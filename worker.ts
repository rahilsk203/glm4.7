import { Hono } from 'hono';
import { streamText } from 'hono/streaming';

// Define types
interface Message {
  role: string;
  content: string;
}

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatCompletionRequest {
  model: string;
  messages: OpenAIMessage[];
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

interface ChatPayload {
  model: string;
  chat_id: string;
  messages: Message[];
  signature_prompt: string;
  stream: boolean;
  params: Record<string, any>;
  extra: Record<string, any>;
  features: {
    image_generation: boolean;
    web_search: boolean;
    auto_web_search: boolean;
    preview_model: boolean;
    flags: string[];
    enable_thinking: boolean;
  };
  variables: Record<string, string>;
  background_tasks: {
    title_generation: boolean;
    tags_generation: boolean;
  };
}

interface ZChatSession {
  token: string;
  user_id: string;
  chat_id: string;
  messages: Message[];
  model: string;
  use_web_search: boolean;
  use_thinking: boolean;
  use_image_gen: boolean;
  use_preview_mode: boolean;
  user_name: string;
  salt_key: string;
  fe_version: string;
}

interface ChatCompletionResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: OpenAIMessage;
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

type Env = {
 Bindings: {
    API_KEY?: string;
  }
};

const app = new Hono<Env>();

// Constants
const BASE_URL = "https://chat.z.ai";

// Middleware to validate API key
const validateApiKey = (c: any, next: () => Promise<void>) => {
  // Skip validation for health check endpoint
  if (c.req.path === '/') {
    return next();
  }
  
  // Get API key from header
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader) {
    return c.json({ error: { message: 'Missing Authorization header' } }, 401);
  }
  
  // Check if it's a Bearer token
  if (!authHeader.startsWith('Bearer ')) {
    return c.json({ error: { message: 'Invalid Authorization header format. Expected: Bearer sk-...' } }, 401);
  }
  
  const apiKey = authHeader.substring(7).trim(); // Remove 'Bearer ' prefix
  
  // If environment has API_KEY configured, validate against it
  if (c.env.API_KEY) {
    if (apiKey !== c.env.API_KEY) {
      return c.json({ error: { message: 'Invalid API key' } }, 401);
    }
  }
  
  // For now, accept any API key that follows the format
  // In a real implementation, you would validate against a stored list of valid keys
  if (!apiKey.startsWith('sk-')) {
    return c.json({ error: { message: 'Invalid API key format. Expected: sk-...' } }, 401);
  }
  
  return next();
};

// Apply the middleware to all routes except the root
app.use('/*', validateApiKey);

// Utility functions
function generateRequestId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

async function generateHmacSignature(key: string, data: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    cryptoKey,
    encoder.encode(data)
  );
  const signatureArray = Array.from(new Uint8Array(signatureBuffer));
  return signatureArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function base64Encode(str: string): string {
  return btoa(unescape(encodeURIComponent(str)));
}

function base64Decode(str: string): string {
  return decodeURIComponent(escape(atob(str)));
}

function generateUrlParams(params: Record<string, any>): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    searchParams.append(key, String(value));
  }
  return searchParams.toString();
}

function getUnixTimestamp(): number {
  return Math.floor(Date.now() / 1000);
}

function getMillisTimestamp(): number {
  return Date.now();
}

// Function to scrape configuration from Z.AI
async function scrapeConfig(): Promise<{ salt_key: string; fe_version: string }> {
  console.log("[*] Scraping configuration from Z.AI...");
  const salt_key = "key-@@@@)))()((9))-xxxx&&&%%%%%";
  let fe_version = "prod-fe-1.0.185";
  
  try {
    const response = await fetch(BASE_URL, { method: 'GET' });
    if (response.ok) {
      const html = await response.text();
      const versionMatch = html.match(/prod-fe-\d+\.\d+\.\d+/);
      if (versionMatch) {
        fe_version = versionMatch[0];
      }
    }
    return { salt_key, fe_version };
  } catch (error) {
    console.error(`[!] Scraping error: ${error}`);
    return { salt_key, fe_version };
  }
}

// Function to generate ZA signature
async function generateZaSignature(
  prompt: string,
  token: string,
  user_id: string,
  salt_key: string
): Promise<{ signature: string; timestamp: string; urlParams: string }> {
  const timestamp = getMillisTimestamp().toString();
  const request_id = generateRequestId();
  
  const bucket = Math.floor(parseInt(timestamp) / 300000);
  const w_key = await generateHmacSignature(salt_key, bucket.toString());
  
  const payloadDict = {
    timestamp,
    requestId: request_id,
    user_id
  };
  
  // Sort the keys alphabetically
  const sortedItems = Object.entries(payloadDict).sort(([a], [b]) => a.localeCompare(b));
  const sortedPayload = sortedItems.map(([k, v]) => `${k},${v}`).join(',');
  
  const promptB64 = base64Encode(prompt.trim());
  
  const dataToSign = `${sortedPayload}|${promptB64}|${timestamp}`;
  const signature = await generateHmacSignature(w_key, dataToSign);
  
  const browserInfo = {
    version: "0.0.1",
    platform: "web",
    token,
    user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0",
    language: "en-US",
    screen_resolution: "1920x1080",
    viewport_size: "1920x1080",
    timezone: "Europe/Paris",
    timezone_offset: "-60"
  };
  
  const params = { ...payloadDict, ...browserInfo };
  const urlParams = `${generateUrlParams(params)}&signature_timestamp=${timestamp}`;
  
  return { signature, timestamp, urlParams };
}

// Function to initialize ZChat session
async function initializeZChat(): Promise<ZChatSession> {
  const { salt_key, fe_version } = await scrapeConfig();
  
  console.log("[*] Initializing Z.AI Session...");
  
  const headers = {
    "Origin": BASE_URL,
    "Referer": `${BASE_URL}/`,
    "Content-Type": "application/json"
  };
  
  // Create a temporary session object
  const session: ZChatSession = {
    token: "",
    user_id: "",
    chat_id: generateRequestId(),
    messages: [],
    model: "glm-4.7",
    use_web_search: false,
    use_thinking: false,
    use_image_gen: false,
    use_preview_mode: false,
    user_name: "Guest",
    salt_key,
    fe_version
  };
  
  try {
    // First attempt to get auth
    let response = await fetch(`${BASE_URL}/api/v1/auths/`, {
      method: 'GET',
      headers
    });
    
    if (!response.ok) {
      // If that fails, try guest auth
      const guestResponse = await fetch(`${BASE_URL}/api/v1/auths/guest`, {
        method: 'POST',
        headers,
        body: JSON.stringify({})
      });
      
      if (guestResponse.ok) {
        const guestData = await guestResponse.json();
        session.token = guestData.token || "";
      }
    } else {
      const data = await response.json();
      session.token = data.token || "";
      
      if (!session.token) {
        const guestResponse = await fetch(`${BASE_URL}/api/v1/auths/guest`, {
          method: 'POST',
          headers,
          body: JSON.stringify({})
        });
        
        if (guestResponse.ok) {
          const guestData = await guestResponse.json();
          session.token = guestData.token || "";
        }
      }
    }
    
    if (session.token) {
      try {
        // Decode JWT token to extract user info
        const tokenParts = session.token.split('.');
        if (tokenParts.length === 3) {
          const payload = JSON.parse(base64Decode(tokenParts[1] + '=='));
          session.user_id = payload.id || "";
          session.user_name = (payload.email || "Guest").split('@')[0];
          console.log(`[+] Connected. UserID: ${session.user_id.substring(0, 8)}... (Name: ${session.user_name})`);
        }
      } catch (error) {
        console.log("[!] Token decode failed, but connected.");
      }
    } else {
      console.log("[!] No token in auth response.");
    }
  } catch (error) {
    console.error(`[!] Initialization Error: ${error}`);
  }
  
  return session;
}

// Function to get context variables
function getContextVars(session: ZChatSession): Record<string, string> {
  const now = new Date();
  return {
    "{{USER_NAME}}": session.user_name,
    "{{USER_LOCATION}}": "Unknown",
    "{{CURRENT_DATETIME}}": now.toISOString().slice(0, 19).replace('T', ' '),
    "{{CURRENT_DATE}}": now.toISOString().slice(0, 10),
    "{{CURRENT_TIME}}": now.toTimeString().substring(0, 8),
    "{{CURRENT_WEEKDAY}}": now.toLocaleString('en-US', { weekday: 'long' }),
    "{{CURRENT_TIMEZONE}}": "Europe/Paris",
    "{{USER_LANGUAGE}}": "en-US"
  };
}

// Main chat function
async function* chatStream(session: ZChatSession, prompt: string) {
  session.messages.push({ role: "user", content: prompt });

  const { signature, timestamp, urlParams } = await generateZaSignature(
    prompt,
    session.token,
    session.user_id,
    session.salt_key
  );

  const url = `${BASE_URL}/api/v2/chat/completions?${urlParams}`;

  const headers = {
    "Authorization": `Bearer ${session.token}`,
    "X-Signature": signature,
    "X-FE-Version": session.fe_version,
    "Content-Type": "application/json",
    "Origin": BASE_URL,
    "Referer": `${BASE_URL}/`
  };

  const payload: ChatPayload = {
    model: session.model,
    chat_id: session.chat_id,
    messages: session.messages,
    signature_prompt: prompt,
    stream: true,
    params: {},
    extra: {},
    features: {
      image_generation: session.use_image_gen,
      web_search: session.use_web_search,
      auto_web_search: session.use_web_search,
      preview_model: session.use_preview_mode,
      flags: [],
      enable_thinking: session.use_thinking
    },
    variables: getContextVars(session),
    background_tasks: {
      title_generation: true,
      tags_generation: true
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Error ${response.status}: ${await response.text()}`);
  }

  if (!response.body) {
    throw new Error('Response body is null');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let fullAssistantContent = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep last incomplete line in buffer

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const dataStr = line.slice(6); // Remove 'data: ' prefix
          
          if (dataStr === '[DONE]') {
            return; // Stream ended
          }
          
          try {
            const dataJson = JSON.parse(dataStr);
            
            if (dataJson.data && dataJson.data.delta_content) {
              const chunk = dataJson.data.delta_content;
              fullAssistantContent += chunk;
              yield chunk;
            } else if (dataJson.choices) {
              const chunk = dataJson.choices[0]?.delta?.content || "";
              if (chunk) {
                fullAssistantContent += chunk;
                yield chunk;
              }
            }
          } catch (e) {
            // Skip malformed JSON
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
    
    if (fullAssistantContent) {
      session.messages.push({ role: "assistant", content: fullAssistantContent });
    }
  }
}

// API endpoint to handle chat requests (legacy)
app.post('/chat', async (c) => {
  try {
    const requestBody = await c.req.json();
    const { prompt, model = "glm-4.7", web_search = false, thinking = false, image_gen = false, preview_mode = false } = requestBody;
    
    // Initialize session for this request
    const session = await initializeZChat();
    session.model = model;
    session.use_web_search = web_search;
    session.use_thinking = thinking;
    session.use_image_gen = image_gen;
    session.use_preview_mode = preview_mode;

    return streamText(c, async (stream) => {
      for await (const chunk of chatStream(session, prompt)) {
        await stream.write(chunk);
      }
    });
  } catch (error) {
    console.error('Chat error:', error);
    return c.json({ error: `Chat error: ${error.message}` }, 500);
  }
});

// OpenAI-compatible chat completion endpoint
app.post('/v1/chat/completions', async (c) => {
  try {
    const requestBody: ChatCompletionRequest = await c.req.json();
    const {
      model = "glm-4.7",
      messages,
      temperature = 0.7,
      max_tokens = 2000,
      stream = false
    } = requestBody;
    
    // Extract the last user message as the prompt
    const lastMessage = messages[messages.length - 1];
    const prompt = lastMessage.content;
    
    // Initialize session for this request
    const session = await initializeZChat();
    session.model = model;
    
    // Handle feature flags based on messages or other criteria
    // For now, setting defaults
    session.use_web_search = messages.some(msg => msg.content.toLowerCase().includes("search"));
    session.use_thinking = messages.some(msg => msg.content.toLowerCase().includes("think"));
    
    if (stream) {
      // Return streaming response
      return streamText(c, async (stream) => {
        const fullResponse = [];
        for await (const chunk of chatStream(session, prompt)) {
          const choice = {
            index: 0,
            delta: { role: 'assistant', content: chunk },
            finish_reason: null as string | null
          };
          
          const data = `data: ${JSON.stringify({ choices: [choice] })}\n\n`;
          await stream.write(data);
        }
        
        // Send the finish message
        const finishChoice = {
          index: 0,
          delta: {},
          finish_reason: 'stop'
        };
        
        const finishData = `data: ${JSON.stringify({ choices: [finishChoice] })}\n\n`;
        await stream.write(finishData);
        
        // Send done signal
        await stream.write('data: [DONE]\n\n');
      });
    } else {
      // Return non-streaming response
      const chunks: string[] = [];
      for await (const chunk of chatStream(session, prompt)) {
        chunks.push(chunk);
      }
      
      const fullContent = chunks.join('');
      
      // Calculate token counts (simple approximation)
      const promptTokens = messages.reduce((sum, msg) => sum + Math.ceil(msg.content.length / 4), 0);
      const completionTokens = Math.ceil(fullContent.length / 4);
      
      const response: ChatCompletionResponse = {
        id: `chatcmpl-${generateRequestId().replace(/-/g, '')}`,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: session.model,
        choices: [{
          index: 0,
          message: {
            role: 'assistant',
            content: fullContent
          },
          finish_reason: 'stop'
        }],
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens
        }
      };
      
      return c.json(response);
    }
  } catch (error) {
    console.error('OpenAI-compatible API error:', error);
    return c.json({ error: `API error: ${error.message}` }, 500);
  }
});

// Health check endpoint
app.get('/', (c) => {
  return c.text('Cloudflare Worker for Z.AI Chat API is running!');
});

// Export the app
export default app;
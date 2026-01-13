# Z.AI Cloudflare Worker API

This project converts the Z.AI chat API functionality into a Cloudflare Worker, allowing you to host and access the Z.AI chat service through your own Cloudflare Worker endpoint. It now includes an OpenAI-compatible API endpoint.

## Features

- Full conversion of the original Python script functionality to TypeScript
- Cloudflare Worker compatible code using standard Web APIs
- Streaming responses for chat completions
- Authentication handling for guest users
- Support for various features like web search, thinking mode, image generation, and preview mode
- OpenAI-compatible API endpoint at `/v1/chat/completions`

## Prerequisites

- Node.js installed on your system
- Cloudflare account and Wrangler CLI installed (`npm install -g wrangler`)
- Cloudflare account ID and (optionally) zone ID for deployment

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Update the `wrangler.toml` file with your Cloudflare account information:
   - Replace `your-account-id-here` with your actual Cloudflare account ID
   - Optionally configure routes with your domain and zone ID

## Development

To run the worker locally for development and testing:
```bash
npm run dev
```

This will start a local development server where you can test the API endpoints.

## Deployment

To deploy the worker to Cloudflare:
```bash
npm run deploy
```

## API Usage

### Legacy Chat Endpoint

Send a POST request to `/chat` with the following JSON payload:

```json
{
  "prompt": "Your message here",
  "model": "glm-4.7",
  "web_search": false,
  "thinking": false,
  "image_gen": false,
  "preview_mode": false
}
```

All parameters except `prompt` are optional and have default values.

Example using curl:
```bash
curl -X POST https://your-worker.your-subdomain.workers.dev/chat \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Hello, how are you?",
    "model": "glm-4.7",
    "web_search": true
  }'
```

### OpenAI-Compatible Endpoint

Send a POST request to `/v1/chat/completions` with the following JSON payload:

```json
{
  "model": "glm-4.7",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "Hello, world!"}
  ],
  "temperature": 0.7,
  "max_tokens": 2000,
  "stream": false
}
```

This endpoint is compatible with OpenAI's API format and supports both streaming and non-streaming responses.

Example using curl:
```bash
curl -X POST http://127.0.0.1:8787/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-test-api-key-for-development" \
  -d '{
    "model": "glm-4.7",
    "messages": [
      {"role": "user", "content": "Hello, how are you?"}
    ],
    "stream": false
  }'
```

## API Key Authentication

All endpoints (except the health check at `/`) require API key authentication in the form of a Bearer token in the Authorization header:

```
Authorization: Bearer sk-your-api-key-here
```

The API key must start with `sk-`. For production deployments, set your API key using:

```bash
wrangler secret put API_KEY
```

For local development, you can set the API key in the `wrangler.toml` file under `[env.development.vars]`.

## Endpoints

- `GET /` - Health check endpoint (no authentication required)
- `POST /chat` - Legacy chat completion endpoint with streaming response
- `POST /v1/chat/completions` - OpenAI-compatible chat completion endpoint

## How It Works

The worker replicates the functionality of the original Python script:

1. Automatically scrapes configuration from Z.AI
2. Handles guest authentication to obtain a session token
3. Generates the required signatures for API requests
4. Streams responses back to the client
5. Maintains conversation history within the request context

## Notes

- The worker runs in a stateless manner, so conversation history is maintained only for the duration of a single request
- For persistent conversations, you'd need to implement external storage (e.g., Cloudflare KV, D1, or R2)
- The worker handles all the cryptographic operations needed for authenticating with the Z.AI API"# glm4.7" 

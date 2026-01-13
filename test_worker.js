// Test script to demonstrate how to interact with the Cloudflare Worker API

async function testWorkerAPI() {
  const workerUrl = 'http://localhost:8787'; // Default Wrangler dev URL
  
  console.log('Testing Cloudflare Worker API...');
  
  try {
    // Test health check endpoint
    console.log('\n1. Testing health check endpoint...');
    const healthResponse = await fetch(workerUrl);
    console.log(`Health check status: ${healthResponse.status}`);
    console.log(`Response: ${await healthResponse.text()}`);
    
    // Test chat endpoint
    console.log('\n2. Testing chat endpoint...');
    const chatResponse = await fetch(`${workerUrl}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt: 'Hello, this is a test message.',
        model: 'glm-4.7',
        web_search: false,
        thinking: false
      })
    });
    
    console.log(`Chat endpoint status: ${chatResponse.status}`);
    
    if (chatResponse.ok) {
      console.log('Response stream:');
      const reader = chatResponse.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      
      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          console.log(decoder.decode(value));
        }
      }
    } else {
      console.error(`Error: ${await chatResponse.text()}`);
    }
  } catch (error) {
    console.error('Test error:', error);
  }
}

// Run the test
testWorkerAPI().catch(console.error);
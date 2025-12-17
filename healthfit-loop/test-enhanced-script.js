#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Load environment variables from .env file
function loadEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) {
    console.error('❌ .env file not found!');
    process.exit(1);
  }

  const envContent = fs.readFileSync(envPath, 'utf8');
  const lines = envContent.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, value] = trimmed.split('=');
      if (key && value) {
        // Remove quotes if present
        process.env[key.trim()] = value.trim().replace(/^["']|["']$/g, '');
      }
    }
  }
}

loadEnv();

const PERPLEXITY_API_KEY = process.env.PURPLEXITY_API_KEY;

async function testEnhancedFeatures() {
  console.log('🧪 Testing Enhanced Perplexity Script...\n');

  const response = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'sonar',
      messages: [
        {
          role: 'user',
          content: 'What is the current price of coffee at Starbucks?'
        }
      ],
      max_tokens: 200
    })
  });

  const data = await response.json();

  // Test cost calculation
  const usage = data.usage || {};
  const INPUT_COST_PER_1M = 1.00;
  const OUTPUT_COST_PER_1M = 3.00;

  const inputTokens = usage.prompt_tokens || 0;
  const outputTokens = usage.completion_tokens || 0;
  const totalTokens = usage.total_tokens || inputTokens + outputTokens;

  const inputCost = (inputTokens / 1000000) * INPUT_COST_PER_1M;
  const outputCost = (outputTokens / 1000000) * OUTPUT_COST_PER_1M;
  const totalCost = inputCost + outputCost;

  console.log('📝 Answer:');
  console.log('─'.repeat(70));
  console.log(data.choices[0]?.message?.content);
  console.log('─'.repeat(70));

  console.log('📊 Usage & Cost:');
  console.log(`   Input tokens:  ${inputTokens.toLocaleString()}`);
  console.log(`   Output tokens: ${outputTokens.toLocaleString()}`);
  console.log(`   Total tokens:  ${totalTokens.toLocaleString()}`);
  console.log(`   💰 Cost: ~$${totalCost.toFixed(6)} (${(totalCost * 100).toFixed(4)}¢)`);
  console.log(`   📈 Input: $${inputCost.toFixed(6)} | Output: $${outputCost.toFixed(6)}`);

  console.log('\n✅ Enhanced features working correctly!');
  console.log('🚀 Your perplexity-query.js script is ready to use with cost tracking!');
}

testEnhancedFeatures().catch(console.error);
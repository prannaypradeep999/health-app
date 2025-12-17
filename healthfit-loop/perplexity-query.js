#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

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

// Load environment variables
loadEnv();

const PERPLEXITY_API_KEY = process.env.PURPLEXITY_API_KEY;

if (!PERPLEXITY_API_KEY) {
  console.error('❌ PURPLEXITY_API_KEY not found in .env file!');
  process.exit(1);
}

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Function to query Perplexity API
async function queryPerplexity(question) {
  try {
    console.log('\n🤔 Thinking...\n');

    const requestPayload = {
      model: 'sonar',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that provides accurate, well-researched answers. Always cite sources when possible.'
        },
        {
          role: 'user',
          content: question
        }
      ],
      temperature: 0.2,
      top_p: 0.9
    };

    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestPayload)
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Calculate approximate cost
    const cost = calculateCost(data.usage || {});

    return {
      content: data.choices[0]?.message?.content || 'No response received',
      usage: data.usage || {},
      cost: cost,
      fullResponse: data
    };

  } catch (error) {
    console.error('❌ Error querying Perplexity:', error.message);
    return null;
  }
}

// Function to calculate approximate API cost
function calculateCost(usage) {
  // Perplexity API pricing (approximate - check current rates)
  // Sonar model: ~$1 per 1M input tokens, ~$3 per 1M output tokens
  const INPUT_COST_PER_1M = 1.00;  // $1 per 1M input tokens
  const OUTPUT_COST_PER_1M = 3.00; // $3 per 1M output tokens

  const inputTokens = usage.prompt_tokens || 0;
  const outputTokens = usage.completion_tokens || 0;
  const totalTokens = usage.total_tokens || inputTokens + outputTokens;

  const inputCost = (inputTokens / 1000000) * INPUT_COST_PER_1M;
  const outputCost = (outputTokens / 1000000) * OUTPUT_COST_PER_1M;
  const totalCost = inputCost + outputCost;

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    inputCost: inputCost.toFixed(6),
    outputCost: outputCost.toFixed(6),
    totalCost: totalCost.toFixed(6),
    totalCostCents: (totalCost * 100).toFixed(4)
  };
}

// Function to format the answer
function formatAnswer(result) {
  if (typeof result === 'string') {
    // Backwards compatibility for old format
    console.log('📝 Answer:');
    console.log('─'.repeat(50));
    console.log(result);
    console.log('─'.repeat(50));
    return;
  }

  const { content, cost, usage } = result;

  console.log('📝 Answer:');
  console.log('─'.repeat(70));
  console.log(content);
  console.log('─'.repeat(70));

  console.log('📊 Usage & Cost:');
  console.log(`   Input tokens:  ${cost.inputTokens.toLocaleString()}`);
  console.log(`   Output tokens: ${cost.outputTokens.toLocaleString()}`);
  console.log(`   Total tokens:  ${cost.totalTokens.toLocaleString()}`);
  console.log(`   💰 Cost: ~$${cost.totalCost} (${cost.totalCostCents}¢)`);
  console.log(`   📈 Input: $${cost.inputCost} | Output: $${cost.outputCost}`);
}

// Session tracking
let sessionStats = {
  queries: 0,
  totalTokens: 0,
  totalCost: 0
};

// Main interactive loop
async function main() {
  console.log('🔮 Perplexity Query Tool v2.0');
  console.log('✨ Now with cost tracking and usage analytics!');
  console.log('Type your questions and get AI-powered answers with real-time web search!');
  console.log('Type "exit" or "quit" to stop.\n');

  const askQuestion = () => {
    rl.question('💭 Your question: ', async (question) => {
      const trimmed = question.trim();

      if (trimmed === '' || trimmed === 'exit' || trimmed === 'quit') {
        // Show session summary
        if (sessionStats.queries > 0) {
          console.log('\n📈 Session Summary:');
          console.log('─'.repeat(30));
          console.log(`   Queries asked: ${sessionStats.queries}`);
          console.log(`   Total tokens: ${sessionStats.totalTokens.toLocaleString()}`);
          console.log(`   Total cost: ~$${sessionStats.totalCost.toFixed(6)} (${(sessionStats.totalCost * 100).toFixed(4)}¢)`);
          console.log(`   Average per query: ~$${(sessionStats.totalCost / sessionStats.queries).toFixed(6)}`);
        }
        console.log('\n👋 Goodbye!');
        rl.close();
        return;
      }

      const result = await queryPerplexity(trimmed);

      if (result) {
        formatAnswer(result);

        // Update session stats
        sessionStats.queries++;
        sessionStats.totalTokens += result.cost.totalTokens;
        sessionStats.totalCost += parseFloat(result.cost.totalCost);

        // Optional: Save to log file for tracking usage
        try {
          const fs = require('fs');
          const logEntry = {
            timestamp: new Date().toISOString(),
            question: trimmed,
            cost: result.cost,
            usage: result.usage
          };

          const logFile = 'perplexity-usage.log';
          fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
        } catch (error) {
          // Ignore logging errors
        }
      }

      console.log('\n' + '='.repeat(60) + '\n');
      askQuestion(); // Ask next question
    });
  };

  askQuestion();
}

// Handle Ctrl+C
rl.on('SIGINT', () => {
  console.log('\n\n👋 Goodbye!');
  process.exit(0);
});

// Start the program
main().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
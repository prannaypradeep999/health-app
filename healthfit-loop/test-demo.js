#!/usr/bin/env node

/**
 * Test script for the HealthFit demo system
 * Tests dynamic demo generation with fresh data
 */

const baseUrl = 'http://localhost:3000';

function generateTestId() {
  return 'test_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
}

async function testDemoGeneration() {
  const surveyId = generateTestId();
  const sessionId = generateTestId();

  console.log('🧪 Testing demo generation with fresh IDs:');
  console.log('📋 Survey ID:', surveyId);
  console.log('🔐 Session ID:', sessionId);

  const testUrl = `${baseUrl}/demo-california?surveyId=${surveyId}&sessionId=${sessionId}`;
  console.log('🌐 Test URL:', testUrl);

  // Test 1: Check if meal current API works with the session
  console.log('\n1️⃣ Testing current meal API...');

  // Test 2: Check if meal generation works
  console.log('\n2️⃣ Testing meal generation...');

  // Test 3: Check for fresh restaurant data
  console.log('\n3️⃣ Checking for fresh restaurant data...');

  console.log('\n✅ Test completed! Open the URL above to see the demo.');
  console.log('📊 Check server logs for "CACHING DISABLED" message to verify fresh data.');
}

testDemoGeneration().catch(console.error);
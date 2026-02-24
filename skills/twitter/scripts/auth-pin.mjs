#!/usr/bin/env node
// OAuth 1.0a PIN-based authorization flow
// Usage: node auth-pin.mjs
// 
// 1. Run this script — it prints a URL
// 2. Give the URL to your human — they log in and authorize
// 3. They get a PIN code and give it back to you
// 4. Enter the PIN when prompted — tokens are saved to secrets/twitter.json
//
// Requires: npm install twitter-api-v2
// Requires: secrets/twitter.json with at least consumerKey and consumerSecret

import { TwitterApi } from 'twitter-api-v2';
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';

const skillDir = dirname(dirname(fileURLToPath(import.meta.url)));
const workspaceDir = dirname(dirname(skillDir));
const secretsPath = process.env.TWITTER_SECRETS || resolve(workspaceDir, 'secrets', 'twitter.json');

let creds;
try {
  creds = JSON.parse(readFileSync(secretsPath, 'utf8'));
} catch (e) {
  console.error(`Cannot read credentials from ${secretsPath}`);
  console.error('Create secrets/twitter.json with at least consumerKey and consumerSecret.');
  process.exit(1);
}

if (!creds.consumerKey || !creds.consumerSecret) {
  console.error('secrets/twitter.json must contain consumerKey and consumerSecret');
  process.exit(1);
}

const client = new TwitterApi({
  appKey: creds.consumerKey,
  appSecret: creds.consumerSecret,
});

// Step 1: Get request token and auth URL
const { url, oauth_token, oauth_token_secret } = await client.generateAuthLink('oob');

console.log('\n=== Twitter PIN Authorization ===');
console.log('\nGive this URL to your human:\n');
console.log(`  ${url}\n`);
console.log('They should:');
console.log('  1. Open the link and log in as the account the agent should post as');
console.log('  2. Click "Authorize app"');
console.log('  3. Copy the PIN code shown\n');

// Step 2: Get PIN from user
const rl = createInterface({ input: process.stdin, output: process.stdout });
const pin = await new Promise(r => rl.question('Enter PIN: ', r));
rl.close();

// Step 3: Exchange PIN for access tokens
try {
  const { accessToken, accessSecret } = await new TwitterApi({
    appKey: creds.consumerKey,
    appSecret: creds.consumerSecret,
    accessToken: oauth_token,
    accessSecret: oauth_token_secret,
  }).login(pin.trim());

  // Step 4: Save tokens
  creds.oauth1 = { accessToken, accessTokenSecret: accessSecret };
  writeFileSync(secretsPath, JSON.stringify(creds, null, 2));

  console.log('\n✅ Access tokens saved to', secretsPath);
  console.log('The agent can now post tweets.');
} catch (e) {
  console.error('\n❌ PIN exchange failed:', e.message);
  console.error('Make sure the PIN is correct and hasn\'t expired.');
  process.exit(1);
}

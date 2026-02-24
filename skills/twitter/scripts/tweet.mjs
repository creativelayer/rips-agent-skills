#!/usr/bin/env node
// Post a tweet from the command line
// Usage: node tweet.mjs "Your tweet text here"
// Requires: npm install twitter-api-v2
// Credentials: secrets/twitter.json (see SKILL.md for format)

import { TwitterApi } from 'twitter-api-v2';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const text = process.argv[2];
if (!text) {
  console.error('Usage: node tweet.mjs "tweet text"');
  process.exit(1);
}

if (text.length > 280) {
  console.error(`Tweet too long: ${text.length}/280 characters`);
  process.exit(1);
}

// Find secrets relative to workspace (skill parent's parent)
const skillDir = dirname(dirname(fileURLToPath(import.meta.url)));
const workspaceDir = dirname(dirname(skillDir));
const secretsPath = process.env.TWITTER_SECRETS || resolve(workspaceDir, 'secrets', 'twitter.json');

let creds;
try {
  creds = JSON.parse(readFileSync(secretsPath, 'utf8'));
} catch (e) {
  console.error(`Cannot read credentials from ${secretsPath}`);
  console.error('Set TWITTER_SECRETS env var or place secrets/twitter.json in workspace.');
  process.exit(1);
}

const client = new TwitterApi({
  appKey: creds.consumerKey,
  appSecret: creds.consumerSecret,
  accessToken: creds.oauth1.accessToken,
  accessSecret: creds.oauth1.accessTokenSecret,
});

try {
  const tweet = await client.v2.tweet(text);
  console.log(JSON.stringify(tweet.data, null, 2));
} catch (e) {
  console.error('Error:', e.code || e.status, e.data || e.message);
  process.exit(1);
}

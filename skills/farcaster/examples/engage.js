#!/usr/bin/env node

/**
 * Farcaster Hub-Direct Engagement Script
 * 
 * Like casts and follow users via direct hub submission.
 * No Neynar managed signers needed — uses raw ed25519 keys.
 * 
 * Usage:
 *   FID=123456 SIGNER_KEY=abc123... node examples/engage.js like <castHash> [castFid]
 *   FID=123456 SIGNER_KEY=abc123... node examples/engage.js unlike <castHash> <castFid>
 *   FID=123456 SIGNER_KEY=abc123... node examples/engage.js follow <targetFid>
 *   FID=123456 SIGNER_KEY=abc123... node examples/engage.js unfollow <targetFid>
 *   node examples/engage.js --help
 * 
 * Environment Variables:
 *   FID         - Your Farcaster ID (number)
 *   SIGNER_KEY  - Your signer private key (hex, with or without 0x)
 *   NEYNAR_KEY  - Neynar API key (optional, for cast lookups)
 */

const {
  makeReactionAdd,
  makeReactionRemove,
  makeLinkAdd,
  makeLinkRemove,
  NobleEd25519Signer,
  FarcasterNetwork,
  ReactionType,
  Message,
} = require('@farcaster/hub-nodejs');

const HUB_URL = 'https://hub-api.neynar.com';

function makeSigner(privateKeyHex) {
  // Normalize key format (may not have 0x prefix)
  const hex = privateKeyHex.startsWith('0x') ? privateKeyHex : `0x${privateKeyHex}`;
  const bytes = Buffer.from(hex.slice(2), 'hex');
  if (bytes.length !== 32) {
    throw new Error(`Signer key must be exactly 32 bytes, got ${bytes.length}`);
  }
  return new NobleEd25519Signer(bytes);
}

function parseHash(hashStr) {
  const hex = hashStr.startsWith('0x') ? hashStr : `0x${hashStr}`;
  return Buffer.from(hex.slice(2), 'hex');
}

async function submitMessage(message, neynarKey) {
  const messageBytes = Buffer.from(Message.encode(message).finish());
  
  const headers = { 'Content-Type': 'application/octet-stream' };
  if (neynarKey) headers['x-api-key'] = neynarKey;
  
  const response = await fetch(`${HUB_URL}/v1/submitMessage`, {
    method: 'POST',
    headers,
    body: messageBytes,
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Hub rejected message: ${error}`);
  }
  
  return await response.json();
}

async function lookupCastAuthor(castHash, neynarKey) {
  if (!neynarKey) return null;
  
  // Try hub API first
  try {
    const hubResponse = await fetch(`${HUB_URL}/v1/castById?fid=0&hash=${castHash}`, {
      headers: { 'x-api-key': neynarKey }
    });
    if (hubResponse.ok) {
      const data = await hubResponse.json();
      return data.data?.fid;
    }
  } catch (e) {
    // Fall through to Neynar v2
  }
  
  // Try Neynar v2
  try {
    const neynarResponse = await fetch(`https://api.neynar.com/v2/farcaster/cast?identifier=${castHash}&type=hash`, {
      headers: { 'x-api-key': neynarKey }
    });
    if (neynarResponse.ok) {
      const data = await neynarResponse.json();
      return data.cast?.author?.fid;
    }
  } catch (e) {
    // Give up
  }
  
  return null;
}

async function like(fid, signer, castHash, castFid, neynarKey) {
  // If castFid not provided, try to look it up
  if (!castFid) {
    castFid = await lookupCastAuthor(castHash, neynarKey);
    if (!castFid) {
      throw new Error('Could not determine cast author FID. Pass it as 4th argument or set NEYNAR_KEY.');
    }
  }
  
  const result = await makeReactionAdd(
    { 
      type: ReactionType.LIKE, 
      targetCastId: { fid: castFid, hash: parseHash(castHash) }
    },
    { fid, network: FarcasterNetwork.MAINNET },
    signer
  );
  
  if (result.isErr()) {
    throw new Error(`makeReactionAdd failed: ${result.error}`);
  }
  
  return await submitMessage(result.value, neynarKey);
}

async function unlike(fid, signer, castHash, castFid, neynarKey) {
  if (!castFid) {
    throw new Error('castFid required for unlike operation');
  }
  
  const result = await makeReactionRemove(
    { 
      type: ReactionType.LIKE, 
      targetCastId: { fid: castFid, hash: parseHash(castHash) }
    },
    { fid, network: FarcasterNetwork.MAINNET },
    signer
  );
  
  if (result.isErr()) {
    throw new Error(`makeReactionRemove failed: ${result.error}`);
  }
  
  return await submitMessage(result.value, neynarKey);
}

async function follow(fid, signer, targetFid, neynarKey) {
  const result = await makeLinkAdd(
    { type: 'follow', targetFid },
    { fid, network: FarcasterNetwork.MAINNET },
    signer
  );
  
  if (result.isErr()) {
    throw new Error(`makeLinkAdd failed: ${result.error}`);
  }
  
  return await submitMessage(result.value, neynarKey);
}

async function unfollow(fid, signer, targetFid, neynarKey) {
  const result = await makeLinkRemove(
    { type: 'follow', targetFid },
    { fid, network: FarcasterNetwork.MAINNET },
    signer
  );
  
  if (result.isErr()) {
    throw new Error(`makeLinkRemove failed: ${result.error}`);
  }
  
  return await submitMessage(result.value, neynarKey);
}

async function main() {
  const [action, target, extra] = process.argv.slice(2);
  
  if (!action || action === '--help' || action === '-h') {
    console.log(`
Farcaster Hub-Direct Engagement

Usage:
  FID=123456 SIGNER_KEY=abc123... node examples/engage.js like <castHash> [castFid]
  FID=123456 SIGNER_KEY=abc123... node examples/engage.js unlike <castHash> <castFid>
  FID=123456 SIGNER_KEY=abc123... node examples/engage.js follow <targetFid>
  FID=123456 SIGNER_KEY=abc123... node examples/engage.js unfollow <targetFid>
  node examples/engage.js --help

Environment Variables:
  FID         - Your Farcaster ID (required)
  SIGNER_KEY  - Your ed25519 signer private key (required)
  NEYNAR_KEY  - Neynar API key (optional, for cast author lookup)

Examples:
  # Like a cast (will auto-lookup author if NEYNAR_KEY set)
  FID=123456 SIGNER_KEY=abc123 NEYNAR_KEY=xyz node examples/engage.js like 0xabcdef...
  
  # Like with explicit author FID
  FID=123456 SIGNER_KEY=abc123 node examples/engage.js like 0xabcdef... 789
  
  # Follow a user
  FID=123456 SIGNER_KEY=abc123 node examples/engage.js follow 789
`);
    process.exit(0);
  }
  
  const fid = parseInt(process.env.FID);
  const signerKey = process.env.SIGNER_KEY;
  const neynarKey = process.env.NEYNAR_KEY;
  
  if (!fid || !signerKey) {
    console.error('ERROR: FID and SIGNER_KEY environment variables required');
    console.error('Use --help for usage information');
    process.exit(1);
  }
  
  if (!target) {
    console.error('ERROR: Missing target argument');
    console.error('Use --help for usage information');
    process.exit(1);
  }
  
  const signer = makeSigner(signerKey);
  
  console.error(`FID ${fid} → ${action} ${target}${extra ? ` (${extra})` : ''}`);
  
  let result;
  try {
    switch (action.toLowerCase()) {
      case 'like':
        result = await like(fid, signer, target, extra ? parseInt(extra) : undefined, neynarKey);
        break;
      case 'unlike':
        if (!extra) throw new Error('unlike requires castFid as 3rd argument');
        result = await unlike(fid, signer, target, parseInt(extra), neynarKey);
        break;
      case 'follow':
        result = await follow(fid, signer, parseInt(target), neynarKey);
        break;
      case 'unfollow':
        result = await unfollow(fid, signer, parseInt(target), neynarKey);
        break;
      default:
        console.error(`ERROR: Unknown action: ${action}`);
        console.error('Supported actions: like, unlike, follow, unfollow');
        process.exit(1);
    }
    
    // Success - output JSON for easy parsing by other tools
    console.log(JSON.stringify({ 
      success: true, 
      action, 
      fid, 
      target, 
      extra: extra || null,
      result 
    }, null, 2));
    
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { like, unlike, follow, unfollow, makeSigner, submitMessage };
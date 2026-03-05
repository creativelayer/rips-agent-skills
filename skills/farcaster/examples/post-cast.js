#!/usr/bin/env node

/**
 * Farcaster Cast Posting Examples
 * 
 * Shows both hub-direct and Neynar v2 API methods for posting casts.
 * Hub-direct gives more control and works with raw ed25519 keys.
 * 
 * Usage:
 *   # Hub-direct method (recommended)
 *   FID=123456 SIGNER_KEY=abc123... NEYNAR_KEY=xyz node examples/post-cast.js "Hello Farcaster!"
 *   
 *   # Neynar v2 method (simpler but requires managed signer)
 *   SIGNER_UUID=abc123... NEYNAR_KEY=xyz node examples/post-cast.js --neynar "Hello Farcaster!"
 *   
 *   # With reply parent
 *   FID=123456 SIGNER_KEY=abc123... NEYNAR_KEY=xyz node examples/post-cast.js "Great post!" --parent 0xabcdef...
 *   
 *   # In a channel
 *   FID=123456 SIGNER_KEY=abc123... NEYNAR_KEY=xyz node examples/post-cast.js "Channel post" --channel ethereum
 */

const {
  makeCastAdd,
  NobleEd25519Signer,
  FarcasterNetwork,
  Message
} = require('@farcaster/hub-nodejs');

/**
 * Post a cast using hub-direct method with raw ed25519 signer
 */
async function postCastHubDirect({ fid, signerPrivateKey, neynarKey, text, parentCastId, parentUrl, channel }) {
  // Normalize signer key format
  const signerHex = signerPrivateKey.startsWith('0x') ? signerPrivateKey : `0x${signerPrivateKey}`;
  const signerBytes = Buffer.from(signerHex.slice(2), 'hex');
  
  if (signerBytes.length !== 32) {
    throw new Error(`Signer key must be exactly 32 bytes, got ${signerBytes.length}`);
  }
  
  const signer = new NobleEd25519Signer(signerBytes);

  // Build cast body
  const castBody = {
    text,
    embeds: [],
    embedsDeprecated: [],
    mentions: [],
    mentionsPositions: []
  };
  
  if (parentCastId) castBody.parentCastId = parentCastId;
  if (parentUrl) castBody.parentUrl = parentUrl;
  if (channel) castBody.parentUrl = `https://warpcast.com/~/channel/${channel}`;

  // Create the cast message
  const castResult = await makeCastAdd(
    castBody,
    { fid, network: FarcasterNetwork.MAINNET },
    signer
  );
  
  if (castResult.isErr()) {
    throw new Error(`Failed to create cast: ${castResult.error}`);
  }

  const cast = castResult.value;
  const hash = '0x' + Buffer.from(cast.hash).toString('hex');
  
  // Encode message - MUST use Message.encode().finish()
  const messageBytes = Buffer.from(Message.encode(cast).finish());

  console.error(`Cast hash: ${hash}`);
  console.error(`Message size: ${messageBytes.length} bytes`);

  // Submit to Neynar hub
  const response = await fetch('https://hub-api.neynar.com/v1/submitMessage', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'x-api-key': neynarKey
    },
    body: messageBytes
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Hub submission failed: ${errorText}`);
  }

  const result = await response.json();
  console.error('✅ Cast submitted successfully via hub-direct');

  return { 
    hash, 
    method: 'hub-direct',
    result 
  };
}

/**
 * Post a cast using Neynar v2 REST API with managed signer
 */
async function postCastNeynarV2({ signerUuid, neynarKey, text, parent, channel }) {
  const body = {
    signer_uuid: signerUuid,
    text
  };
  
  if (parent) body.parent = parent; // Cast hash for replies
  if (channel) body.channel_id = channel;

  const response = await fetch('https://api.neynar.com/v2/farcaster/cast', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': neynarKey
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Neynar v2 API failed: ${errorText}`);
  }

  const result = await response.json();
  console.error('✅ Cast submitted successfully via Neynar v2');

  return {
    hash: result.cast?.hash,
    method: 'neynar-v2', 
    result
  };
}

function parseParentCast(parentHash) {
  // For hub-direct, we need { fid, hash } format
  // This is a simplified version - in practice you'd look up the author FID
  const hash = Buffer.from(parentHash.startsWith('0x') ? parentHash.slice(2) : parentHash, 'hex');
  return { 
    fid: 0, // Would need to look this up from the cast
    hash 
  };
}

function showUsage() {
  console.log(`
Farcaster Cast Posting Examples

Hub-Direct Method (recommended):
  FID=123456 SIGNER_KEY=abc123... NEYNAR_KEY=xyz node examples/post-cast.js "Hello Farcaster!"
  FID=123456 SIGNER_KEY=abc123... NEYNAR_KEY=xyz node examples/post-cast.js "Reply text" --parent 0xabcdef...
  FID=123456 SIGNER_KEY=abc123... NEYNAR_KEY=xyz node examples/post-cast.js "Channel post" --channel ethereum

Neynar v2 Method (requires managed signer):
  SIGNER_UUID=abc123... NEYNAR_KEY=xyz node examples/post-cast.js --neynar "Hello Farcaster!"
  SIGNER_UUID=abc123... NEYNAR_KEY=xyz node examples/post-cast.js --neynar "Reply text" --parent 0xabcdef...

Options:
  --neynar          Use Neynar v2 API instead of hub-direct
  --parent <hash>   Reply to a cast (cast hash)
  --channel <id>    Post in a channel (channel ID)
  --help           Show this help

Environment Variables:
  Hub-Direct Method:
    FID         - Your Farcaster ID (required)
    SIGNER_KEY  - Your ed25519 signer private key (required)
    NEYNAR_KEY  - Neynar API key (required)
  
  Neynar v2 Method:
    SIGNER_UUID - Your Neynar managed signer UUID (required)
    NEYNAR_KEY  - Neynar API key (required)

Examples:
  # Simple cast
  FID=123456 SIGNER_KEY=abc123 NEYNAR_KEY=xyz node examples/post-cast.js "GM Farcaster!"
  
  # Reply to a cast  
  FID=123456 SIGNER_KEY=abc123 NEYNAR_KEY=xyz node examples/post-cast.js "Interesting point!" --parent 0x1a2b3c...
  
  # Post in ethereum channel
  FID=123456 SIGNER_KEY=abc123 NEYNAR_KEY=xyz node examples/post-cast.js "ETH to the moon!" --channel ethereum
`);
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h') || args.length === 0) {
    showUsage();
    process.exit(0);
  }
  
  const useNeynar = args.includes('--neynar');
  const parentIndex = args.indexOf('--parent');
  const channelIndex = args.indexOf('--channel');
  
  // Extract text (first non-flag argument)
  let text = '';
  for (let i = 0; i < args.length; i++) {
    if (!args[i].startsWith('--') && args[i] !== 'neynar') {
      text = args[i];
      break;
    }
  }
  
  if (!text) {
    console.error('ERROR: Cast text is required');
    showUsage();
    process.exit(1);
  }
  
  const parent = parentIndex >= 0 ? args[parentIndex + 1] : null;
  const channel = channelIndex >= 0 ? args[channelIndex + 1] : null;
  
  try {
    let result;
    
    if (useNeynar) {
      // Neynar v2 method
      const signerUuid = process.env.SIGNER_UUID;
      const neynarKey = process.env.NEYNAR_KEY;
      
      if (!signerUuid || !neynarKey) {
        console.error('ERROR: SIGNER_UUID and NEYNAR_KEY required for Neynar v2 method');
        process.exit(1);
      }
      
      result = await postCastNeynarV2({
        signerUuid,
        neynarKey,
        text,
        parent,
        channel
      });
      
    } else {
      // Hub-direct method
      const fid = parseInt(process.env.FID);
      const signerKey = process.env.SIGNER_KEY;
      const neynarKey = process.env.NEYNAR_KEY;
      
      if (!fid || !signerKey || !neynarKey) {
        console.error('ERROR: FID, SIGNER_KEY, and NEYNAR_KEY required for hub-direct method');
        process.exit(1);
      }
      
      result = await postCastHubDirect({
        fid,
        signerPrivateKey: signerKey,
        neynarKey,
        text,
        parentCastId: parent ? parseParentCast(parent) : null,
        channel
      });
    }
    
    // Output JSON for easy parsing by other tools
    console.log(JSON.stringify({
      success: true,
      text,
      parent: parent || null,
      channel: channel || null,
      ...result
    }, null, 2));
    
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { 
  postCastHubDirect, 
  postCastNeynarV2 
};
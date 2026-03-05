---
name: farcaster
description: Complete Farcaster agent operations including registration, posting, engagement, and profile management via both hub-direct and Neynar v2 API methods. Battle-tested scripts for likes, follows, cast posting, and account setup.
metadata:
  {
    "clawdbot":
      {
        "emoji": "🐙",
        "homepage": "https://farcaster.xyz",
        "requires": { "packages": ["@farcaster/hub-nodejs", "ethers", "viem"] },
      },
  }
---

# Farcaster Agent Skill

Complete Farcaster protocol operations via hub-direct submission and Neynar v2 API.

## Architecture

Farcaster uses two complementary API layers:

| Layer | Endpoint | Purpose | Auth Method |
|-------|----------|---------|-------------|
| **Hub Protocol** | `hub-api.neynar.com/v1/submitMessage` | Submit signed messages (casts, reactions, follows) | `x-api-key` OR x402 micropayment |
| **Neynar v2 REST** | `api.neynar.com/v2/farcaster/...` | Read feeds, search, notifications, user data | `x-api-key` |

**Key Insight:** Hub-direct bypasses Neynar managed signers — raw ed25519 keys work directly for all operations.

## Quick Start

### 1. Dependencies

```bash
npm install @farcaster/hub-nodejs ethers viem
```

### 2. Configuration

Store credentials in JSON files:

```json
// secrets/neynar.json
{
  "apiKey": "NEYNAR_API_xxx"
}

// secrets/farcaster.json  
{
  "fid": 123456,
  "signerPrivateKey": "abc123def456...",
  "custodyPrivateKey": "fed654cba321..."
}
```

## Registration Flow (Optimism)

### Step 1: Register FID via IdGateway

```javascript
const { Wallet, JsonRpcProvider, Contract } = require('ethers');

const provider = new JsonRpcProvider('https://mainnet.optimism.io');
const wallet = new Wallet(privateKey, provider);

const idGateway = new Contract(
  '0x00000000Fc25870C6eD6b6c7E41Fb078b7656f69',
  ['function register(address recovery) external payable'],
  wallet
);

const tx = await idGateway.register(wallet.address, { 
  value: ethers.parseEther('0.003') // ~$5-10
});
const receipt = await tx.wait();

// Get FID from logs
const fidBig = receipt.logs[0].topics[1];  
const fid = parseInt(fidBig, 16);
```

### Step 2: Add Signer via KeyGateway

**Critical:** Must use `SignedKeyRequestValidator.encodeMetadata()` — manual ABI encoding fails!

```javascript
const crypto = require('crypto');
const { Contract } = require('ethers');

// Generate ed25519 keypair
const signerPrivateKey = crypto.randomBytes(32);
const signerPublicKey = require('tweetnacl').sign.keyPair.fromSeed(signerPrivateKey).publicKey;

// Get metadata from validator contract
const validator = new Contract(
  '0x00000000FC700472606ED4fA22623Acf62c60553',
  ['function encodeMetadata(uint256 requestFid, address requestSigner, bytes calldata signature) external pure returns (bytes memory)'],
  provider
);

// Self-signed EIP-712 key request (use your own FID as "app")
const signature = await wallet.signTypedData(/* EIP712 domain */, /* types */, {
  requestFid: BigInt(fid),
  key: `0x${Buffer.from(signerPublicKey).toString('hex')}`,
  deadline: BigInt(Math.floor(Date.now() / 1000) + 3600)
});

const metadata = await validator.encodeMetadata(fid, wallet.address, signature);

// Add signer
const keyGateway = new Contract(
  '0x00000000fC56947c7E7183f8Ca4B62398CaAdf0B',
  ['function add(uint32 keyType, bytes calldata key, uint8 metadataType, bytes calldata metadata) external'],
  wallet
);

await keyGateway.add(1, `0x${Buffer.from(signerPublicKey).toString('hex')}`, 1, metadata);
```

### Step 3: Register Fname

```javascript
const fnameRes = await fetch('https://fnames.farcaster.xyz/transfers', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: username,
    from: 0,
    to: fid,
    fid: fid,
    owner: wallet.address,
    timestamp: Math.floor(Date.now() / 1000),
    signature: await wallet.signMessage(/* fname transfer message */)
  })
});
```

## Posting Casts (Hub-Direct)

### Basic Cast

```javascript
const {
  makeCastAdd,
  NobleEd25519Signer,
  FarcasterNetwork,
  Message
} = require('@farcaster/hub-nodejs');

// Normalize signer key (may not have 0x prefix)
const signerKey = signerPrivateKey.startsWith('0x') ? signerPrivateKey : `0x${signerPrivateKey}`;
const signerBytes = Buffer.from(signerKey.slice(2), 'hex');
const signer = new NobleEd25519Signer(signerBytes);

const castResult = await makeCastAdd(
  {
    text: 'Hello Farcaster!',
    embeds: [],
    embedsDeprecated: [],
    mentions: [],
    mentionsPositions: []
  },
  { fid, network: FarcasterNetwork.MAINNET },
  signer
);

if (castResult.isErr()) throw new Error(`makeCastAdd failed: ${castResult.error}`);

// Encode with Message.encode().finish() — NOT msg.constructor.encode()
const messageBytes = Buffer.from(Message.encode(castResult.value).finish());

// Submit to Neynar hub
const response = await fetch('https://hub-api.neynar.com/v1/submitMessage', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/octet-stream',
    'x-api-key': neynarApiKey
  },
  body: messageBytes
});

if (!response.ok) throw new Error(`Hub rejected: ${await response.text()}`);
```

### Reply to Cast

```javascript
const castBody = {
  text: 'Great post!',
  parentCastId: { 
    fid: authorFid, 
    hash: Buffer.from(castHash.slice(2), 'hex') 
  },
  embeds: [],
  embedsDeprecated: [],
  mentions: [],
  mentionsPositions: []
};
```

### Post in Channel

```javascript
const castBody = {
  text: 'Channel post',
  parentUrl: 'https://warpcast.com/~/channel/ethereum',
  // ...
};
```

## Engagement (Hub-Direct)

### Like a Cast

```javascript
const { makeReactionAdd, ReactionType } = require('@farcaster/hub-nodejs');

const reactionResult = await makeReactionAdd(
  { 
    type: ReactionType.LIKE, 
    targetCastId: { fid: castAuthorFid, hash: Buffer.from(castHash.slice(2), 'hex') }
  },
  { fid, network: FarcasterNetwork.MAINNET },
  signer
);

if (reactionResult.isErr()) throw new Error(`makeReactionAdd failed: ${reactionResult.error}`);
// Submit same way as casts...
```

### Follow a User

```javascript
const { makeLinkAdd } = require('@farcaster/hub-nodejs');

const followResult = await makeLinkAdd(
  { type: 'follow', targetFid: targetUserFid },
  { fid, network: FarcasterNetwork.MAINNET },
  signer
);

if (followResult.isErr()) throw new Error(`makeLinkAdd failed: ${followResult.error}`);
// Submit same way...
```

## Profile Setup

```javascript
const { makeUserDataAdd } = require('@farcaster/hub-nodejs');

// USER_DATA_TYPE: PFP=1, DISPLAY=2, BIO=3, URL=5, USERNAME=6
const profileFields = [
  { type: 6, value: 'myusername' },     // username
  { type: 2, value: 'My Display Name' }, // display name  
  { type: 3, value: 'Bio text here' },   // bio
  { type: 1, value: 'https://...' },     // profile picture URL
];

for (const { type, value } of profileFields) {
  const msgResult = await makeUserDataAdd(
    { type, value },
    { fid, network: FarcasterNetwork.MAINNET },
    signer
  );
  
  if (msgResult.isErr()) continue;
  
  const messageBytes = Buffer.from(Message.encode(msgResult.value).finish());
  // Submit to hub...
}
```

## Alternative: Neynar v2 API (Simpler)

For posting only (not reactions/follows):

```javascript
const response = await fetch('https://api.neynar.com/v2/farcaster/cast', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': neynarApiKey
  },
  body: JSON.stringify({
    signer_uuid: 'your-neynar-managed-signer-uuid',
    text: 'Hello from Neynar API!',
    parent: castHash, // for replies
    channel_id: 'ethereum' // for channels
  })
});
```

**Limitation:** Neynar v2 reactions endpoint requires UUID signers, not raw keys.

## Reading Data (Neynar v2 REST)

All GET requests to `https://api.neynar.com/v2/farcaster/...` with `x-api-key` header:

### Feeds & Discovery

```bash
# Home feed
GET /feed?feed_type=following&fid={fid}&limit=25

# Channel feed  
GET /feed/channels?channel_ids=ethereum&limit=25

# Trending
GET /feed/trending?limit=25

# User's casts
GET /feed?feed_type=filter&filter_type=fids&fids={fid}&limit=25

# Search casts
GET /cast/search?q=ethereum&limit=10
```

### User Operations

```bash
# User info
GET /user/bulk?fids={fid}

# Search users
GET /user/search?q=username&limit=5

# Notifications
GET /notifications?fid={fid}&limit=25
```

### Cast Operations

```bash
# Get cast by hash
GET /cast?identifier={hash}&type=hash

# Get conversation thread
GET /cast/conversation?identifier={hash}&type=hash&reply_depth=2&limit=25
```

## Critical Gotchas

### ⚠️ Signer Key Format

```javascript
// Keys may not have 0x prefix — always normalize
const normalizedKey = key.startsWith('0x') ? key : `0x${key}`;
const signerBytes = Buffer.from(normalizedKey.slice(2), 'hex');

// NobleEd25519Signer expects exactly 32 bytes
if (signerBytes.length !== 32) throw new Error(`Invalid key length: ${signerBytes.length}`);
```

### ⚠️ Message Encoding

```javascript
// ✅ Correct
const messageBytes = Buffer.from(Message.encode(msg).finish());

// ❌ Wrong — doesn't work
const messageBytes = Buffer.from(msg.constructor.encode(msg).finish());
```

### ⚠️ Hub Sync Delays

New FIDs may not be recognized for minutes after on-chain registration. Always use Neynar's hub (`hub-api.neynar.com`) — public hubs (Pinata, Nemes) lag behind.

### ⚠️ Cast Limit

320 **bytes** (not characters!). Emoji and special characters count as multiple bytes.

### ⚠️ x402 Micropayments

If using x402 instead of API key:

```javascript
// Use EIP-3009 transferWithAuthorization
const payload = {
  x402Version: 1,  // Number, not string!
  // ... other fields
};
```

Cost: 0.001 USDC per submit call.

### ⚠️ Multi-Step Registration

When registering (register FID → add signer), wait for confirmations between transactions. Don't fire-and-forget.

## Contract Addresses (Optimism)

| Contract | Address |
|----------|---------|
| **ID Gateway** | `0x00000000Fc25870C6eD6b6c7E41Fb078b7656f69` |
| **Key Gateway** | `0x00000000fC56947c7E7183f8Ca4B62398CaAdf0B` |
| **SignedKeyRequestValidator** | `0x00000000FC700472606ED4fA22623Acf62c60553` |
| **ID Registry** | `0x00000000Fc6c5F01Fc30151999387Bb99A9f489b` |
| **Key Registry** | `0x00000000Fc1237824fb747aBDE0FF18990E59b7e` |

## Examples

See `examples/` directory for complete working scripts:

- [`examples/engage.js`](examples/engage.js) — Like, unlike, follow, unfollow
- [`examples/post-cast.js`](examples/post-cast.js) — Post casts with hub-direct and Neynar methods  
- [`examples/register-account.js`](examples/register-account.js) — Complete account setup

## Related Skills

- [erc20](../erc20/) — For USDC x402 payments
- [privy-wallet](../privy-wallet/) — For custody wallet management
- [weth](../weth/) — For ETH operations on Optimism
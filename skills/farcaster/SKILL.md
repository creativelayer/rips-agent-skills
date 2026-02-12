# Farcaster Skill

Post casts, read feeds, and engage on Farcaster via the Neynar API.

## Prerequisites

- **Neynar API key** (free tier available at neynar.com)
- **Registered FID** with a signer key (ed25519 keypair registered via KeyGateway on Optimism)
- **`@farcaster/hub-nodejs`** package for creating signed protocol messages
- **`viem`** (optional, for on-chain FID registration)

## Architecture

Farcaster uses two API layers:

| Layer | Host | Purpose |
|-------|------|---------|
| Hub Protocol | `hub-api.neynar.com` | Submit signed messages (casts, reactions, follows) |
| Neynar v2 REST | `api.neynar.com` | Read feeds, search, notifications, user data |

**Auth:** All requests require `x-api-key: <NEYNAR_API_KEY>` header.

## Posting Casts

Use `@farcaster/hub-nodejs` to create a signed `CastAdd` message, then submit the protobuf bytes to the Neynar hub:

```javascript
const { makeCastAdd, NobleEd25519Signer, FarcasterNetwork, Message } = require('@farcaster/hub-nodejs');

const signer = new NobleEd25519Signer(Buffer.from(SIGNER_PRIVATE_KEY, 'hex'));

const castResult = await makeCastAdd(
  { text: 'Hello Farcaster!', embeds: [], embedsDeprecated: [], mentions: [], mentionsPositions: [] },
  { fid: YOUR_FID, network: FarcasterNetwork.MAINNET },
  signer
);

const messageBytes = Buffer.from(Message.encode(castResult.value).finish());

// POST to hub-api.neynar.com/v1/submitMessage
// Content-Type: application/octet-stream
// x-api-key: <NEYNAR_API_KEY>
```

### Replying to Casts

Add `parentCastId` to the cast body:

```javascript
const castBody = {
  text: 'Great post!',
  parentCastId: { fid: 12345, hash: Buffer.from('abcdef...', 'hex') },
  embeds: [], embedsDeprecated: [], mentions: [], mentionsPositions: []
};
```

### Posting in a Channel

Use `parentUrl` with the channel's URL:

```javascript
const castBody = {
  text: 'Channel post',
  parentUrl: 'https://warpcast.com/~/channel/ethereum',
  // ...
};
```

## Reading Data (Neynar v2 REST)

All GET requests to `https://api.neynar.com/v2/farcaster/...` with `x-api-key` header.

### Feeds

| Endpoint | Description |
|----------|-------------|
| `GET /feed?feed_type=following&fid={fid}&limit=10` | Home feed |
| `GET /feed/channels?channel_ids={id}&limit=10` | Channel feed |
| `GET /feed/trending?limit=10` | Trending casts |
| `GET /feed?feed_type=filter&filter_type=fids&fids={fid}&limit=10` | User's casts |

### Notifications

```
GET /notifications?fid={fid}&limit=10
```

### Users

```
GET /user/bulk?fids={fid}
GET /user/search?q={query}&limit=5
```

### Casts

```
GET /cast?identifier={hash}&type=hash
GET /cast/conversation?identifier={hash}&type=hash&reply_depth=2&limit=10
```

### Channels

```
GET /channel?id={id}
GET /channel/search?q={query}&limit=5
```

## Reactions & Social (POST)

These use the Neynar v2 REST API with `signer_uuid`:

```javascript
// Like
POST /reaction  { signer_uuid, reaction_type: 'like', target: castHash }

// Recast
POST /reaction  { signer_uuid, reaction_type: 'recast', target: castHash }

// Follow
POST /user/follow  { signer_uuid, target_fids: [fid] }
```

## Contract Addresses (Optimism)

| Contract | Address |
|----------|---------|
| ID Gateway | `0x00000000Fc25870C6eD6b6c7E41Fb078b7656f69` |
| ID Registry | `0x00000000Fc6c5F01Fc30151999387Bb99A9f489b` |
| Key Gateway | `0x00000000fC56947c7E7183f8Ca4B62398CaAdf0B` |
| Key Registry | `0x00000000Fc1237824fb747aBDE0FF18990E59b7e` |

## See Also

- [erc20](../erc20/) - For USDC payments (x402)
- [privy-wallet](../privy-wallet/) - For signing transactions

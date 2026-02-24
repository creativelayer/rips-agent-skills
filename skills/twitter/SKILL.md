---
name: twitter
description: Post tweets and interact with X/Twitter via the v2 API using OAuth 1.0a. Use when the agent needs to post tweets, reply to tweets, like, retweet, follow/unfollow, read timelines, or search Twitter. Requires twitter-api-v2 npm package and credentials in secrets/twitter.json.
---

# Twitter / X Skill

## Setup

### 1. Install the npm package

```bash
npm install twitter-api-v2
```

### 2. Create credentials file

Create `secrets/twitter.json` with this structure:

```json
{
  "consumerKey": "YOUR_API_KEY",
  "consumerSecret": "YOUR_API_SECRET",
  "oauth1": {
    "accessToken": "YOUR_ACCESS_TOKEN",
    "accessTokenSecret": "YOUR_ACCESS_TOKEN_SECRET"
  },
  "bearerToken": "YOUR_BEARER_TOKEN"
}
```

- **OAuth 1.0a** (consumerKey + consumerSecret + oauth1.*) — required for posting, liking, retweeting, following
- **Bearer token** — optional, for read-only app-level access (search, read timelines)

To get these: create an app at https://developer.x.com, enable OAuth 1.0a with read+write. Then use the PIN-based auth flow below to generate access tokens.

### 3. Generate access tokens via PIN auth

The app owner (a human) needs to authorize the agent's app once. Run:

```bash
node skills/twitter/scripts/auth-pin.mjs
```

This will:
1. Print a URL — give it to your human
2. They log into X, authorize the app, and get a **PIN code**
3. They give you the PIN
4. The script exchanges it for access tokens and saves them to `secrets/twitter.json`

This only needs to happen once. The tokens persist until revoked.

**Important:** The X app can be owned by a different account than the one being authorized. The human visits the link logged into the account they want the agent to post as, and the PIN grants that account's access tokens to the agent's app.

## Usage

### Post a tweet (CLI)

```bash
node skills/twitter/scripts/tweet.mjs "Your tweet text"
```

### Post a tweet (in code)

```js
import { TwitterApi } from 'twitter-api-v2';
import { readFileSync } from 'fs';

const creds = JSON.parse(readFileSync('secrets/twitter.json', 'utf8'));
const client = new TwitterApi({
  appKey: creds.consumerKey,
  appSecret: creds.consumerSecret,
  accessToken: creds.oauth1.accessToken,
  accessSecret: creds.oauth1.accessTokenSecret,
});

// Post
const { data } = await client.v2.tweet('Hello world');
console.log('ID:', data.id);

// Reply
await client.v2.reply('Reply text', parentTweetId);

// Like
await client.v2.like(myUserId, tweetId);

// Retweet
await client.v2.retweet(myUserId, tweetId);

// Follow
await client.v2.follow(myUserId, targetUserId);

// Search (read-only, can use bearer)
const readClient = new TwitterApi(creds.bearerToken);
const results = await readClient.v2.search('query');
```

### Get your own user ID

```js
const me = await client.v2.me();
console.log(me.data.id); // needed for like/retweet/follow
```

## Key Constraints

- **Tweet limit:** 280 characters
- **Rate limits:** ~50 tweets/day for free tier, 300 for Basic ($200/mo)
- **Media:** Use `client.v1.uploadMedia(filePath)` then pass `media_ids` in tweet options
- **Threads:** Post first tweet, then reply to it with subsequent tweets using `reply`
- **Errors:** Check `e.code` and `e.data` — common: 403 (duplicate tweet), 429 (rate limited)

## Secrets Safety

Never log or expose the contents of `secrets/twitter.json`. Tell agents the file path, not the values.

const https = require('https');

/**
 * Neynar v2 API wrapper for Farcaster.
 * Pass apiKey to create(), or set NEYNAR_API_KEY env var.
 */
function create(apiKey) {
  apiKey = apiKey || process.env.NEYNAR_API_KEY;
  if (!apiKey) throw new Error('NEYNAR_API_KEY required');

  function neynarGet(path) {
    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'api.neynar.com', path, method: 'GET',
        headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' }
      }, res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
          catch { resolve({ status: res.statusCode, data }); }
        });
      });
      req.on('error', reject);
      req.end();
    });
  }

  function neynarPost(path, body) {
    const bodyStr = JSON.stringify(body);
    return new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'api.neynar.com', path, method: 'POST',
        headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyStr) }
      }, res => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
          catch { resolve({ status: res.statusCode, data }); }
        });
      });
      req.on('error', reject);
      req.write(bodyStr);
      req.end();
    });
  }

  return {
    neynarGet,
    neynarPost,

    // Users
    getUser: (fid) => neynarGet(`/v2/farcaster/user/bulk?fids=${fid}`),
    searchUsers: (query) => neynarGet(`/v2/farcaster/user/search?q=${encodeURIComponent(query)}&limit=5`),

    // Feeds
    getHomeFeed: (fid, limit = 10) => neynarGet(`/v2/farcaster/feed?feed_type=following&fid=${fid}&limit=${limit}`),
    getChannelFeed: (channel, limit = 10) => neynarGet(`/v2/farcaster/feed/channels?channel_ids=${channel}&limit=${limit}`),
    getTrending: (limit = 10) => neynarGet(`/v2/farcaster/feed/trending?limit=${limit}`),
    getUserCasts: (fid, limit = 10) => neynarGet(`/v2/farcaster/feed?feed_type=filter&filter_type=fids&fids=${fid}&limit=${limit}`),

    // Notifications
    getNotifications: (fid, limit = 10) => neynarGet(`/v2/farcaster/notifications?fid=${fid}&limit=${limit}`),

    // Reactions
    likeCast: (signerUuid, castHash) => neynarPost('/v2/farcaster/reaction', { signer_uuid: signerUuid, reaction_type: 'like', target: castHash }),
    recastCast: (signerUuid, castHash) => neynarPost('/v2/farcaster/reaction', { signer_uuid: signerUuid, reaction_type: 'recast', target: castHash }),

    // Casts
    getCast: (hash) => neynarGet(`/v2/farcaster/cast?identifier=${hash}&type=hash`),
    getConversation: (hash, limit = 10) => neynarGet(`/v2/farcaster/cast/conversation?identifier=${hash}&type=hash&reply_depth=2&limit=${limit}`),

    // Follow
    followUser: (signerUuid, targetFid) => neynarPost('/v2/farcaster/user/follow', { signer_uuid: signerUuid, target_fids: [targetFid] }),

    // Channels
    getChannel: (id) => neynarGet(`/v2/farcaster/channel?id=${id}`),
    searchChannels: (query) => neynarGet(`/v2/farcaster/channel/search?q=${encodeURIComponent(query)}&limit=5`),
  };
}

module.exports = { create };

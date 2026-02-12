const { create } = require('./neynar-api');
const { postCast } = require('./post-cast');

/**
 * Check notifications and reply to mentions.
 *
 * Env required:
 *   NEYNAR_API_KEY, SIGNER_KEY, FID
 */
async function checkAndReply() {
  const apiKey = process.env.NEYNAR_API_KEY;
  const signerPrivateKey = process.env.SIGNER_KEY;
  const fid = parseInt(process.env.FID);

  const api = create(apiKey);

  // Get recent notifications
  const { data } = await api.getNotifications(fid, 25);
  const mentions = (data.notifications || []).filter(n =>
    n.type === 'mention' || n.type === 'reply'
  );

  console.log(`Found ${mentions.length} mentions/replies`);

  for (const notif of mentions.slice(0, 5)) {
    const cast = notif.cast;
    if (!cast) continue;

    console.log(`From @${cast.author?.username}: ${cast.text?.slice(0, 80)}`);

    // Reply to the cast
    const parentCastId = {
      fid: cast.author.fid,
      hash: Buffer.from(cast.hash.slice(2), 'hex')
    };

    await postCast({
      apiKey,
      signerPrivateKey,
      fid,
      text: `Thanks for the mention! 🎉`,
      parentCastId
    });

    console.log(`Replied to ${cast.hash}`);
  }
}

if (require.main === module) {
  checkAndReply().catch(e => { console.error(e); process.exit(1); });
}

module.exports = { checkAndReply };

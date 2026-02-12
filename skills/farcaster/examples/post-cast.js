const https = require('https');
const {
  makeCastAdd,
  NobleEd25519Signer,
  FarcasterNetwork,
  Message
} = require('@farcaster/hub-nodejs');

/**
 * Post a cast to Farcaster using Neynar hub API.
 *
 * Env/config required:
 *   NEYNAR_API_KEY  — Neynar API key
 *   SIGNER_KEY      — ed25519 signer private key (hex)
 *   FID             — your Farcaster ID (number)
 */
async function postCast({ apiKey, signerPrivateKey, fid, text, parentCastId, parentUrl }) {
  const signerBytes = Buffer.from(signerPrivateKey, 'hex');
  const signer = new NobleEd25519Signer(signerBytes);

  const castBody = {
    text,
    embeds: [],
    embedsDeprecated: [],
    mentions: [],
    mentionsPositions: []
  };
  if (parentCastId) castBody.parentCastId = parentCastId;
  if (parentUrl) castBody.parentUrl = parentUrl;

  const castResult = await makeCastAdd(
    castBody,
    { fid, network: FarcasterNetwork.MAINNET },
    signer
  );
  if (castResult.isErr()) throw new Error(`Failed to create cast: ${castResult.error}`);

  const cast = castResult.value;
  const hash = '0x' + Buffer.from(cast.hash).toString('hex');
  const messageBytes = Buffer.from(Message.encode(cast).finish());

  const result = await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'hub-api.neynar.com',
      path: '/v1/submitMessage',
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'x-api-key': apiKey
      }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, data }); }
      });
    });
    req.on('error', reject);
    req.write(messageBytes);
    req.end();
  });

  if (result.status !== 200) throw new Error(`Submit failed: ${JSON.stringify(result.data)}`);
  console.log('Cast posted:', hash);
  return { hash };
}

// CLI usage
if (require.main === module) {
  const apiKey = process.env.NEYNAR_API_KEY;
  const signerPrivateKey = process.env.SIGNER_KEY;
  const fid = parseInt(process.env.FID);
  const text = process.argv[2] || 'Hello from Farcaster skill!';

  postCast({ apiKey, signerPrivateKey, fid, text })
    .then(r => console.log(r))
    .catch(e => { console.error(e); process.exit(1); });
}

module.exports = { postCast };

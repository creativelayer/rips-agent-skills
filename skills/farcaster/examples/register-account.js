#!/usr/bin/env node

/**
 * Complete Farcaster Account Registration
 * 
 * Registers a new FID, adds a signer, sets profile data, and optionally registers an fname.
 * This is a complete end-to-end setup script for new Farcaster accounts.
 * 
 * Usage:
 *   CUSTODY_KEY=0x... NEYNAR_KEY=xyz node examples/register-account.js "Display Name" username "Bio text" "https://avatar.url"
 *   node examples/register-account.js --help
 * 
 * Prerequisites:
 *   - Wallet with 0.003+ ETH on Optimism for registration costs
 *   - Neynar API key for hub submission
 */

const crypto = require('crypto');
const { Wallet, JsonRpcProvider, Contract, formatEther } = require('ethers');
const {
  makeUserDataAdd,
  NobleEd25519Signer,
  FarcasterNetwork,
  Message
} = require('@farcaster/hub-nodejs');

// Contract addresses on Optimism
const ID_GATEWAY = '0x00000000Fc25870C6eD6b6c7E41Fb078b7656f69';
const KEY_GATEWAY = '0x00000000fC56947c7E7183f8Ca4B62398CaAdf0B';
const ID_REGISTRY = '0x00000000Fc6c5F01Fc30151999387Bb99A9f489b';
const SIGNED_KEY_REQUEST_VALIDATOR = '0x00000000FC700472606ED4fA22623Acf62c60553';

// Basic ABIs for the contracts we need
const ID_GATEWAY_ABI = [
  'function register(address recovery) external payable'
];

const KEY_GATEWAY_ABI = [
  'function add(uint32 keyType, bytes calldata key, uint8 metadataType, bytes calldata metadata) external'
];

const ID_REGISTRY_ABI = [
  'function idOf(address owner) external view returns (uint256)',
  'event Register(address indexed to, uint256 indexed id, address recovery)'
];

const VALIDATOR_ABI = [
  'function encodeMetadata(uint256 requestFid, address requestSigner, bytes calldata signature) external pure returns (bytes memory)'
];

// EIP-712 domain and types for signed key requests
const EIP712_DOMAIN = {
  name: 'Farcaster SignedKeyRequestValidator',
  version: '1',
  chainId: 10, // Optimism
  verifyingContract: SIGNED_KEY_REQUEST_VALIDATOR
};

const EIP712_TYPES = {
  SignedKeyRequest: [
    { name: 'requestFid', type: 'uint256' },
    { name: 'key', type: 'bytes' },
    { name: 'deadline', type: 'uint256' }
  ]
};

async function waitForTransaction(provider, txHash, description) {
  console.error(`⏳ Waiting for ${description}...`);
  const receipt = await provider.waitForTransaction(txHash);
  if (receipt.status !== 1) {
    throw new Error(`${description} failed`);
  }
  console.error(`✅ ${description} confirmed`);
  return receipt;
}

async function registerFid(wallet, provider) {
  console.error('\n📝 Registering FID...');
  
  // Check if already registered
  const idRegistry = new Contract(ID_REGISTRY, ID_REGISTRY_ABI, provider);
  const existingFid = await idRegistry.idOf(wallet.address);
  
  if (existingFid > 0n) {
    console.error(`✅ Already registered with FID: ${existingFid.toString()}`);
    return Number(existingFid);
  }
  
  // Register new FID
  const idGateway = new Contract(ID_GATEWAY, ID_GATEWAY_ABI, wallet);
  const tx = await idGateway.register(wallet.address, {
    value: ethers.parseEther('0.003') // ~$5-10 USD
  });
  
  const receipt = await waitForTransaction(provider, tx.hash, 'FID registration');
  
  // Extract FID from events
  const registerEvent = receipt.logs.find(log => {
    try {
      const parsed = idRegistry.interface.parseLog(log);
      return parsed.name === 'Register';
    } catch (e) {
      return false;
    }
  });
  
  if (!registerEvent) {
    throw new Error('Could not find Register event in transaction logs');
  }
  
  const fid = Number(registerEvent.args.id);
  console.error(`✅ FID registered: ${fid}`);
  return fid;
}

async function addSigner(wallet, provider, fid) {
  console.error('\n🔑 Adding signer...');
  
  // Generate ed25519 keypair
  const signerPrivateKey = crypto.randomBytes(32);
  const { publicKey: signerPublicKey } = require('tweetnacl').sign.keyPair.fromSeed(signerPrivateKey);
  
  // Create self-signed key request (use own FID as the "app")
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600); // 1 hour from now
  const keyBytes = `0x${Buffer.from(signerPublicKey).toString('hex')}`;
  
  const signedKeyRequest = {
    requestFid: BigInt(fid),
    key: keyBytes,
    deadline
  };
  
  // Sign the EIP-712 message
  const signature = await wallet.signTypedData(EIP712_DOMAIN, EIP712_TYPES, signedKeyRequest);
  
  // Get encoded metadata from validator
  const validator = new Contract(SIGNED_KEY_REQUEST_VALIDATOR, VALIDATOR_ABI, provider);
  const metadata = await validator.encodeMetadata(fid, wallet.address, signature);
  
  // Add signer to key gateway
  const keyGateway = new Contract(KEY_GATEWAY, KEY_GATEWAY_ABI, wallet);
  const tx = await keyGateway.add(
    1, // keyType: ed25519
    keyBytes,
    1, // metadataType: SignedKeyRequestMetadata
    metadata
  );
  
  await waitForTransaction(provider, tx.hash, 'signer addition');
  
  return {
    signerPrivateKey: Buffer.from(signerPrivateKey).toString('hex'),
    signerPublicKey: Buffer.from(signerPublicKey).toString('hex')
  };
}

async function setProfile(fid, signerPrivateKey, neynarKey, displayName, username, bio, avatarUrl) {
  console.error('\n👤 Setting profile...');
  
  const signerBytes = Buffer.from(signerPrivateKey, 'hex');
  const signer = new NobleEd25519Signer(signerBytes);
  
  // USER_DATA_TYPE constants
  const USER_DATA_TYPE = {
    PFP: 1,
    DISPLAY: 2, 
    BIO: 3,
    URL: 5,
    USERNAME: 6
  };
  
  const profileFields = [];
  if (username) profileFields.push({ type: USER_DATA_TYPE.USERNAME, value: username });
  if (displayName) profileFields.push({ type: USER_DATA_TYPE.DISPLAY, value: displayName });
  if (bio) profileFields.push({ type: USER_DATA_TYPE.BIO, value: bio });
  if (avatarUrl) profileFields.push({ type: USER_DATA_TYPE.PFP, value: avatarUrl });
  
  for (const { type, value } of profileFields) {
    try {
      const msgResult = await makeUserDataAdd(
        { type, value },
        { fid, network: FarcasterNetwork.MAINNET },
        signer
      );
      
      if (msgResult.isErr()) {
        console.error(`❌ Failed to create ${type} message:`, msgResult.error.message);
        continue;
      }
      
      const messageBytes = Buffer.from(Message.encode(msgResult.value).finish());
      
      const response = await fetch('https://hub-api.neynar.com/v1/submitMessage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'x-api-key': neynarKey
        },
        body: messageBytes
      });
      
      const typeName = ['', 'PFP', 'Display Name', 'Bio', '', 'URL', 'Username'][type];
      
      if (response.ok) {
        console.error(`✅ Set ${typeName}: ${value.slice(0, 40)}${value.length > 40 ? '...' : ''}`);
      } else {
        const errorText = await response.text();
        console.error(`❌ Failed to set ${typeName}:`, errorText.slice(0, 80));
      }
      
    } catch (error) {
      console.error(`❌ Error setting profile field ${type}:`, error.message);
    }
  }
}

async function registerFname(wallet, fid, username) {
  if (!username) {
    console.error('\n⏭️  Skipping fname registration (no username provided)');
    return null;
  }
  
  console.error(`\n📛 Registering fname: ${username}...`);
  
  const timestamp = Math.floor(Date.now() / 1000);
  const messageToSign = require('ethers').AbiCoder.defaultAbiCoder().encode(
    ['string', 'uint256', 'string', 'uint256', 'uint256'],
    ['Farcaster fname transfer', timestamp, username, 0, fid]
  ).slice(2); // Remove 0x prefix
  
  const signature = await wallet.signMessage(Buffer.from(messageToSign, 'hex'));
  
  const response = await fetch('https://fnames.farcaster.xyz/transfers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: username,
      from: 0,
      to: fid,
      fid: fid,
      owner: wallet.address,
      timestamp,
      signature
    })
  });
  
  if (response.ok) {
    const data = await response.json();
    console.error(`✅ Fname registered! Transfer ID: ${data.transfer?.id}`);
    return data.transfer?.id;
  } else {
    const errorText = await response.text();
    console.error(`❌ Fname registration failed: ${errorText.slice(0, 100)}`);
    console.error('(Username was still set via profile data)');
    return null;
  }
}

function showUsage() {
  console.log(`
Complete Farcaster Account Registration

Usage:
  CUSTODY_KEY=0x... NEYNAR_KEY=xyz node examples/register-account.js "Display Name" username "Bio text" "https://avatar.url"
  node examples/register-account.js --help

Arguments (all optional):
  display_name  - Display name for the profile
  username      - Username (will attempt fname registration)
  bio          - Profile bio text
  avatar_url   - Profile picture URL

Environment Variables:
  CUSTODY_KEY  - Private key for Optimism wallet with ETH (required)
  NEYNAR_KEY   - Neynar API key for hub submission (required)

Prerequisites:
  - Wallet with 0.003+ ETH on Optimism for registration costs
  - Neynar API key (free tier available at neynar.com)

Examples:
  # Full registration
  CUSTODY_KEY=0xabc123... NEYNAR_KEY=xyz node examples/register-account.js "John Doe" johndoe "Building cool things" "https://example.com/avatar.png"
  
  # Minimal registration (FID + signer only)
  CUSTODY_KEY=0xabc123... NEYNAR_KEY=xyz node examples/register-account.js
  
  # Just display name and username
  CUSTODY_KEY=0xabc123... NEYNAR_KEY=xyz node examples/register-account.js "John Doe" johndoe

Cost:
  - FID registration: ~0.003 ETH (~$5-10 USD)
  - Gas for signer addition: ~0.0001 ETH
  - Total: ~0.0031 ETH
`);
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    showUsage();
    process.exit(0);
  }
  
  const custodyKey = process.env.CUSTODY_KEY;
  const neynarKey = process.env.NEYNAR_KEY;
  
  if (!custodyKey || !neynarKey) {
    console.error('ERROR: CUSTODY_KEY and NEYNAR_KEY environment variables required');
    showUsage();
    process.exit(1);
  }
  
  const [displayName, username, bio, avatarUrl] = args;
  
  try {
    // Setup
    const provider = new JsonRpcProvider('https://mainnet.optimism.io');
    const wallet = new Wallet(custodyKey, provider);
    
    console.error('🚀 Starting Farcaster account registration...');
    console.error(`📍 Address: ${wallet.address}`);
    
    // Check balance
    const balance = await provider.getBalance(wallet.address);
    console.error(`💰 Balance: ${formatEther(balance)} ETH`);
    
    if (balance < ethers.parseEther('0.0035')) {
      console.error('⚠️  Warning: Balance may be insufficient for registration (~0.0035 ETH needed)');
    }
    
    // Step 1: Register FID
    const fid = await registerFid(wallet, provider);
    
    // Step 2: Add signer
    const { signerPrivateKey, signerPublicKey } = await addSigner(wallet, provider, fid);
    
    // Step 3: Set profile (if data provided)
    if (displayName || username || bio || avatarUrl) {
      await setProfile(fid, signerPrivateKey, neynarKey, displayName, username, bio, avatarUrl);
    }
    
    // Step 4: Register fname (if username provided)
    const fnameTransferId = await registerFname(wallet, fid, username);
    
    // Final success output
    console.error('\n🎉 Registration complete!');
    console.error(`   FID: ${fid}`);
    console.error(`   Address: ${wallet.address}`);
    if (username) console.error(`   Username: @${username}`);
    
    // Output JSON for easy parsing by other tools
    const result = {
      success: true,
      fid,
      address: wallet.address,
      signerPrivateKey,
      signerPublicKey,
      profile: {
        displayName: displayName || null,
        username: username || null,
        bio: bio || null,
        avatarUrl: avatarUrl || null
      },
      fnameTransferId: fnameTransferId || null
    };
    
    console.log(JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { 
  registerFid, 
  addSigner, 
  setProfile, 
  registerFname 
};
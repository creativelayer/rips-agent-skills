/**
 * Send ETH using a Privy wallet
 * 
 * Usage: node send-eth.mjs <recipient> <amount_eth>
 * Example: node send-eth.mjs 0x1234...5678 0.01
 * 
 * Requires:
 *   - PRIVY_CREDS_PATH: path to privy-wallet.json
 *   - PRIVY_AUTH_KEY_PATH: path to auth key file
 *   - RPC_URL: Base RPC endpoint (optional, defaults to public)
 */

import { PrivyClient } from '@privy-io/node';
import { createViemAccount } from '@privy-io/node/viem';
import { createPublicClient, createWalletClient, http, parseEther, formatEther } from 'viem';
import { base } from 'viem/chains';
import fs from 'fs';

const CREDS_PATH = process.env.PRIVY_CREDS_PATH || 'secrets/privy-wallet.json';
const AUTH_KEY_PATH = process.env.PRIVY_AUTH_KEY_PATH || 'secrets/privy-auth-key.txt';
const RPC_URL = process.env.RPC_URL || 'https://mainnet.base.org';

async function main() {
  const [recipient, amountEth] = process.argv.slice(2);
  
  if (!recipient || !amountEth) {
    console.error('Usage: node send-eth.mjs <recipient> <amount_eth>');
    process.exit(1);
  }

  // Load credentials
  const creds = JSON.parse(fs.readFileSync(CREDS_PATH, 'utf8'));
  const authKey = fs.readFileSync(AUTH_KEY_PATH, 'utf8').trim();

  // Set up clients
  const privy = new PrivyClient({ appId: creds.appId, appSecret: creds.appSecret });
  const publicClient = createPublicClient({ chain: base, transport: http(RPC_URL) });

  const account = createViemAccount(privy, {
    walletId: creds.walletId,
    address: creds.address,
    authorizationContext: { authorization_private_keys: [authKey] }
  });

  const walletClient = createWalletClient({ account, chain: base, transport: http(RPC_URL) });

  // Check balance first
  const balance = await publicClient.getBalance({ address: account.address });
  console.log(`Wallet: ${account.address}`);
  console.log(`Balance: ${formatEther(balance)} ETH`);

  const value = parseEther(amountEth);
  if (balance < value) {
    console.error('Insufficient balance!');
    process.exit(1);
  }

  // Send transaction
  console.log(`Sending ${amountEth} ETH to ${recipient}...`);
  const txHash = await walletClient.sendTransaction({
    to: recipient,
    value,
  });

  console.log(`TX: ${txHash}`);
  
  // Wait for confirmation
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
  console.log(`Confirmed in block ${receipt.blockNumber}`);
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});

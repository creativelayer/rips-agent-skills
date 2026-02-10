/**
 * Send USDC on Base
 * 
 * Usage: node send-usdc.mjs <recipient> <amount>
 * Example: node send-usdc.mjs 0x1234...5678 10
 * 
 * Requires:
 *   - PRIVY_CREDS_PATH: path to privy-wallet.json
 *   - PRIVY_AUTH_KEY_PATH: path to auth key file
 *   - RPC_URL: Base RPC endpoint (optional)
 */

import { PrivyClient } from '@privy-io/node';
import { createViemAccount } from '@privy-io/node/viem';
import { createPublicClient, createWalletClient, http, parseUnits, formatUnits, encodeFunctionData } from 'viem';
import { base } from 'viem/chains';
import fs from 'fs';

const CREDS_PATH = process.env.PRIVY_CREDS_PATH || 'secrets/privy-wallet.json';
const AUTH_KEY_PATH = process.env.PRIVY_AUTH_KEY_PATH || 'secrets/privy-auth-key.txt';
const RPC_URL = process.env.RPC_URL || 'https://mainnet.base.org';

const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

async function main() {
  const [recipient, amountStr] = process.argv.slice(2);
  
  if (!recipient || !amountStr) {
    console.error('Usage: node send-usdc.mjs <recipient> <amount>');
    process.exit(1);
  }

  const amount = parseUnits(amountStr, 6);

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

  // Check balance
  const balance = await publicClient.readContract({
    address: USDC,
    abi: [{ name: 'balanceOf', type: 'function', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] }],
    functionName: 'balanceOf',
    args: [account.address]
  });

  console.log(`Wallet: ${account.address}`);
  console.log(`USDC balance: ${formatUnits(balance, 6)}`);

  if (balance < amount) {
    console.error('Insufficient USDC balance!');
    process.exit(1);
  }

  // Send USDC
  console.log(`Sending ${amountStr} USDC to ${recipient}...`);

  const txHash = await walletClient.sendTransaction({
    to: USDC,
    data: encodeFunctionData({
      abi: [{ 
        name: 'transfer', 
        type: 'function', 
        inputs: [{ type: 'address' }, { type: 'uint256' }], 
        outputs: [{ type: 'bool' }] 
      }],
      functionName: 'transfer',
      args: [recipient, amount]
    })
  });

  console.log(`TX: ${txHash}`);
  await publicClient.waitForTransactionReceipt({ hash: txHash });

  // Check new balance
  const newBalance = await publicClient.readContract({
    address: USDC,
    abi: [{ name: 'balanceOf', type: 'function', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] }],
    functionName: 'balanceOf',
    args: [account.address]
  });

  console.log(`New USDC balance: ${formatUnits(newBalance, 6)}`);
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});

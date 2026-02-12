/**
 * RIPS Staking — stake, claim rewards, check status.
 *
 * Usage:
 *   node rips-stake.mjs status
 *   node rips-stake.mjs stake
 *   node rips-stake.mjs claim
 *
 * Requires: viem, @privy-io/node (or any wallet client)
 * Configure: WALLET_ADDRESS, RPC_URL, and wallet client setup below.
 */

import { createPublicClient, http, formatEther, formatUnits, encodeFunctionData, maxUint256 } from 'viem';
import { base } from 'viem/chains';

// === CONFIG — replace with your setup ===
const WALLET = process.env.WALLET_ADDRESS || '0xYOUR_WALLET';
const RPC_URL = process.env.RPC_URL || 'https://mainnet.base.org';

const RIPS = '0xc1aDDAe61Bc74a14971BFA48A0B7141AdeD4fB07';
const STAKER = '0xB6d7B6F1c4Ad64d75fc8c63e56188b6e3eF0c004';
const FEEPOOL = '0xb0D256824ACd2EE1cbC03e97C47A7B5fec9Fe5f3';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// === ABIs ===
const erc20Abi = [
  { name: 'balanceOf', type: 'function', inputs: [{ name: 'account', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { name: 'approve', type: 'function', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { name: 'allowance', type: 'function', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' }
];

const stakerAbi = [
  { name: 'stake', type: 'function', inputs: [{ name: 'user', type: 'address' }, { name: 'token', type: 'address' }, { name: 'quantity', type: 'uint256' }, { name: 'customize', type: 'bool' }, { name: 'customPools', type: 'address[]' }], outputs: [] },
  { name: 'getStake', type: 'function', inputs: [{ name: 'user', type: 'address' }, { name: 'token', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { name: 'claimRewards', type: 'function', inputs: [{ name: 'user', type: 'address' }, { name: 'token', type: 'address' }], outputs: [] }
];

const feePoolAbi = [
  { name: 'getUnpaidRewards', type: 'function', inputs: [{ name: 'user', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' }
];

// === CLIENTS ===
const publicClient = createPublicClient({ chain: base, transport: http(RPC_URL) });

// TODO: Set up your wallet client here. Example with Privy:
// import { createViemAccount } from '@privy-io/node/viem';
// import { PrivyClient } from '@privy-io/node';
// import { createWalletClient } from 'viem';
// const walletClient = createWalletClient({ account, chain: base, transport: http(RPC_URL) });
let walletClient = null; // Replace with your wallet client

const action = process.argv[2] || 'status';

if (action === 'status') {
  const [ripsBalance, staked, claimable] = await Promise.all([
    publicClient.readContract({ address: RIPS, abi: erc20Abi, functionName: 'balanceOf', args: [WALLET] }),
    publicClient.readContract({ address: STAKER, abi: stakerAbi, functionName: 'getStake', args: [WALLET, RIPS] }),
    publicClient.readContract({ address: FEEPOOL, abi: feePoolAbi, functionName: 'getUnpaidRewards', args: [WALLET] })
  ]);
  console.log('RIPS balance:', formatEther(ripsBalance));
  console.log('RIPS staked:', formatEther(staked));
  console.log('USDC claimable:', formatUnits(claimable, 6));
}

if (action === 'stake') {
  if (!walletClient) { console.error('Wallet client not configured'); process.exit(1); }
  const ripsBalance = await publicClient.readContract({ address: RIPS, abi: erc20Abi, functionName: 'balanceOf', args: [WALLET] });
  if (ripsBalance === 0n) { console.log('No RIPS to stake'); process.exit(1); }
  console.log('Staking', formatEther(ripsBalance), 'RIPS...');

  const allowance = await publicClient.readContract({ address: RIPS, abi: erc20Abi, functionName: 'allowance', args: [WALLET, STAKER] });
  if (allowance < ripsBalance) {
    console.log('Approving RIPS...');
    const approveTx = await walletClient.sendTransaction({
      to: RIPS, data: encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [STAKER, maxUint256] })
    });
    await publicClient.waitForTransactionReceipt({ hash: approveTx });
    console.log('Approved');
  }

  const stakeTx = await walletClient.sendTransaction({
    to: STAKER, data: encodeFunctionData({ abi: stakerAbi, functionName: 'stake', args: [WALLET, RIPS, ripsBalance, true, [FEEPOOL]] })
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: stakeTx });
  console.log('Staked! TX:', stakeTx, 'Status:', receipt.status);
}

if (action === 'claim') {
  if (!walletClient) { console.error('Wallet client not configured'); process.exit(1); }
  const claimable = await publicClient.readContract({ address: FEEPOOL, abi: feePoolAbi, functionName: 'getUnpaidRewards', args: [WALLET] });
  if (claimable === 0n) { console.log('Nothing to claim'); process.exit(0); }
  console.log('Claiming', formatUnits(claimable, 6), 'USDC...');
  const claimTx = await walletClient.sendTransaction({
    to: STAKER, data: encodeFunctionData({ abi: stakerAbi, functionName: 'claimRewards', args: [WALLET, USDC] })
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: claimTx });
  console.log('Claimed! TX:', claimTx, 'Status:', receipt.status);
}

/**
 * Swap WETH to USDC on Base via Uniswap V3
 * 
 * Usage: node swap-weth-to-usdc.mjs <amount_weth> [min_usdc]
 * Example: node swap-weth-to-usdc.mjs 0.01 18
 * 
 * Requires:
 *   - PRIVY_CREDS_PATH: path to privy-wallet.json
 *   - PRIVY_AUTH_KEY_PATH: path to auth key file
 *   - RPC_URL: Base RPC endpoint (optional)
 */

import { PrivyClient } from '@privy-io/node';
import { createViemAccount } from '@privy-io/node/viem';
import { createPublicClient, createWalletClient, http, parseEther, parseUnits, formatUnits, encodeFunctionData, maxUint256 } from 'viem';
import { base } from 'viem/chains';
import fs from 'fs';

const CREDS_PATH = process.env.PRIVY_CREDS_PATH || 'secrets/privy-wallet.json';
const AUTH_KEY_PATH = process.env.PRIVY_AUTH_KEY_PATH || 'secrets/privy-auth-key.txt';
const RPC_URL = process.env.RPC_URL || 'https://mainnet.base.org';

const WETH = '0x4200000000000000000000000000000000000006';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const SWAP_ROUTER = '0x2626664c2603336E57B271c5C0b26F421741e481';

const ERC20_ABI = [
  { name: 'balanceOf', type: 'function', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'approve', type: 'function', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { name: 'allowance', type: 'function', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }] }
];

async function main() {
  const [amountWeth, minUsdcArg] = process.argv.slice(2);
  
  if (!amountWeth) {
    console.error('Usage: node swap-weth-to-usdc.mjs <amount_weth> [min_usdc]');
    process.exit(1);
  }

  const amountIn = parseEther(amountWeth);
  const minOut = minUsdcArg ? parseUnits(minUsdcArg, 6) : 0n;

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

  // Check WETH balance
  const wethBalance = await publicClient.readContract({
    address: WETH,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [account.address]
  });

  console.log(`Wallet: ${account.address}`);
  console.log(`WETH balance: ${formatUnits(wethBalance, 18)}`);

  if (wethBalance < amountIn) {
    console.error('Insufficient WETH balance!');
    process.exit(1);
  }

  // Check/set approval
  const allowance = await publicClient.readContract({
    address: WETH,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [account.address, SWAP_ROUTER]
  });

  if (allowance < amountIn) {
    console.log('Approving WETH for SwapRouter...');
    const approveTx = await walletClient.sendTransaction({
      to: WETH,
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [SWAP_ROUTER, maxUint256]
      })
    });
    await publicClient.waitForTransactionReceipt({ hash: approveTx });
    console.log('Approved!');
  }

  // Execute swap
  console.log(`Swapping ${amountWeth} WETH -> USDC...`);

  const swapParams = {
    tokenIn: WETH,
    tokenOut: USDC,
    fee: 3000,
    recipient: account.address,
    amountIn,
    amountOutMinimum: minOut,
    sqrtPriceLimitX96: 0n
  };

  const swapData = encodeFunctionData({
    abi: [{
      name: 'exactInputSingle',
      type: 'function',
      inputs: [{
        type: 'tuple',
        components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'recipient', type: 'address' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'amountOutMinimum', type: 'uint256' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' }
        ]
      }],
      outputs: [{ type: 'uint256' }]
    }],
    functionName: 'exactInputSingle',
    args: [swapParams]
  });

  const swapTx = await walletClient.sendTransaction({
    to: SWAP_ROUTER,
    data: swapData
  });

  console.log(`TX: ${swapTx}`);
  await publicClient.waitForTransactionReceipt({ hash: swapTx });

  // Check new balance
  const usdcBalance = await publicClient.readContract({
    address: USDC,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [account.address]
  });

  console.log(`USDC balance: ${formatUnits(usdcBalance, 6)}`);
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});

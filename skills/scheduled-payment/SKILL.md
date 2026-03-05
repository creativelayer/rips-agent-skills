# Scheduled Payment Skill

Config-driven recurring token payments with automatic swap-if-low logic. Perfect for daily pack sales, recurring payouts, or automated treasury operations.

## Core Pattern

1. **Config-driven**: Define recipient, token, amount, and auto-swap rules
2. **Balance check**: Verify sufficient balance before payment
3. **Auto-swap logic**: If balance too low, swap from backup token
4. **Idempotency**: Track payment history to prevent double-sends
5. **Safety**: Multiple validation layers and caps

## Configuration Structure

```javascript
const paymentConfig = {
  recipient: '0x548c457c2405d68d41f0050478356DE945CDB8B0',
  token: {
    address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC
    decimals: 6,
    symbol: 'USDC'
  },
  amount: '50', // Human-readable amount
  autoSwap: {
    enabled: true,
    sourceToken: {
      address: '0x4200000000000000000000000000000000000006', // WETH
      decimals: 18,
      symbol: 'WETH'
    },
    swapAmount: '0.02', // Amount to swap when needed
    threshold: '55', // Swap if balance below this
    slippageTolerance: 0.01 // 1% initial slippage
  },
  safety: {
    maxDailyAmount: '100', // Never send more than this per day
    requirePositiveBalance: true
  }
};
```

## State File Pattern

Track payments to ensure idempotency:

```javascript
// payments-state.json
{
  "lastPaymentDate": "2026-03-05",
  "todaysSent": "50.00",
  "totalSent": "2450.00",
  "lastTxHash": "0x..."
}
```

## Implementation Example

```javascript
import { createPublicClient, createWalletClient, http } from 'viem';
import { base } from 'viem/chains';
import { encodeFunctionData, parseUnits, formatUnits } from 'viem';
import fs from 'fs';

const RPC_URL = 'https://base-mainnet.g.alchemy.com/v2/UIq6IAtiFSotBU8rupy2z';

// Contract addresses (Base)
const QUOTER_V2 = '0x3d4e44Eb1374240CE5F1B871ab261CD16335B76a';
const SWAP_ROUTER = '0x2626664c2603336E57B271c5C0b26F421741e481';

// ABIs
const ERC20_ABI = [
  { name: 'balanceOf', type: 'function', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'transfer', type: 'function', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { name: 'approve', type: 'function', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] }
];

const QUOTER_ABI = [
  {
    name: 'quoteExactInputSingle',
    type: 'function',
    inputs: [
      { name: 'tokenIn', type: 'address' },
      { name: 'tokenOut', type: 'address' },
      { name: 'fee', type: 'uint24' },
      { name: 'amountIn', type: 'uint256' },
      { name: 'sqrtPriceLimitX96', type: 'uint160' }
    ],
    outputs: [{ name: 'amountOut', type: 'uint256' }]
  }
];

const SWAP_ROUTER_ABI = [
  {
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
  }
];

async function executeScheduledPayment(walletClient, config, stateFile = 'payment-state.json') {
  const publicClient = createPublicClient({
    chain: base,
    transport: http(RPC_URL)
  });
  
  const walletAddress = walletClient.account.address;
  const today = new Date().toISOString().split('T')[0];
  
  // Load state
  let state = { lastPaymentDate: '', todaysSent: '0', totalSent: '0' };
  try {
    if (fs.existsSync(stateFile)) {
      state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    }
  } catch (e) {
    console.warn('Could not load state file, starting fresh');
  }
  
  // Check idempotency
  if (state.lastPaymentDate === today) {
    throw new Error(`Payment already sent today (${today}). Sent: ${state.todaysSent} ${config.token.symbol}`);
  }
  
  // Safety check: daily limit
  const proposedDaily = parseFloat(state.lastPaymentDate === today ? state.todaysSent : '0') + parseFloat(config.amount);
  if (proposedDaily > parseFloat(config.safety.maxDailyAmount)) {
    throw new Error(`Daily limit exceeded. Proposed: ${proposedDaily}, Limit: ${config.safety.maxDailyAmount}`);
  }
  
  const amountWei = parseUnits(config.amount, config.token.decimals);
  
  // Check balance
  const balance = await publicClient.readContract({
    address: config.token.address,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [walletAddress]
  });
  
  const balanceHuman = formatUnits(balance, config.token.decimals);
  console.log(`Current ${config.token.symbol} balance: ${balanceHuman}`);
  
  // Auto-swap if needed
  if (config.autoSwap.enabled && parseFloat(balanceHuman) < parseFloat(config.autoSwap.threshold)) {
    console.log(`Balance (${balanceHuman}) below threshold (${config.autoSwap.threshold}). Executing auto-swap...`);
    await executeAutoSwap(walletClient, publicClient, config);
  }
  
  // Re-check balance after potential swap
  const finalBalance = await publicClient.readContract({
    address: config.token.address,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [walletAddress]
  });
  
  if (finalBalance < amountWei) {
    throw new Error(`Insufficient balance. Need: ${config.amount}, Have: ${formatUnits(finalBalance, config.token.decimals)}`);
  }
  
  // Execute payment
  console.log(`Sending ${config.amount} ${config.token.symbol} to ${config.recipient}...`);
  const txHash = await walletClient.sendTransaction({
    to: config.token.address,
    data: encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'transfer',
      args: [config.recipient, amountWei]
    })
  });
  
  // Update state
  state.lastPaymentDate = today;
  state.todaysSent = (state.lastPaymentDate === today ? parseFloat(state.todaysSent) + parseFloat(config.amount) : parseFloat(config.amount)).toString();
  state.totalSent = (parseFloat(state.totalSent) + parseFloat(config.amount)).toString();
  state.lastTxHash = txHash;
  
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
  
  return {
    success: true,
    txHash,
    amount: config.amount,
    token: config.token.symbol,
    recipient: config.recipient,
    state
  };
}

async function executeAutoSwap(walletClient, publicClient, config) {
  const walletAddress = walletClient.account.address;
  const swapAmountWei = parseUnits(config.autoSwap.swapAmount, config.autoSwap.sourceToken.decimals);
  
  // Check source token balance
  const sourceBalance = await publicClient.readContract({
    address: config.autoSwap.sourceToken.address,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [walletAddress]
  });
  
  if (sourceBalance < swapAmountWei) {
    throw new Error(`Insufficient ${config.autoSwap.sourceToken.symbol} for auto-swap. Need: ${config.autoSwap.swapAmount}, Have: ${formatUnits(sourceBalance, config.autoSwap.sourceToken.decimals)}`);
  }
  
  // Get quote
  const quote = await publicClient.readContract({
    address: QUOTER_V2,
    abi: QUOTER_ABI,
    functionName: 'quoteExactInputSingle',
    args: [
      config.autoSwap.sourceToken.address,
      config.token.address,
      3000, // 0.3% fee tier (most common)
      swapAmountWei,
      0n
    ]
  });
  
  const minOut = quote * BigInt(Math.floor((1 - config.autoSwap.slippageTolerance) * 10000)) / 10000n;
  
  console.log(`Auto-swap quote: ${config.autoSwap.swapAmount} ${config.autoSwap.sourceToken.symbol} → ${formatUnits(quote, config.token.decimals)} ${config.token.symbol} (min: ${formatUnits(minOut, config.token.decimals)})`);
  
  // Approve if needed (simplified - in production, check allowance first)
  await walletClient.sendTransaction({
    to: config.autoSwap.sourceToken.address,
    data: encodeFunctionData({
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [SWAP_ROUTER, swapAmountWei]
    })
  });
  
  // Execute swap
  const swapParams = {
    tokenIn: config.autoSwap.sourceToken.address,
    tokenOut: config.token.address,
    fee: 3000,
    recipient: walletAddress,
    amountIn: swapAmountWei,
    amountOutMinimum: minOut,
    sqrtPriceLimitX96: 0n
  };
  
  const swapTxHash = await walletClient.sendTransaction({
    to: SWAP_ROUTER,
    data: encodeFunctionData({
      abi: SWAP_ROUTER_ABI,
      functionName: 'exactInputSingle',
      args: [swapParams]
    })
  });
  
  console.log(`Auto-swap executed: ${swapTxHash}`);
  
  // Wait a moment for state to update (in production, wait for confirmation)
  await new Promise(resolve => setTimeout(resolve, 2000));
}

export { executeScheduledPayment, paymentConfig };
```

## Usage Examples

### Daily Pack Sales
```javascript
const packSalesConfig = {
  recipient: '0x548c457c2405d68d41f0050478356DE945CDB8B0',
  token: { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6, symbol: 'USDC' },
  amount: '50',
  autoSwap: {
    enabled: true,
    sourceToken: { address: '0x4200000000000000000000000000000000000006', decimals: 18, symbol: 'WETH' },
    swapAmount: '0.02',
    threshold: '55',
    slippageTolerance: 0.01
  },
  safety: { maxDailyAmount: '100', requirePositiveBalance: true }
};

// In your cron job or scheduled task
try {
  const result = await executeScheduledPayment(walletClient, packSalesConfig);
  console.log('Payment successful:', result);
} catch (error) {
  console.error('Payment failed:', error.message);
}
```

### Team Payroll
```javascript
const payrollConfig = {
  recipient: '0x...',
  token: { address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6, symbol: 'USDC' },
  amount: '2000',
  autoSwap: { enabled: false }, // Manual funding only
  safety: { maxDailyAmount: '5000', requirePositiveBalance: true }
};
```

## Safety Features

1. **Idempotency**: Prevents double-payments on the same day
2. **Daily limits**: Configurable maximum daily send amount
3. **Balance validation**: Multiple balance checks throughout flow
4. **Slippage protection**: Quote-based minimum output amounts
5. **State persistence**: Tracks payment history for auditing
6. **Graceful failures**: Clear error messages for debugging

## Common Gotchas

### State File Management
- Keep state files in a persistent location
- Back up state files regularly
- Consider using a database for multi-agent scenarios

### Auto-Swap Considerations
- Only enable auto-swap with sufficient source token balance
- Monitor slippage tolerance - markets can be volatile
- Consider the 0.3% pool fee tier (3000) as default for most pairs

### Gas Estimation
- Auto-swap requires two transactions (approve + swap)
- Factor in gas costs when calculating swap amounts
- Consider gas price fluctuations in your thresholds

## See Also

- [erc20](../erc20/) - For basic token operations
- [uniswap-v3](../uniswap-v3/) - For understanding swap mechanics
- [swap-with-retry](../swap-with-retry/) - For robust swap execution
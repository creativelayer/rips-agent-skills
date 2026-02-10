# ERC20 Skill

Transfer and manage ERC20 tokens on Base and other EVM chains.

## Common Token Addresses (Base)

| Token | Address |
|-------|---------|
| USDC | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| WETH | `0x4200000000000000000000000000000000000006` |
| DAI | `0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb` |

## Operations

### Check Balance

```javascript
const balance = await publicClient.readContract({
  address: TOKEN_ADDRESS,
  abi: [{
    name: 'balanceOf',
    type: 'function',
    inputs: [{ type: 'address' }],
    outputs: [{ type: 'uint256' }]
  }],
  functionName: 'balanceOf',
  args: [walletAddress]
});

// For USDC (6 decimals): Number(balance) / 1e6
// For most tokens (18 decimals): Number(balance) / 1e18
```

### Transfer Tokens

```javascript
import { encodeFunctionData, parseUnits } from 'viem';

const amount = parseUnits('10', 6); // 10 USDC (6 decimals)

const txHash = await walletClient.sendTransaction({
  to: USDC_ADDRESS,
  data: encodeFunctionData({
    abi: [{
      name: 'transfer',
      type: 'function',
      inputs: [{ type: 'address' }, { type: 'uint256' }],
      outputs: [{ type: 'bool' }]
    }],
    functionName: 'transfer',
    args: [recipientAddress, amount]
  })
});
```

### Approve Spending

Required before swaps or other contracts can spend your tokens:

```javascript
import { maxUint256 } from 'viem';

const txHash = await walletClient.sendTransaction({
  to: TOKEN_ADDRESS,
  data: encodeFunctionData({
    abi: [{
      name: 'approve',
      type: 'function',
      inputs: [{ type: 'address' }, { type: 'uint256' }],
      outputs: [{ type: 'bool' }]
    }],
    functionName: 'approve',
    args: [spenderAddress, maxUint256] // Unlimited approval
  })
});
```

## Decimal Handling

Different tokens have different decimals:

| Token | Decimals | parseUnits Example |
|-------|----------|-------------------|
| USDC | 6 | `parseUnits('100', 6)` = 100 USDC |
| WETH | 18 | `parseUnits('0.1', 18)` = 0.1 WETH |
| Most tokens | 18 | `parseUnits('1000', 18)` |

## See Also

- [uniswap-v3](../uniswap-v3/) - For swapping tokens
- [weth](../weth/) - For wrapping/unwrapping ETH

# Bankr Trading Skill

Use [Bankr](https://bankr.bot) as a trading intermediary when your primary wallet can't easily swap tokens (e.g., Uniswap V4 pools, exotic pairs, or tokens without V3 liquidity).

## Why This Pattern?

Privy server wallets are great for on-chain operations, but swapping on Uniswap V4 requires complex routing (Universal Router V2, pool-specific hooks, etc.). Bankr handles all that routing internally via natural language.

**The pattern:** Fund Bankr → Bankr trades → Send tokens back to your wallet.

## Prerequisites

- A Bankr API key with **Agent API** enabled ([bankr.bot/api](https://bankr.bot/api))
- Your Bankr wallet address (query via API)
- Your primary wallet (Privy or other) for sending/receiving funds

## Setup

```bash
# Store Bankr config
mkdir -p ~/.clawdbot/skills/bankr
cat > ~/.clawdbot/skills/bankr/config.json << 'EOF'
{
  "apiKey": "bk_YOUR_KEY_HERE",
  "apiUrl": "https://api.bankr.bot"
}
EOF
```

## Step 1: Get Your Bankr Wallet Address

```bash
# Using the Bankr API
JOB=$(curl -s -X POST https://api.bankr.bot/agent/jobs \
  -H "Content-Type: application/json" \
  -H "x-api-key: $BANKR_API_KEY" \
  -d '{"prompt": "What is my wallet address on Base?"}')

JOB_ID=$(echo "$JOB" | jq -r '.jobId')

# Poll until complete
while true; do
  STATUS=$(curl -s "https://api.bankr.bot/agent/jobs/$JOB_ID" \
    -H "x-api-key: $BANKR_API_KEY")
  if echo "$STATUS" | jq -e '.status == "completed"' > /dev/null; then
    echo "$STATUS" | jq -r '.response'
    break
  fi
  sleep 5
done
```

Save the address — you'll need it for transfers.

## Step 2: Fund Bankr Wallet

Send tokens from your primary wallet to Bankr. Example using Privy + viem:

```javascript
// Transfer WETH to Bankr wallet for trading
const WETH = '0x4200000000000000000000000000000000000006';
const BANKR_WALLET = '0x...'; // Your Bankr wallet address

const hash = await walletClient.sendTransaction({
  to: WETH,
  data: encodeFunctionData({
    abi: [{
      name: 'transfer', type: 'function',
      inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
      outputs: [{ type: 'bool' }]
    }],
    functionName: 'transfer',
    args: [BANKR_WALLET, parseEther('0.025')]
  })
});
```

See [erc20 skill](../erc20/) for full transfer details.

## Step 3: Execute Trade via Bankr

```bash
# Swap WETH for any token — Bankr handles routing
scripts/bankr-trade.sh "Swap all my WETH for RIPS token (0xc1aDDAe61Bc74a14971BFA48A0B7141AdeD4fB07) on Base"
```

Bankr supports natural language prompts. It can swap on Uniswap V3, V4, Aerodrome, and other DEXes automatically.

## Step 4: Send Tokens Back

```bash
# Transfer tokens from Bankr back to your primary wallet
scripts/bankr-trade.sh "Transfer all my RIPS tokens to 0xYOUR_WALLET_ADDRESS on Base"
```

**Note:** If the first transfer attempt fails, try being more explicit with the token contract address:
```
"Transfer 10000000 RIPS (contract 0xc1aDDAe61Bc74a14971BFA48A0B7141AdeD4fB07) to address 0xYOUR_WALLET on Base chain"
```

## Helper Script

See [examples/bankr-trade.sh](examples/bankr-trade.sh) for a complete submit-poll-complete script.

## When to Use This vs Direct Swaps

| Scenario | Use |
|----------|-----|
| Uniswap V3 pair with good liquidity | Direct swap (see [uniswap-v3](../uniswap-v3/)) |
| Uniswap V4 pool (hooks, dynamic fees) | **Bankr** |
| Exotic/low-liquidity tokens | **Bankr** (aggregates multiple DEXes) |
| ETH ↔ WETH | Direct wrap/unwrap (see [weth](../weth/)) |
| Speed-critical trades | Direct swap (Bankr has ~15-60s latency) |

## Gotchas

1. **Bankr wallet is separate** — it has its own address. You must fund it first.
2. **Latency** — Bankr jobs take 10-60+ seconds to complete. Not ideal for time-sensitive trades.
3. **Transfer failures** — Bankr occasionally fails on transfers. Retry with more explicit prompts (include contract address, exact amounts).
4. **Gas** — Bankr needs native ETH for gas on its wallet. If it runs out, send some ETH directly.
5. **Balance queries** — Bankr only sees its own wallet. Don't ask it about your Privy wallet balance.

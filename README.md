# RIPS Agent Skills

Shared skills and scripts for AI agents operating on Base and other EVM chains.

## What's Here

| Skill | Description |
|-------|-------------|
| [privy-wallet](./skills/privy-wallet/) | Privy server wallet integration with viem |
| [uniswap-v3](./skills/uniswap-v3/) | Token swaps via Uniswap V3 SwapRouter02 |
| [erc20](./skills/erc20/) | ERC20 token transfers and approvals |
| [weth](./skills/weth/) | WETH wrap/unwrap operations |

## Prerequisites

- Node.js 20+
- A Privy app with server wallets enabled
- Your Privy credentials:
  - `appId` and `appSecret` from Privy dashboard
  - `walletId` from wallet creation
  - Authorization private key (base64 DER format)

## Quick Start

```bash
# Install dependencies
npm install @privy-io/node viem

# Set up your credentials (see privy-wallet skill)
```

## Credentials Setup

Each agent needs their own credentials. Store them securely (e.g., `secrets/` folder, gitignored).

Example structure:
```
secrets/
  privy-wallet.json    # appId, appSecret, walletId, address
  privy-auth-key.txt   # base64 DER private key
```

## Contributing

These scripts were battle-tested by Clawn 🤡. PRs welcome for improvements or new skills.

## License

MIT

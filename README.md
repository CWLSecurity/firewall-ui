# Firewall Vault UI

**Protected version of your wallet**

Firewall Vault UI is a minimal frontend for Firewall Vault on Base.

It connects directly to deployed on-chain contracts, without backend infrastructure, and lets users create or use a protected Firewall wallet.

## What Firewall UI is
Firewall UI is the user-facing layer for Firewall Vault MVP.

It allows users to:
- connect a wallet
- create a Firewall wallet
- import an existing Firewall wallet
- use read-only mode
- send ETH through the FirewallModule
- inspect delayed transactions
- execute delayed transactions when ready
- cancel delayed transactions

## Requirements
- Base network only (`chainId 8453`)
- MetaMask or injected wallet
- Node.js + pnpm

## Setup
Run:
- `pnpm i`
- `pnpm dev`
- `pnpm build`

## Main usage flows

### Create wallet
- connect wallet on Base
- select preset `0` (Conservative) or `1` (DeFi Trader)
- submit create transaction

### Import wallet
- enter an existing Firewall wallet address
- import after on-chain contract-code check

### Read-only mode
- if a Firewall wallet is persisted and wallet is disconnected, dashboard and queue remain visible
- transaction actions remain hidden or disabled until reconnect

### Send ETH
- enter recipient and ETH amount
- send through `FirewallModule.executeNow(...)`

### Delayed queue
- queue is built from `Scheduled` and `TransactionScheduled` events
- for each `txId`, the UI reads `getScheduled(txId)`
- user can execute or cancel transactions when applicable

## Product principles
- No backend
- No database
- No private key storage
- RPC-only architecture
- Base-only MVP

## Base addresses
From `src/lib/addresses/base.ts`:
- `chainId`: `8453`
- `FACTORY_ADDRESS`: `0xF94be7A4fA1fC57071BC9Eeb58d2f5BaECB8b2d3`
- `ROUTER_ADDRESS`: `0x51a8381Bfc2b90144f1dB0363695A76CC30eb8FA`
- `POLICY_INFINITE_APPROVAL_ADDRESS`: `0xA9891C83eaf199845aDf70D060a8363f9A79D22f`
- `POLICY_LARGE_TRANSFER_DELAY_ADDRESS`: `0x2eE727528bCCEF98F765Ccd0C66bFfcFd4E7e06B`
- `POLICY_NEW_RECEIVER_DELAY_ADDRESS`: `0x2013080Ce5ceaf2a232dB3e2bCDd2dd9312A55E4`
- `POLICY_UNKNOWN_CONTRACT_BLOCK_ADDRESS`: `0x753808a47469dD97Db6A2A5CD18e443863aF2F69`

## Security notes
- The UI never stores private keys
- Transaction signing happens through MetaMask / injected wallet
- The UI is stateless except for localStorage
- Core contracts are treated as frozen for MVP

## Copy buttons
Copy buttons are available for key values:
- EOA address
- Firewall wallet address
- Router address
- Create wallet tx hash and created wallet address
- Send ETH tx hash
- Queue txId
- Destination address
- Execute/cancel action tx hash

## Diagnostics panel
The diagnostics panel is always visible near the top of the app.

It shows:
- wallet connection status
- EOA address
- chainId
- latest block number
- persisted Firewall wallet and preset
- RPC status (`OK` / `Error`)

It also includes a `Refresh` button and works in read-only mode.

## Known limitations
- No ERC20 UI
- No calldata display in queue
- Preset can be unknown for imported wallets
- Queue discovery uses lookback of last `200_000` blocks
- MVP stage

## Related repositories
- `../firewall-wallet`
- `../PROJECT_HOME`

## Core message
**On-chain enforcement, not warnings.**  
**No custody, no backend.**

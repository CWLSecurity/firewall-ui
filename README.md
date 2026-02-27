# Firewall UI (MVP)

## 1) What Is Firewall UI (MVP)
Firewall UI is a minimal frontend for Firewall Vault on Base. It connects to on-chain contracts (no backend), lets users create/import a Firewall wallet, send ETH through the module, and manage delayed transactions.

## 2) Requirements
- Base network only (`chainId 8453`)
- MetaMask (or injected wallet)
- Node.js + pnpm

## 3) Setup
```bash
pnpm i
pnpm dev
pnpm build
```

## 4) Usage Flows
- Create wallet:
  - Connect wallet on Base
  - Select preset `0` (Conservative) or `1` (DeFi Trader)
  - Submit create transaction
- Import wallet:
  - Enter existing Firewall wallet address
  - Import after on-chain contract-code check
- Read-only mode:
  - If a Firewall wallet is persisted and wallet is disconnected, dashboard/queue remain visible
  - Transaction actions remain hidden/disabled until wallet reconnects
- Send ETH:
  - Enter recipient + ETH amount
  - Sends via FirewallModule `executeNow(...)`
- Delayed queue execute/cancel:
  - Queue is built from `Scheduled` and `TransactionScheduled` events
  - Per `txId`, read `getScheduled(txId)` and execute/cancel when applicable

## 5) Known Limitations
- No calldata display in queue (only `dataHash` from `getScheduled`)
- Preset can be unknown for imported wallets
- Queue discovery uses lookback of last `200_000` blocks

## 6) Base Addresses
From `src/lib/addresses/base.ts`:
- `chainId`: `8453`
- `FACTORY_ADDRESS`: `0xF94be7A4fA1fC57071BC9Eeb58d2f5BaECB8b2d3`
- `ROUTER_ADDRESS`: `0x51a8381Bfc2b90144f1dB0363695A76CC30eb8FA`
- `POLICY_INFINITE_APPROVAL_ADDRESS`: `0xA9891C83eaf199845aDf70D060a8363f9A79D22f`
- `POLICY_LARGE_TRANSFER_DELAY_ADDRESS`: `0x2eE727528bCCEF98F765Ccd0C66bFfcFd4E7e06B`
- `POLICY_NEW_RECEIVER_DELAY_ADDRESS`: `0x2013080Ce5ceaf2a232dB3e2bCDd2dd9312A55E4`
- `POLICY_UNKNOWN_CONTRACT_BLOCK_ADDRESS`: `0x753808a47469dD97Db6A2A5CD18e443863aF2F69`

## 7) Security Notes
- No private keys are stored by the app
- All actions are on-chain transactions through the connected wallet
- Core contracts are treated as frozen/read-only for this UI MVP

## 8) Copy Buttons
- Copy buttons are available for key values:
  - EOA address, Firewall wallet address, Router address
  - Create wallet tx hash and created wallet address
  - Send ETH tx hash (and recipient input when provided)
  - Queue txId, destination address, and execute/cancel action tx hash

## 9) Diagnostics Panel
- Always visible near the top of the app.
- Shows:
  - wallet connection status
  - EOA address
  - chainId
  - latest block number
  - persisted Firewall wallet + preset
  - RPC status (`OK` / `Error`)
- Includes a `Refresh` button to refetch the latest block.
- Works in read-only mode (disconnected with persisted wallet).

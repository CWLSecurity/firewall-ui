# FIREWALL VAULT — firewall-ui (MVP) — Project Context

## 0) What we are building
We are building firewall-ui: a minimal, clean Web3 frontend for Firewall Vault on Base (chainId 8453).

The on-chain core (firewall-wallet) is stable / frozen for MVP and MUST NOT be modified.

UI is separate from core and can be wiped/rebuilt freely.

## 1) Core is frozen (DO NOT modify)
Core repo path (local):
/home/pavel/firewall-wallet/packages/contracts

Core includes:
- FirewallModule
- PolicyRouter (per-wallet)
- FirewallFactory (supports presets)
- Policies:
  - InfiniteApprovalPolicy
  - NewReceiverDelayPolicy (ERC20-aware)
  - LargeTransferDelayPolicy (ERC20-aware)
  - UnknownContractBlockPolicy (not in default presets)

Presets:
- Preset 0 — Conservative
- Preset 1 — DeFi Trader

Delayed transactions supported:
- schedule()
- executeScheduled()
- cancelScheduled()
- getScheduled(txId)

Core verified with smoke script on Anvil.

## 2) UI MVP Goals
UI must:
- Connect wallet (MetaMask / injected)
- Work on Base only
- Create Firewall wallet via Factory (preset 0 or 1)
- Show:
  - Firewall wallet address
  - Router address
  - Selected preset
- Allow:
  - Send ETH
  - Advanced call (optional)
- Show delayed queue:
  - Read via events + getScheduled(txId)
  - Execute / Cancel

No backend.
No SaaS logic.
Pure on-chain interaction.

## 3) Hard Requirements
- Base network first (chainId 8453)
- Use viem (NOT ethers)
- Clean architecture
- Minimal dependencies
- Security-aware UX

## 4) ABI Source
ABI must be copied from Foundry artifacts:
Path:
/home/pavel/firewall-wallet/packages/contracts/out/**/<Contract>.json

Use the "abi" field from those files.

## 5) Definition of Done (MVP)
User can:
1) Connect wallet on Base
2) Create firewall wallet
3) See wallet/router/preset
4) Send ETH
5) See delayed queue
6) Execute/Cancel delayed tx

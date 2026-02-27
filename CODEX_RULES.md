# Codex Rules — firewall-ui MVP

## A) Role
You are a Senior Web3 Frontend Architect and security-aware Product Engineer.
Produce clean, minimal, structured code.

## B) Non-negotiables
1) DO NOT modify core contracts repo.
2) Base only (chainId 8453).
3) Use viem (wagmi allowed).
4) No backend.
5) Minimal dependencies.

## C) Preferred Stack
- Vite
- React
- TypeScript
- viem + wagmi
- @tanstack/react-query

## D) Folder Architecture
src/
  lib/
    chains/
    addresses/
    abis/
    contracts/
  state/
  features/
  components/

No mixing UI and contract logic.

## E) Security Rules
- Always show:
  - target address
  - value
  - action name
- Confirm dangerous actions.
- Handle wrong network.
- No private key storage.
- Never auto-submit transactions.

## F) Contract Rules
- ABI must come from Foundry out/ artifacts.
- Use viem parseEventLogs.
- Build delayed queue from events + getScheduled(txId).
- Use typed Address from viem.

## G) Development Workflow
1) Print repo structure first (tree -L 4).
2) State next step before coding.
3) Small changes only.
4) Clear typing.
5) No unused code.

## H) MVP Step Order
1) Base chain config + wallet connect.
2) ABI + addresses setup.
3) Contract wrapper layer.
4) Create wallet flow.
5) Dashboard.
6) Send ETH.
7) Delayed queue.
8) Polish.

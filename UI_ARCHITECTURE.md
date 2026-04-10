# Firewall UI Architecture (Current)

Last updated: 2026-03-25

This is the canonical architecture reference for `firewall-ui`.

## 1. Runtime Roles
- Signer wallet: signs owner actions.
- Vault (`FirewallModule`): protected executor.
- Firewall UI: security console for lifecycle, protections, queue, and operational actions.

## 2. Top-Level Composition
Entry:
- `src/App.tsx`

Major UI surfaces:
- Topbar session controls
- Create/Import flows
- Protected Vault overview
- Active protections and management modal
- Queue summary and queue modal
- Queue automation bot panel (per-Vault enable/disable and server status)
- Send modal (preflight + submit)
- Receive modal (address share + request URI builder + direct signer send)

## 3. State Ownership
Local app-shell state:
- `src/modules/app-shell/useAppShellState.ts`
- Owns modal visibility, create-flow draft state, and disconnect markers.

Derived global status:
- `src/modules/app-shell/useGlobalSiteStatus.ts`
- Produces signer/vault readiness statuses and UI unlock gates.

Wallet discovery state:
- `src/modules/wallet/useFirewallWalletState.ts`
- Detects latest owner Vault from chain logs with validation.

Vault runtime state:
- `src/modules/vault/useVaultRuntime.ts`
- Reads router/base pack/policies/add-on availability and evaluates transfer intent.

Queue runtime state:
- `src/modules/vault/useVaultQueue.ts`
- `src/modules/vault/useVaultBot.ts`

Queue/Actions utility state logic:
- `src/modules/app-shell/actionsQueue.ts`
- Owns shared input validation and queue-readiness description logic for Send/Receive/Queue surfaces.

Queue bot server runtime:
- `server/queue-bot-server.mjs`
- Owns relayer loop, per-vault enablement registry, and API endpoints under `/api/v1/bot/*`.

## 4. State Machines (Practical)
Signer status:
- `disconnected` -> `wrong_network` -> `ready`

Vault status:
- `disconnected` -> `wrong_network` -> `detecting` / `awaiting_confirmation` -> `ready` / `no_vault`

Create flow (local draft machine):
- `idle` -> `intent_started` -> `tx_request_started` -> `tx_hash_received` -> `awaiting_confirmation`
- Reset on failure/cancel.
- Final readiness is chain/runtime confirmed, not inferred from UI draft.

Disconnect behavior:
- `Disconnect Vault` sets owner-scoped disconnect marker.
- Auto-adopt is blocked for that owner until explicit create/import action clears marker.

## 5. Data and Contract Boundaries
UI composes reads/writes from:
- `src/contracts/factory.ts`
- `src/contracts/moduleViews.ts`
- `src/contracts/policyRouter.ts`
- `src/contracts/registry.ts`
- `src/contracts/policies.ts`
- `src/contracts/queueExecutor.ts`

Semantic authority:
- On-chain introspection for technical policy identity/config.
- UI model mapping (`src/modules/vault/model.ts`) for business wording and concise copy.

## 6. Degradation Strategy
When RPC is degraded or partial:
- Keep product flows usable where safe.
- Use stable fallback labels/tooltips instead of raw internal errors.
- Retry transient reads for policy and pack metadata.

## 7. Privacy/Storage Policy
- No site-side persistence of user business actions.
- Wagmi persistence explicitly disabled (`storage: null`).
- No analytics instrumentation in app code.

## 8. Testing Policy
Required for fixes:
- Add regression test for bugfix behavior.
- Run:
  - `npm test`
  - `npm run lint`
  - `npm run build`
  - `npm run bot:server` (when validating automation flow end-to-end)

Current regression focus areas:
- Vault create/import/disconnect transitions
- Base line mapping (`Vault Safe` vs `DeFi Trader`)
- Policy tooltip fallback and metadata rendering
- Add-on enable availability and status mapping

# Firewall Vault UI

Last updated: 2026-03-24

`firewall-ui` is the active security console for Firewall Vault on Base Mainnet.

## What This App Is
- A non-custodial security console for Firewall Vault.
- A place to create/import a Vault, inspect active protections, manage add-ons, and operate delayed queue actions.
- A frontend over on-chain policy/routing logic in `firewall-wallet`.

## What This App Is Not
- Not a backend risk engine.
- Not an off-chain policy simulator that can override chain behavior.
- Not a full standalone replacement for signer wallets.

## Current Product Flows
- Connect signer wallet (MetaMask/Rabby style injected wallet).
- Create Vault with selected base line (`Vault Safe` or `DeFi Trader`).
- Import existing owner-bound Vault.
- Review active protections with compact business-friendly tooltips.
- Open `Manage Protection` and enable add-on packs.
- Send through Vault with preflight decision checks and queue-aware outcomes.
- Receive into Vault via direct address copy, EIP-681 request URI, mobile MetaMask deep link, or direct send from connected wallet.
- Manage delayed queue actions (ready/cancel) with unlock status.
- Disconnect Vault without disconnecting signer wallet.
- Disconnect full wallet session.

## Protection Lines and Add-ons
Base lines:
- `Vault Safe` (base pack `0`): 3 base protections.
- `DeFi Trader` (base pack `1`): 5 base protections.

Add-on packs currently surfaced:
- `Approval Hardening` (pack `2`)
- `24-Hour New Receiver Delay` (pack `3`)
- `24-Hour Large Transfer Delay` (pack `4`)

## Policy Data Strategy (Current)
- Technical truth is read from chain via policy introspection:
  - `policyKey`, `policyName`, `policyDescription`, `policyConfigVersion`, `policyConfig`.
- User-facing business wording is mapped in UI domain layer (`src/modules/vault/model.ts`).
- UI now prefers chain metadata, with resilient fallback copy during transient RPC degradation.

## Privacy and Data Handling
- No site-side business-state persistence.
- `wagmi` client persistence is disabled (`storage: null`).
- No analytics SDK and no browser telemetry pipeline in app code.
- Note: wallet extensions and RPC providers may still log requests outside this UI.

## Architecture (Runtime)
Entry:
- `src/App.tsx`

State and orchestration:
- `src/modules/app-shell/useAppShellState.ts`
- `src/modules/app-shell/useGlobalSiteStatus.ts`
- `src/modules/app-shell/useTraceTransitions.ts`

Wallet/Vault runtime:
- `src/modules/wallet/useFirewallWalletState.ts`
- `src/modules/vault/useVaultRuntime.ts`
- `src/modules/vault/useVaultQueue.ts`

UI composition:
- `src/modules/app-shell/areas.tsx`
- `src/modules/app-shell/modals.tsx`
- `src/modules/app-shell/helpers.ts`

Contract read/write layer:
- `src/contracts/*`

Reference:
- `UI_ARCHITECTURE.md`
- `VAULT_CREATION_STATE_TEST_PLAN.md`
- `MARKETING_BRIEF.md`

## Reliability Improvements Included
- Better transient RPC handling for policy and pack reads.
- Fallback protection labels/tooltips when chain metadata is partial.
- Compact tooltip UX for active protections and add-ons.
- Disconnect Vault guard: disconnected Vault should not auto-reconnect in background.
- Queue readiness helper for consistent unlock ETA status text.
- Receive helper for request amount validation and request URI generation.
- Receive direct-send guard that blocks transfers above connected wallet balance.
- Receive direct-send precheck estimates fee and blocks `amount + fee > balance`.
- Wallet detection now preserves last confirmed Vault during transient wallet/network/RPC flaps.
- Receive modal uses backdrop scrolling on small viewports so close controls stay reachable.

## Build and Validation
- `npm test`
- `npm run test:smoke`
- `npm run lint`
- `npm run build`
- `npm run smoke`
- `npm run integrity:check`

Smoke coverage entry points:
- `src/modules/app-shell/globalSiteStatus.smoke.test.ts`
- `src/modules/app-shell/actionsQueue.test.ts`
- `src/contracts/createWalletPoliciesFlow.test.ts`

## Messaging Brief for Content Generation
Use these as safe claims:
- "On-chain transaction firewall for EVM wallets on Base."
- "Non-custodial protection: your signer wallet keeps private keys."
- "Deterministic policy enforcement on-chain (allow, delay, block)."
- "Security console with queue control and add-on protection packs."

Avoid these claims:
- "Guarantees no losses."
- "Universal wallet replacement for all dApps today."
- "AI decides transaction risk."

## Related Repositories
- `../firewall-wallet` (contracts and canonical policy logic)
- `../firewall-connector` (EIP-1193 connector boundary)
- `../PROJECT_HOME` (cross-repo product and launch docs)

# Firewall Vault UI

Last updated: 2026-04-21

`firewall-ui` is the active security console for Firewall Vault on Base Mainnet.

## What This App Is
- A non-custodial security console for Firewall Vault.
- A place to create/import a Vault, inspect active protections, manage add-ons, and operate delayed queue actions.
- A frontend over on-chain policy/routing logic in `firewall-wallet`.

## What This App Is Not
- Not a backend risk engine.
- Not an off-chain policy simulator that can override chain behavior.
- Not a full standalone replacement for signer wallets.

## MVP Scope for UI
In MVP:
- This app is the primary and sufficient user path for Vault operations.
- Users do not need connector/extension to complete core flows.

After MVP:
- Connector/extension integration can add compatibility flows for external dApps.
- UI remains the canonical security console for queue/protection management.

## Current Product Flows
- Connect signer wallet (MetaMask/Rabby style injected wallet).
- Create Vault with selected base line (`Vault Safe` or `DeFi Trader`) and initial bot gas buffer.
- Import existing owner-bound Vault.
- Review active protections with compact business-friendly tooltips.
- Open `Manage Protection` and enable add-on packs.
- Send through Vault with preflight decision checks and queue-aware outcomes.
- Receive into Vault via direct address copy, EIP-681 request URI, mobile MetaMask deep link, or direct send from connected wallet.
- Manage delayed queue actions (ready/cancel) with unlock status.
- Enable or disable queue bot automation per Vault from Queue modal.
- Disconnect Vault without disconnecting signer wallet.
- Disconnect full wallet session.

## MVP User Path (Today)
1. Connect signer wallet in UI (`Connect Wallet`).
2. Create a new Vault (with initial bot gas buffer) or import an existing Vault by owner.
3. Use `Actions`:
   - `Send` for outgoing protected transfers/interactions,
   - `Receive` to top up the Vault address.
4. Check `Queue` for delayed actions and execute/cancel when unlocked.
5. Optional: enable `Automation Bot` in Queue modal.
6. Manage add-on protections in `Manage Protection` based on risk profile.

Post-MVP note:
- Browser connector/extension flow is intentionally scheduled for post-MVP.
- Current MVP path is fully functional without connector dependency.

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
- `BOT_AUTOMATION.md`
- `../PROJECT_HOME/MARKETING_BRIEF.md` (canonical campaign/copy source)

## Reliability Improvements Included
- Better transient RPC handling for policy and pack reads.
- Fallback protection labels/tooltips when chain metadata is partial.
- Compact tooltip UX for active protections and add-ons.
- Disconnect Vault guard: disconnected Vault should not auto-reconnect in background.
- Queue readiness helper for consistent unlock ETA status text.
- Queue bot panel with explicit server status and on-chain executor status.
- Create flow now sends payable `createWallet(...)` with configurable initial bot gas buffer.
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
- `npm run bot:server`
- `npm run integrity:check`

## CI/CD (Current Production Flow)
UI deploy is GitHub Actions driven.

Workflows:
- `Firewall UI CI`
  - file: `.github/workflows/ci.yml`
  - trigger: `push` to `main`, `pull_request`
  - gates: `lint`, `test`, `smoke`, `integrity:check`
- `Firewall UI Deploy (Cloudflare Pages)`
  - file: `.github/workflows/deploy-cloudflare-pages.yml`
  - trigger: `push` to `main`, `workflow_dispatch`
  - action: build `dist` and deploy to Cloudflare Pages

Required GitHub settings (repo-level):
- Secret: `CLOUDFLARE_API_TOKEN`
- Secret: `CLOUDFLARE_ACCOUNT_ID`
- Variable: `CF_PAGES_PROJECT_NAME`

Current domain mapping:
- `firewall-wallet.com`
- `www.firewall-wallet.com`
- `bot.firewall-wallet.com` (queue bot API)

## Bot Deploy (Local CD)
Bot deploy is intentionally local operator-driven from this machine.

Local deploy command:
- `npm run bot:deploy:remote`

Script:
- `scripts/deploy-bot-remote.sh`

Defaults:
- host: `68.183.4.10`
- user: `root`
- port: `22`
- remote command: `/usr/local/bin/deploy-firewall-bot`
- healthcheck: `https://bot.firewall-wallet.com/api/v1/bot/health`

Optional overrides:
- `BOT_DEPLOY_HOST`
- `BOT_DEPLOY_USER`
- `BOT_DEPLOY_PORT`
- `BOT_DEPLOY_REMOTE_CMD`
- `BOT_HEALTHCHECK_URL`

Release operator runbook:
1. Run locally:
   - `npm run lint`
   - `npm test`
   - `npm run smoke`
2. If integrity-protected files changed:
   - `./scripts/integrity.sh update`
   - `npm run integrity:check`
3. Push to `main`.
4. Verify both workflows are green.
5. Run bot deploy from local machine:
   - `npm run bot:deploy:remote`
6. Verify production site and bot API health.

## Queue Bot Server
- Start API/worker server:
  - `npm run bot:server`
- Default URL:
  - `http://127.0.0.1:8787`
- Dev proxy:
  - Vite proxies `/api/*` to `http://127.0.0.1:8787` by default.
  - Override with `VITE_DEV_BOT_SERVER_TARGET`.
- Full runbook:
  - `BOT_AUTOMATION.md`

Gas + execution notes:
- Bot execution uses relayer gas up-front and gets refunded from queue reserve.
- Reserve is now expected to exist on queued actions intended for automation.

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

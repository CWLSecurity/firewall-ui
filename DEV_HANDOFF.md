# Firewall UI — Developer Handoff

Last updated: 2026-04-22

This document is for onboarding engineers who will maintain and extend `firewall-ui`.

## 1. Mission of this repo
- User-facing security console for Firewall Vault on Base.
- Reads canonical on-chain state from `firewall-wallet` contracts.
- Provides owner operations: vault create/import, policy visibility, queue execution, bot toggles.

## 2. Runtime entry points
- App root: `src/App.tsx`
- Global shell state: `src/modules/app-shell/useAppShellState.ts`
- Wallet/Vault orchestration: `src/modules/wallet/useFirewallWalletState.ts`
- Vault runtime: `src/modules/vault/useVaultRuntime.ts`
- Queue reads/ops: `src/modules/vault/useVaultQueue.ts`
- Bot API client state: `src/modules/vault/useVaultBot.ts`

## 3. Contract integration boundary
- Runtime addresses: `src/contracts/addresses/base.ts`
- Runtime env parsing: `src/contracts/runtimeConfig.ts`
- Queue executor calls: `src/contracts/queueExecutor.ts`
- ABI sources: `src/lib/abis/*.json`

Address updates come from wallet deploy flow (`firewall-wallet`), not from manual edits.

## 4. Bot API boundary (server + UI)
- Server process: `server/queue-bot-server.mjs`
- Local deploy helper: `scripts/deploy-bot-remote.sh`
- Bot operations runbook: `BOT_AUTOMATION.md`

Security model:
- Remote mutation endpoints must run with token auth (`BOT_API_TOKEN`) for internet-facing mode.
- Unsafe remote mode is intentionally blocked by default in deploy health checks.

## 5. Quality gates before merge/release
- `npm run lint`
- `npm run security:static`
- `npm test`
- `npm run smoke`
- `npm run integrity:check`

## 6. Production deploy flow
1. Push `main`.
2. GitHub workflows run:
   - `.github/workflows/ci.yml`
   - `.github/workflows/deploy-cloudflare-pages.yml`
3. Verify Pages deployment and production health.
4. If bot runtime changed: run local remote deploy from operator machine:
   - `npm run bot:deploy:remote`

## 7. High-risk edit areas
- `src/modules/app-shell/modals.tsx` (multi-modal state coupling)
- `src/modules/vault/useVaultRuntime.ts` (chain discovery and policy normalization)
- `src/modules/vault/useVaultQueue.ts` (queue scans and status folding)
- `server/queue-bot-server.mjs` (remote mutation auth and process execution)

When touching these files, require explicit regression checks with smoke tests.

## 8. Debugging shortcuts
- Verify runtime config from built app env by checking resolved values in `runtimeConfig.ts`.
- Validate bot API health:
  - `curl https://bot.firewall-wallet.com/api/v1/bot/health`
- Check whether bot auth mode is safe:
  - expect `security.mutationAuthMode` = `token` for internet-facing deployment.

## 9. Cross-repo dependencies
- `../firewall-wallet`: deploys contracts and syncs addresses to this repo.
- `../PROJECT_HOME`: source of release runbooks and launch checklist.

Do not duplicate contract logic in UI. Keep all policy semantics canonical in `firewall-wallet`.

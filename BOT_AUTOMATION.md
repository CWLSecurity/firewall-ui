# Firewall UI Queue Bot Server

Last updated: 2026-03-25

This document describes the queue automation server used by `firewall-ui`.

## Goal
- Let users enable queue automation per Vault from UI.
- Keep owner key out of bot runtime.
- Use only relayer key on server.

## Components
- UI control: Queue modal (`Queue Details`) includes `Automation Bot` panel.
- On-chain auth:
  - owner signs `setQueueExecutor(relayer, true|false)` from UI wallet.
  - relayer executes only via `executeScheduledByExecutor(txId)`.
- Server runtime:
  - `server/queue-bot-server.mjs`
  - periodic runner calling `forge script script/RunQueueRelayer.s.sol:RunQueueRelayer --broadcast`
  - per-vault state stored in `server/state/bot-vaults.json`.

## Gas model (important)
- Relayer is tx sender and pays network gas up-front.
- Vault reserve refunds relayer inside execution tx.
- Queue actions without reserve are skipped by relayer script.
- Recommended flow:
  - fund bot gas pool at Vault creation (UI `Bot gas buffer (ETH)` input),
  - keep pool funded for expected queue volume.

## API (local server)
- `GET /api/v1/bot/health`
- `GET /api/v1/bot/vaults`
- `GET /api/v1/bot/vault/:vault/status`
- `POST /api/v1/bot/vault/:vault/enable`
- `POST /api/v1/bot/vault/:vault/disable`
- `POST /api/v1/bot/vault/:vault/run`

By default, mutating endpoints are local-only (`127.0.0.1` / `::1`).
Optional token mode:
- set `BOT_API_TOKEN`
- pass header `x-firewall-bot-token`.

## Required runtime env
- `BASE_RPC_URL`
- `RELAYER_PRIVATE_KEY` (or fallback `DEPLOYER_PK`)

Optional:
- `BOT_SERVER_HOST` (default `127.0.0.1`)
- `BOT_SERVER_PORT` (default `8787`)
- `QUEUE_BOT_LOOP_SECONDS` (default `20`)
- `QUEUE_SCAN_LIMIT` (default `128`)
- `BOT_WALLET_CONTRACTS_DIR` (default `/home/pavel/firewall-wallet/packages/contracts`)
- `BOT_WALLET_ENV_PATH` (default `/home/pavel/firewall-wallet/.env`)
- `BOT_STATE_PATH` (default `server/state/bot-vaults.json`)
- `BOT_API_TOKEN`
- `BOT_ALLOW_UNSAFE_REMOTE=true` (only for controlled infra)

## Runbook
1. Start server:
   - `npm run bot:server`
2. Open UI and go to `Queue` -> `Open Queue`.
3. In `Automation Bot`:
   - click `Enable Bot` (wallet signs `setQueueExecutor(..., true)`).
4. Verify:
   - `Server bot: Enabled`
   - `Executor on-chain: Enabled`
5. To stop automation:
   - click `Disable Bot` (revokes on-chain executor + disables server vault runner).

## Security notes
- Server does not store owner private key.
- Server does not need owner signatures.
- Compromised bot cannot bypass unlock delay; contract enforces unlock time.
- Keep relayer key in env/secret manager only, never in repo files.

## CI/CD (VPS deploy)
`firewall-ui` includes workflow:
- `.github/workflows/deploy-bot-vps.yml`

Behavior:
- trigger: `workflow_dispatch` and `push` to `main` for bot-relevant paths,
- deploy target: VPS host over SSH,
- remote command: `/usr/local/bin/deploy-firewall-bot`,
- optional post-deploy health check via public bot URL.

Required GitHub repo config:
- Secret: `BOT_DEPLOY_SSH_KEY` (full unencrypted OpenSSH private key)
- Variable: `BOT_DEPLOY_HOST` (optional, default `68.183.4.10`)
- Variable: `BOT_DEPLOY_USER` (optional, default `root`)
- Variable: `BOT_DEPLOY_PORT` (optional, defaults to `22`)
- Variable: `BOT_HEALTHCHECK_URL` (optional, default `https://bot.firewall-wallet.com/api/v1/bot/health`)

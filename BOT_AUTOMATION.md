# Firewall UI Queue Bot Server

Last updated: 2026-04-22

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

Mutating endpoints require authorization:
- normal UI path: owner wallet signs a short per-action authorization message;
- optional ops fallback: `BOT_API_TOKEN` with header `x-firewall-bot-token`;
- unsafe remote mode is only for controlled infrastructure testing.

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
- `BOT_API_TOKEN` (optional ops fallback; normal UI mutations use owner wallet signatures)
- `BOT_ALLOW_UNSAFE_REMOTE=true` (only for controlled infra)

Security status in health:
- `GET /api/v1/bot/health` returns:
  - `security.mutationAuthMode` (`wallet`, `token+wallet`, `unsafe-remote`)
  - `security.hasApiToken`
  - `security.allowUnsafeRemote`
  - `security.loopbackOnlyHost`

## Runbook
1. Start server:
   - `npm run bot:server`
2. Open UI and go to `Queue` -> `Open Queue`.
3. In `Automation Bot`:
  - click `Enable Bot` (wallet signs `setQueueExecutor(..., true)`),
  - sign the short bot authorization message in the owner wallet.
4. Verify:
   - `Server bot: Enabled`
   - `Executor on-chain: Enabled`
5. To stop automation:
  - click `Disable Bot` (revokes on-chain executor + disables server vault runner),
  - sign the short bot authorization message in the owner wallet.

## Security notes
- Server does not store owner private key.
- Server does not need owner signatures.
- Compromised bot cannot bypass unlock delay; contract enforces unlock time.
- Keep relayer key in env/secret manager only, never in repo files.

## CD (local operator flow)
Bot deploy is performed from local operator machine (not via GitHub bot workflow).

Deploy command:
- `npm run bot:deploy:remote`

Script:
- `scripts/deploy-bot-remote.sh`

Required deploy variables:
- `BOT_DEPLOY_HOST`
- `BOT_DEPLOY_USER`

Defaulted variables:
- `BOT_DEPLOY_PORT=22`
- `BOT_DEPLOY_REMOTE_CMD=/usr/local/bin/deploy-firewall-bot`
- `BOT_HEALTHCHECK_URL` (set to your bot health endpoint)
- `RUN_LOCAL_CHECKS=1` (runs `lint`, `security:static`, `test`, `test:bot:e2e`, `smoke`, `integrity:check` before remote deploy)
- `ALLOW_UNSAFE_REMOTE_BOT_AUTH=0` (fails deploy if health reports `mutationAuthMode=unsafe-remote`)

Bot server e2e tests:
- `npm run test:bot:e2e`

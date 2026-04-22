#!/usr/bin/env bash
set -euo pipefail

BOT_DEPLOY_HOST="${BOT_DEPLOY_HOST:-68.183.4.10}"
BOT_DEPLOY_USER="${BOT_DEPLOY_USER:-root}"
BOT_DEPLOY_PORT="${BOT_DEPLOY_PORT:-22}"
BOT_DEPLOY_REMOTE_CMD="${BOT_DEPLOY_REMOTE_CMD:-/usr/local/bin/deploy-firewall-bot}"
BOT_HEALTHCHECK_URL="${BOT_HEALTHCHECK_URL:-https://bot.firewall-wallet.com/api/v1/bot/health}"
RUN_LOCAL_CHECKS="${RUN_LOCAL_CHECKS:-1}"

if [ -z "$BOT_DEPLOY_HOST" ] || [ -z "$BOT_DEPLOY_USER" ]; then
  echo "BOT_DEPLOY_HOST and BOT_DEPLOY_USER are required."
  exit 1
fi

if [ "$RUN_LOCAL_CHECKS" = "1" ]; then
  echo "[bot-deploy] local quality/security gates"
  npm run lint
  npm run security:static
  npm test
  npm run smoke
  npm run integrity:check
fi

echo "[bot-deploy] host=${BOT_DEPLOY_HOST} user=${BOT_DEPLOY_USER} port=${BOT_DEPLOY_PORT}"
ssh -p "$BOT_DEPLOY_PORT" "${BOT_DEPLOY_USER}@${BOT_DEPLOY_HOST}" "$BOT_DEPLOY_REMOTE_CMD"

if [ -n "$BOT_HEALTHCHECK_URL" ]; then
  echo "[bot-deploy] healthcheck=${BOT_HEALTHCHECK_URL}"
  response="$(curl -fsSL "$BOT_HEALTHCHECK_URL")"
  if ! printf '%s' "$response" | grep -q '"ok"[[:space:]]*:[[:space:]]*true'; then
    echo "[bot-deploy] healthcheck failed: unexpected response"
    printf '%s\n' "$response"
    exit 1
  fi
fi

echo "[bot-deploy] done"

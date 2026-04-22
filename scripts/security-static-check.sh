#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

has_rg=0
if command -v rg >/dev/null 2>&1; then
  has_rg=1
fi

search_matches() {
  local pattern="$1"
  shift
  if [[ ${has_rg} -eq 1 ]]; then
    rg -n -S "${pattern}" "$@"
  else
    grep -RInP "${pattern}" "$@"
  fi
}

echo "[ui-security-static] scanning for leaked credentials and keys"

if search_matches "(ghp_[A-Za-z0-9]{30,}|cfat_[A-Za-z0-9]{20,}|-----BEGIN (RSA|OPENSSH|EC) PRIVATE KEY-----)" \
  "${ROOT_DIR}/src" "${ROOT_DIR}/server" "${ROOT_DIR}/scripts" "${ROOT_DIR}/public"; then
  echo "[ui-security-static][fail] possible token/private-key material found" >&2
  exit 1
fi

if search_matches "(RELAYER_PRIVATE_KEY|DEPLOYER_PK|PRIVATE_KEY|BOT_DEPLOY_SSH_KEY|GITHUB_TOKEN|CLOUDFLARE_API_TOKEN)\\s*[:=]\\s*['\\\"]?0x[a-fA-F0-9]{64}" \
  "${ROOT_DIR}/src" "${ROOT_DIR}/server" "${ROOT_DIR}/scripts" "${ROOT_DIR}/public"; then
  echo "[ui-security-static][fail] possible secret/private-key material found" >&2
  exit 1
fi

echo "[ui-security-static] ok"

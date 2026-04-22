import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { privateKeyToAccount } from 'viem/accounts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

const BOT_STATE_VERSION = 1
const MAX_OUTPUT_CHARS = 4000

function nowIso() {
  return new Date().toISOString()
}

function normalizeAddress(value) {
  if (typeof value !== 'string') {
    return null
  }

  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) {
    return null
  }

  return value.toLowerCase()
}

function normalizePrivateKey(value) {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return null
  }

  const withPrefix = trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`
  if (!/^0x[a-fA-F0-9]{64}$/.test(withPrefix)) {
    return null
  }

  return withPrefix
}

function sanitizeOutput(value) {
  if (typeof value !== 'string' || value.length === 0) {
    return null
  }

  const normalized = value.replace(/\0/g, '').trim()
  if (normalized.length === 0) {
    return null
  }

  if (normalized.length <= MAX_OUTPUT_CHARS) {
    return normalized
  }

  return normalized.slice(normalized.length - MAX_OUTPUT_CHARS)
}

async function loadDotEnv(envPath) {
  try {
    const raw = await fs.readFile(envPath, 'utf8')
    const entries = {}
    const lines = raw.split('\n')

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) {
        continue
      }
      const separator = trimmed.indexOf('=')
      if (separator <= 0) {
        continue
      }
      const key = trimmed.slice(0, separator).trim()
      if (!key) {
        continue
      }
      let value = trimmed.slice(separator + 1).trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      entries[key] = value
    }

    return entries
  } catch {
    return {}
  }
}

function parseBool(value, fallback = false) {
  if (typeof value !== 'string') {
    return fallback
  }

  const normalized = value.trim().toLowerCase()
  if (normalized === '1' || normalized === 'true' || normalized === 'yes') {
    return true
  }
  if (normalized === '0' || normalized === 'false' || normalized === 'no') {
    return false
  }
  return fallback
}

function parseInteger(value, fallback) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return fallback
  }
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }
  return parsed
}

function compactError(error) {
  const raw = error instanceof Error ? error.message : String(error)
  return raw.replace(/\s+/g, ' ').trim()
}

export function isLoopbackHost(host) {
  return host === '127.0.0.1' || host === '::1' || host === 'localhost'
}

export function resolveMutationAuthMode({ apiToken, allowUnsafeRemote }) {
  if (allowUnsafeRemote) {
    return 'unsafe-remote'
  }
  if (apiToken) {
    return 'token'
  }
  return 'local-only'
}

export function assertMutationAuthStartupAllowed(runtime) {
  const mutationAuthMode = resolveMutationAuthMode(runtime)
  if (!isLoopbackHost(runtime.host) && mutationAuthMode === 'local-only') {
    throw new Error(
      `Refusing to start bot server on non-loopback host (${runtime.host}) without BOT_API_TOKEN.`
    )
  }
  return mutationAuthMode
}

async function loadRuntimeConfig() {
  const walletEnvPath = process.env.BOT_WALLET_ENV_PATH
    ? path.resolve(process.env.BOT_WALLET_ENV_PATH)
    : '/home/pavel/firewall-wallet/.env'
  const walletEnv = await loadDotEnv(walletEnvPath)
  const env = { ...walletEnv, ...process.env }

  const contractsDir = env.BOT_WALLET_CONTRACTS_DIR
    ? path.resolve(env.BOT_WALLET_CONTRACTS_DIR)
    : '/home/pavel/firewall-wallet/packages/contracts'
  const statePath = env.BOT_STATE_PATH
    ? path.resolve(env.BOT_STATE_PATH)
    : path.join(repoRoot, 'server', 'state', 'bot-vaults.json')
  const host = env.BOT_SERVER_HOST || '127.0.0.1'
  const port = parseInteger(env.BOT_SERVER_PORT, 8787)
  const intervalSeconds = parseInteger(env.QUEUE_BOT_LOOP_SECONDS, 20)
  const scanLimit = parseInteger(env.QUEUE_SCAN_LIMIT, 128)
  const relayerPrivateKey = normalizePrivateKey(env.RELAYER_PRIVATE_KEY || env.DEPLOYER_PK || '')
  const relayerAddress = relayerPrivateKey ? privateKeyToAccount(relayerPrivateKey).address : null
  const baseRpcUrl = (env.BASE_RPC_URL || '').trim()

  return {
    host,
    port,
    contractsDir,
    walletEnvPath,
    statePath,
    apiToken: (env.BOT_API_TOKEN || '').trim(),
    allowUnsafeRemote: parseBool(env.BOT_ALLOW_UNSAFE_REMOTE, false),
    intervalSeconds,
    scanLimit,
    scriptName: env.BOT_RELAYER_SCRIPT || 'script/RunQueueRelayer.s.sol:RunQueueRelayer',
    baseRpcUrl,
    relayerPrivateKey,
    relayerAddress,
    deployerPrivateKey: normalizePrivateKey(env.DEPLOYER_PK || ''),
  }
}

async function ensureDir(filePath) {
  const dir = path.dirname(filePath)
  await fs.mkdir(dir, { recursive: true })
}

async function loadState(statePath) {
  try {
    const raw = await fs.readFile(statePath, 'utf8')
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') {
      return {
        version: BOT_STATE_VERSION,
        updatedAt: nowIso(),
        vaults: {},
      }
    }
    const vaults = parsed.vaults && typeof parsed.vaults === 'object' ? parsed.vaults : {}
    return {
      version: BOT_STATE_VERSION,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : nowIso(),
      vaults,
    }
  } catch {
    return {
      version: BOT_STATE_VERSION,
      updatedAt: nowIso(),
      vaults: {},
    }
  }
}

async function persistState(statePath, state) {
  state.updatedAt = nowIso()
  await ensureDir(statePath)
  const tempPath = `${statePath}.tmp`
  await fs.writeFile(tempPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  await fs.rename(tempPath, statePath)
}

function createVaultRecord() {
  return {
    enabled: false,
    running: false,
    runCount: 0,
    successCount: 0,
    failureCount: 0,
    lastRunAt: null,
    lastSuccessAt: null,
    lastError: null,
    lastOutput: null,
  }
}

export function isAuthorizedMutation({ req, apiToken, allowUnsafeRemote }) {
  if (!apiToken) {
    const remoteAddress = req.socket.remoteAddress || ''
    if (allowUnsafeRemote) {
      return true
    }
    return (
      remoteAddress === '127.0.0.1'
      || remoteAddress === '::1'
      || remoteAddress === '::ffff:127.0.0.1'
    )
  }
  const incoming = req.headers['x-firewall-bot-token']
  return typeof incoming === 'string' && incoming === apiToken
}

function sendJson(res, code, payload) {
  res.statusCode = code
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(`${JSON.stringify(payload)}\n`)
}

async function readJsonBody(req) {
  const chunks = []
  let size = 0

  for await (const chunk of req) {
    const buffer = Buffer.from(chunk)
    size += buffer.length
    if (size > 50_000) {
      throw new Error('Body too large.')
    }
    chunks.push(buffer)
  }

  if (chunks.length === 0) {
    return {}
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) {
    return {}
  }

  const parsed = JSON.parse(raw)
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid JSON body.')
  }
  return parsed
}

function buildVaultStatusResponse({ vaultAddress, state, runtime }) {
  const record = state.vaults[vaultAddress] || createVaultRecord()
  return {
    ok: true,
    vaultAddress,
    relayerAddress: runtime.relayerAddress,
    runtime: {
      hasBaseRpc: runtime.baseRpcUrl.length > 0,
      hasRelayerKey: Boolean(runtime.relayerPrivateKey),
    },
    vault: record,
  }
}

function spawnForge({ runtime, vaultAddress }) {
  return new Promise((resolve) => {
    const args = [
      'script',
      runtime.scriptName,
      '--rpc-url',
      runtime.baseRpcUrl,
      '--broadcast',
      '-vv',
    ]

    const child = spawn('forge', args, {
      cwd: runtime.contractsDir,
      env: {
        ...process.env,
        BASE_RPC_URL: runtime.baseRpcUrl,
        VAULT_ADDRESS: vaultAddress,
        RELAYER_PRIVATE_KEY: runtime.relayerPrivateKey || '',
        DEPLOYER_PK: runtime.deployerPrivateKey || '',
        QUEUE_SCAN_LIMIT: String(runtime.scanLimit),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk)
    })

    child.on('close', (code) => {
      resolve({
        code: typeof code === 'number' ? code : 1,
        stdout: sanitizeOutput(stdout),
        stderr: sanitizeOutput(stderr),
      })
    })

    child.on('error', (error) => {
      resolve({
        code: 1,
        stdout: sanitizeOutput(stdout),
        stderr: sanitizeOutput(`${stderr}\n${compactError(error)}`),
      })
    })
  })
}

async function main() {
  const runtime = await loadRuntimeConfig()
  const state = await loadState(runtime.statePath)
  const mutationAuthMode = assertMutationAuthStartupAllowed(runtime)

  if (mutationAuthMode === 'unsafe-remote') {
    console.warn('[bot][warn] BOT_ALLOW_UNSAFE_REMOTE=true (unsafe mode enabled).')
  }

  const ensureVault = (vaultAddress) => {
    if (!state.vaults[vaultAddress]) {
      state.vaults[vaultAddress] = createVaultRecord()
    }
    return state.vaults[vaultAddress]
  }

  let tickInProgress = false

  async function runVault(vaultAddress, reason) {
    const record = ensureVault(vaultAddress)
    record.running = true
    record.runCount += 1
    record.lastRunAt = nowIso()
    await persistState(runtime.statePath, state)

    if (!runtime.baseRpcUrl || !runtime.relayerPrivateKey) {
      record.running = false
      record.failureCount += 1
      record.lastError = 'Missing BASE_RPC_URL or RELAYER_PRIVATE_KEY for bot runtime.'
      record.lastOutput = null
      await persistState(runtime.statePath, state)
      return
    }

    const result = await spawnForge({
      runtime,
      vaultAddress,
    })
    record.running = false

    const outputParts = [result.stdout, result.stderr].filter((entry) => typeof entry === 'string' && entry.length > 0)
    record.lastOutput = outputParts.length > 0 ? outputParts.join('\n') : null

    if (result.code === 0) {
      record.successCount += 1
      record.lastSuccessAt = nowIso()
      record.lastError = null
      await persistState(runtime.statePath, state)
      console.log(`[bot] ${reason} vault=${vaultAddress} ok`)
      return
    }

    record.failureCount += 1
    record.lastError = `Relayer script failed with code ${result.code}`
    await persistState(runtime.statePath, state)
    console.error(`[bot] ${reason} vault=${vaultAddress} failed code=${result.code}`)
  }

  async function runTick(reason) {
    if (tickInProgress) {
      return
    }

    const enabledVaults = Object.entries(state.vaults)
      .filter(([, record]) => Boolean(record?.enabled))
      .map(([vaultAddress]) => vaultAddress)

    if (enabledVaults.length === 0) {
      return
    }

    tickInProgress = true
    try {
      for (const vaultAddress of enabledVaults) {
        await runVault(vaultAddress, reason)
      }
    } finally {
      tickInProgress = false
    }
  }

  const server = createServer(async (req, res) => {
    try {
      if (!req.url) {
        sendJson(res, 400, { ok: false, error: 'Missing URL.' })
        return
      }

      const method = req.method || 'GET'
      const url = new URL(req.url, `http://${req.headers.host || `${runtime.host}:${runtime.port}`}`)
      const pathname = url.pathname

      if (method === 'GET' && pathname === '/api/v1/bot/health') {
        sendJson(res, 200, {
          ok: true,
          updatedAt: state.updatedAt,
          runtime: {
            relayerAddress: runtime.relayerAddress,
            hasBaseRpc: runtime.baseRpcUrl.length > 0,
            hasRelayerKey: Boolean(runtime.relayerPrivateKey),
            intervalSeconds: runtime.intervalSeconds,
            contractsDir: runtime.contractsDir,
          },
          security: {
            mutationAuthMode,
            hasApiToken: Boolean(runtime.apiToken),
            allowUnsafeRemote: runtime.allowUnsafeRemote,
            loopbackOnlyHost: isLoopbackHost(runtime.host),
          },
          scheduler: {
            tickInProgress,
          },
        })
        return
      }

      if (method === 'GET' && pathname === '/api/v1/bot/vaults') {
        const vaults = Object.entries(state.vaults).map(([vaultAddress, record]) => ({
          vaultAddress,
          ...record,
        }))
        sendJson(res, 200, {
          ok: true,
          relayerAddress: runtime.relayerAddress,
          runtime: {
            hasBaseRpc: runtime.baseRpcUrl.length > 0,
            hasRelayerKey: Boolean(runtime.relayerPrivateKey),
          },
          vaults,
        })
        return
      }

      const match = pathname.match(/^\/api\/v1\/bot\/vault\/(0x[a-fA-F0-9]{40})\/(status|enable|disable|run)$/)
      if (match) {
        const vaultAddress = normalizeAddress(match[1])
        const action = match[2]

        if (!vaultAddress) {
          sendJson(res, 400, { ok: false, error: 'Invalid vault address.' })
          return
        }

        if (action === 'status' && method === 'GET') {
          sendJson(res, 200, buildVaultStatusResponse({
            vaultAddress,
            state,
            runtime,
          }))
          return
        }

        if (method !== 'POST') {
          sendJson(res, 405, { ok: false, error: 'Method not allowed.' })
          return
        }

        if (!isAuthorizedMutation({ req, apiToken: runtime.apiToken, allowUnsafeRemote: runtime.allowUnsafeRemote })) {
          sendJson(res, 401, { ok: false, error: 'Unauthorized bot mutation request.' })
          return
        }

        await readJsonBody(req).catch(() => ({}))
        const record = ensureVault(vaultAddress)

        if (action === 'enable') {
          record.enabled = true
          await persistState(runtime.statePath, state)
          sendJson(res, 200, {
            ok: true,
            message: 'Vault bot enabled.',
            status: buildVaultStatusResponse({
              vaultAddress,
              state,
              runtime,
            }),
          })
          void runVault(vaultAddress, 'manual-enable')
          return
        }

        if (action === 'disable') {
          record.enabled = false
          await persistState(runtime.statePath, state)
          sendJson(res, 200, {
            ok: true,
            message: 'Vault bot disabled.',
            status: buildVaultStatusResponse({
              vaultAddress,
              state,
              runtime,
            }),
          })
          return
        }

        if (action === 'run') {
          sendJson(res, 200, {
            ok: true,
            message: 'Vault bot run started.',
            status: buildVaultStatusResponse({
              vaultAddress,
              state,
              runtime,
            }),
          })
          void runVault(vaultAddress, 'manual-run')
          return
        }
      }

      sendJson(res, 404, { ok: false, error: 'Route not found.' })
    } catch (error) {
      sendJson(res, 500, {
        ok: false,
        error: compactError(error),
      })
    }
  })

  server.on('error', (error) => {
    console.error(`[bot] server error ${compactError(error)}`)
    process.exit(1)
  })

  server.listen(runtime.port, runtime.host, () => {
    console.log(`[bot] server listening on http://${runtime.host}:${runtime.port}`)
    console.log(`[bot] contractsDir=${runtime.contractsDir}`)
    console.log(`[bot] relayer=${runtime.relayerAddress || 'not configured'}`)
    console.log(`[bot] baseRpc=${runtime.baseRpcUrl ? 'configured' : 'missing'}`)
    console.log(`[bot] mutationAuthMode=${mutationAuthMode}`)
    console.log(`[bot] statePath=${runtime.statePath}`)
  })

  setInterval(() => {
    void runTick('interval')
  }, runtime.intervalSeconds * 1000)
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  void main().catch((error) => {
    console.error(`[bot] fatal ${compactError(error)}`)
    process.exit(1)
  })
}

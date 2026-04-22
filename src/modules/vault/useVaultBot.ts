import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Address } from 'viem'
import { usePublicClient } from 'wagmi'
import { readIsQueueExecutor } from '../../contracts/queueExecutor'

const BOT_STATUS_RETRY_DELAYS_MS = [250, 700] as const
const BOT_STATUS_POLL_INTERVAL_MS = 15_000
const BOT_API_TOKEN_STORAGE_KEYS = ['firewall.botApiToken', 'FIREWALL_BOT_API_TOKEN'] as const

type ServerRuntimeStatus = {
  hasBaseRpc: boolean
  hasRelayerKey: boolean
}

type ServerVaultRecord = {
  enabled: boolean
  running: boolean
  runCount: number
  successCount: number
  failureCount: number
  lastRunAt: string | null
  lastSuccessAt: string | null
  lastError: string | null
  lastOutput: string | null
}

type ServerVaultStatusResponse = {
  ok: true
  vaultAddress: Address
  relayerAddress: Address | null
  runtime: ServerRuntimeStatus
  vault: ServerVaultRecord
}

export type VaultBotStatus = {
  vaultAddress: Address
  relayerAddress: Address | null
  serverEnabled: boolean
  running: boolean
  runCount: number
  successCount: number
  failureCount: number
  lastRunAtMs: number | null
  lastSuccessAtMs: number | null
  lastError: string | null
  lastOutput: string | null
  hasBaseRpc: boolean
  hasRelayerKey: boolean
  onchainExecutorEnabled: boolean | null
}

function toApiUrl(path: string): string {
  const fromEnvRaw = (import.meta.env.VITE_BOT_API_BASE_URL as string | undefined) ?? ''
  const fromEnv = fromEnvRaw.trim()
  if (!fromEnv) {
    return path
  }

  return new URL(path, fromEnv).toString()
}

export function readBotMutationToken(): string | null {
  if (typeof window === 'undefined') {
    return null
  }

  const storages: Array<Storage | null> = []
  try {
    storages.push(window.sessionStorage)
  } catch {
    storages.push(null)
  }
  try {
    storages.push(window.localStorage)
  } catch {
    storages.push(null)
  }

  for (const storage of storages) {
    if (!storage) {
      continue
    }
    for (const key of BOT_API_TOKEN_STORAGE_KEYS) {
      try {
        const value = storage.getItem(key)
        if (typeof value !== 'string') {
          continue
        }
        const trimmed = value.trim()
        if (trimmed.length > 0) {
          return trimmed
        }
      } catch {
        continue
      }
    }
  }

  return null
}

export function buildBotMutationHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }

  const token = readBotMutationToken()
  if (token) {
    headers['x-firewall-bot-token'] = token
  }

  return headers
}

function isAddress(value: unknown): value is Address {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value)
}

function parseIsoTimeToMs(value: unknown): number | null {
  if (typeof value !== 'string') {
    return null
  }
  const ms = Date.parse(value)
  return Number.isFinite(ms) ? ms : null
}

function isTransientBotError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase()
  return (
    message.includes('network')
    || message.includes('timeout')
    || message.includes('fetch')
    || message.includes('failed to fetch')
    || message.includes('temporarily unavailable')
    || message.includes('gateway')
    || message.includes('503')
    || message.includes('429')
  )
}

async function waitMs(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export function normalizeVaultBotStatusResponse(params: {
  walletAddress: Address
  response: unknown
}): VaultBotStatus | null {
  if (!params.response || typeof params.response !== 'object') {
    return null
  }

  const raw = params.response as Partial<ServerVaultStatusResponse>
  if (raw.ok !== true || !raw.vault || !raw.runtime) {
    return null
  }

  const relayerAddress = isAddress(raw.relayerAddress) ? raw.relayerAddress : null

  return {
    vaultAddress: params.walletAddress,
    relayerAddress,
    serverEnabled: Boolean(raw.vault.enabled),
    running: Boolean(raw.vault.running),
    runCount: Number.isFinite(raw.vault.runCount) ? Number(raw.vault.runCount) : 0,
    successCount: Number.isFinite(raw.vault.successCount) ? Number(raw.vault.successCount) : 0,
    failureCount: Number.isFinite(raw.vault.failureCount) ? Number(raw.vault.failureCount) : 0,
    lastRunAtMs: parseIsoTimeToMs(raw.vault.lastRunAt),
    lastSuccessAtMs: parseIsoTimeToMs(raw.vault.lastSuccessAt),
    lastError: typeof raw.vault.lastError === 'string' && raw.vault.lastError.length > 0 ? raw.vault.lastError : null,
    lastOutput: typeof raw.vault.lastOutput === 'string' && raw.vault.lastOutput.length > 0 ? raw.vault.lastOutput : null,
    hasBaseRpc: Boolean(raw.runtime.hasBaseRpc),
    hasRelayerKey: Boolean(raw.runtime.hasRelayerKey),
    onchainExecutorEnabled: null,
  }
}

function toBotActionError(error: unknown, fallback: string): Error {
  const message = error instanceof Error ? error.message : String(error)
  const normalized = message.trim()
  if (normalized.length === 0) {
    return new Error(fallback)
  }

  return new Error(normalized)
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null)
  if (response.ok) {
    return payload as T
  }

  const reason =
    payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
      ? payload.error
      : `HTTP ${response.status}`
  throw new Error(reason)
}

async function fetchBotVaultStatus(walletAddress: Address): Promise<ServerVaultStatusResponse> {
  const response = await fetch(toApiUrl(`/api/v1/bot/vault/${walletAddress}/status`), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
  })

  return readJsonResponse<ServerVaultStatusResponse>(response)
}

async function postBotVaultAction(params: {
  walletAddress: Address
  action: 'enable' | 'disable' | 'run'
}): Promise<void> {
  const response = await fetch(toApiUrl(`/api/v1/bot/vault/${params.walletAddress}/${params.action}`), {
    method: 'POST',
    headers: buildBotMutationHeaders(),
    body: JSON.stringify({}),
  })

  await readJsonResponse<{ ok: true }>(response)
}

export function useVaultBot(walletAddress: Address | null) {
  const publicClient = usePublicClient()
  const [status, setStatus] = useState<VaultBotStatus | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshNonce, setRefreshNonce] = useState(0)

  const refresh = useCallback(() => {
    setRefreshNonce((value) => value + 1)
  }, [])

  const loadStatus = useCallback(async () => {
    if (!walletAddress) {
      setStatus(null)
      setError(null)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    let lastError: unknown = null

    for (let attempt = 0; attempt <= BOT_STATUS_RETRY_DELAYS_MS.length; attempt += 1) {
      try {
        const response = await fetchBotVaultStatus(walletAddress)
        const normalized = normalizeVaultBotStatusResponse({
          walletAddress,
          response,
        })
        if (!normalized) {
          throw new Error('Bot server returned invalid status payload.')
        }

        let onchainExecutorEnabled: boolean | null = null
        if (normalized.relayerAddress && publicClient) {
          onchainExecutorEnabled = await readIsQueueExecutor({
            publicClient,
            walletAddress,
            executorAddress: normalized.relayerAddress,
          })
        }

        setStatus({
          ...normalized,
          onchainExecutorEnabled,
        })
        setError(null)
        setIsLoading(false)
        return
      } catch (statusError) {
        lastError = statusError
        const canRetry = attempt < BOT_STATUS_RETRY_DELAYS_MS.length && isTransientBotError(statusError)
        if (!canRetry) {
          break
        }
        await waitMs(BOT_STATUS_RETRY_DELAYS_MS[attempt])
      }
    }

    const message = lastError instanceof Error ? lastError.message : String(lastError)
    setError(`Bot status unavailable. ${message}`)
    setIsLoading(false)
  }, [publicClient, walletAddress])

  useEffect(() => {
    queueMicrotask(() => {
      void loadStatus()
    })
  }, [loadStatus, refreshNonce])

  useEffect(() => {
    if (!walletAddress) {
      return
    }

    const timer = setInterval(() => {
      void loadStatus()
    }, BOT_STATUS_POLL_INTERVAL_MS)

    return () => {
      clearInterval(timer)
    }
  }, [loadStatus, walletAddress])

  const enableOnServer = useCallback(async () => {
    if (!walletAddress) {
      throw new Error('Vault address is not selected.')
    }

    try {
      await postBotVaultAction({
        walletAddress,
        action: 'enable',
      })
    } catch (actionError) {
      throw toBotActionError(actionError, 'Failed to enable Vault bot on server.')
    } finally {
      refresh()
    }
  }, [refresh, walletAddress])

  const disableOnServer = useCallback(async () => {
    if (!walletAddress) {
      throw new Error('Vault address is not selected.')
    }

    try {
      await postBotVaultAction({
        walletAddress,
        action: 'disable',
      })
    } catch (actionError) {
      throw toBotActionError(actionError, 'Failed to disable Vault bot on server.')
    } finally {
      refresh()
    }
  }, [refresh, walletAddress])

  const runNow = useCallback(async () => {
    if (!walletAddress) {
      throw new Error('Vault address is not selected.')
    }

    try {
      await postBotVaultAction({
        walletAddress,
        action: 'run',
      })
    } catch (actionError) {
      throw toBotActionError(actionError, 'Failed to trigger queue bot run.')
    } finally {
      refresh()
    }
  }, [refresh, walletAddress])

  const health = useMemo(() => {
    if (!status) {
      return {
        hasServerStatus: false,
        readyForAutomation: false,
      }
    }

    const runtimeReady = status.hasBaseRpc && status.hasRelayerKey
    const readyForAutomation = runtimeReady && status.relayerAddress !== null

    return {
      hasServerStatus: true,
      runtimeReady,
      readyForAutomation,
    }
  }, [status])

  return {
    status,
    health,
    isLoading,
    error,
    refresh,
    enableOnServer,
    disableOnServer,
    runNow,
  }
}

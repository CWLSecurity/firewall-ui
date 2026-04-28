import { useCallback, useEffect, useMemo, useState } from 'react'
import { parseAbi, type Address } from 'viem'
import { usePublicClient } from 'wagmi'
import { formatDelay } from './model'

export type QueueItemView = {
  txId: `0x${string}`
  to: Address
  value: bigint
  unlockTime: bigint
  exists: boolean
  executed: boolean
  dataHash: `0x${string}`
  ready: boolean
  reason: string
  reasonLines: string[]
  delaySeconds: bigint | null
  decision: 'allow' | 'delay' | 'revert' | 'unknown'
}

type EvaluateIntent = (params: { to: Address; value: bigint; data?: `0x${string}` }) => Promise<{
  decision: 'allow' | 'delay' | 'revert' | 'unknown'
  delaySeconds: bigint | null
  reasons: string[]
}>

type QueueScanMeta = {
  nextNonce: number | null
  scannedNonces: number
  txIdsFound: number
  slotReadFailures: number
  scheduledReadFailures: number
  updatedAtMs: number
}

const ZERO_BYTES32 = `0x${'0'.repeat(64)}`
const MAX_QUEUE_NONCE_SCAN = 256
const QUEUE_READ_RETRY_DELAYS_MS = [250, 700, 1400] as const
const queueReadAbi = parseAbi([
  'function nextNonce() view returns (uint96)',
  'function scheduledTxIdByNonce(uint96 nonce) view returns (bytes32)',
  'function getScheduled(bytes32 txId) view returns (bool exists, bool executed, address to, uint256 value, uint48 unlockTime, bytes32 dataHash)',
])

function getQueueReadConfig(walletAddress: Address) {
  return {
    address: walletAddress,
    abi: queueReadAbi,
  } as const
}

function isTransientQueueError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase()
  return (
    message.includes('503')
    || message.includes('429')
    || message.includes('rate limit')
    || message.includes('too many requests')
    || message.includes('temporarily unavailable')
    || message.includes('gateway')
    || message.includes('timeout')
    || message.includes('network')
    || message.includes('fetch')
    || message.includes('dns')
    || message.includes('failed to lookup address information')
    || message.includes('no backend is currently healthy')
  )
}

async function waitMs(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function readContractWithRetry(params: {
  run: () => Promise<unknown>
}): Promise<unknown> {
  let lastError: unknown = null

  for (let attempt = 0; attempt <= QUEUE_READ_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await params.run()
    } catch (error) {
      lastError = error
      const canRetry = attempt < QUEUE_READ_RETRY_DELAYS_MS.length && isTransientQueueError(error)
      if (!canRetry) {
        break
      }
      await waitMs(QUEUE_READ_RETRY_DELAYS_MS[attempt])
    }
  }

  throw (lastError instanceof Error ? lastError : new Error(String(lastError)))
}

function parseQueueNonce(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value
  }

  if (typeof value === 'bigint' && value >= 0n && value <= BigInt(Number.MAX_SAFE_INTEGER)) {
    return Number(value)
  }

  return null
}

function uniqueSortedNonces(values: number[]): number[] {
  return Array.from(new Set(values))
    .filter((value) => Number.isInteger(value) && value >= 0)
    .sort((a, b) => a - b)
}

function isTxIdLike(value: unknown): value is `0x${string}` {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{64}$/.test(value)
}

function enrichReasonWithDelay(line: string, delaySeconds: bigint | null): string {
  const normalized = line.trim()
  if (normalized.length === 0 || delaySeconds === null) {
    return normalized
  }

  const delayLabel = formatDelay(delaySeconds)
  const hasDelayDuration = /delay/i.test(normalized) && /\b(seconds?|minutes?|hours?|days?)\b/i.test(normalized)
  if (hasDelayDuration) {
    return normalized
  }

  return `${normalized} Delay time: ${delayLabel}.`
}

function parseUintLikeToBigInt(value: unknown): bigint | null {
  if (typeof value === 'bigint' && value >= 0n) {
    return value
  }

  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return BigInt(value)
  }

  return null
}

type ParsedScheduledRow = {
  exists: boolean
  executed: boolean
  to: Address
  value: bigint
  unlockTime: bigint
  dataHash: `0x${string}`
}

export function parseScheduledRow(raw: unknown): ParsedScheduledRow | null {
  if (!Array.isArray(raw) || raw.length < 6) {
    return null
  }

  const tuple = raw as readonly unknown[]
  const existsRaw = tuple[0]
  const executedRaw = tuple[1]
  const toRaw = tuple[2]
  const valueRaw = tuple[3]
  const unlockRaw = tuple[4]
  const dataHashRaw = tuple[5]

  if (typeof toRaw !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(toRaw)) {
    return null
  }

  const value = parseUintLikeToBigInt(valueRaw)
  const unlockTime = parseUintLikeToBigInt(unlockRaw)
  if (value === null || unlockTime === null) {
    return null
  }

  if (typeof dataHashRaw !== 'string' || !/^0x[a-fA-F0-9]{64}$/.test(dataHashRaw)) {
    return null
  }

  return {
    exists: Boolean(existsRaw),
    executed: Boolean(executedRaw),
    to: toRaw as Address,
    value,
    unlockTime,
    dataHash: dataHashRaw as `0x${string}`,
  }
}

export function useVaultQueue(walletAddress: Address | null, evaluateIntent: EvaluateIntent | null) {
  const publicClient = usePublicClient()
  const [items, setItems] = useState<QueueItemView[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [scanMeta, setScanMeta] = useState<QueueScanMeta | null>(null)
  const [refreshNonce, setRefreshNonce] = useState(0)

  const refresh = useCallback(() => {
    setRefreshNonce((value) => value + 1)
  }, [])

  useEffect(() => {
    if (!walletAddress || !publicClient) {
      queueMicrotask(() => {
        setItems([])
        setIsLoading(false)
        setError(null)
        setScanMeta(null)
      })
      return
    }

    const client = publicClient
    const vaultAddress = walletAddress

    let cancelled = false

    async function run() {
      setIsLoading(true)
      setError(null)

      try {
        const nextNonceRaw = await readContractWithRetry({
          run: () =>
            client.readContract({
              ...getQueueReadConfig(vaultAddress),
              functionName: 'nextNonce',
            }),
        })
        const nextNonce = parseQueueNonce(nextNonceRaw)
        if (nextNonce === null) {
          throw new Error('Queue read failed: nextNonce() returned invalid value.')
        }

        const rangeStart = nextNonce > MAX_QUEUE_NONCE_SCAN ? nextNonce - MAX_QUEUE_NONCE_SCAN : 0
        const rangeNonces =
          nextNonce > 0
            ? Array.from({ length: nextNonce - rangeStart }, (_, offset) => rangeStart + offset)
            : []
        const probeNonces = [0, 1, 2, 3]
        const candidateNonces = uniqueSortedNonces([...rangeNonces, ...probeNonces])

        let slotReadFailures = 0
        const txIdReads = await Promise.all(
          candidateNonces.map(async (nonce) => {
            try {
              const txIdRaw = await readContractWithRetry({
                run: () =>
                  client.readContract({
                    ...getQueueReadConfig(vaultAddress),
                    functionName: 'scheduledTxIdByNonce',
                    args: [BigInt(nonce)],
                  }),
              })
              return { nonce, txIdRaw }
            } catch {
              slotReadFailures += 1
              return { nonce, txIdRaw: null }
            }
          }),
        )

        const txIds = txIdReads
          .map((entry) => entry.txIdRaw)
          .filter((value): value is `0x${string}` => isTxIdLike(value) && value !== ZERO_BYTES32)
        const uniqueTxIds = Array.from(new Set(txIds)).reverse()

        let scheduledReadFailures = 0
        const scheduledRows = await Promise.all(
          uniqueTxIds.map(async (txId) => {
            let scheduledRaw: unknown
            try {
              scheduledRaw = await readContractWithRetry({
                run: () =>
                  client.readContract({
                    ...getQueueReadConfig(vaultAddress),
                    functionName: 'getScheduled',
                    args: [txId],
                  }),
              })
            } catch {
              scheduledReadFailures += 1
              return null
            }

            const parsedScheduled = parseScheduledRow(scheduledRaw)
            if (!parsedScheduled) {
              return null
            }
            const { exists, executed, to, value, unlockTime, dataHash } = parsedScheduled

            const nowSec = BigInt(Math.floor(Date.now() / 1000))

            let reason = 'Delayed by active protection rules.'
            let reasonLines = [reason]
            let delaySeconds: bigint | null = null
            let decision: 'allow' | 'delay' | 'revert' | 'unknown' = 'delay'
            if (evaluateIntent && exists && !executed) {
              try {
                const evaluation = await evaluateIntent({
                  to,
                  value,
                  data: '0x',
                })
                decision = evaluation.decision
                delaySeconds = evaluation.delaySeconds

                if (evaluation.reasons.length > 0) {
                  reasonLines = evaluation.reasons
                }
              } catch {
                reason = 'Delayed by active protection rules.'
                reasonLines = [reason]
              }
            }

            reasonLines = Array.from(new Set(
              reasonLines
                .map((line) => line.trim())
                .filter((line) => line.length > 0),
            ))

            if (reasonLines.length === 0) {
              reasonLines = ['Delayed by active protection rules.']
            }

            if (decision === 'delay' && delaySeconds !== null) {
              reasonLines = reasonLines.map((line) => enrichReasonWithDelay(line, delaySeconds))
            }

            reason = reasonLines.join(' ')

            return {
              txId,
              to,
              value,
              unlockTime,
              exists,
              executed,
              dataHash,
              ready: exists && !executed && unlockTime <= nowSec,
              reason,
              reasonLines,
              delaySeconds,
              decision,
            } satisfies QueueItemView
          }),
        )

        const nextItems = scheduledRows
          .filter((item): item is QueueItemView => Boolean(item))
          .filter((item) => item.exists && !item.executed)
          .sort((left, right) => {
            if (left.unlockTime === right.unlockTime) return 0
            return left.unlockTime < right.unlockTime ? -1 : 1
          })

        const nextMeta: QueueScanMeta = {
          nextNonce,
          scannedNonces: candidateNonces.length,
          txIdsFound: uniqueTxIds.length,
          slotReadFailures,
          scheduledReadFailures,
          updatedAtMs: Date.now(),
        }

        if (
          nextNonce > 0
          && nextMeta.txIdsFound === 0
          && nextMeta.slotReadFailures > 0
        ) {
          throw new Error(
            `Queue read incomplete for vault ${vaultAddress}: nextNonce=${nextNonce}, txIdsFound=0, slotReadFailures=${nextMeta.slotReadFailures}.`,
          )
        }

        if (
          nextMeta.txIdsFound > 0
          && nextItems.length === 0
          && nextMeta.scheduledReadFailures >= nextMeta.txIdsFound
        ) {
          throw new Error(
            `Queue getScheduled reads failed for vault ${vaultAddress}: txIds=${nextMeta.txIdsFound}, scheduledReadFailures=${nextMeta.scheduledReadFailures}.`,
          )
        }

        if (!cancelled) {
          setItems(nextItems)
          setError(null)
          setScanMeta(nextMeta)
        }
      } catch (queueError) {
        if (!cancelled) {
          const details = queueError instanceof Error ? queueError.message : String(queueError)
          setError(`Could not load Vault queue for ${vaultAddress}. ${details}`)
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [evaluateIntent, publicClient, refreshNonce, walletAddress])

  const summary = useMemo(() => {
    const pendingCount = items.length
    const nextUnlock = items.length > 0 ? items[0].unlockTime : null

    return {
      pendingCount,
      nextUnlock,
    }
  }, [items])

  return {
    items,
    summary,
    scanMeta,
    isLoading,
    error,
    refresh,
  }
}

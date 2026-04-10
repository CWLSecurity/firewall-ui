import { describe, expect, it, vi } from 'vitest'
import { readQueueTxIds } from './moduleViews'

const VAULT = '0x1111111111111111111111111111111111111111'

describe('readQueueTxIds', () => {
  it('keeps working when one nonce slot read fails', async () => {
    const txA = `0x${'a'.repeat(64)}`
    const zero = `0x${'0'.repeat(64)}`

    const readContract = vi.fn(async (params: {
      functionName: string
      args?: readonly unknown[]
    }) => {
      if (params.functionName === 'nextNonce') {
        return 3n
      }

      const nonce = params.args?.[0]
      if (params.functionName === 'scheduledTxIdByNonce' && nonce === 0n) {
        return txA
      }
      if (params.functionName === 'scheduledTxIdByNonce' && nonce === 1n) {
        throw new Error('temporary rpc failure')
      }
      if (params.functionName === 'scheduledTxIdByNonce' && nonce === 2n) {
        return zero
      }

      return zero
    })

    const result = await readQueueTxIds({
      publicClient: {
        readContract,
        getBlockNumber: vi.fn(async () => 100n),
        getLogs: vi.fn(async () => []),
      } as never,
      walletAddress: VAULT,
    })

    expect(result).toEqual([txA])
  })

  it('scans only recent nonce window for queue history', async () => {
    const zero = `0x${'0'.repeat(64)}`
    const observedNonces: bigint[] = []

    const readContract = vi.fn(async (params: {
      functionName: string
      args?: readonly unknown[]
    }) => {
      if (params.functionName === 'nextNonce') {
        return 300n
      }

      if (params.functionName === 'scheduledTxIdByNonce') {
        const nonce = params.args?.[0] as bigint
        observedNonces.push(nonce)
        return zero
      }

      return zero
    })

    const result = await readQueueTxIds({
      publicClient: {
        readContract,
        getBlockNumber: vi.fn(async () => 100n),
        getLogs: vi.fn(async () => []),
      } as never,
      walletAddress: VAULT,
    })

    expect(result).toEqual([])
    expect(observedNonces.length).toBe(260)
    expect(observedNonces[0]).toBe(44n)
    expect(observedNonces[255]).toBe(299n)
    expect(observedNonces.slice(256)).toEqual([0n, 1n, 2n, 3n])
  })

  it('falls back to scheduling logs when nonce path returns empty', async () => {
    const txFromLogs = `0x${'b'.repeat(64)}`

    const readContract = vi.fn(async (params: {
      functionName: string
    }) => {
      if (params.functionName === 'nextNonce') {
        return 0n
      }

      return `0x${'0'.repeat(64)}`
    })

    const getBlockNumber = vi.fn(async () => 100n)
    const getLogs = vi.fn(async () => [
      {
        topics: [
          `0x${'1'.repeat(64)}`,
          txFromLogs,
          `0x${'2'.repeat(64)}`,
        ],
      },
    ])

    const result = await readQueueTxIds({
      publicClient: { readContract, getLogs, getBlockNumber } as never,
      walletAddress: VAULT,
    })

    expect(result).toEqual([txFromLogs])
  })

  it('probes first nonce slots when nextNonce is zero', async () => {
    const txFromProbe = `0x${'c'.repeat(64)}`

    const readContract = vi.fn(async (params: {
      functionName: string
      args?: readonly unknown[]
    }) => {
      if (params.functionName === 'nextNonce') {
        return 0n
      }

      if (params.functionName === 'scheduledTxIdByNonce' && params.args?.[0] === 0n) {
        return txFromProbe
      }

      return `0x${'0'.repeat(64)}`
    })

    const result = await readQueueTxIds({
      publicClient: {
        readContract,
        getBlockNumber: vi.fn(async () => 100n),
        getLogs: vi.fn(async () => []),
      } as never,
      walletAddress: VAULT,
    })

    expect(result).toEqual([txFromProbe])
  })
})

import { describe, expect, it, vi } from 'vitest'
import { findLatestWalletByOwner } from './factory'

const OWNER = '0x1111111111111111111111111111111111111111'
const WALLET = '0x2222222222222222222222222222222222222222'
const TX_HASH = `0x${'a'.repeat(64)}`

describe('findLatestWalletByOwner', () => {
  it('prefers latestWalletOfOwner view when available', async () => {
    const getLogs = vi.fn(async () => [])
    const readContract = vi.fn(async () => WALLET)

    const result = await findLatestWalletByOwner({
      publicClient: {
        getBlockNumber: vi.fn(async () => 123n),
        getLogs,
        readContract,
      } as never,
      owner: OWNER,
    })

    expect(result).toEqual({
      walletAddress: WALLET,
      basePackId: null,
      blockNumber: 123n,
      transactionHash: null,
    })
    expect(readContract).toHaveBeenCalled()
    expect(getLogs).not.toHaveBeenCalled()
  })

  it('falls back to WalletCreated logs when view is unavailable', async () => {
    const readContract = vi.fn(async () => {
      throw new Error('execution reverted')
    })
    const getLogs = vi.fn(async () => [
      {
        args: {
          owner: OWNER,
          wallet: WALLET,
          basePackId: 0n,
        },
        blockNumber: 98n,
        transactionHash: TX_HASH,
      },
    ])

    const result = await findLatestWalletByOwner({
      publicClient: {
        getBlockNumber: vi.fn(async () => 100n),
        getLogs,
        readContract,
      } as never,
      owner: OWNER,
      lookbackBlocks: 200n,
    })

    expect(result).toEqual({
      walletAddress: WALLET,
      basePackId: 0,
      blockNumber: 98n,
      transactionHash: TX_HASH,
    })
    expect(readContract).toHaveBeenCalled()
    expect(getLogs).toHaveBeenCalled()
  })
})

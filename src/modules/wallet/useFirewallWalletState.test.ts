import { describe, expect, it } from 'vitest'
import { resolveWalletRecordAfterDetection } from './useFirewallWalletState'

const RECORD_A = {
  walletAddress: '0x1111111111111111111111111111111111111111',
  basePackId: 0,
  blockNumber: 1n,
  transactionHash: '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
} as const

const RECORD_B = {
  ...RECORD_A,
  walletAddress: '0x2222222222222222222222222222222222222222',
  basePackId: 1,
} as const

describe('resolveWalletRecordAfterDetection', () => {
  it('keeps previous record when refresh returned null in same owner scope', () => {
    const result = resolveWalletRecordAfterDetection({
      previousRecord: RECORD_A,
      nextRecord: null,
      scopeChanged: false,
      forceClear: false,
    })

    expect(result).toEqual(RECORD_A)
  })

  it('clears previous record when scope changed', () => {
    const result = resolveWalletRecordAfterDetection({
      previousRecord: RECORD_A,
      nextRecord: null,
      scopeChanged: true,
      forceClear: false,
    })

    expect(result).toBeNull()
  })

  it('clears previous record when forced clear is requested', () => {
    const result = resolveWalletRecordAfterDetection({
      previousRecord: RECORD_A,
      nextRecord: RECORD_B,
      scopeChanged: false,
      forceClear: true,
    })

    expect(result).toBeNull()
  })

  it('uses next record when provided', () => {
    const result = resolveWalletRecordAfterDetection({
      previousRecord: RECORD_A,
      nextRecord: RECORD_B,
      scopeChanged: false,
      forceClear: false,
    })

    expect(result).toEqual(RECORD_B)
  })
})

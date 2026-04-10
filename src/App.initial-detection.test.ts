import { describe, expect, it } from 'vitest'
import {
  shouldClearInitialDetectionTimeout,
  shouldWaitForInitialVaultDetection,
  toStatusWalletState,
} from './modules/app-shell/initialDetection'

describe('shouldWaitForInitialVaultDetection', () => {
  it('waits while initial detection is pending and timeout did not fire', () => {
    const result = shouldWaitForInitialVaultDetection({
      isInitialDetectionPending: true,
      isInitialDetectionTimedOut: false,
    })

    expect(result).toBe(true)
  })

  it('stops waiting after timeout', () => {
    const result = shouldWaitForInitialVaultDetection({
      isInitialDetectionPending: true,
      isInitialDetectionTimedOut: true,
    })

    expect(result).toBe(false)
  })
})

describe('shouldClearInitialDetectionTimeout', () => {
  it('clears timeout marker after initial detection resolves for the same owner', () => {
    const result = shouldClearInitialDetectionTimeout({
      normalizedOwner: '0x1111111111111111111111111111111111111111',
      timedOutDetectionOwner: '0x1111111111111111111111111111111111111111',
      isInitialDetectionPending: false,
    })

    expect(result).toBe(true)
  })

  it('keeps timeout marker while initial detection is still pending', () => {
    const result = shouldClearInitialDetectionTimeout({
      normalizedOwner: '0x1111111111111111111111111111111111111111',
      timedOutDetectionOwner: '0x1111111111111111111111111111111111111111',
      isInitialDetectionPending: true,
    })

    expect(result).toBe(false)
  })

  it('does not clear when timeout marker belongs to another owner', () => {
    const result = shouldClearInitialDetectionTimeout({
      normalizedOwner: '0x1111111111111111111111111111111111111111',
      timedOutDetectionOwner: '0x2222222222222222222222222222222222222222',
      isInitialDetectionPending: false,
    })

    expect(result).toBe(false)
  })
})

describe('toStatusWalletState', () => {
  it('keeps detected chain vault state', () => {
    const state = toStatusWalletState({
      walletState: {
        walletAddress: '0x1111111111111111111111111111111111111111',
        basePackId: 1,
        source: 'chain',
        walletRecord: {
          walletAddress: '0x1111111111111111111111111111111111111111',
          basePackId: 1,
          blockNumber: 1n,
          transactionHash: null,
        },
        isLoading: false,
        hasInitialDetectionCompleted: true,
        error: null,
        refresh: () => {},
      },
    })

    expect(state.source).toBe('chain')
    expect(state.walletAddress).toBe('0x1111111111111111111111111111111111111111')
    expect(state.walletRecord).not.toBeNull()
  })

  it('keeps manual state intact', () => {
    const state = toStatusWalletState({
      walletState: {
        walletAddress: '0x2222222222222222222222222222222222222222',
        basePackId: 0,
        source: 'manual',
        walletRecord: null,
        isLoading: false,
        hasInitialDetectionCompleted: true,
        error: null,
        refresh: () => {},
      },
    })

    expect(state.source).toBe('manual')
    expect(state.walletAddress).toBe('0x2222222222222222222222222222222222222222')
  })
})

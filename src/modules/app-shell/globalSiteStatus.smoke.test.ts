import { describe, expect, it } from 'vitest'
import type { FirewallWalletState } from '../wallet/useFirewallWalletState'
import { deriveGlobalSiteStatus } from './useGlobalSiteStatus'

const OWNER = '0x1111111111111111111111111111111111111111' as const
const VAULT = '0x2222222222222222222222222222222222222222' as const

function makeWalletState(overrides?: Partial<FirewallWalletState>): FirewallWalletState {
  return {
    walletAddress: null,
    basePackId: null,
    source: null,
    walletRecord: null,
    isLoading: false,
    error: null,
    hasInitialDetectionCompleted: false,
    refresh: () => {},
    ...overrides,
  }
}

function makeParams(overrides?: Partial<Parameters<typeof deriveGlobalSiteStatus>[0]>) {
  return {
    isConnected: false,
    isBaseReady: false,
    ownerAddress: null,
    vaultDisconnectedByOwner: null,
    manualWallet: null,
    walletState: makeWalletState(),
    createModalOpen: false,
    createSessionAutoAdoptBlocked: false,
    createIntentStarted: false,
    txRequestStarted: false,
    txHashReceived: null,
    awaitingConfirmation: false,
    ...overrides,
  }
}

describe('Global status smoke matrix', () => {
  it('disconnected state is stable and fully locked', () => {
    const status = deriveGlobalSiteStatus(makeParams())
    expect(status.signerStatus).toBe('disconnected')
    expect(status.vaultStatus).toBe('disconnected')
    expect(status.createModalVisible).toBe(false)
    expect(status.vaultReadyUiUnlocked).toBe(false)
  })

  it('wrong-network connected wallet reports wrong_network', () => {
    const status = deriveGlobalSiteStatus(makeParams({
      isConnected: true,
      ownerAddress: OWNER,
    }))
    expect(status.signerStatus).toBe('wrong_network')
    expect(status.vaultStatus).toBe('wrong_network')
  })

  it('initial base detection unresolved shows detecting', () => {
    const status = deriveGlobalSiteStatus(makeParams({
      isConnected: true,
      isBaseReady: true,
      ownerAddress: OWNER,
    }))
    expect(status.vaultStatus).toBe('detecting')
    expect(status.isInitialVaultDetectionUnresolved).toBe(true)
  })

  it('base-ready with completed detection and no vault shows no_vault', () => {
    const status = deriveGlobalSiteStatus(makeParams({
      isConnected: true,
      isBaseReady: true,
      ownerAddress: OWNER,
      walletState: makeWalletState({
        hasInitialDetectionCompleted: true,
      }),
    }))
    expect(status.vaultStatus).toBe('no_vault')
    expect(status.hasSelectedVault).toBe(false)
  })

  it('submission evidence with tx hash keeps awaiting_confirmation until vault becomes effective', () => {
    const status = deriveGlobalSiteStatus(makeParams({
      isConnected: true,
      isBaseReady: true,
      ownerAddress: OWNER,
      txHashReceived: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      walletState: makeWalletState({
        walletAddress: VAULT,
        basePackId: 0,
        source: 'chain',
        hasInitialDetectionCompleted: true,
      }),
      createModalOpen: true,
      createSessionAutoAdoptBlocked: true,
    }))
    expect(status.vaultStatus).toBe('awaiting_confirmation')
    expect(status.createFlowSubmissionEvidence).toBe(true)
  })

  it('confirmed vault unlocks ready state and primary vault areas', () => {
    const status = deriveGlobalSiteStatus(makeParams({
      isConnected: true,
      isBaseReady: true,
      ownerAddress: OWNER,
      walletState: makeWalletState({
        walletAddress: VAULT,
        basePackId: 0,
        source: 'chain',
        hasInitialDetectionCompleted: true,
      }),
    }))
    expect(status.vaultStatus).toBe('ready')
    expect(status.activeVaultAddress).toBe(VAULT)
    expect(status.vaultReadyUiUnlocked).toBe(true)
  })

  it('disconnect marker blocks auto-adopted chain vault for same owner', () => {
    const status = deriveGlobalSiteStatus(makeParams({
      isConnected: true,
      isBaseReady: true,
      ownerAddress: OWNER,
      vaultDisconnectedByOwner: OWNER,
      walletState: makeWalletState({
        walletAddress: VAULT,
        basePackId: 0,
        source: 'chain',
        hasInitialDetectionCompleted: true,
      }),
    }))
    expect(status.blockAutoAdoptDetectedVault).toBe(true)
    expect(status.activeVaultAddress).toBeNull()
    expect(status.vaultStatus).toBe('no_vault')
  })

  it('manual vault bypasses initial detection gate', () => {
    const status = deriveGlobalSiteStatus(makeParams({
      isConnected: true,
      isBaseReady: true,
      ownerAddress: OWNER,
      manualWallet: {
        walletAddress: VAULT,
        basePackId: 1,
      },
      walletState: makeWalletState({
        walletAddress: VAULT,
        basePackId: 1,
        source: 'manual',
        hasInitialDetectionCompleted: false,
      }),
    }))
    expect(status.isInitialVaultDetectionUnresolved).toBe(false)
    expect(status.vaultStatus).toBe('ready')
  })

  it('refresh after initial detection exposes refresh-in-progress flag', () => {
    const status = deriveGlobalSiteStatus(makeParams({
      isConnected: true,
      isBaseReady: true,
      ownerAddress: OWNER,
      walletState: makeWalletState({
        walletAddress: VAULT,
        basePackId: 0,
        source: 'chain',
        isLoading: true,
        hasInitialDetectionCompleted: true,
      }),
    }))
    expect(status.isVaultDetectionRefreshInProgress).toBe(true)
  })

  it('create modal visibility remains gated by connected base-ready state', () => {
    const visible = deriveGlobalSiteStatus(makeParams({
      isConnected: true,
      isBaseReady: true,
      ownerAddress: OWNER,
      createModalOpen: true,
      walletState: makeWalletState({
        hasInitialDetectionCompleted: true,
      }),
    }))
    const hidden = deriveGlobalSiteStatus(makeParams({
      isConnected: true,
      isBaseReady: false,
      ownerAddress: OWNER,
      createModalOpen: true,
    }))

    expect(visible.createModalVisible).toBe(true)
    expect(hidden.createModalVisible).toBe(false)
  })
})

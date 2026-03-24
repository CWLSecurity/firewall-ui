import type { Address, Hash } from 'viem'
import type { FirewallWalletState } from '../wallet/useFirewallWalletState'

export type SignerStatus = 'disconnected' | 'wrong_network' | 'ready'

export type VaultStatus =
  | 'disconnected'
  | 'wrong_network'
  | 'detecting'
  | 'awaiting_confirmation'
  | 'ready'
  | 'no_vault'

type UseGlobalSiteStatusParams = {
  isConnected: boolean
  isBaseReady: boolean
  ownerAddress: Address | null
  vaultDisconnectedByOwner: Address | null
  manualWallet: {
    walletAddress: Address
    basePackId: number | null
  } | null
  walletState: FirewallWalletState
  createModalOpen: boolean
  createSessionAutoAdoptBlocked: boolean
  createIntentStarted: boolean
  txRequestStarted: boolean
  txHashReceived: Hash | null
  awaitingConfirmation: boolean
}

export type GlobalSiteStatus = {
  manualWallet: {
    walletAddress: Address
    basePackId: number | null
  } | null
  signerStatus: SignerStatus
  vaultStatus: VaultStatus
  createFlowSubmissionEvidence: boolean
  blockAutoAdoptDetectedVault: boolean
  effectiveVaultConfirmedExists: boolean
  isAwaitingVaultConfirmation: boolean
  isInitialVaultDetectionUnresolved: boolean
  isVaultDetectionRefreshInProgress: boolean
  activeVaultAddress: Address | null
  knownVaultAddress: Address | null
  hasSelectedVault: boolean
  createModalVisible: boolean
  vaultReadyUiUnlocked: boolean
  hasVaultConfirmed: boolean
}

function sameAddress(left: Address, right: Address): boolean {
  return left.toLowerCase() === right.toLowerCase()
}

export function shouldBlockAutoAdoptDetectedVault(params: {
  walletSource: FirewallWalletState['source']
  ownerAddress: Address | null
  vaultDisconnectedByOwner: Address | null
  createSessionAutoAdoptBlocked: boolean
  createModalOpen: boolean
  txHashReceived: Hash | null
}): boolean {
  const autoAdoptBlockedByDisconnect = Boolean(
    params.ownerAddress
    && params.vaultDisconnectedByOwner
    && sameAddress(params.ownerAddress, params.vaultDisconnectedByOwner),
  )

  return Boolean(
    params.walletSource
    && (
      autoAdoptBlockedByDisconnect
      || params.createSessionAutoAdoptBlocked
      || (params.createModalOpen && !params.txHashReceived)
    ),
  )
}

export function useGlobalSiteStatus(params: UseGlobalSiteStatusParams) {
  return deriveGlobalSiteStatus(params)
}

export function deriveGlobalSiteStatus(params: UseGlobalSiteStatusParams): GlobalSiteStatus {
  const {
    isConnected,
    isBaseReady,
    ownerAddress,
    vaultDisconnectedByOwner,
    manualWallet,
    walletState,
    createModalOpen,
    createSessionAutoAdoptBlocked,
    createIntentStarted,
    txRequestStarted,
    txHashReceived,
    awaitingConfirmation,
  } = params

  const vaultConfirmedExists = Boolean(
    isBaseReady
    && walletState.walletAddress
    && (walletState.source === 'chain' || walletState.source === 'manual'),
  )

  const createFlowSubmissionEvidence = Boolean(
    createIntentStarted || txRequestStarted || txHashReceived || awaitingConfirmation,
  )

  const blockAutoAdoptDetectedVault = shouldBlockAutoAdoptDetectedVault({
    walletSource: walletState.source,
    ownerAddress,
    vaultDisconnectedByOwner,
    createSessionAutoAdoptBlocked,
    createModalOpen,
    txHashReceived,
  })

  const effectiveVaultConfirmedExists = vaultConfirmedExists && !blockAutoAdoptDetectedVault

  const isAwaitingVaultConfirmation = Boolean(
    isBaseReady
    && createFlowSubmissionEvidence
    && (awaitingConfirmation || (txHashReceived && !effectiveVaultConfirmedExists)),
  )

  const isInitialVaultDetectionUnresolved = Boolean(
    ownerAddress
    && isConnected
    && isBaseReady
    && !walletState.hasInitialDetectionCompleted
    && !manualWallet,
  )

  const isVaultDetectionRefreshInProgress = Boolean(
    ownerAddress
    && isConnected
    && isBaseReady
    && walletState.hasInitialDetectionCompleted
    && walletState.isLoading,
  )

  const activeVaultAddress = effectiveVaultConfirmedExists ? walletState.walletAddress : null

  const knownVaultAddress =
    walletState.walletAddress
    && effectiveVaultConfirmedExists
    && (walletState.source === 'chain' || walletState.source === 'manual')
      ? walletState.walletAddress
      : null

  const hasSelectedVault = Boolean(activeVaultAddress)
  const createModalVisible = createModalOpen && isConnected && isBaseReady
  const vaultReadyUiUnlocked = Boolean(
    isConnected
    && ownerAddress
    && hasSelectedVault
    && activeVaultAddress,
  )
  const signerStatus: SignerStatus = !isConnected ? 'disconnected' : isBaseReady ? 'ready' : 'wrong_network'

  const vaultStatus: VaultStatus = !isConnected
    ? 'disconnected'
    : !isBaseReady
      ? 'wrong_network'
      : isInitialVaultDetectionUnresolved
        ? 'detecting'
        : isAwaitingVaultConfirmation
          ? 'awaiting_confirmation'
          : hasSelectedVault
            ? 'ready'
            : 'no_vault'

  return {
    manualWallet,
    signerStatus,
    vaultStatus,
    createFlowSubmissionEvidence,
    blockAutoAdoptDetectedVault,
    effectiveVaultConfirmedExists,
    isAwaitingVaultConfirmation,
    isInitialVaultDetectionUnresolved,
    isVaultDetectionRefreshInProgress,
    activeVaultAddress,
    knownVaultAddress,
    hasSelectedVault,
    createModalVisible,
    vaultReadyUiUnlocked,
    hasVaultConfirmed: vaultConfirmedExists,
  }
}

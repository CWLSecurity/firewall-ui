import './App.css'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi'
import type { Address } from 'viem'
import { CopyButton } from './components/CopyButton'
import { BASE_CHAIN_ID } from './contracts/addresses/base'
import { FACTORY_LOG_LOOKBACK_BLOCKS } from './contracts/runtimeConfig'
import { shortAddress, shortHash, txUrl } from './lib/explorer/base'
import { GetStartedArea, NewsArea, TrustArea, VaultOverview } from './modules/app-shell/areas'
import {
  CreateVaultModal,
  ImportVaultCard,
  ProtectionManagementModal,
  QueueDetailsModal,
  ReceiveVaultModal,
  SendVaultModal,
} from './modules/app-shell/modals'
import {
  baseLineName,
  createFallbackActiveProtectionRules,
  formatCompactEth,
  formatDateTime,
  normalizeActivePolicyLabel,
  normalizeQueueLoadError,
  resolveActivePolicyTooltipLines,
  normalizeVaultStateError,
  policySemanticKey,
  ruleContextLabel,
} from './modules/app-shell/helpers'
import {
  shouldClearInitialDetectionTimeout,
  shouldWaitForInitialVaultDetection,
  toStatusWalletState,
} from './modules/app-shell/initialDetection'
import type { ProtectionRuleView } from './modules/app-shell/types'
import { useAppShellState } from './modules/app-shell/useAppShellState'
import { useGlobalSiteStatus } from './modules/app-shell/useGlobalSiteStatus'
import { useTraceTransitions } from './modules/app-shell/useTraceTransitions'
import { logCreateFlowDebug } from './modules/debug/createFlowDebug'
import { packTitleFromSlug, policyCompactTooltipLines } from './modules/vault/model'
import { useVaultQueue } from './modules/vault/useVaultQueue'
import { useVaultRuntime } from './modules/vault/useVaultRuntime'
import { isProviderNotFoundError, orderConnectorsByProviderPriority } from './modules/wallet/connectors'
import { useEthBalance } from './modules/wallet/useEthBalance'
import { useFirewallWalletState } from './modules/wallet/useFirewallWalletState'
import { Button } from './ui/Button'

const INITIAL_VAULT_DETECTION_TIMEOUT_MS = 10_000
const WALLET_DRIFT_DEBUG_QUERY_PARAM = 'debug-wallet'

type WalletDebugSnapshot = {
  ownerAddress: Address | null
  ownerBalanceEth: string | null
  chainId: number | undefined
  isBaseReady: boolean
  connectorId: string | null
  connectorName: string | null
  connectorType: string | null
  manualWalletAddress: Address | null
  manualWalletBasePackId: number | null
  walletStateAddress: Address | null
  walletStateBasePackId: number | null
  walletSource: string | null
  knownVaultAddress: Address | null
  activeVaultAddress: Address | null
  hasSelectedVault: boolean
  effectiveVaultConfirmedExists: boolean
  blockAutoAdoptDetectedVault: boolean
  vaultDisconnectedByOwner: Address | null
  hasInitialDetectionCompleted: boolean
  isLoading: boolean
  walletRecordAddress: Address | null
  walletRecordBasePackId: number | null
  walletRecordBlockNumber: string | null
  walletRecordTransactionHash: string | null
  walletError: string | null
  connectError: string | null
  vaultBalanceEth: string | null
}

function formatWalletDebugValue(value: unknown): string {
  if (value === null) {
    return 'null'
  }

  if (value === undefined) {
    return 'undefined'
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  if (typeof value === 'bigint') {
    return value.toString()
  }

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function serializeWalletDebugSnapshot(snapshot: WalletDebugSnapshot | null): string {
  if (!snapshot) {
    return 'null'
  }

  return JSON.stringify(snapshot)
}

function normalizeConnectErrorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const withShort = error as { shortMessage?: unknown; message?: unknown }
    if (typeof withShort.shortMessage === 'string' && withShort.shortMessage.trim().length > 0) {
      return withShort.shortMessage
    }
    if (typeof withShort.message === 'string' && withShort.message.trim().length > 0) {
      return withShort.message
    }
  }

  return 'Wallet connection failed. Check wallet extension and retry.'
}

function isWalletDriftDebugEnabled(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  return new URLSearchParams(window.location.search).has(WALLET_DRIFT_DEBUG_QUERY_PARAM)
}

function App() {
  const { address, isConnected: isProviderConnected, chainId, connector } = useAccount()
  const { connectAsync, connectors, isPending: isConnectPending } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain, isPending: isSwitchPending } = useSwitchChain()
  const [timedOutDetectionOwner, setTimedOutDetectionOwner] = useState<string | null>(null)
  const [connectError, setConnectError] = useState<string | null>(null)
  const [walletDebugFirstSnapshotText, setWalletDebugFirstSnapshotText] = useState<string | null>(null)
  const [walletDebugPreviousSnapshotText, setWalletDebugPreviousSnapshotText] = useState<string | null>(null)
  const walletDriftDebugEnabled = useMemo(() => isWalletDriftDebugEnabled(), [])
  const firstWalletSnapshotRef = useRef<WalletDebugSnapshot | null>(null)
  const previousWalletSnapshotRef = useRef<{
    ownerAddress: Address | null
    chainId: number | undefined
    connectorId: string | null
    walletAddress: Address | null
    knownVaultAddress: Address | null
    walletSource: string | null
  } | null>(null)

  const ownerAddress: Address | null = isProviderConnected && address ? (address as Address) : null
  const isWalletConnected = Boolean(ownerAddress)
  const isBaseReady = isWalletConnected && chainId === BASE_CHAIN_ID
  const normalizedOwner = ownerAddress?.toLowerCase() ?? null
  const isInitialDetectionTimedOut = Boolean(
    normalizedOwner && timedOutDetectionOwner === normalizedOwner,
  )
  const prioritizedConnectors = useMemo(
    () => orderConnectorsByProviderPriority(connectors),
    [connectors],
  )

  const ui = useAppShellState()
  const {
    manualWalletByOwner,
    vaultDisconnectedByOwner,
    showImportPanel,
    createModalOpen,
    createSessionAutoAdoptBlocked,
    selectedProfileDraft,
    selectedAddOnsDraft,
    createIntentStarted,
    txRequestStarted,
    txHashReceived,
    awaitingConfirmation,
    isProtectionModalOpen,
    isQueueModalOpen,
    isReceiveModalOpen,
    isSendModalOpen,
    updateManualWalletByOwner,
    updateVaultDisconnectedByOwner,
    updateShowImportPanel,
    updateCreateModalOpen,
    updateCreateSessionAutoAdoptBlocked,
    updateSelectedProfileDraft,
    updateSelectedAddOnsDraft,
    updateCreateIntentStarted,
    updateTxRequestStarted,
    updateTxHashReceived,
    updateAwaitingConfirmation,
    setIsProtectionModalOpen,
    setIsQueueModalOpen,
    setIsReceiveModalOpen,
    setIsSendModalOpen,
    closeCreateModal,
    markCreateFlowFailed,
  } = ui

  const manualWallet = useMemo(() => {
    if (!normalizedOwner || !manualWalletByOwner) {
      return null
    }

    if (manualWalletByOwner.ownerAddress.toLowerCase() !== normalizedOwner) {
      return null
    }

    return {
      walletAddress: manualWalletByOwner.walletAddress,
      basePackId: manualWalletByOwner.basePackId,
    }
  }, [manualWalletByOwner, normalizedOwner])

  const walletState = useFirewallWalletState({
    ownerAddress,
    isBaseReady,
    manualWallet,
    lookbackBlocks: FACTORY_LOG_LOOKBACK_BLOCKS,
  })

  const isInitialDetectionPending = Boolean(
    ownerAddress
    && isWalletConnected
    && isBaseReady
    && !walletState.hasInitialDetectionCompleted
    && !manualWallet,
  )
  const isWaitingForInitialDetection = shouldWaitForInitialVaultDetection({
    isInitialDetectionPending,
    isInitialDetectionTimedOut,
  })

  useEffect(() => {
    if (!isWaitingForInitialDetection) {
      return
    }

    const timeoutId = setTimeout(() => {
      logCreateFlowDebug('handler_run', {
        handler: 'initial_vault_detection_timeout',
        trigger: 'initial_detection_wait_timeout',
        source: 'src/App.tsx::App/useEffect[initial_detection_timeout]',
        timeoutMs: INITIAL_VAULT_DETECTION_TIMEOUT_MS,
      })
      setTimedOutDetectionOwner(normalizedOwner)
    }, INITIAL_VAULT_DETECTION_TIMEOUT_MS)

    return () => {
      clearTimeout(timeoutId)
    }
  }, [isWaitingForInitialDetection, normalizedOwner])

  useEffect(() => {
    if (!shouldClearInitialDetectionTimeout({
      normalizedOwner,
      timedOutDetectionOwner,
      isInitialDetectionPending,
    })) {
      return
    }

    queueMicrotask(() => {
      setTimedOutDetectionOwner(null)
    })
  }, [isInitialDetectionPending, normalizedOwner, timedOutDetectionOwner])

  const walletStateForStatus = useMemo(
    () =>
      toStatusWalletState({
        walletState,
      }),
    [walletState],
  )

  const effectiveCreateSessionAutoAdoptBlocked = createSessionAutoAdoptBlocked

  const globalStatus = useGlobalSiteStatus({
    isConnected: isWalletConnected,
    isBaseReady,
    ownerAddress,
    vaultDisconnectedByOwner,
    manualWallet,
    walletState: walletStateForStatus,
    createModalOpen,
    createSessionAutoAdoptBlocked: effectiveCreateSessionAutoAdoptBlocked,
    createIntentStarted,
    txRequestStarted,
    txHashReceived,
    awaitingConfirmation,
  })

  const {
    hasVaultConfirmed: vaultConfirmedExists,
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
  } = globalStatus

  const ownerBalance = useEthBalance(ownerAddress)
  const vaultBalance = useEthBalance(activeVaultAddress)
  const ownerBalanceCompactEth = formatCompactEth(ownerBalance.balanceEth)
  const vaultBalanceCompactEth = formatCompactEth(vaultBalance.balanceEth)

  const walletDebugSnapshot = useMemo<WalletDebugSnapshot>(() => ({
    ownerAddress,
    ownerBalanceEth: ownerBalanceCompactEth,
    chainId,
    isBaseReady,
    connectorId: connector?.id ?? null,
    connectorName: connector?.name ?? null,
    connectorType: connector?.type ?? null,
    manualWalletAddress: manualWallet?.walletAddress ?? null,
    manualWalletBasePackId: manualWallet?.basePackId ?? null,
    walletStateAddress: walletState.walletAddress,
    walletStateBasePackId: walletState.basePackId,
    walletSource: walletState.source,
    knownVaultAddress,
    activeVaultAddress,
    hasSelectedVault,
    effectiveVaultConfirmedExists,
    blockAutoAdoptDetectedVault,
    vaultDisconnectedByOwner,
    hasInitialDetectionCompleted: walletState.hasInitialDetectionCompleted,
    isLoading: walletState.isLoading,
    walletRecordAddress: walletState.walletRecord?.walletAddress ?? null,
    walletRecordBasePackId: walletState.walletRecord?.basePackId ?? null,
    walletRecordBlockNumber: walletState.walletRecord?.blockNumber?.toString() ?? null,
    walletRecordTransactionHash: walletState.walletRecord?.transactionHash ?? null,
    walletError: walletState.error,
    connectError,
    vaultBalanceEth: vaultBalanceCompactEth,
  }), [
    activeVaultAddress,
    blockAutoAdoptDetectedVault,
    chainId,
    connectError,
    connector?.id,
    connector?.name,
    connector?.type,
    effectiveVaultConfirmedExists,
    hasSelectedVault,
    isBaseReady,
    knownVaultAddress,
    manualWallet?.basePackId,
    manualWallet?.walletAddress,
    ownerAddress,
    ownerBalanceCompactEth,
    vaultBalanceCompactEth,
    vaultDisconnectedByOwner,
    walletState.basePackId,
    walletState.error,
    walletState.hasInitialDetectionCompleted,
    walletState.isLoading,
    walletState.source,
    walletState.walletAddress,
    walletState.walletRecord?.basePackId,
    walletState.walletRecord?.blockNumber,
    walletState.walletRecord?.transactionHash,
    walletState.walletRecord?.walletAddress,
  ])

  useEffect(() => {
    if (!walletDriftDebugEnabled) {
      return
    }

    const currentSnapshotText = serializeWalletDebugSnapshot(walletDebugSnapshot)
    const previous = previousWalletSnapshotRef.current
    const previousSnapshotText = previous
      ? JSON.stringify(previous)
      : 'null'
    const changed =
      !previous
      || previous.ownerAddress !== walletDebugSnapshot.ownerAddress
      || previous.chainId !== walletDebugSnapshot.chainId
      || previous.connectorId !== walletDebugSnapshot.connectorId
      || previous.walletAddress !== walletDebugSnapshot.walletStateAddress
      || previous.knownVaultAddress !== walletDebugSnapshot.knownVaultAddress
      || previous.walletSource !== walletDebugSnapshot.walletSource

    if (!firstWalletSnapshotRef.current || changed) {
      queueMicrotask(() => {
        if (!firstWalletSnapshotRef.current) {
          firstWalletSnapshotRef.current = walletDebugSnapshot
          setWalletDebugFirstSnapshotText(currentSnapshotText)
        }

        if (changed) {
          setWalletDebugPreviousSnapshotText(previousSnapshotText)
        }
      })
    }

    if (changed) {
      console.debug('[wallet-drift-debug] snapshot', {
        ...walletDebugSnapshot,
        first: firstWalletSnapshotRef.current,
        previous,
        at: new Date().toISOString(),
      })
      previousWalletSnapshotRef.current = {
        ownerAddress: walletDebugSnapshot.ownerAddress,
        chainId: walletDebugSnapshot.chainId,
        connectorId: walletDebugSnapshot.connectorId,
        walletAddress: walletDebugSnapshot.walletStateAddress,
        knownVaultAddress: walletDebugSnapshot.knownVaultAddress,
        walletSource: walletDebugSnapshot.walletSource,
      }
    }
  }, [walletDebugSnapshot, walletDriftDebugEnabled])

  const vaultRuntime = useVaultRuntime(activeVaultAddress, ownerAddress)
  const queueState = useVaultQueue(activeVaultAddress, activeVaultAddress ? vaultRuntime.evaluateTransferIntent : null)
  const hasEnabledProtection = vaultRuntime.addOnStates.some((addon) => addon.enabled)

  const switchToBase = switchChain
    ? () => {
        switchChain({ chainId: BASE_CHAIN_ID })
      }
    : null

  const activeLineTitle = vaultRuntime.securityLine ? vaultRuntime.securityLine.title : baseLineName(walletState.basePackId)
  const activeLineId = vaultRuntime.securityLine?.id ?? null

  const enabledAddonTitles = useMemo(
    () =>
      vaultRuntime.addOnStates
        .filter((addon) => addon.enabled)
        .map((addon) =>
          packTitleFromSlug({
            packId: addon.definition.packId,
            slug: addon.pack?.slug ?? null,
            fallbackTitle: addon.definition.title,
          }),
        ),
    [vaultRuntime.addOnStates],
  )

  const protectionRules = useMemo<ProtectionRuleView[]>(() => {
    const addonTitleByPackId = new Map<number, string>()
    for (const addon of vaultRuntime.addOnStates) {
      addonTitleByPackId.set(
        addon.definition.packId,
        packTitleFromSlug({
          packId: addon.definition.packId,
          slug: addon.pack?.slug ?? null,
          fallbackTitle: addon.definition.title,
        }),
      )
    }

    const grouped = new Map<string, {
      key: string
      label: string
      contextLabel: ProtectionRuleView['contextLabel']
      tooltipLines: Set<string>
    }>()
    const linePolicyIndexByPack = new Map<number, number>()

    for (const policy of vaultRuntime.activePolicies) {
      const key = `${policy.source}:${policy.packId}:${policySemanticKey(policy)}`
      const linePolicyIndex = policy.source === 'line'
        ? (linePolicyIndexByPack.get(policy.packId) ?? 0)
        : 0

      if (policy.source === 'line') {
        linePolicyIndexByPack.set(policy.packId, linePolicyIndex + 1)
      }

      const sourceContextLine = policy.source === 'line'
        ? `Included in Base Protection: ${activeLineTitle}.`
        : `Enabled as Add-on: ${addonTitleByPackId.get(policy.packId) ?? `Pack ${policy.packId}`}.`

      const compactTooltip = resolveActivePolicyTooltipLines({
        lineId: activeLineId,
        source: policy.source,
        basePolicyIndex: linePolicyIndex,
        policyKind: policy.details.kind,
        chainTooltipLines: policyCompactTooltipLines(policy.view),
      })

      const tooltipLines = [
        ...compactTooltip,
        sourceContextLine,
      ]

      const existing = grouped.get(key)
      if (existing) {
        for (const line of tooltipLines) {
          existing.tooltipLines.add(line)
        }
        continue
      }

      grouped.set(key, {
        key,
        label: normalizeActivePolicyLabel({
          lineId: activeLineId,
          source: policy.source,
          basePolicyIndex: linePolicyIndex,
          chainLabel: policy.view.metadata.displayName,
          kind: policy.details.kind,
          policyName: policy.details.policyName,
        }),
        contextLabel: ruleContextLabel(policy.source),
        tooltipLines: new Set(tooltipLines),
      })
    }

    const rules = Array.from(grouped.values()).map((rule) => ({
      key: rule.key,
      label: rule.label,
      contextLabel: rule.contextLabel,
      tooltipLines: Array.from(rule.tooltipLines),
    }))

    if (rules.length > 0) {
      return rules
    }

    if (activeLineId) {
      return createFallbackActiveProtectionRules({
        lineId: activeLineId,
        lineTitle: activeLineTitle,
      })
    }

    return []
  }, [activeLineId, activeLineTitle, vaultRuntime.activePolicies, vaultRuntime.addOnStates])

  const hasActiveProtectionRule = protectionRules.length > 0
  useTraceTransitions(useMemo(() => [
    {
      key: 'walletState.walletAddress',
      value: walletState.walletAddress,
      trigger: 'wallet_runtime_update',
      source: 'src/App.tsx::App/useTraceTransitions',
    },
    {
      key: 'walletState.source',
      value: walletState.source,
      trigger: 'wallet_runtime_update',
      source: 'src/App.tsx::App/useTraceTransitions',
    },
    {
      key: 'walletState.hasInitialDetectionCompleted',
      value: walletState.hasInitialDetectionCompleted,
      trigger: 'wallet_runtime_update',
      source: 'src/App.tsx::App/useTraceTransitions',
    },
    {
      key: 'isInitialVaultDetectionUnresolved',
      value: isInitialVaultDetectionUnresolved,
      trigger: 'wallet_detection_lifecycle',
      source: 'src/App.tsx::App/useTraceTransitions',
    },
    {
      key: 'isVaultDetectionRefreshInProgress',
      value: isVaultDetectionRefreshInProgress,
      trigger: 'wallet_detection_lifecycle',
      source: 'src/App.tsx::App/useTraceTransitions',
    },
    {
      key: 'isInitialDetectionTimedOut',
      value: isInitialDetectionTimedOut,
      trigger: 'wallet_detection_lifecycle',
      source: 'src/App.tsx::App/useTraceTransitions',
    },
    {
      key: 'isWaitingForInitialDetection',
      value: isWaitingForInitialDetection,
      trigger: 'wallet_detection_lifecycle',
      source: 'src/App.tsx::App/useTraceTransitions',
    },
    {
      key: 'effectiveVaultConfirmedExists',
      value: effectiveVaultConfirmedExists,
      trigger: 'wallet_runtime_update',
      source: 'src/App.tsx::App/useTraceTransitions',
    },
    {
      key: 'hasSelectedVault',
      value: hasSelectedVault,
      trigger: 'vault_ui_unlock_check',
      source: 'src/App.tsx::App/useTraceTransitions',
    },
    {
      key: 'createModalVisible',
      value: createModalVisible,
      trigger: 'modal_visibility_guard_update',
      source: 'src/App.tsx::App/useTraceTransitions',
    },
    {
      key: 'isAwaitingVaultConfirmation',
      value: isAwaitingVaultConfirmation,
      trigger: 'create_progress_derived',
      source: 'src/App.tsx::App/useTraceTransitions',
    },
    {
      key: 'vaultReadyUiUnlocked',
      value: vaultReadyUiUnlocked,
      trigger: 'vault_ui_unlock_check',
      source: 'src/App.tsx::App/useTraceTransitions',
    },
    {
      key: 'hasEnabledProtection',
      value: hasEnabledProtection,
      trigger: 'vault_runtime_protection_update',
      source: 'src/App.tsx::App/useTraceTransitions',
    },
    {
      key: 'hasActiveProtectionRule',
      value: hasActiveProtectionRule,
      trigger: 'active_protections_rendering',
      source: 'src/App.tsx::App/useTraceTransitions',
    },
  ], [
    createModalVisible,
    effectiveVaultConfirmedExists,
    hasActiveProtectionRule,
    hasEnabledProtection,
    hasSelectedVault,
    isAwaitingVaultConfirmation,
    isInitialDetectionTimedOut,
    isInitialVaultDetectionUnresolved,
    isWaitingForInitialDetection,
    isVaultDetectionRefreshInProgress,
    vaultReadyUiUnlocked,
    walletState.hasInitialDetectionCompleted,
    walletState.source,
    walletState.walletAddress,
  ]))

  useEffect(() => {
    if (!vaultConfirmedExists || !blockAutoAdoptDetectedVault) {
      return
    }

    logCreateFlowDebug('handler_run', {
      handler: 'vault_detection_auto_adopt_blocked',
      trigger: 'create_modal_open_without_submit',
      source: 'src/App.tsx::App/useEffect[vault_detection_auto_adopt_blocked]',
      walletAddress: walletState.walletAddress,
      walletSource: walletState.source,
    })
  }, [blockAutoAdoptDetectedVault, vaultConfirmedExists, walletState.source, walletState.walletAddress])

  useEffect(() => {
    logCreateFlowDebug('handler_run', {
      handler: 'owner_changed_reset',
      trigger: 'normalized_owner_change',
      source: 'src/App.tsx::App/useEffect[normalizedOwner]',
      normalizedOwner,
    })

    queueMicrotask(() => {
      setTimedOutDetectionOwner(null)
      updateCreateModalOpen(false, 'owner_changed_reset')
      updateCreateSessionAutoAdoptBlocked(false, 'owner_changed_reset')
      updateShowImportPanel(false, 'owner_changed_reset')
      updateSelectedProfileDraft('vault-safe', 'owner_changed_reset')
      updateSelectedAddOnsDraft([], 'owner_changed_reset')
      updateCreateIntentStarted(false, 'owner_changed_reset')
      updateTxRequestStarted(false, 'owner_changed_reset')
      updateTxHashReceived(null, 'owner_changed_reset')
      updateAwaitingConfirmation(false, 'owner_changed_reset')
    })
  }, [
    normalizedOwner,
    updateAwaitingConfirmation,
    updateCreateIntentStarted,
    updateCreateSessionAutoAdoptBlocked,
    updateCreateModalOpen,
    updateSelectedAddOnsDraft,
    updateSelectedProfileDraft,
    updateShowImportPanel,
    updateTxHashReceived,
    updateTxRequestStarted,
  ])

  useEffect(() => {
    if (!effectiveVaultConfirmedExists) {
      return
    }

    logCreateFlowDebug('handler_run', {
      handler: 'vault_detection_complete',
      trigger: 'effectiveVaultConfirmedExists_true',
      source: 'src/App.tsx::App/useEffect[effectiveVaultConfirmedExists]',
      createFlowSubmissionEvidence,
      createModalOpen,
      txHashReceived,
      awaitingConfirmation,
      walletSource: walletState.source,
      walletAddress: walletState.walletAddress,
    })

    if (!createFlowSubmissionEvidence) {
      return
    }

    queueMicrotask(() => {
      updateCreateIntentStarted(false, 'vault_detection_complete')
      updateTxRequestStarted(false, 'vault_detection_complete')
      updateTxHashReceived(null, 'vault_detection_complete')
      updateAwaitingConfirmation(false, 'vault_detection_complete')
      updateSelectedProfileDraft('vault-safe', 'vault_detection_complete')
      updateSelectedAddOnsDraft([], 'vault_detection_complete')
      updateCreateModalOpen(false, 'vault_detection_complete')
    })
  }, [
    awaitingConfirmation,
    createModalOpen,
    createFlowSubmissionEvidence,
    effectiveVaultConfirmedExists,
    txHashReceived,
    updateAwaitingConfirmation,
    updateCreateIntentStarted,
    updateCreateModalOpen,
    updateSelectedAddOnsDraft,
    updateSelectedProfileDraft,
    updateTxHashReceived,
    updateTxRequestStarted,
    walletState.source,
    walletState.walletAddress,
  ])

  const handleCloseCreateModal = useCallback((options?: { preserveSubmissionState?: boolean }) => {
    closeCreateModal({
      preserveSubmissionState: options?.preserveSubmissionState,
      trigger: 'modal_close',
    })
  }, [closeCreateModal])

  const handleCreateFlowFailed = useCallback(() => {
    markCreateFlowFailed('create_flow_failed')
  }, [markCreateFlowFailed])

  const connectDisabled = isWalletConnected || prioritizedConnectors.length === 0 || isConnectPending

  const handleConnect = useCallback(async () => {
    setConnectError(null)

    if (prioritizedConnectors.length === 0) {
      setConnectError('No injected wallet was detected. Unlock/install MetaMask or Rabby and retry.')
      return
    }

    let sawProviderNotFound = false
    for (const connector of prioritizedConnectors) {
      try {
        const provider = await connector.getProvider()
        if (!provider) {
          sawProviderNotFound = true
          continue
        }

        await connectAsync({ connector })
        return
      } catch (error) {
        if (isProviderNotFoundError(error)) {
          sawProviderNotFound = true
          continue
        }

        setConnectError(normalizeConnectErrorMessage(error))
        return
      }
    }

    if (sawProviderNotFound) {
      setConnectError('Provider not found in this tab. Allow wallet extension on this site and reload.')
      return
    }

    setConnectError('Wallet connection failed. Reload page and retry.')
  }, [connectAsync, prioritizedConnectors])

  useEffect(() => {
    if (isWalletConnected) {
      queueMicrotask(() => {
        setConnectError(null)
      })
    }
  }, [isWalletConnected])

  const handleDisconnectVault = useCallback(() => {
    if (!ownerAddress) {
      return
    }

    logCreateFlowDebug('handler_run', {
      handler: 'disconnect_vault',
      trigger: 'disconnect_vault_click',
      source: 'src/App.tsx::App/handleDisconnectVault',
      ownerAddress,
      previousWalletSource: walletState.source,
      previousWalletAddress: walletState.walletAddress,
    })

    updateManualWalletByOwner(null, 'disconnect_vault_click')
    updateVaultDisconnectedByOwner(ownerAddress, 'disconnect_vault_click')
    updateCreateSessionAutoAdoptBlocked(false, 'disconnect_vault_click')
    updateCreateModalOpen(false, 'disconnect_vault_click')
    updateShowImportPanel(false, 'disconnect_vault_click')
    updateCreateIntentStarted(false, 'disconnect_vault_click')
    updateTxRequestStarted(false, 'disconnect_vault_click')
    updateTxHashReceived(null, 'disconnect_vault_click')
    updateAwaitingConfirmation(false, 'disconnect_vault_click')
    setIsProtectionModalOpen(false)
    setIsQueueModalOpen(false)
    setIsReceiveModalOpen(false)
    setIsSendModalOpen(false)
  }, [
    ownerAddress,
    setIsProtectionModalOpen,
    setIsQueueModalOpen,
    setIsReceiveModalOpen,
    setIsSendModalOpen,
    updateAwaitingConfirmation,
    updateCreateIntentStarted,
    updateCreateModalOpen,
    updateCreateSessionAutoAdoptBlocked,
    updateManualWalletByOwner,
    updateShowImportPanel,
    updateTxHashReceived,
    updateTxRequestStarted,
    updateVaultDisconnectedByOwner,
    walletState.source,
    walletState.walletAddress,
  ])

  const handleDisconnectWallet = useCallback(() => {
    if (ownerAddress) {
      handleDisconnectVault()
    }
    disconnect()
  }, [disconnect, handleDisconnectVault, ownerAddress])

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="topbar-brand">Firewall Vault</div>
        <div className="topbar-actions">
          {isWalletConnected && ownerAddress ? (
            <>
              <span className="topbar-item">
                <span className="topbar-item-label">Wallet:</span>{' '}
                {shortAddress(ownerAddress)} · {ownerBalanceCompactEth ?? (ownerBalance.isLoading ? 'Loading...' : 'N/A')} ETH
              </span>
              {knownVaultAddress ? (
                <span className="topbar-item">
                  <span className="topbar-item-label">Vault:</span>{' '}
                  {shortAddress(knownVaultAddress)} · {vaultBalanceCompactEth ?? (vaultBalance.isLoading ? 'Loading...' : 'N/A')} ETH
                </span>
              ) : null}
              <span className={`network-pill ${isBaseReady ? 'is-ready' : 'is-wrong'}`}>
                {isBaseReady ? 'Base' : `Wrong (${chainId ?? 'N/A'})`}
              </span>
              {!isBaseReady && switchToBase ? (
                <Button type="button" variant="primary" disabled={isSwitchPending} onClick={switchToBase}>
                  {isSwitchPending ? 'Switching...' : 'Switch to Base'}
                </Button>
              ) : null}
              {hasSelectedVault ? (
                <Button type="button" onClick={handleDisconnectVault}>
                  Disconnect Vault
                </Button>
              ) : null}
              <Button
                type="button"
                onClick={handleDisconnectWallet}
              >
                Disconnect Wallet
              </Button>
              {walletDriftDebugEnabled ? (
                <details className="topbar-debug">
                  <summary>Wallet trace</summary>
                  <div className="topbar-debug-grid">
                    <p><strong>ownerAddress</strong> {formatWalletDebugValue(walletDebugSnapshot.ownerAddress)}</p>
                    <p><strong>ownerBalanceEth</strong> {formatWalletDebugValue(walletDebugSnapshot.ownerBalanceEth)}</p>
                    <p><strong>chainId</strong> {formatWalletDebugValue(walletDebugSnapshot.chainId)}</p>
                    <p><strong>isBaseReady</strong> {formatWalletDebugValue(walletDebugSnapshot.isBaseReady)}</p>
                    <p><strong>connectorId</strong> {formatWalletDebugValue(walletDebugSnapshot.connectorId)}</p>
                    <p><strong>connectorName</strong> {formatWalletDebugValue(walletDebugSnapshot.connectorName)}</p>
                    <p><strong>connectorType</strong> {formatWalletDebugValue(walletDebugSnapshot.connectorType)}</p>
                    <p><strong>manualWalletAddress</strong> {formatWalletDebugValue(walletDebugSnapshot.manualWalletAddress)}</p>
                    <p><strong>manualWalletBasePackId</strong> {formatWalletDebugValue(walletDebugSnapshot.manualWalletBasePackId)}</p>
                    <p><strong>walletStateAddress</strong> {formatWalletDebugValue(walletDebugSnapshot.walletStateAddress)}</p>
                    <p><strong>walletStateBasePackId</strong> {formatWalletDebugValue(walletDebugSnapshot.walletStateBasePackId)}</p>
                    <p><strong>walletSource</strong> {formatWalletDebugValue(walletDebugSnapshot.walletSource)}</p>
                    <p><strong>knownVaultAddress</strong> {formatWalletDebugValue(walletDebugSnapshot.knownVaultAddress)}</p>
                    <p><strong>activeVaultAddress</strong> {formatWalletDebugValue(walletDebugSnapshot.activeVaultAddress)}</p>
                    <p><strong>hasSelectedVault</strong> {formatWalletDebugValue(walletDebugSnapshot.hasSelectedVault)}</p>
                    <p><strong>effectiveVaultConfirmedExists</strong> {formatWalletDebugValue(walletDebugSnapshot.effectiveVaultConfirmedExists)}</p>
                    <p><strong>blockAutoAdoptDetectedVault</strong> {formatWalletDebugValue(walletDebugSnapshot.blockAutoAdoptDetectedVault)}</p>
                    <p><strong>vaultDisconnectedByOwner</strong> {formatWalletDebugValue(walletDebugSnapshot.vaultDisconnectedByOwner)}</p>
                    <p><strong>hasInitialDetectionCompleted</strong> {formatWalletDebugValue(walletDebugSnapshot.hasInitialDetectionCompleted)}</p>
                    <p><strong>isLoading</strong> {formatWalletDebugValue(walletDebugSnapshot.isLoading)}</p>
                    <p><strong>walletRecordAddress</strong> {formatWalletDebugValue(walletDebugSnapshot.walletRecordAddress)}</p>
                    <p><strong>walletRecordBasePackId</strong> {formatWalletDebugValue(walletDebugSnapshot.walletRecordBasePackId)}</p>
                    <p><strong>walletRecordBlockNumber</strong> {formatWalletDebugValue(walletDebugSnapshot.walletRecordBlockNumber)}</p>
                    <p><strong>walletRecordTransactionHash</strong> {formatWalletDebugValue(walletDebugSnapshot.walletRecordTransactionHash)}</p>
                    <p><strong>walletError</strong> {formatWalletDebugValue(walletDebugSnapshot.walletError)}</p>
                    <p><strong>connectError</strong> {formatWalletDebugValue(walletDebugSnapshot.connectError)}</p>
                    <p><strong>vaultBalanceEth</strong> {formatWalletDebugValue(walletDebugSnapshot.vaultBalanceEth)}</p>
                    <p><strong>firstSnapshot</strong> {formatWalletDebugValue(walletDebugFirstSnapshotText)}</p>
                    <p><strong>previousSnapshot</strong> {formatWalletDebugValue(walletDebugPreviousSnapshotText)}</p>
                  </div>
                </details>
              ) : null}
            </>
          ) : (
            <Button type="button" variant="primary" disabled={connectDisabled} onClick={handleConnect}>
              {isConnectPending ? 'Connecting...' : 'Connect Wallet'}
            </Button>
          )}
        </div>
      </header>

      <div className="layout-3-col">
        <aside className="sidebar sidebar-left">
          <NewsArea />
        </aside>

        <section className="main-column">
          {!isWalletConnected ? (
            <>
              <header className="hero">
                <div className="hero-copy">
                  <h1>Create a protected Vault for your Base assets</h1>
                  <p className="hero-subtitle">Connect your wallet, choose a protection mode, and approve one setup transaction to start using a guarded Vault.</p>
                  <ul className="compact-list compact-list-tight muted">
                    <li>Non-custodial</li>
                    <li>Deterministic on-chain enforcement</li>
                    <li>Base Mainnet only</li>
                  </ul>
                  <p className="muted">Your wallet is for access and signatures. Your Vault holds funds and enforces protection rules.</p>
                </div>
              </header>

              <section className="layout-two-col">
                <section className="card">
                  <header className="card-header">
                    <h2>How It Works</h2>
                  </header>
                  <div className="card-body compact-stack">
                    <p>1. Create or import a Vault.</p>
                    <p className="muted">2. Send and receive through the Vault.</p>
                    <p className="muted">3. Every action is checked by on-chain protection rules.</p>
                    <p>4. Safe actions proceed. Risky actions are delayed or blocked.</p>
                  </div>
                </section>

                <section className="card">
                  <header className="card-header">
                    <h2>Examples</h2>
                  </header>
                  <div className="card-body compact-rows">
                    <div className="compact-row">
                      <span>Risky approval</span>
                      <strong className="status-error">BLOCKED OR DELAYED</strong>
                    </div>
                    <div className="compact-row">
                      <span>Large transfer</span>
                      <strong className="status-warning">DELAYED</strong>
                    </div>
                    <div className="compact-row">
                      <span>Normal DeFi action</span>
                      <strong className="status-ok">ALLOWED</strong>
                    </div>
                  </div>
                </section>
              </section>

              <GetStartedArea
                isConnected={isWalletConnected}
                isBaseReady={isBaseReady}
                hasSelectedVault={hasSelectedVault}
                onConnect={handleConnect}
                connectDisabled={connectDisabled}
                connectPending={isConnectPending}
                connectError={connectError}
                onSwitchToBase={switchToBase}
                switchPending={isSwitchPending}
              />
            </>
          ) : null}

          {isWalletConnected && !hasSelectedVault ? (
            <section className="stack-lg">
              {!isBaseReady ? (
                <section className="card">
                  <header className="card-header">
                    <h2>No Vault selected</h2>
                  </header>
                  <div className="card-body compact-stack">
                    <p>Switch to Base Mainnet to create or import a Vault.</p>
                  </div>
                </section>
              ) : null}

              {ownerAddress && isBaseReady && isWaitingForInitialDetection ? (
                <section className="card">
                  <header className="card-header">
                    <h2>Checking latest Vault</h2>
                  </header>
                  <div className="card-body compact-stack">
                    <p className="muted">
                      We are checking Base for the latest Vault linked to this wallet before showing create and import actions.
                    </p>
                    <p className="muted">
                      If this takes more than about 10 seconds, you can still continue manually.
                    </p>
                  </div>
                </section>
              ) : null}

              {ownerAddress
              && isBaseReady
              && !isWaitingForInitialDetection
              ? (
                <div className="stack-lg">
                  <section className="card">
                    <header className="card-header">
                      <h2>Create or Import Vault</h2>
                    </header>
                    <div className="card-body compact-stack">
                      <p className="muted">
                        {isAwaitingVaultConfirmation
                          ? 'Vault creation was submitted. Finalizing your Vault now.'
                          : 'Create a new Vault for this wallet or import one you already use.'}
                      </p>
                      {isInitialDetectionTimedOut ? (
                        <p className="status-warning">
                          Vault lookup timed out. You can still create or import now while background sync continues.
                        </p>
                      ) : null}
                      {isVaultDetectionRefreshInProgress && !isAwaitingVaultConfirmation && !isInitialDetectionTimedOut ? (
                        <p className="muted">Checking account status in the background.</p>
                      ) : null}
                      {isAwaitingVaultConfirmation ? (
                        <p className="status-ok">
                          Vault controls will unlock automatically as soon as setup is complete.
                        </p>
                      ) : null}
                      {txHashReceived ? (
                        <p className="muted">
                          Last create tx:{' '}
                          <a href={txUrl(txHashReceived)} target="_blank" rel="noreferrer">
                            {shortHash(txHashReceived)}
                          </a>{' '}
                          <CopyButton value={txHashReceived} />
                        </p>
                      ) : null}
                      <div className="row">
                        <Button
                          type="button"
                          variant="primary"
                          disabled={isAwaitingVaultConfirmation}
                          onClick={() => {
                            logCreateFlowDebug('handler_run', {
                              handler: 'open_create_modal',
                              trigger: 'create_button_click',
                              source: 'src/App.tsx::App',
                              isInitialVaultDetectionUnresolved,
                              hasInitialDetectionCompleted: walletState.hasInitialDetectionCompleted,
                            })
                            updateCreateSessionAutoAdoptBlocked(true, 'create_button_click')
                            updateCreateModalOpen(true, 'create_button_click')
                          }}
                        >
                          Create New Vault
                        </Button>
                        <Button
                          type="button"
                          disabled={isAwaitingVaultConfirmation}
                          onClick={() => {
                            const nextValue = !showImportPanel
                            logCreateFlowDebug('handler_run', {
                              handler: 'toggle_import_panel',
                              trigger: 'import_button_click',
                              source: 'src/App.tsx::App',
                              previous: showImportPanel,
                              next: nextValue,
                              isInitialVaultDetectionUnresolved,
                              hasInitialDetectionCompleted: walletState.hasInitialDetectionCompleted,
                            })
                            updateShowImportPanel(nextValue, 'import_button_click')
                          }}
                        >
                          {showImportPanel ? 'Hide Import' : 'Import Existing Vault'}
                        </Button>
                      </div>
                      {!isAwaitingVaultConfirmation ? (
                        <p className="muted">Creating a Vault sends one setup transaction on Base.</p>
                      ) : null}
                    </div>
                  </section>
                  {showImportPanel ? (
                    <ImportVaultCard
                      ownerAddress={ownerAddress}
                      isBaseReady={isBaseReady}
                      onImported={({ walletAddress, basePackId }) => {
                        handleCreateFlowFailed()
                        updateCreateSessionAutoAdoptBlocked(false, 'import_success')
                        updateVaultDisconnectedByOwner(null, 'import_success')
                        updateSelectedProfileDraft('vault-safe', 'import_success')
                        updateSelectedAddOnsDraft([], 'import_success')
                        updateManualWalletByOwner({
                          ownerAddress,
                          walletAddress,
                          basePackId,
                        }, 'import_success')
                        updateShowImportPanel(false, 'import_success')
                      }}
                    />
                  ) : null}
                  {walletState.error ? (
                    <details className="advanced-block">
                      <summary>Need help updating status?</summary>
                      <div className="compact-stack">
                        <p className="muted">
                          We could not refresh your account status right now. You can still create or import a Vault manually.
                        </p>
                        <div className="row">
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={walletState.isLoading}
                            onClick={() => {
                              logCreateFlowDebug('handler_run', {
                                handler: 'manual_wallet_detection_refresh',
                                trigger: 'refresh_detection_click',
                                source: 'src/App.tsx::App/advanced_status_help',
                              })
                              walletState.refresh()
                            }}
                          >
                            {walletState.isLoading ? 'Checking...' : 'Check again'}
                          </Button>
                        </div>
                      </div>
                    </details>
                  ) : null}
                </div>
              ) : null}
            </section>
          ) : null}

          {isWalletConnected && hasSelectedVault && ownerAddress && activeVaultAddress ? (
            <section className="stack-lg">
              <VaultOverview
                walletAddress={activeVaultAddress}
                chainId={chainId}
                vaultBalanceEth={vaultBalance.balanceEth}
                isBalanceLoading={vaultBalance.isLoading}
                lineTitle={activeLineTitle}
                rules={protectionRules}
                isProtectionLoading={vaultRuntime.isLoading}
                protectionError={vaultRuntime.error ? normalizeVaultStateError(vaultRuntime.error) : null}
                onDisconnectVault={handleDisconnectVault}
                onManageProtection={() => {
                  setIsProtectionModalOpen(true)
                  vaultRuntime.refresh()
                }}
              />

              <section id="vault-queue" className="card">
                <header className="card-header row-between">
                  <h2>Queue</h2>
                  <Button type="button" variant="primary" onClick={() => setIsQueueModalOpen(true)}>
                    Open Queue
                  </Button>
                </header>
                <div className="card-body compact-stack">
                  {queueState.summary.pendingCount === 0 ? <p>No delayed actions right now.</p> : null}
                  {queueState.summary.pendingCount > 0 ? (
                    <p>
                      <strong>Delayed actions:</strong> {queueState.summary.pendingCount}
                    </p>
                  ) : null}
                  {queueState.summary.pendingCount > 0 ? (
                    <p>
                      <strong>Ready to execute now:</strong>{' '}
                      {queueState.items.filter((item) => item.ready).length}
                    </p>
                  ) : null}
                  {queueState.summary.nextUnlock ? <p>Next unlock: {formatDateTime(queueState.summary.nextUnlock)}</p> : null}
                  {queueState.isLoading ? <p className="muted">Loading summary...</p> : null}
                  {queueState.error ? <p className="status-warning">{normalizeQueueLoadError(queueState.error)}</p> : null}
                  <p className="muted">Delayed actions stay in queue until their unlock time, then you or automation can execute them.</p>
                </div>
              </section>

              <section className="card">
                <header className="card-header">
                  <h2>Actions</h2>
                </header>
                <div className="card-body compact-stack">
                  <p className="muted">Choose whether to move funds into the Vault or out of it.</p>
                  <p className="muted">
                    Vault balance:{' '}
                    {vaultBalance.isLoading
                      ? 'loading...'
                      : vaultBalance.balanceEth !== null
                        ? `${vaultBalance.balanceEth} ETH`
                        : 'unavailable'}
                  </p>
                  <div className="row action-entrypoints">
                    <Button type="button" onClick={() => setIsReceiveModalOpen(true)}>
                      Receive to Vault
                    </Button>
                    <Button type="button" variant="primary" onClick={() => setIsSendModalOpen(true)}>
                      Send from Vault
                    </Button>
                  </div>
                </div>
              </section>
            </section>
          ) : null}
        </section>

        <aside className="sidebar sidebar-right">
          <TrustArea />
        </aside>
      </div>

      {ownerAddress ? (
        <CreateVaultModal
          isOpen={createModalVisible}
          ownerAddress={ownerAddress}
          isBaseReady={isBaseReady}
          selectedProfileDraft={selectedProfileDraft}
          selectedAddOnsDraft={selectedAddOnsDraft}
          createIntentStarted={createIntentStarted}
          txRequestStarted={txRequestStarted}
          txHashReceived={txHashReceived}
          awaitingConfirmation={awaitingConfirmation}
          onProfileDraftChange={(lineId) => {
            updateSelectedProfileDraft(lineId, 'profile_select')
          }}
          onCreateIntentStarted={() => {
            updateCreateIntentStarted(true, 'create_submit')
          }}
          onTxRequestStarted={() => {
            updateTxRequestStarted(true, 'tx_request_start')
          }}
          onTxHashReceived={(hash) => {
            logCreateFlowDebug('handler_run', {
              handler: 'on_tx_hash_callback',
              trigger: 'create_tx_hash_received',
              source: 'src/App.tsx::App',
              txHash: hash,
            })
            updateTxHashReceived(hash, 'tx_hash_callback')
          }}
          onAwaitingConfirmationChange={(value) => {
            updateAwaitingConfirmation(value, value ? 'awaiting_confirmation_start' : 'awaiting_confirmation_end')
            if (!value) {
              updateTxRequestStarted(false, 'awaiting_confirmation_end')
            }
          }}
          onCreateFlowFailed={handleCreateFlowFailed}
          onClose={() => handleCloseCreateModal()}
          onCreated={({ walletAddress, basePackId, txHash }) => {
            logCreateFlowDebug('handler_run', {
              handler: 'create_confirmed',
              trigger: 'tx_receipt_success',
              source: 'src/App.tsx::App/onCreated',
              walletAddress,
              basePackId,
              txHash,
            })
            updateManualWalletByOwner({
              ownerAddress,
              walletAddress,
              basePackId,
            }, 'create_confirmed_from_receipt')
            updateCreateSessionAutoAdoptBlocked(false, 'create_confirmed')
            updateVaultDisconnectedByOwner(null, 'create_confirmed')
            updateCreateIntentStarted(false, 'create_confirmed')
            updateTxRequestStarted(false, 'create_confirmed')
            updateTxHashReceived(txHash, 'create_confirmed')
            updateAwaitingConfirmation(false, 'create_confirmed')
            updateShowImportPanel(false, 'create_confirmed')
            updateSelectedProfileDraft('vault-safe', 'create_confirmed')
            updateSelectedAddOnsDraft([], 'create_confirmed')
            walletState.refresh()
            handleCloseCreateModal({ preserveSubmissionState: true })
          }}
        />
      ) : null}

      {activeVaultAddress ? (
        <>
          <QueueDetailsModal
            isOpen={isQueueModalOpen && isWalletConnected && hasSelectedVault}
            onClose={() => setIsQueueModalOpen(false)}
            walletAddress={activeVaultAddress}
            items={queueState.items}
            isLoading={queueState.isLoading}
            error={queueState.error ? normalizeQueueLoadError(queueState.error) : null}
            onRefresh={queueState.refresh}
            onChanged={() => {
              queueState.refresh()
              vaultRuntime.refresh()
            }}
          />

          <ReceiveVaultModal
            isOpen={isReceiveModalOpen && isWalletConnected && hasSelectedVault}
            onClose={() => setIsReceiveModalOpen(false)}
            walletAddress={activeVaultAddress}
          />

          <SendVaultModal
            isOpen={isSendModalOpen && isWalletConnected && hasSelectedVault}
            onClose={() => setIsSendModalOpen(false)}
            walletAddress={activeVaultAddress}
            balanceEth={vaultBalance.balanceEth}
            isBalanceLoading={vaultBalance.isLoading}
            evaluateTransferIntent={vaultRuntime.evaluateTransferIntent}
            onQueueChanged={queueState.refresh}
          />
        </>
      ) : null}

      <ProtectionManagementModal
        isOpen={isProtectionModalOpen && isWalletConnected && hasSelectedVault}
        onClose={() => setIsProtectionModalOpen(false)}
        routerAddress={vaultRuntime.routerAddress}
        lineTitle={activeLineTitle}
        enabledAddonTitles={enabledAddonTitles}
        rules={protectionRules}
        addOns={vaultRuntime.addOnStates}
        onChanged={() => {
          vaultRuntime.refresh()
          queueState.refresh()
        }}
        disabled={!isBaseReady}
      />
    </main>
  )
}

export default App

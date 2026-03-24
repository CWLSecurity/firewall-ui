import './App.css'
import { useCallback, useEffect, useMemo, useState } from 'react'
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
import type { ProtectionRuleView } from './modules/app-shell/types'
import { useAppShellState } from './modules/app-shell/useAppShellState'
import { useGlobalSiteStatus } from './modules/app-shell/useGlobalSiteStatus'
import { useTraceTransitions } from './modules/app-shell/useTraceTransitions'
import { logCreateFlowDebug } from './modules/debug/createFlowDebug'
import { packTitleFromSlug, policyCompactTooltipLines } from './modules/vault/model'
import { useVaultQueue } from './modules/vault/useVaultQueue'
import { useVaultRuntime } from './modules/vault/useVaultRuntime'
import { useEthBalance } from './modules/wallet/useEthBalance'
import { useFirewallWalletState } from './modules/wallet/useFirewallWalletState'
import { Button } from './ui/Button'

type DetectedVaultChoice = 'undecided' | 'existing' | 'new'

function App() {
  const { address, isConnected: isProviderConnected, chainId } = useAccount()
  const { connect, connectors, isPending: isConnectPending } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain, isPending: isSwitchPending } = useSwitchChain()
  const [acceptedWalletAddress, setAcceptedWalletAddress] = useState<Address | null>(null)
  const [detectedVaultChoice, setDetectedVaultChoice] = useState<DetectedVaultChoice>('undecided')

  const rawWalletAddress = isProviderConnected && address ? address : null
  const hasAcceptedWallet = Boolean(
    rawWalletAddress
    && acceptedWalletAddress
    && rawWalletAddress.toLowerCase() === acceptedWalletAddress.toLowerCase(),
  )
  const ownerAddress = hasAcceptedWallet ? rawWalletAddress : null
  const isWalletConnected = Boolean(ownerAddress)
  const isWalletAwaitingUserConfirmation = Boolean(rawWalletAddress && !hasAcceptedWallet)
  const isBaseReady = isWalletConnected && chainId === BASE_CHAIN_ID
  const normalizedOwner = ownerAddress?.toLowerCase() ?? null
  const injectedConnector = connectors.find((connector) => connector.id === 'injected') ?? connectors[0]

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

  useEffect(() => {
    if (!rawWalletAddress) {
      if (acceptedWalletAddress !== null) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setAcceptedWalletAddress(null)
      }
      return
    }

    if (
      acceptedWalletAddress
      && acceptedWalletAddress.toLowerCase() !== rawWalletAddress.toLowerCase()
    ) {
      setAcceptedWalletAddress(null)
    }
  }, [acceptedWalletAddress, rawWalletAddress])

  useEffect(() => {
    if (!ownerAddress) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDetectedVaultChoice('undecided')
      return
    }

    setDetectedVaultChoice('undecided')
  }, [ownerAddress])

  const walletState = useFirewallWalletState({
    ownerAddress,
    isBaseReady,
    manualWallet,
    lookbackBlocks: FACTORY_LOG_LOOKBACK_BLOCKS,
  })

  const detectedChainVaultAddress = walletState.source === 'chain' ? walletState.walletAddress : null
  const shouldGateDetectedVaultUntilChoice = Boolean(
    ownerAddress
    && detectedChainVaultAddress
    && detectedVaultChoice !== 'existing',
  )
  const effectiveCreateSessionAutoAdoptBlocked =
    createSessionAutoAdoptBlocked || shouldGateDetectedVaultUntilChoice

  const globalStatus = useGlobalSiteStatus({
    isConnected: isWalletConnected,
    isBaseReady,
    ownerAddress,
    vaultDisconnectedByOwner,
    manualWallet,
    walletState,
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
  const isDetectedVaultChoicePromptVisible = Boolean(
    isWalletConnected
    && isBaseReady
    && detectedChainVaultAddress
    && detectedVaultChoice === 'undecided'
    && !isInitialVaultDetectionUnresolved,
  )

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
    isInitialVaultDetectionUnresolved,
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

  const connectDisabled = isWalletConnected || isWalletAwaitingUserConfirmation || !injectedConnector || isConnectPending

  const handleConnect = () => {
    if (!injectedConnector) {
      return
    }
    connect({ connector: injectedConnector, chainId: BASE_CHAIN_ID })
  }

  const handleAcceptWalletSession = useCallback(() => {
    if (!rawWalletAddress) {
      return
    }
    setAcceptedWalletAddress(rawWalletAddress)
  }, [rawWalletAddress])

  const handleChooseAnotherWallet = useCallback(() => {
    setAcceptedWalletAddress(null)
    disconnect()
  }, [disconnect])

  const handleUseDetectedVault = useCallback(() => {
    if (!ownerAddress || !detectedChainVaultAddress) {
      return
    }

    setDetectedVaultChoice('existing')
    updateVaultDisconnectedByOwner(null, 'detected_vault_accept_existing')
    updateCreateSessionAutoAdoptBlocked(false, 'detected_vault_accept_existing')
    updateShowImportPanel(false, 'detected_vault_accept_existing')
  }, [
    detectedChainVaultAddress,
    ownerAddress,
    updateCreateSessionAutoAdoptBlocked,
    updateShowImportPanel,
    updateVaultDisconnectedByOwner,
  ])

  const handleCreateNewVaultInstead = useCallback(() => {
    setDetectedVaultChoice('new')
    updateCreateSessionAutoAdoptBlocked(true, 'detected_vault_choose_new')
    updateShowImportPanel(false, 'detected_vault_choose_new')
  }, [updateCreateSessionAutoAdoptBlocked, updateShowImportPanel])

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
    setAcceptedWalletAddress(null)
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
                <span className="topbar-item-label">Wallet:</span> {shortAddress(ownerAddress)}
              </span>
              {knownVaultAddress ? (
                <span className="topbar-item">
                  <span className="topbar-item-label">Vault:</span> {shortAddress(knownVaultAddress)}
                </span>
              ) : null}
              <span className="topbar-item">
                <span className="topbar-item-label">Balance:</span>{' '}
                {ownerBalanceCompactEth ?? (ownerBalance.isLoading ? 'Loading...' : 'N/A')} ETH
              </span>
              <span className={`network-pill ${isBaseReady ? 'is-ready' : 'is-wrong'}`}>
                {isBaseReady ? 'Base' : `Wrong (${chainId ?? 'N/A'})`}
              </span>
              {activeVaultAddress ? (
                <span className="topbar-item">
                  <span className="topbar-item-label">Vault bal:</span>{' '}
                  {vaultBalance.balanceEth ?? (vaultBalance.isLoading ? 'Loading...' : 'N/A')} ETH
                </span>
              ) : null}
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
            </>
          ) : isWalletAwaitingUserConfirmation && rawWalletAddress ? (
            <>
              <span className="topbar-item">
                <span className="topbar-item-label">Wallet session:</span> {shortAddress(rawWalletAddress)}
              </span>
              <Button type="button" onClick={handleChooseAnotherWallet}>
                Choose another wallet
              </Button>
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
          {!isWalletConnected && isWalletAwaitingUserConfirmation && rawWalletAddress ? (
            <section className="stack-lg">
              <section className="card">
                <header className="card-header">
                  <h2>Confirm Wallet Session</h2>
                </header>
                <div className="card-body compact-stack">
                  <p>Earlier you used this wallet in this browser session.</p>
                  <p>
                    Active wallet: <strong>{shortAddress(rawWalletAddress)}</strong>
                  </p>
                  <p className="muted">Do you want to continue with this wallet?</p>
                  <div className="row">
                    <Button type="button" variant="primary" onClick={handleAcceptWalletSession}>
                      Continue
                    </Button>
                    <Button type="button" onClick={handleChooseAnotherWallet}>
                      Choose another wallet
                    </Button>
                  </div>
                </div>
              </section>
            </section>
          ) : null}

          {!isWalletConnected && !isWalletAwaitingUserConfirmation ? (
            <>
              <header className="hero">
                <div className="hero-copy">
                  <h1>Firewall Vault</h1>
                  <p className="hero-subtitle">Non-custodial transaction firewall for EVM wallets</p>
                  <p className="muted">Blocks or delays risky wallet actions on-chain.</p>
                  <p className="muted">No custody. No private key storage. Open-source and verifiable.</p>
                </div>
              </header>

              <GetStartedArea
                isConnected={isWalletConnected}
                isBaseReady={isBaseReady}
                hasSelectedVault={hasSelectedVault}
                onConnect={handleConnect}
                connectDisabled={connectDisabled}
                connectPending={isConnectPending}
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

              {isDetectedVaultChoicePromptVisible && detectedChainVaultAddress ? (
                <section className="card">
                  <header className="card-header">
                    <h2>Use Existing Vault?</h2>
                  </header>
                  <div className="card-body compact-stack">
                    <p>We found a Vault previously created for this wallet:</p>
                    <p>
                      <strong>{shortAddress(detectedChainVaultAddress)}</strong>
                    </p>
                    <p className="muted">Do you want to continue with this Vault?</p>
                    <div className="row">
                      <Button type="button" variant="primary" onClick={handleUseDetectedVault}>
                        Continue with this Vault
                      </Button>
                      <Button type="button" onClick={handleCreateNewVaultInstead}>
                        Create new Vault
                      </Button>
                    </div>
                  </div>
                </section>
              ) : null}

              {ownerAddress
              && isBaseReady
              && (!detectedChainVaultAddress || detectedVaultChoice === 'new') ? (
                <div className="stack-lg">
                  <section className="card">
                    <header className="card-header">
                      <h2>Create or Import Vault</h2>
                    </header>
                    <div className="card-body compact-stack">
                      {detectedChainVaultAddress && detectedVaultChoice === 'new' ? (
                        <p className="muted">
                          Existing Vault was skipped for this session. Wallet remains connected, you can create a new Vault.
                        </p>
                      ) : null}
                      <p className="muted">
                        {isAwaitingVaultConfirmation
                          ? 'Vault creation was submitted. Finalizing your Vault now.'
                          : 'Choose one action to continue.'}
                      </p>
                      {isVaultDetectionRefreshInProgress && !isAwaitingVaultConfirmation ? (
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
                          Create Vault
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
                          We could not refresh your account status right now. You can still create or import a Vault.
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
                onManageProtection={() => setIsProtectionModalOpen(true)}
              />

              <section id="vault-queue" className="card">
                <header className="card-header row-between">
                  <h2>Queue</h2>
                  <Button type="button" variant="primary" onClick={() => setIsQueueModalOpen(true)}>
                    Open Queue
                  </Button>
                </header>
                <div className="card-body compact-stack">
                  {queueState.summary.pendingCount === 0 ? <p>No delayed transactions.</p> : null}
                  {queueState.summary.pendingCount > 0 ? (
                    <p>
                      <strong>Delayed transactions:</strong> {queueState.summary.pendingCount}
                    </p>
                  ) : null}
                  {queueState.summary.pendingCount > 0 ? (
                    <p>
                      <strong>Ready to execute:</strong>{' '}
                      {queueState.items.filter((item) => item.ready).length}
                    </p>
                  ) : null}
                  {queueState.summary.nextUnlock ? <p>Next unlock: {formatDateTime(queueState.summary.nextUnlock)}</p> : null}
                  {queueState.isLoading ? <p className="muted">Loading summary...</p> : null}
                  {queueState.error ? <p className="status-warning">{normalizeQueueLoadError(queueState.error)}</p> : null}
                </div>
              </section>

              <section className="card">
                <header className="card-header">
                  <h2>Actions</h2>
                </header>
                <div className="card-body compact-stack">
                  <p className="muted">Open a focused flow for receiving or sending assets.</p>
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
                      Receive
                    </Button>
                    <Button type="button" variant="primary" onClick={() => setIsSendModalOpen(true)}>
                      Send
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

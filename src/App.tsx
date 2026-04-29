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
import {
  shouldClearInitialDetectionTimeout,
  shouldWaitForInitialVaultDetection,
  toStatusWalletState,
} from './modules/app-shell/initialDetection'
import type { ProtectionRuleView } from './modules/app-shell/types'
import { useAppShellState } from './modules/app-shell/useAppShellState'
import { useGlobalSiteStatus } from './modules/app-shell/useGlobalSiteStatus'
import { packTitleFromSlug, policyCompactTooltipLines } from './modules/vault/model'
import { useVaultQueue } from './modules/vault/useVaultQueue'
import { useVaultRuntime } from './modules/vault/useVaultRuntime'
import { isProviderNotFoundError, orderConnectorsByProviderPriority } from './modules/wallet/connectors'
import { useEthBalance } from './modules/wallet/useEthBalance'
import { useFirewallWalletState } from './modules/wallet/useFirewallWalletState'
import { Button } from './ui/Button'

const INITIAL_VAULT_DETECTION_TIMEOUT_MS = 10_000

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

function App() {
  const { address, isConnected: isProviderConnected, chainId } = useAccount()
  const { connectAsync, connectors, isPending: isConnectPending } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain, isPending: isSwitchPending } = useSwitchChain()
  const [timedOutDetectionOwner, setTimedOutDetectionOwner] = useState<string | null>(null)
  const [connectError, setConnectError] = useState<string | null>(null)

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
    createFlowSubmissionEvidence,
    effectiveVaultConfirmedExists,
    isAwaitingVaultConfirmation,
    isVaultDetectionRefreshInProgress,
    activeVaultAddress,
    knownVaultAddress,
    hasSelectedVault,
    createModalVisible,
  } = globalStatus

  const ownerBalance = useEthBalance(ownerAddress)
  const vaultBalance = useEthBalance(activeVaultAddress)
  const ownerBalanceCompactEth = formatCompactEth(ownerBalance.balanceEth)
  const vaultBalanceCompactEth = formatCompactEth(vaultBalance.balanceEth)

  const vaultRuntime = useVaultRuntime(activeVaultAddress, ownerAddress)
  const queueState = useVaultQueue(activeVaultAddress, activeVaultAddress ? vaultRuntime.evaluateTransferIntent : null)

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

  useEffect(() => {
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
    createFlowSubmissionEvidence,
    effectiveVaultConfirmedExists,
    updateAwaitingConfirmation,
    updateCreateIntentStarted,
    updateCreateModalOpen,
    updateSelectedAddOnsDraft,
    updateSelectedProfileDraft,
    updateTxHashReceived,
    updateTxRequestStarted,
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
                            onClick={() => walletState.refresh()}
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

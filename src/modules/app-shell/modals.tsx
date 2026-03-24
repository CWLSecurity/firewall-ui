import { useEffect, useMemo, useRef, useState } from 'react'
import { formatEther, parseEther, parseEventLogs, type Address, type Hash } from 'viem'
import { useAccount, usePublicClient, useSendTransaction, useWriteContract } from 'wagmi'
import { CopyButton } from '../../components/CopyButton'
import { BASE_CHAIN_ID, FACTORY_ADDRESS } from '../../contracts/addresses/base'
import { extractCreatedWalletFromReceipt, factoryConfig } from '../../contracts/factory'
import { readPolicyRuntimeDetails } from '../../contracts/policies'
import { getPolicyRouterConfig } from '../../contracts/policyRouter'
import { readPackById } from '../../contracts/registry'
import { verifyImportedFirewallWallet } from '../../contracts/walletVerification'
import { addressUrl, shortAddress, shortHash, txUrl } from '../../lib/explorer/base'
import { getFirewallModuleConfig } from '../../lib/contracts/firewallModule'
import { isHexAddress } from '../../lib/validation/address'
import { logCreateFlowDebug } from '../debug/createFlowDebug'
import {
  buildMetaMaskReceiveLink,
  buildReceiveRequestUri,
  describeQueueReadiness,
  validateReceiveAmountInput,
  validateReceiveWithEstimatedFee,
  validateReceiveTransferInput,
  validateSendInput,
} from './actionsQueue'
import {
  buildPolicyView,
  formatDelay,
  packAccessLabel,
  packTitleFromSlug,
  policyCompactTooltipLines,
  packTooltipLines,
  SECURITY_LINES,
} from '../vault/model'
import type { AddonState } from '../vault/useVaultRuntime'
import type { QueueItemView } from '../vault/useVaultQueue'
import { useEthBalance } from '../wallet/useEthBalance'
import { Button } from '../../ui/Button'
import { InfoTooltip } from '../../ui/InfoTooltip'
import {
  classifyImportFailure,
  createIncludedProtectionRows,
  createLineBehaviorNotes,
  createLineAudience,
  formatDateTime,
  isExpectedRouterDecision,
  POLICY_CATALOG_URL,
  normalizeIncludedPolicyLabel,
  resolveIncludedPolicyTooltipLines,
  normalizeCreateError,
  normalizeEnableAddonError,
  normalizeQueueActionError,
  normalizeSendError,
  formatCompactEth,
} from './helpers'
import type {
  CreateFlowCompletion,
  CreateLineId,
  ImportValidationState,
  ProtectionRuleView,
  SendOutcome,
} from './types'

function inferResultFromReceipt(params: {
  walletAddress: Address
  logs: readonly { address: Address; topics: readonly Hash[]; data: `0x${string}` }[]
}): 'sent_immediately' | 'delayed' | 'unknown' {
  const moduleLogs = params.logs.filter(
    (log) => log.address.toLowerCase() === params.walletAddress.toLowerCase(),
  )

  if (moduleLogs.length === 0) {
    return 'unknown'
  }

  const scheduledLogs = parseEventLogs({
    abi: getFirewallModuleConfig(params.walletAddress).abi,
    eventName: 'Scheduled',
    logs: moduleLogs as never[],
    strict: false,
  })

  if (scheduledLogs.length > 0) {
    return 'delayed'
  }

  const executedNow = parseEventLogs({
    abi: getFirewallModuleConfig(params.walletAddress).abi,
    eventName: 'ExecutedNow',
    logs: moduleLogs as never[],
    strict: false,
  })

  if (executedNow.length > 0) {
    return 'sent_immediately'
  }

  return 'unknown'
}

function normalizeReceiveTransferError(receiveError: unknown): string {
  const raw =
    receiveError instanceof Error
      ? receiveError.message
      : typeof receiveError === 'string'
        ? receiveError
        : 'Transfer failed.'
  const message = raw.trim()
  const normalized = message.toLowerCase()

  if (
    normalized.includes('user rejected')
    || normalized.includes('user denied')
    || normalized.includes('rejected the request')
  ) {
    return 'Transaction was rejected in wallet.'
  }

  if (normalized.includes('insufficient funds')) {
    return 'Insufficient signer balance for amount and network fee.'
  }

  if (normalized.includes('chain')) {
    return 'Wrong network selected. Switch wallet to Base Mainnet.'
  }

  return message.length > 0 ? message : 'Transfer failed.'
}

const NATIVE_TRANSFER_GAS_LIMIT = 21_000n

type CreateVaultModalProps = {
  isOpen: boolean
  ownerAddress: Address
  isBaseReady: boolean
  selectedProfileDraft: CreateLineId
  selectedAddOnsDraft: number[]
  createIntentStarted: boolean
  txRequestStarted: boolean
  txHashReceived: Hash | null
  awaitingConfirmation: boolean
  onProfileDraftChange: (lineId: CreateLineId) => void
  onCreateIntentStarted: () => void
  onTxRequestStarted: () => void
  onTxHashReceived: (hash: Hash) => void
  onAwaitingConfirmationChange: (value: boolean) => void
  onCreateFlowFailed: () => void
  onCreated: (params: CreateFlowCompletion) => void
  onClose: () => void
}

export function CreateVaultModal({
  isOpen,
  ownerAddress,
  isBaseReady,
  selectedProfileDraft,
  selectedAddOnsDraft,
  createIntentStarted,
  txRequestStarted,
  txHashReceived,
  awaitingConfirmation,
  onProfileDraftChange,
  onCreateIntentStarted,
  onTxRequestStarted,
  onTxHashReceived,
  onAwaitingConfirmationChange,
  onCreateFlowFailed,
  onCreated,
  onClose,
}: CreateVaultModalProps) {
  const publicClient = usePublicClient()
  const { writeContractAsync } = useWriteContract()

  const [recoveryAddress, setRecoveryAddress] = useState<string>(ownerAddress)
  const [error, setError] = useState<string | null>(null)
  const [includedRows, setIncludedRows] = useState<Array<{
    key: string
    label: string
    tooltipLines: string[]
  }>>([])
  const [isIncludedLoading, setIsIncludedLoading] = useState(false)

  const selectedLine = SECURITY_LINES.find((line) => line.id === selectedProfileDraft) ?? SECURITY_LINES[0]
  const lineBehaviorNotes = createLineBehaviorNotes(selectedProfileDraft)
  const lineBehaviorTitle = selectedProfileDraft === 'vault-safe'
    ? 'How Safe works'
    : 'How DeFi works'

  const createDisabled = !isBaseReady || !publicClient || txRequestStarted || awaitingConfirmation
  const closeDisabled = txRequestStarted || awaitingConfirmation
  const prevCreateDisabledRef = useRef(createDisabled)
  const prevCloseDisabledRef = useRef(closeDisabled)
  const createStatus = useMemo(() => {
    if (awaitingConfirmation) {
      return 'Waiting for confirmation...'
    }

    if (txRequestStarted) {
      return 'One transaction: confirm in your wallet...'
    }

    if (txHashReceived) {
      return 'Transaction confirmed. Finalizing Vault setup...'
    }

    if (createIntentStarted) {
      return 'Ready to request wallet confirmation.'
    }

    return 'Ready to create.'
  }, [awaitingConfirmation, createIntentStarted, txHashReceived, txRequestStarted])

  useEffect(() => {
    if (isOpen) {
      logCreateFlowDebug('create_modal_opened', {
        source: 'src/modules/app-shell/modals.tsx::CreateVaultModal/useEffect[isOpen]',
        ownerAddress,
        selectedProfileDraft,
        selectedAddOnsDraft,
        createIntentStarted,
        txRequestStarted,
        txHashReceived,
        awaitingConfirmation,
      })
      logCreateFlowDebug('handler_run', {
        handler: 'on_add_on_toggle',
        source: 'src/modules/app-shell/modals.tsx::CreateVaultModal',
        note: 'No add-on toggle handler in active modal implementation.',
      })
      return
    }

    setRecoveryAddress(ownerAddress)
    setError(null)
    setIncludedRows([])
    setIsIncludedLoading(false)
  }, [
    awaitingConfirmation,
    createIntentStarted,
    isOpen,
    ownerAddress,
    selectedAddOnsDraft,
    selectedProfileDraft,
    txHashReceived,
    txRequestStarted,
  ])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    let cancelled = false

    // Clear previous line policies immediately to avoid showing stale entries
    // while the next line policies are loading.
    setIncludedRows([])
    setIsIncludedLoading(true)

    async function loadIncludedFromChain() {
      if (!isBaseReady || !publicClient) {
        setIncludedRows(createIncludedProtectionRows(selectedProfileDraft))
        setIsIncludedLoading(false)
        return
      }

      try {
        const basePack = await readPackById({
          publicClient,
          packId: selectedLine.basePackId,
        })

        if (!basePack || basePack.packType !== 'base') {
          throw new Error('Base pack metadata is unavailable.')
        }

        const rows: Array<{ key: string; label: string; tooltipLines: string[] }> = []
        for (let index = 0; index < basePack.policies.length; index += 1) {
          const policyAddress = basePack.policies[index]
          const details = await readPolicyRuntimeDetails({
            publicClient,
            policyAddress,
          })

          const view = buildPolicyView(policyAddress, details, {
            sourceContext: 'base',
          })

          rows.push({
            key: `included-${basePack.id}-${index}-${policyAddress.toLowerCase()}`,
            label: normalizeIncludedPolicyLabel({
              lineId: selectedProfileDraft,
              index,
              chainLabel: view.metadata.displayName,
            }),
            tooltipLines: resolveIncludedPolicyTooltipLines({
              lineId: selectedProfileDraft,
              index,
              policyKind: details.kind,
              chainTooltipLines: policyCompactTooltipLines(view),
            }),
          })
        }

        if (!cancelled) {
          setIncludedRows(rows)
        }
      } catch {
        if (!cancelled) {
          setIncludedRows(createIncludedProtectionRows(selectedProfileDraft))
        }
      } finally {
        if (!cancelled) {
          setIsIncludedLoading(false)
        }
      }
    }

    void loadIncludedFromChain()

    return () => {
      cancelled = true
    }
  }, [isBaseReady, isOpen, publicClient, selectedLine.basePackId, selectedProfileDraft])

  useEffect(() => {
    const previous = prevCreateDisabledRef.current
    if (previous === createDisabled) {
      return
    }

    logCreateFlowDebug('state_transition', {
      key: 'createDisabled',
      previous,
      next: createDisabled,
      trigger: 'derived_flags_update',
      source: 'src/modules/app-shell/modals.tsx::CreateVaultModal',
    })
    prevCreateDisabledRef.current = createDisabled
  }, [createDisabled])

  useEffect(() => {
    const previous = prevCloseDisabledRef.current
    if (previous === closeDisabled) {
      return
    }

    logCreateFlowDebug('state_transition', {
      key: 'closeDisabled',
      previous,
      next: closeDisabled,
      trigger: 'derived_flags_update',
      source: 'src/modules/app-shell/modals.tsx::CreateVaultModal',
    })
    prevCloseDisabledRef.current = closeDisabled
  }, [closeDisabled])

  if (!isOpen) {
    return null
  }

  const requestClose = (trigger: string) => {
    logCreateFlowDebug('handler_run', {
      handler: 'on_modal_close',
      trigger,
      source: 'src/modules/app-shell/modals.tsx::CreateVaultModal/requestClose',
      closeDisabled,
    })
    onClose()
  }

  async function handleCreate() {
    logCreateFlowDebug('handler_run', {
      handler: 'on_create_submit',
      trigger: 'create_button_click',
      source: 'src/modules/app-shell/modals.tsx::CreateVaultModal/handleCreate',
      selectedProfileDraft,
      selectedAddOnsDraft,
      ownerAddress,
    })
    setError(null)

    if (!isHexAddress(recoveryAddress)) {
      logCreateFlowDebug('create_submit_blocked', {
        reason: 'invalid_recovery_address',
        source: 'src/modules/app-shell/modals.tsx::CreateVaultModal/handleCreate',
        recoveryAddress,
      })
      setError('Recovery address is invalid.')
      return
    }

    if (!publicClient) {
      logCreateFlowDebug('create_submit_blocked', {
        reason: 'public_client_not_ready',
        source: 'src/modules/app-shell/modals.tsx::CreateVaultModal/handleCreate',
      })
      setError('Wallet connection is not ready. Please retry.')
      return
    }

    if (!isBaseReady) {
      logCreateFlowDebug('create_submit_blocked', {
        reason: 'wrong_network',
        source: 'src/modules/app-shell/modals.tsx::CreateVaultModal/handleCreate',
      })
      setError('Switch to Base Mainnet first.')
      return
    }

    onCreateIntentStarted()

    let txHash: Hash | null = null

    try {
      onTxRequestStarted()
      const hash = await writeContractAsync({
        ...factoryConfig,
        chainId: BASE_CHAIN_ID,
        functionName: 'createWallet',
        args: [ownerAddress, recoveryAddress as Address, BigInt(selectedLine.basePackId)],
      })
      txHash = hash as Hash
      logCreateFlowDebug('handler_run', {
        handler: 'on_tx_hash_callback',
        trigger: 'write_contract_hash_resolved',
        source: 'src/modules/app-shell/modals.tsx::CreateVaultModal/handleCreate',
        txHash,
      })
      onTxHashReceived(txHash)

      onAwaitingConfirmationChange(true)
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') {
        throw new Error('Transaction reverted.')
      }

      const receiptLogs = receipt.logs.map((log) => ({
        address: log.address,
        topics: log.topics,
        data: log.data,
      }))

      const factoryLogs = receiptLogs.filter(
        (log) => log.address.toLowerCase() === FACTORY_ADDRESS.toLowerCase(),
      )

      const parsedFactoryLogs = parseEventLogs({
        abi: factoryConfig.abi,
        eventName: 'WalletCreated',
        logs: factoryLogs as unknown as never[],
        strict: false,
      }) as Array<{ args?: Record<string, unknown> }>

      let walletAddress: Address | null = null
      for (const parsedLog of parsedFactoryLogs) {
        const ownerFromLog = parsedLog.args?.owner
        const walletFromLog = parsedLog.args?.wallet
        if (
          typeof ownerFromLog === 'string'
          && ownerFromLog.toLowerCase() === ownerAddress.toLowerCase()
          && typeof walletFromLog === 'string'
          && /^0x[a-fA-F0-9]{40}$/.test(walletFromLog)
        ) {
          walletAddress = walletFromLog as Address
          break
        }
      }

      if (!walletAddress) {
        walletAddress = extractCreatedWalletFromReceipt({ logs: receiptLogs })
      }

      logCreateFlowDebug('handler_run', {
        handler: 'created_wallet_address_resolved',
        trigger: 'tx_receipt_success',
        source: 'src/modules/app-shell/modals.tsx::CreateVaultModal/handleCreate',
        ownerAddress,
        walletAddress,
      })

      let verifiedBasePackId: number | null = null
      try {
        const createdWalletVerification = await verifyImportedFirewallWallet({
          publicClient,
          ownerAddress,
          walletAddress,
        })
        if (createdWalletVerification.ok) {
          verifiedBasePackId = createdWalletVerification.basePackId
        } else {
          logCreateFlowDebug('handler_run', {
            handler: 'created_wallet_verification_non_blocking',
            trigger: 'post_receipt_validation_warning',
            source: 'src/modules/app-shell/modals.tsx::CreateVaultModal/handleCreate',
            ownerAddress,
            walletAddress,
            reason: createdWalletVerification.reason,
          })
        }
      } catch (verificationError) {
        logCreateFlowDebug('handler_run', {
          handler: 'created_wallet_verification_non_blocking',
          trigger: 'post_receipt_validation_error',
          source: 'src/modules/app-shell/modals.tsx::CreateVaultModal/handleCreate',
          ownerAddress,
          walletAddress,
          error: verificationError instanceof Error ? verificationError.message : String(verificationError),
        })
      }

      onAwaitingConfirmationChange(false)
      onCreated({
        walletAddress,
        basePackId: verifiedBasePackId ?? selectedLine.basePackId,
        txHash: txHash as Hash,
      })
    } catch (createError) {
      onAwaitingConfirmationChange(false)
      onCreateFlowFailed()
      logCreateFlowDebug('create_submit_failed', {
        source: 'src/modules/app-shell/modals.tsx::CreateVaultModal/handleCreate',
        error: createError instanceof Error ? createError.message : String(createError),
      })
      setError(normalizeCreateError(createError))
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={() => {
        if (!closeDisabled) {
          requestClose('backdrop_click')
        }
      }}
    >
      <section
        className="modal-card modal-card-tight"
        role="dialog"
        aria-modal="true"
        aria-label="Create vault"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <h2>Create Vault</h2>
          <Button
            type="button"
            variant="ghost"
            onClick={() => requestClose('close_button')}
            disabled={closeDisabled}
          >
            Close
          </Button>
        </header>

        <div className="create-modal-grid">
          <div className="create-modal-column create-modal-column-line">
            <div className="modal-section modal-section-compact">
              <h3>Protection line</h3>
              <fieldset className="choice-fieldset choice-fieldset-compact">
                {SECURITY_LINES.map((line) => (
                  <label
                    key={line.id}
                    className={`choice-option choice-option-compact ${selectedProfileDraft === line.id ? 'is-selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="security-line"
                      checked={selectedProfileDraft === line.id}
                      onChange={() => {
                        logCreateFlowDebug('handler_run', {
                          handler: 'on_profile_select',
                          trigger: 'line_radio_change',
                          source: 'src/modules/app-shell/modals.tsx::CreateVaultModal',
                          previousLine: selectedProfileDraft,
                          nextLine: line.id,
                        })
                        onProfileDraftChange(line.id as CreateLineId)
                      }}
                    />
                    <span className="line-choice-copy">
                      <strong>{line.title}</strong>
                      <span className="muted">{createLineAudience(line.id as CreateLineId)}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
            </div>

            <div className="modal-section modal-section-compact line-behavior-panel">
              <h3>{lineBehaviorTitle}</h3>
              <p className="muted">{lineBehaviorNotes.summary}</p>
              <ul className="compact-list compact-list-tight line-behavior-list">
                {lineBehaviorNotes.bullets.map((line) => (
                  <li key={`line-behavior-${selectedProfileDraft}-${line}`}>{line}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="create-modal-column">
            <div className="modal-section modal-section-compact">
              <h3>Included</h3>
              <p className="muted">Included policies: {includedRows.length}</p>
              {isIncludedLoading ? <p className="muted">Loading policies from chain...</p> : null}
              {selectedAddOnsDraft.length > 0 ? (
                <p className="muted">Draft add-ons selected: {selectedAddOnsDraft.length}</p>
              ) : null}
              <ul className="compact-list compact-list-tight included-policies-list">
                {includedRows.map((row) => (
                  <li key={row.key} className="included-policy-item">
                    <span className="included-policy-label">{row.label}</span>
                    <InfoTooltip label={`${row.label} details`}>
                      <div className="tooltip-stack">
                        {row.tooltipLines.map((line) => (
                          <p key={`${row.key}-${line}`}>{line}</p>
                        ))}
                        <a className="tooltip-link" href={POLICY_CATALOG_URL} target="_blank" rel="noreferrer">
                          Full policy details and metadata
                        </a>
                      </div>
                    </InfoTooltip>
                  </li>
                ))}
                {!isIncludedLoading && includedRows.length === 0 ? (
                  <li className="muted">No policies found for this line.</li>
                ) : null}
              </ul>
            </div>

            <div className="modal-section modal-section-compact">
              <h3>Create</h3>
              <p className="muted">One on-chain transaction.</p>
              <label className="field-label" htmlFor="modal-recovery-address-input">
                Recovery address
              </label>
              <input
                id="modal-recovery-address-input"
                className="text-input"
                type="text"
                value={recoveryAddress}
                onChange={(event) => setRecoveryAddress(event.target.value.trim())}
                placeholder="0x..."
              />
              <div className="row">
                <Button type="button" variant="primary" disabled={createDisabled} onClick={() => void handleCreate()}>
                  {txRequestStarted || awaitingConfirmation ? 'Creating...' : 'Create Protected Vault (1 tx)'}
                </Button>
              </div>
              <p className="muted">{createStatus}</p>
              {error ? <p className="status-error">{error}</p> : null}
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}

type ImportVaultCardProps = {
  ownerAddress: Address
  isBaseReady: boolean
  onImported: (params: { walletAddress: Address; basePackId: number | null }) => void
}

export function ImportVaultCard({ ownerAddress, isBaseReady, onImported }: ImportVaultCardProps) {
  const publicClient = usePublicClient()

  const [vaultAddressInput, setVaultAddressInput] = useState('')
  const [validation, setValidation] = useState<ImportValidationState>({
    kind: 'idle',
    message: 'Enter a Vault address to validate.',
  })

  async function handleImport() {
    if (!isBaseReady) {
      setValidation({
        kind: 'unsupported',
        message: 'Switch to Base Mainnet before importing.',
      })
      return
    }

    if (!isHexAddress(vaultAddressInput)) {
      setValidation({
        kind: 'not_firewall_vault',
        message: 'Enter a valid contract address.',
      })
      return
    }

    if (!publicClient) {
      setValidation({
        kind: 'unsupported',
        message: 'Network connection is not ready right now.',
      })
      return
    }

    try {
      setValidation({ kind: 'checking', message: 'Validating address...' })

      const verification = await verifyImportedFirewallWallet({
        publicClient,
        ownerAddress,
        walletAddress: vaultAddressInput as Address,
      })

      if (!verification.ok) {
        setValidation(classifyImportFailure(verification.reason))
        return
      }

      setValidation({
        kind: 'valid_firewall_vault',
        message: 'Valid Firewall Vault. Selecting it now.',
      })

      onImported({
        walletAddress: vaultAddressInput as Address,
        basePackId: verification.basePackId,
      })
    } catch (importError) {
      const reason = importError instanceof Error ? importError.message : 'Import failed.'
      setValidation(classifyImportFailure(reason))
    }
  }

  const stateClassName =
    validation.kind === 'valid_firewall_vault'
      ? 'status-ok'
      : validation.kind === 'checking' || validation.kind === 'idle'
        ? 'muted'
        : validation.kind === 'unsupported'
          ? 'status-warning'
          : 'status-error'

  return (
    <section className="card">
      <header className="card-header">
        <h2>Import Existing Vault</h2>
      </header>
      <div className="card-body compact-stack">
        <label className="field-label" htmlFor="import-vault-address-input">
          Vault address
        </label>
        <input
          id="import-vault-address-input"
          className="text-input"
          type="text"
          value={vaultAddressInput}
          onChange={(event) => setVaultAddressInput(event.target.value.trim())}
          placeholder="0x..."
        />

        <div className="row">
          <Button type="button" disabled={validation.kind === 'checking'} onClick={() => void handleImport()}>
            {validation.kind === 'checking' ? 'Checking...' : 'Validate & Import'}
          </Button>
        </div>

        <p className={stateClassName}>{validation.message}</p>

        <details className="advanced-block">
          <summary>Validation states</summary>
          <ul className="compact-list muted">
            <li>Valid Firewall Vault</li>
            <li>Not a Firewall Vault</li>
            <li>Unsupported / unreadable</li>
          </ul>
        </details>
      </div>
    </section>
  )
}

type ProtectionManagementModalProps = {
  isOpen: boolean
  onClose: () => void
  routerAddress: Address | null
  lineTitle: string
  enabledAddonTitles: string[]
  rules: ProtectionRuleView[]
  addOns: AddonState[]
  onChanged: () => void
  disabled?: boolean
}

type AddonUiPhase = 'enabled' | 'available' | 'unavailable' | 'pending'

export function ProtectionManagementModal({
  isOpen,
  onClose,
  routerAddress,
  lineTitle,
  enabledAddonTitles,
  rules,
  addOns,
  onChanged,
  disabled = false,
}: ProtectionManagementModalProps) {
  const publicClient = usePublicClient()
  const { writeContractAsync, isPending } = useWriteContract()
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingEnablePackId, setPendingEnablePackId] = useState<number | null>(null)

  useEffect(() => {
    if (!isOpen || !isPending) {
      setPendingEnablePackId(null)
    }
  }, [isOpen, isPending])

  if (!isOpen) {
    return null
  }

  async function handleEnable(packId: number, title: string) {
    setStatus(null)
    setError(null)

    if (!routerAddress || !publicClient) {
      setError('Vault settings are temporarily unavailable.')
      return
    }

    try {
      setPendingEnablePackId(packId)
      setStatus(`Enable ${title} in wallet...`)
      const hash = await writeContractAsync({
        ...getPolicyRouterConfig(routerAddress),
        chainId: BASE_CHAIN_ID,
        functionName: 'enableAddonPack',
        args: [BigInt(packId)],
      })

      setStatus('Waiting for confirmation...')
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') {
        throw new Error('Enable add-on reverted.')
      }

      setStatus(`${title} is now enabled.`)
      onChanged()
    } catch (enableError) {
      setStatus(null)
      setError(normalizeEnableAddonError(enableError))
    } finally {
      setPendingEnablePackId(null)
    }
  }

  function packTitle(addon: AddonState): string {
    return packTitleFromSlug({
      packId: addon.definition.packId,
      slug: addon.pack?.slug ?? null,
      fallbackTitle: addon.definition.title,
    })
  }

  function statusLabel(addon: AddonState): string {
    const phase = addonUiPhase(addon)

    if (phase === 'pending') {
      return 'Pending confirmation'
    }

    if (phase === 'enabled') {
      return 'Enabled'
    }

    if (!routerAddress) {
      return 'Vault settings unavailable'
    }

    if (addon.availabilityReason === 'Enable') {
      return 'Available'
    }

    if (addon.availabilityReason === 'Requires access') {
      return 'Requires access'
    }

    if (addon.availabilityReason === 'Pack is inactive') {
      return 'Unavailable'
    }

    if (addon.availabilityReason === 'Included in current protection line') {
      return 'Already active in this line'
    }

    if (addon.availabilityReason === 'Access status unavailable') {
      return 'Access check unavailable'
    }

    return 'Unavailable'
  }

  function addonTooltipLines(addon: AddonState, status: string): string[] {
    return packTooltipLines({
      accessLabel: packAccessLabel(addon.accessMode),
      statusLabel: status,
      policyViews: addon.policyViews,
      fallbackDescription: addon.definition.shortDescription,
    })
  }

  function actionLabel(addon: AddonState): string {
    const phase = addonUiPhase(addon)
    if (phase === 'pending') return 'Pending...'
    if (phase === 'enabled') return 'Enabled'
    if (!routerAddress) return 'Unavailable'
    if (addon.availabilityReason === 'Requires access') return 'Requires access'
    if (addon.availabilityReason === 'Pack is inactive') return 'Unavailable'
    if (addon.eligibleToEnable) return 'Enable'
    return 'Unavailable'
  }

  function actionDisabled(addon: AddonState): boolean {
    const phase = addonUiPhase(addon)
    if (phase === 'pending' || phase === 'enabled') return true
    if (disabled || isPending || !routerAddress) return true
    if (phase !== 'available') return true
    return false
  }

  function addonUiPhase(addon: AddonState): AddonUiPhase {
    if (isPending && pendingEnablePackId === addon.definition.packId) {
      return 'pending'
    }

    if (addon.enabled) {
      return 'enabled'
    }

    if (routerAddress && addon.availabilityReason === 'Enable') {
      return 'available'
    }

    return 'unavailable'
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="modal-card modal-card-tight manage-protection-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Manage protection"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <h2>Manage Protection</h2>
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </header>

        <div className="modal-section modal-section-compact">
          <h3>Current</h3>
          <div className="compact-rows">
            <div className="compact-row">
              <span className="compact-row-main">
                <strong>Line:</strong> {lineTitle}
              </span>
            </div>
            <div className="compact-row">
              <span className="compact-row-main">
                <strong>Add-ons:</strong> {enabledAddonTitles.length > 0 ? enabledAddonTitles.join(', ') : 'None'}
              </span>
            </div>
          </div>
        </div>

        <div className="modal-section modal-section-compact">
          <h3>Active rules</h3>
          {rules.length === 0 ? <p className="muted">No active rules returned.</p> : null}
          <ul className="compact-list compact-list-tight compact-list-scroll">
            {rules.map((rule) => (
              <li key={`modal-${rule.key}`} className="row-inline">
                <span>{rule.label}</span>
                <InfoTooltip label={`${rule.label} details`}>
                  <div className="tooltip-stack">
                    {rule.tooltipLines.map((line) => (
                      <p key={`modal-${rule.key}-${line}`}>{line}</p>
                    ))}
                    <a className="tooltip-link" href={POLICY_CATALOG_URL} target="_blank" rel="noreferrer">
                      Full policy details and metadata
                    </a>
                  </div>
                </InfoTooltip>{' '}
                <span className="muted">({rule.contextLabel})</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="modal-section modal-section-compact">
          <h3>Add-ons</h3>
          {addOns.length === 0 ? <p className="muted">No add-ons are configured for this release.</p> : null}
          <div className="compact-rows compact-rows-scroll">
            {addOns.map((addon) => {
              const uiReason = statusLabel(addon)
              const buttonLabel = actionLabel(addon)
              const modeLabel = packAccessLabel(addon.accessMode)
              const tooltipLines = addonTooltipLines(addon, uiReason)
              const title = packTitle(addon)

              return (
                <article key={`available-${addon.definition.packId}`} className="compact-row">
                  <span className="compact-row-main">
                    <strong>{title}</strong>{' '}
                    <InfoTooltip label={`${title} details`}>
                      <div className="tooltip-stack">
                        {tooltipLines.map((line, index) => (
                          <p key={`${addon.definition.packId}-${index}`}>{line}</p>
                        ))}
                        <a className="tooltip-link" href={POLICY_CATALOG_URL} target="_blank" rel="noreferrer">
                          Full add-on and policy details
                        </a>
                      </div>
                    </InfoTooltip>
                    <span className="muted">{modeLabel} | {uiReason}</span>
                  </span>
                  <Button
                    type="button"
                    disabled={actionDisabled(addon)}
                    onClick={() => void handleEnable(addon.definition.packId, title)}
                  >
                    {buttonLabel}
                  </Button>
                </article>
              )
            })}
          </div>
        </div>

        <div className="operation-feedback" aria-live="polite" role="status">
          {status ? <p className="status-ok">{status}</p> : <p className="muted">Action updates appear here.</p>}
          {error ? <p className="status-error">{error}</p> : null}
        </div>
      </section>
    </div>
  )
}

type SendFromVaultCardProps = {
  walletAddress: Address
  balanceEth: string | null
  isBalanceLoading: boolean
  evaluateTransferIntent: (params: { to: Address; value: bigint; data?: `0x${string}` }) => Promise<{
    decision: 'allow' | 'delay' | 'revert' | 'unknown'
    delaySeconds: bigint | null
    reasons: string[]
  }>
  onQueueChanged: () => void
  embedded?: boolean
}

function SendFromVaultCard({
  walletAddress,
  balanceEth,
  isBalanceLoading,
  evaluateTransferIntent,
  onQueueChanged,
  embedded = false,
}: SendFromVaultCardProps) {
  const publicClient = usePublicClient()
  const { writeContractAsync, isPending } = useWriteContract()

  const [recipient, setRecipient] = useState('')
  const [amount, setAmount] = useState('')
  const [guidance, setGuidance] = useState<string | null>(null)
  const [preflight, setPreflight] = useState<{
    decision: 'allow' | 'delay' | 'revert' | 'unknown'
    reasons: string[]
    delaySeconds: bigint | null
  } | null>(null)
  const [outcome, setOutcome] = useState<SendOutcome>({
    kind: 'idle',
    title: 'Ready',
    body: 'Enter recipient and amount, then run check and send.',
    txHash: null,
  })

  const availableBalanceWei = useMemo(() => {
    if (!balanceEth) {
      return null
    }

    try {
      return parseEther(balanceEth)
    } catch {
      return null
    }
  }, [balanceEth])

  const availableBalanceLabel = formatCompactEth(balanceEth)

  async function runPreflight(): Promise<{
    to: Address
    valueWei: bigint
    intent: { decision: 'allow' | 'delay' | 'revert' | 'unknown'; reasons: string[]; delaySeconds: bigint | null }
  } | null> {
    const validation = validateSendInput({
      recipient,
      amountEth: amount,
      walletAddress,
      availableBalanceWei,
    })

    if (!validation.ok) {
      setOutcome({
        kind: 'failed',
        title: 'Validation issue',
        body: validation.message,
        txHash: null,
      })
      return null
    }

    const intent = await evaluateTransferIntent({
      to: validation.to,
      value: validation.valueWei,
      data: '0x',
    })

    const decision = isExpectedRouterDecision(intent.decision) ? intent.decision : 'unknown'

    const nextPreflight = {
      decision,
      reasons: intent.reasons,
      delaySeconds: intent.delaySeconds,
    }

    setPreflight(nextPreflight)

    if (decision === 'allow') {
      setGuidance('This transfer should be sent immediately.')
    } else if (decision === 'delay') {
      const estimatedUnlock = intent.delaySeconds !== null
        ? formatDateTime(BigInt(Math.floor(Date.now() / 1000)) + intent.delaySeconds)
        : null
      setGuidance(
        `This transfer will be delayed${intent.delaySeconds !== null ? ` by about ${formatDelay(intent.delaySeconds)}` : ''}${estimatedUnlock ? ` (estimated unlock: ${estimatedUnlock})` : ''}.`,
      )
    } else if (decision === 'revert') {
      setGuidance('This transfer is blocked by current protections.')
    } else {
      setGuidance('Could not classify this transfer. You can still try submitting.')
    }

    return {
      to: validation.to,
      valueWei: validation.valueWei,
      intent: nextPreflight,
    }
  }

  async function handleSubmit() {
    const input = await runPreflight()
    if (!input || !publicClient) {
      return
    }

    if (input.intent.decision === 'revert') {
      setOutcome({
        kind: 'blocked',
        title: 'Blocked',
        body: input.intent.reasons.join(' ') || 'Blocked by active Vault protections.',
        txHash: null,
      })
      return
    }

    const decision = input.intent.decision
    const functionName = decision === 'delay' ? 'schedule' : 'executeNow'

    try {
      setOutcome({
        kind: 'idle',
        title: 'Submitting',
        body: decision === 'delay' ? 'Submitting delayed transfer...' : 'Submitting immediate transfer...',
        txHash: null,
      })

      const hash = await writeContractAsync({
        ...getFirewallModuleConfig(walletAddress),
        chainId: BASE_CHAIN_ID,
        functionName,
        args: [input.to, input.valueWei, '0x'],
      })

      setOutcome({
        kind: 'idle',
        title: 'Pending',
        body: 'Waiting for Base confirmation...',
        txHash: hash,
      })

      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') {
        throw new Error('Transaction reverted.')
      }

      const resultKind = inferResultFromReceipt({
        walletAddress,
        logs: receipt.logs.map((log) => ({
          address: log.address,
          topics: log.topics,
          data: log.data,
        })),
      })

      if (resultKind === 'sent_immediately') {
        setOutcome({
          kind: 'sent_immediately',
          title: 'Sent immediately',
          body: 'This transfer was allowed and sent right away.',
          txHash: hash,
        })
        return
      }

      if (resultKind === 'delayed') {
        setOutcome({
          kind: 'delayed',
          title: 'Delayed',
          body: input.intent.reasons.join(' ') || 'Delayed by active Vault protections.',
          txHash: hash,
        })
        onQueueChanged()
        return
      }

      setOutcome({
        kind: 'failed',
        title: 'Submitted',
        body: 'Submitted successfully, but result type could not be classified.',
        txHash: hash,
      })
    } catch (sendError) {
      const normalized = normalizeSendError(sendError)
      setOutcome({
        kind: normalized.kind,
        title: normalized.kind === 'blocked' ? 'Blocked' : 'Send failed',
        body: normalized.message,
        txHash: null,
      })
    }
  }

  return (
    <section className={embedded ? 'subcard subcard-send' : 'card'}>
      <header className="card-header">
        {embedded ? <h3>Send</h3> : <h2>Send From Vault</h2>}
      </header>
      <div className="card-body compact-stack">
        <p className="muted">Check result first, then send from your Vault.</p>

        <label className="field-label" htmlFor="send-recipient-input">
          Recipient
        </label>
        <input
          id="send-recipient-input"
          className="text-input"
          value={recipient}
          onChange={(event) => setRecipient(event.target.value.trim())}
          placeholder="0x..."
        />

        <label className="field-label" htmlFor="send-amount-input">
          Amount (ETH)
        </label>
        <div className="row">
          <input
            id="send-amount-input"
            className="text-input"
            value={amount}
            onChange={(event) => setAmount(event.target.value.trim())}
            placeholder="0.01"
          />
          <Button
            type="button"
            variant="ghost"
            disabled={isPending || availableBalanceWei === null || availableBalanceWei <= 0n}
            onClick={() => setAmount(balanceEth ?? '')}
          >
            Max
          </Button>
        </div>

        <p className="muted">
          Balance:{' '}
          {isBalanceLoading
            ? 'loading...'
            : availableBalanceLabel !== null
              ? `${availableBalanceLabel} ETH`
              : 'unavailable'}
        </p>

        <div className="row">
          <Button type="button" onClick={() => void runPreflight()} disabled={isPending}>
            Check result
          </Button>
          <Button type="button" variant="primary" onClick={() => void handleSubmit()} disabled={isPending}>
            {isPending ? 'Submitting...' : 'Send'}
          </Button>
        </div>

        {guidance ? <p className="muted">{guidance}</p> : null}
        {preflight?.reasons.length ? (
          <ul className="compact-list muted">
            {preflight.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        ) : null}

        <div className="subcard">
          <p>
            <strong>{outcome.title}</strong>
          </p>
          <p>{outcome.body}</p>
          {outcome.txHash ? (
            <p>
              Tx:{' '}
              <a href={txUrl(outcome.txHash)} target="_blank" rel="noreferrer">
                {shortHash(outcome.txHash)}
              </a>{' '}
              <CopyButton value={outcome.txHash} />
            </p>
          ) : null}
        </div>
      </div>
    </section>
  )
}

type QueueItemCardProps = {
  walletAddress: Address
  item: QueueItemView
  onChanged: () => void
}

function QueueItemCard({ walletAddress, item, onChanged }: QueueItemCardProps) {
  const publicClient = usePublicClient()
  const { writeContractAsync, isPending } = useWriteContract()
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionHash, setActionHash] = useState<Hash | null>(null)
  const queueState = useMemo(
    () =>
      describeQueueReadiness({
        unlockTime: item.unlockTime,
      }),
    [item.unlockTime],
  )

  async function runAction(functionName: 'executeScheduled' | 'cancelScheduled') {
    if (!publicClient) {
      setActionError('Network connection is not ready.')
      return
    }

    setActionError(null)
    setActionHash(null)

    try {
      const hash = await writeContractAsync({
        ...getFirewallModuleConfig(walletAddress),
        chainId: BASE_CHAIN_ID,
        functionName,
        args: [item.txId],
      })

      setActionHash(hash as Hash)
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') {
        throw new Error('Action reverted.')
      }

      onChanged()
    } catch (queueActionError) {
      setActionError(normalizeQueueActionError(queueActionError))
    }
  }

  return (
    <article className="queue-card">
      <p>
        <strong>{shortHash(item.txId)}</strong> <CopyButton value={item.txId} label="Copy id" />
      </p>
      <p>
        Recipient:{' '}
        <a href={addressUrl(item.to)} target="_blank" rel="noreferrer">
          {shortAddress(item.to)}
        </a>{' '}
        <CopyButton value={item.to} />
      </p>
      <p>Asset / amount: ETH {formatEther(item.value)}</p>
      <p>Reason for delay: {item.reason}</p>
      <p>Unlock time: {formatDateTime(item.unlockTime)}</p>
      <p>Status: {queueState.status}</p>
      <div className="row">
        <Button type="button" disabled={!queueState.ready || isPending} onClick={() => void runAction('executeScheduled')}>
          Execute now
        </Button>
        <Button type="button" variant="ghost" disabled={isPending} onClick={() => void runAction('cancelScheduled')}>
          Cancel queued
        </Button>
      </div>
      {actionHash ? (
        <p>
          Action tx:{' '}
          <a href={txUrl(actionHash)} target="_blank" rel="noreferrer">
            {shortHash(actionHash)}
          </a>{' '}
          <CopyButton value={actionHash} />
        </p>
      ) : null}
      {actionError ? <p className="status-error">{actionError}</p> : null}
    </article>
  )
}

type QueueDetailsModalProps = {
  isOpen: boolean
  onClose: () => void
  walletAddress: Address
  items: QueueItemView[]
  isLoading: boolean
  error: string | null
  onRefresh: () => void
  onChanged: () => void
}

export function QueueDetailsModal({
  isOpen,
  onClose,
  walletAddress,
  items,
  isLoading,
  error,
  onRefresh,
  onChanged,
}: QueueDetailsModalProps) {
  if (!isOpen) {
    return null
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label="Queue details"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <h2>Queue Details</h2>
          <div className="row">
            <Button type="button" onClick={onRefresh}>
              Refresh
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>
        </header>

        {isLoading ? <p className="muted">Loading delayed actions...</p> : null}
        {error ? <p className="status-warning">{error}</p> : null}
        {items.length === 0 && !isLoading && !error ? <p>No delayed actions right now.</p> : null}

        {items.length > 0 ? (
          <div className="queue-list-grid">
            {items.map((item) => (
              <QueueItemCard key={item.txId} walletAddress={walletAddress} item={item} onChanged={onChanged} />
            ))}
          </div>
        ) : null}
      </section>
    </div>
  )
}

type ReceiveVaultModalProps = {
  isOpen: boolean
  onClose: () => void
  walletAddress: Address
}

export function ReceiveVaultModal({ isOpen, onClose, walletAddress }: ReceiveVaultModalProps) {
  const { address: signerAddress, isConnected } = useAccount()
  const publicClient = usePublicClient()
  const { sendTransactionAsync, isPending: isSendPending } = useSendTransaction()
  const signerAddressResolved = isConnected && signerAddress ? signerAddress : null
  const signerBalance = useEthBalance(signerAddressResolved)
  const [requestedAmountEth, setRequestedAmountEth] = useState('')
  const [transferStatus, setTransferStatus] = useState<{
    kind: 'idle' | 'pending' | 'success' | 'error'
    message: string
    txHash: Hash | null
  }>({
    kind: 'idle',
    message: 'Set amount and send directly from your connected wallet, or share the request URI.',
    txHash: null,
  })

  useEffect(() => {
    if (!isOpen) {
      setRequestedAmountEth('')
      setTransferStatus({
        kind: 'idle',
        message: 'Set amount and send directly from your connected wallet, or share the request URI.',
        txHash: null,
      })
    }
  }, [isOpen])

  const amountValidation = useMemo(
    () => validateReceiveAmountInput(requestedAmountEth),
    [requestedAmountEth],
  )

  const amountWei = amountValidation.ok ? amountValidation.amountWei : null
  const signerBalanceWei = useMemo(() => {
    if (!signerBalance.balanceEth) {
      return null
    }
    try {
      return parseEther(signerBalance.balanceEth)
    } catch {
      return null
    }
  }, [signerBalance.balanceEth])
  const transferValidation = useMemo(
    () =>
      validateReceiveTransferInput({
        amountEth: requestedAmountEth,
        availableBalanceWei: signerBalanceWei,
      }),
    [requestedAmountEth, signerBalanceWei],
  )
  const isSignerBalanceReady = !signerBalance.isLoading && signerBalanceWei !== null

  const paymentRequest = useMemo(
    () =>
      buildReceiveRequestUri({
        walletAddress,
        amountWei,
        chainId: BASE_CHAIN_ID,
      }),
    [amountWei, walletAddress],
  )

  const metaMaskDeepLink = useMemo(
    () =>
      buildMetaMaskReceiveLink({
        walletAddress,
        amountWei,
        chainId: BASE_CHAIN_ID,
      }),
    [amountWei, walletAddress],
  )

  async function handleSendFromConnectedWallet() {
    if (!transferValidation.ok) {
      setTransferStatus({
        kind: 'error',
        message: transferValidation.message,
        txHash: null,
      })
      return
    }

    if (!publicClient) {
      setTransferStatus({
        kind: 'error',
        message: 'Network connection is not ready.',
        txHash: null,
      })
      return
    }

    if (!isSignerBalanceReady || signerBalanceWei === null) {
      setTransferStatus({
        kind: 'error',
        message: 'Connected wallet balance is still loading. Try again in a moment.',
        txHash: null,
      })
      return
    }

    let estimatedFeeWei: bigint | null = null
    try {
      const fees = await publicClient.estimateFeesPerGas()
      const gasPriceWei = fees.maxFeePerGas ?? fees.gasPrice ?? null
      estimatedFeeWei = gasPriceWei !== null ? gasPriceWei * NATIVE_TRANSFER_GAS_LIMIT : null
    } catch {
      estimatedFeeWei = null
    }

    const feeAffordability = validateReceiveWithEstimatedFee({
      amountWei: transferValidation.amountWei,
      balanceWei: signerBalanceWei,
      estimatedFeeWei,
    })
    if (!feeAffordability.ok) {
      const maxEth = formatCompactEth(formatEther(feeAffordability.maxTransferWei)) ?? formatEther(feeAffordability.maxTransferWei)
      setTransferStatus({
        kind: 'error',
        message: `Amount plus estimated network fee exceeds connected wallet balance. Max amount now: ${maxEth} ETH.`,
        txHash: null,
      })
      return
    }

    try {
      setTransferStatus({
        kind: 'pending',
        message: 'Check wallet and confirm transfer.',
        txHash: null,
      })

      const hash = await sendTransactionAsync({
        chainId: BASE_CHAIN_ID,
        to: walletAddress,
        value: transferValidation.amountWei,
      })

      setTransferStatus({
        kind: 'pending',
        message: 'Transfer submitted. Waiting for Base confirmation...',
        txHash: hash,
      })

      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') {
        throw new Error('Transaction reverted.')
      }

      setTransferStatus({
        kind: 'success',
        message: 'Transfer confirmed. Vault balance will refresh automatically.',
        txHash: hash,
      })
    } catch (receiveError) {
      setTransferStatus({
        kind: 'error',
        message: normalizeReceiveTransferError(receiveError),
        txHash: null,
      })
    }
  }

  if (!isOpen) {
    return null
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="modal-card modal-card-compact receive-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Receive into vault"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <h2>Receive</h2>
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </header>
        <div className="modal-section compact-stack">
          <p>Vault address</p>
          <p>
            <code className="receive-code">{walletAddress}</code>
          </p>
          <div className="row">
            <CopyButton value={walletAddress} label="Copy address" />
            <a href={addressUrl(walletAddress)} target="_blank" rel="noreferrer">
              View on BaseScan
            </a>
          </div>
          <p className="muted">Network: Base Mainnet (chain {BASE_CHAIN_ID}).</p>
        </div>

        <div className="modal-section compact-stack">
          <label className="field-label" htmlFor="receive-amount-input">
            Amount (ETH)
          </label>
          <input
            id="receive-amount-input"
            className="text-input"
            value={requestedAmountEth}
            onChange={(event) => setRequestedAmountEth(event.target.value.trim())}
            placeholder="0.10"
          />
          <p className="muted">Use this amount for direct send from connected wallet.</p>
          {!amountValidation.ok ? <p className="status-warning">{amountValidation.message}</p> : null}
          {amountValidation.ok && !transferValidation.ok && requestedAmountEth.trim().length > 0 ? (
            <p className="status-warning">{transferValidation.message}</p>
          ) : null}
          <p className="muted">
            Connected wallet balance:{' '}
            {signerBalance.isLoading
              ? 'loading...'
              : signerBalance.balanceEth !== null
                ? `${formatCompactEth(signerBalance.balanceEth) ?? signerBalance.balanceEth} ETH`
                : 'unavailable'}
          </p>
          {!isSignerBalanceReady ? <p className="muted">Direct send unlocks after wallet balance is loaded.</p> : null}
          <div className="row">
            <Button
              type="button"
              variant="primary"
              disabled={isSendPending || !isSignerBalanceReady || !transferValidation.ok}
              onClick={() => void handleSendFromConnectedWallet()}
            >
              {isSendPending ? 'Submitting...' : 'Send From Connected Wallet'}
            </Button>
            <a href={metaMaskDeepLink} target="_blank" rel="noreferrer">
              Open in MetaMask (mobile)
            </a>
          </div>
          <div className="operation-feedback" aria-live="polite" role="status">
            {transferStatus.kind === 'success' ? <p className="status-ok">{transferStatus.message}</p> : null}
            {transferStatus.kind === 'error' ? <p className="status-error">{transferStatus.message}</p> : null}
            {transferStatus.kind === 'pending' ? <p className="muted">{transferStatus.message}</p> : null}
            {transferStatus.kind === 'idle' ? <p className="muted">{transferStatus.message}</p> : null}
            {transferStatus.txHash ? (
              <p>
                Tx:{' '}
                <a href={txUrl(transferStatus.txHash)} target="_blank" rel="noreferrer">
                  {shortHash(transferStatus.txHash)}
                </a>{' '}
                <CopyButton value={transferStatus.txHash} />
              </p>
            ) : null}
          </div>
          <details className="advanced-block receive-advanced">
            <summary>Share options</summary>
            <p className="muted">Request URI for compatible wallets:</p>
            <p>
              <code className="receive-code">{paymentRequest}</code>
            </p>
            <div className="row">
              <CopyButton value={paymentRequest} label="Copy request URI" />
              <a href={metaMaskDeepLink} target="_blank" rel="noreferrer">
                Open in MetaMask (mobile)
              </a>
            </div>
          </details>
        </div>
      </section>
    </div>
  )
}

type SendVaultModalProps = {
  isOpen: boolean
  onClose: () => void
  walletAddress: Address
  balanceEth: string | null
  isBalanceLoading: boolean
  evaluateTransferIntent: (params: { to: Address; value: bigint; data?: `0x${string}` }) => Promise<{
    decision: 'allow' | 'delay' | 'revert' | 'unknown'
    delaySeconds: bigint | null
    reasons: string[]
  }>
  onQueueChanged: () => void
}

export function SendVaultModal({
  isOpen,
  onClose,
  walletAddress,
  balanceEth,
  isBalanceLoading,
  evaluateTransferIntent,
  onQueueChanged,
}: SendVaultModalProps) {
  if (!isOpen) {
    return null
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="modal-card"
        role="dialog"
        aria-modal="true"
        aria-label="Send from vault"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <h2>Send</h2>
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </header>
        <SendFromVaultCard
          walletAddress={walletAddress}
          balanceEth={balanceEth}
          isBalanceLoading={isBalanceLoading}
          evaluateTransferIntent={evaluateTransferIntent}
          onQueueChanged={onQueueChanged}
          embedded
        />
      </section>
    </div>
  )
}

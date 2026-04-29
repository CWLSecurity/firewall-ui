import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatEther, parseEther, parseEventLogs, type Address, type Hash } from 'viem'
import { useAccount, usePublicClient, useSendTransaction, useWriteContract } from 'wagmi'
import { CopyButton } from '../../components/CopyButton'
import { BASE_CHAIN_ID, FACTORY_ADDRESS } from '../../contracts/addresses/base'
import { extractCreatedWalletFromReceipt, factoryConfig, findLatestWalletByOwner } from '../../contracts/factory'
import { readPolicyRuntimeDetails } from '../../contracts/policies'
import { getQueueExecutorConfig } from '../../contracts/queueExecutor'
import { getPolicyRouterConfig } from '../../contracts/policyRouter'
import { readPackById } from '../../contracts/registry'
import { verifyImportedFirewallWallet } from '../../contracts/walletVerification'
import { addressUrl, shortAddress, shortHash, txUrl } from '../../lib/explorer/base'
import { getFirewallModuleConfig } from '../../lib/contracts/firewallModule'
import { isHexAddress } from '../../lib/validation/address'
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
import { useVaultBot } from '../vault/useVaultBot'
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
const TRANSIENT_FEEDBACK_TTL_MS = 5000
const CREATE_RECEIPT_TIMEOUT_MS = 120_000
const CREATE_RECEIPT_RECOVERY_DELAYS_MS = [1_200, 2_600, 4_200] as const
const CREATE_WALLET_RESOLUTION_RETRY_DELAYS_MS = [1_000, 2_200, 3_500] as const
const CREATE_WALLET_RESOLUTION_ATTEMPT_TIMEOUT_MS = 4_000
const CREATE_OWNER_PREFLIGHT_TIMEOUT_MS = 2_500
const IMPORT_VALIDATION_TIMEOUT_MS = 45_000
const RECEIVE_IDLE_STATUS = {
  kind: 'idle' as const,
  message: 'Choose an amount to send from the connected wallet, or share a deposit link.',
  txHash: null as Hash | null,
}

function isReceiptWaitTimeoutError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase()
  return message.includes('timed out')
    || message.includes('waitfortransactionreceipt')
    || message.includes('transaction receipt')
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function waitForCreateReceipt(params: {
  publicClient: NonNullable<ReturnType<typeof usePublicClient>>
  hash: Hash
}) {
  try {
    return await params.publicClient.waitForTransactionReceipt({
      hash: params.hash,
      timeout: CREATE_RECEIPT_TIMEOUT_MS,
    })
  } catch (error) {
    if (!isReceiptWaitTimeoutError(error)) {
      throw error
    }

    for (const delayMs of CREATE_RECEIPT_RECOVERY_DELAYS_MS) {
      try {
        return await params.publicClient.getTransactionReceipt({
          hash: params.hash,
        })
      } catch {
        await sleep(delayMs)
      }
    }

    throw error
  }
}

function isRecoverableCreateResolutionError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase()
  return (
    message.includes('timeout')
    || message.includes('transaction receipt')
    || message.includes('waitfortransactionreceipt')
    || message.includes('walletcreated')
    || message.includes('firewallfactory')
    || message.includes('could not resolve')
  )
}

function sameAddress(left: Address, right: Address): boolean {
  return left.toLowerCase() === right.toLowerCase()
}

async function resolveCreatedWalletFromOwnerWithRetry(params: {
  publicClient: NonNullable<ReturnType<typeof usePublicClient>>
  ownerAddress: Address
  knownWalletBeforeCreate: Address | null
}): Promise<{ walletAddress: Address; basePackId: number | null } | null> {
  for (let attempt = 0; attempt <= CREATE_WALLET_RESOLUTION_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const latest = await Promise.race([
        findLatestWalletByOwner({
          publicClient: params.publicClient,
          owner: params.ownerAddress,
        }),
        sleep(CREATE_WALLET_RESOLUTION_ATTEMPT_TIMEOUT_MS).then(
          () => null as Awaited<ReturnType<typeof findLatestWalletByOwner>>,
        ),
      ])

      if (latest) {
        const isSameAsBefore = Boolean(
          params.knownWalletBeforeCreate
          && sameAddress(latest.walletAddress, params.knownWalletBeforeCreate),
        )
        if (!isSameAsBefore) {
          return {
            walletAddress: latest.walletAddress,
            basePackId: latest.basePackId,
          }
        }
      }
    } catch {
      // Keep retrying while create flow is still active.
    }

    if (attempt < CREATE_WALLET_RESOLUTION_RETRY_DELAYS_MS.length) {
      await sleep(CREATE_WALLET_RESOLUTION_RETRY_DELAYS_MS[attempt])
    }
  }

  return null
}

async function resolveKnownWalletBeforeCreate(params: {
  ownerAddress: Address
  publicClient: NonNullable<ReturnType<typeof usePublicClient>>
}): Promise<Address | null> {
  const knownWalletPromise = (async () => {
    try {
      const latestBeforeCreate = await findLatestWalletByOwner({
        publicClient: params.publicClient,
        owner: params.ownerAddress,
      })
      return latestBeforeCreate?.walletAddress ?? null
    } catch {
      return null
    }
  })()

  return Promise.race([
    knownWalletPromise,
    sleep(CREATE_OWNER_PREFLIGHT_TIMEOUT_MS).then(() => null as Address | null),
  ])
}

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

type IncludedPolicyRow = {
  key: string
  label: string
  tooltipLines: string[]
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

  const [error, setError] = useState<string | null>(null)
  const [initialBotGasBufferEth, setInitialBotGasBufferEth] = useState('0.0002')
  const [includedRows, setIncludedRows] = useState<IncludedPolicyRow[]>(() => createIncludedProtectionRows(selectedProfileDraft))
  const [isIncludedLoading, setIsIncludedLoading] = useState(false)
  const includedRowsCacheRef = useRef<Map<string, IncludedPolicyRow[]>>(new Map())

  const selectedLine = SECURITY_LINES.find((line) => line.id === selectedProfileDraft) ?? SECURITY_LINES[0]
  const lineBehaviorNotes = createLineBehaviorNotes(selectedProfileDraft)
  const lineBehaviorTitle = selectedProfileDraft === 'vault-safe'
    ? 'How Vault mode works'
    : 'How DeFi Trader works'

  const createDisabled = !isBaseReady || !publicClient || txRequestStarted || awaitingConfirmation
  const closeDisabled = txRequestStarted || awaitingConfirmation
  const createStatus = useMemo(() => {
    if (awaitingConfirmation) {
      return 'Waiting for confirmation...'
    }

    if (txRequestStarted) {
      return 'One setup transaction: confirm in your wallet...'
    }

    if (txHashReceived) {
      return 'Transaction confirmed. Finalizing Vault setup...'
    }

    if (createIntentStarted) {
      return 'Ready to open your wallet for confirmation.'
    }

      return 'Ready to create your Vault.'
  }, [awaitingConfirmation, createIntentStarted, txHashReceived, txRequestStarted])

  useEffect(() => {
    if (isOpen) {
      return
    }

    queueMicrotask(() => {
      setError(null)
      setIncludedRows(createIncludedProtectionRows(selectedProfileDraft))
      setIsIncludedLoading(false)
    })
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
    const fallbackRows = createIncludedProtectionRows(selectedProfileDraft)
    const cacheKey = `${selectedProfileDraft}:${selectedLine.basePackId}`
    const cachedRows = includedRowsCacheRef.current.get(cacheKey)

    // Show line defaults immediately, then hydrate with on-chain metadata.
    setIncludedRows(cachedRows ?? fallbackRows)
    setIsIncludedLoading(false)

    async function loadIncludedFromChain() {
      if (!isBaseReady || !publicClient) {
        setIncludedRows(fallbackRows)
        return
      }

      if (cachedRows) {
        return
      }

      setIsIncludedLoading(true)

      try {
        const basePack = await readPackById({
          publicClient,
          packId: selectedLine.basePackId,
        })

        if (!basePack || basePack.packType !== 'base') {
          throw new Error('Base pack metadata is unavailable.')
        }

        const rows = await Promise.all(
          basePack.policies.map(async (policyAddress, index) => {
            const details = await readPolicyRuntimeDetails({
              publicClient,
              policyAddress,
            })

            const view = buildPolicyView(policyAddress, details, {
              sourceContext: 'base',
            })

            return {
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
            }
          }),
        )

        if (!cancelled) {
          includedRowsCacheRef.current.set(cacheKey, rows)
          setIncludedRows(rows)
        }
      } catch {
        if (!cancelled) {
          setIncludedRows(fallbackRows)
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

  if (!isOpen) {
    return null
  }

  const requestClose = (trigger: string) => {
    void trigger
    onClose()
  }

  async function handleCreate() {
    setError(null)

    let initialBotGasBufferWei = 0n
    try {
      initialBotGasBufferWei = parseEther(initialBotGasBufferEth.trim())
    } catch {
      setError('Enter a valid initial automation balance in ETH.')
      return
    }

    if (initialBotGasBufferWei <= 0n) {
      setError('Initial automation balance must be greater than 0 ETH.')
      return
    }

    if (!publicClient) {
      setError('Wallet connection is not ready. Please retry.')
      return
    }

    if (!isBaseReady) {
      setError('Switch to Base Mainnet first.')
      return
    }

    onCreateIntentStarted()
    // Preload owner wallet snapshot in background, but do not block wallet confirmation prompt.
    const knownWalletBeforeCreatePromise = resolveKnownWalletBeforeCreate({
      ownerAddress,
      publicClient,
    })

    let txHash: Hash | null = null

    try {
      onTxRequestStarted()
      const hash = await writeContractAsync({
        ...factoryConfig,
        chainId: BASE_CHAIN_ID,
        functionName: 'createWallet',
        value: initialBotGasBufferWei,
        // Recovery authorization flow is not active in the current product stage.
        // Keep owner as placeholder recovery in create call until dedicated recovery UX/flow is shipped.
        args: [ownerAddress, ownerAddress, BigInt(selectedLine.basePackId)],
      })
      txHash = hash as Hash
      onTxHashReceived(txHash)

      onAwaitingConfirmationChange(true)
      const receipt = await waitForCreateReceipt({ publicClient, hash })
      if (receipt.status !== 'success') {
        throw new Error('Transaction reverted.')
      }
      onAwaitingConfirmationChange(false)

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
        try {
          walletAddress = extractCreatedWalletFromReceipt({ logs: receiptLogs })
        } catch {
          walletAddress = null
        }
      }

      if (!walletAddress) {
        const knownWalletBeforeCreate = await knownWalletBeforeCreatePromise
        const fallbackResolved = await resolveCreatedWalletFromOwnerWithRetry({
          publicClient,
          ownerAddress,
          knownWalletBeforeCreate,
        })
        walletAddress = fallbackResolved?.walletAddress ?? null
      }

      if (!walletAddress) {
        throw new Error('Created wallet address could not be resolved from receipt or chain history.')
      }

      onCreated({
        walletAddress,
        basePackId: selectedLine.basePackId,
        txHash: txHash as Hash,
      })
    } catch (createError) {
      if (txHash && isRecoverableCreateResolutionError(createError)) {
        const knownWalletBeforeCreate = await knownWalletBeforeCreatePromise
        const fallbackResolved = await resolveCreatedWalletFromOwnerWithRetry({
          publicClient,
          ownerAddress,
          knownWalletBeforeCreate,
        })
        if (fallbackResolved) {
          onAwaitingConfirmationChange(false)
          onCreated({
            walletAddress: fallbackResolved.walletAddress,
            basePackId: fallbackResolved.basePackId ?? selectedLine.basePackId,
            txHash,
          })
          return
        }
      }

      onAwaitingConfirmationChange(false)
      onCreateFlowFailed()
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
                      onChange={() => onProfileDraftChange(line.id as CreateLineId)}
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
              {isIncludedLoading && includedRows.length === 0 ? <p className="muted">Loading policies from chain...</p> : null}
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
              <p className="muted">One on-chain setup transaction.</p>
              <p className="muted">
                Recovery setup is planned for a later release. The current flow stores the owner as a placeholder only.
              </p>
              <label className="field-label" htmlFor="create-bot-gas-buffer-input">
                Initial automation balance (ETH)
              </label>
              <input
                id="create-bot-gas-buffer-input"
                className="text-input"
                type="text"
                inputMode="decimal"
                value={initialBotGasBufferEth}
                onChange={(event) => setInitialBotGasBufferEth(event.target.value.trim())}
                placeholder="0.0002"
              />
              <p className="muted">
                This amount is reserved for automation to execute delayed actions after they unlock. It does not let automation withdraw arbitrary Vault funds.
              </p>
              <div className="row">
                <Button type="button" variant="primary" disabled={createDisabled} onClick={() => void handleCreate()}>
                  {txRequestStarted || awaitingConfirmation ? 'Creating...' : 'Create New Vault (1 tx)'}
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
      const verification = await Promise.race([
        verifyImportedFirewallWallet({
          publicClient,
          ownerAddress,
          walletAddress: vaultAddressInput as Address,
        }),
        sleep(IMPORT_VALIDATION_TIMEOUT_MS).then(() => null as Awaited<ReturnType<typeof verifyImportedFirewallWallet>> | null),
      ])

      if (!verification) {
        setValidation({
          kind: 'unsupported',
          message: 'Address checks timed out on RPC. Retry in a moment.',
        })
        return
      }

      if (!verification.ok) {
        setValidation({
          ...classifyImportFailure(verification.reason),
        })
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
      setValidation({
        ...classifyImportFailure(reason),
      })
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

function activeRuleSourceLabel(contextLabel: ProtectionRuleView['contextLabel']): string {
  if (contextLabel === 'Included in Base Protection') {
    return 'Source: Base line (always active)'
  }

  return 'Source: Enabled add-on'
}

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
  const [optimisticEnabledPackIds, setOptimisticEnabledPackIds] = useState<number[]>([])

  useEffect(() => {
    if (!isOpen) {
      queueMicrotask(() => {
        setPendingEnablePackId(null)
        setOptimisticEnabledPackIds([])
      })
    }
  }, [isOpen])

  useEffect(() => {
    if (!status || isPending || pendingEnablePackId !== null) {
      return
    }

    const timer = setTimeout(() => {
      setStatus(null)
    }, TRANSIENT_FEEDBACK_TTL_MS)

    return () => {
      clearTimeout(timer)
    }
  }, [isPending, pendingEnablePackId, status])

  useEffect(() => {
    if (!error) {
      return
    }

    const timer = setTimeout(() => {
      setError(null)
    }, TRANSIENT_FEEDBACK_TTL_MS)

    return () => {
      clearTimeout(timer)
    }
  }, [error])

  if (!isOpen) {
    return null
  }

  async function handleEnable(packId: number, title: string) {
    if (pendingEnablePackId !== null) {
      return
    }

    setStatus(null)
    setError(null)

    if (!routerAddress || !publicClient) {
      setError('Vault settings are temporarily unavailable.')
      return
    }

    try {
      setPendingEnablePackId(packId)
      setStatus(`Pending: confirm ${title} in wallet...`)
      const hash = await writeContractAsync({
        ...getPolicyRouterConfig(routerAddress),
        chainId: BASE_CHAIN_ID,
        functionName: 'enableAddonPack',
        args: [BigInt(packId)],
      })

      setStatus('Pending: waiting for blockchain confirmation...')
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') {
        throw new Error('Enable add-on reverted.')
      }

      setOptimisticEnabledPackIds((prev) => (
        prev.includes(packId) ? prev : [...prev, packId]
      ))
      setStatus(`${title} is now enabled.`)
      onChanged()
      setTimeout(() => {
        onChanged()
      }, 3000)
    } catch (enableError) {
      setStatus(null)
      setError(normalizeEnableAddonError(enableError))
    } finally {
      const minPendingVisibleMs = 1200
      await new Promise((resolve) => {
        setTimeout(resolve, minPendingVisibleMs)
      })
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
    if (disabled || isPending || pendingEnablePackId !== null || !routerAddress) return true
    if (phase !== 'available') return true
    return false
  }

  function addonUiPhase(addon: AddonState): AddonUiPhase {
    if (pendingEnablePackId === addon.definition.packId) {
      return 'pending'
    }

    if (addon.enabled || optimisticEnabledPackIds.includes(addon.definition.packId)) {
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
                <span className="muted">{activeRuleSourceLabel(rule.contextLabel)}</span>
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

type QueueItemDetailsPanelProps = {
  walletAddress: Address
  item: QueueItemView
  onChanged: () => void
}

function fallbackSplitReasonLines(reason: string): string[] {
  const normalized = reason.trim()
  if (normalized.length === 0) {
    return []
  }

  const split = normalized
    .split(/(?=(?:Delayed|Blocked) by )/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  if (split.length > 0) {
    return split
  }

  return [normalized]
}

function QueueItemDetailsPanel({ walletAddress, item, onChanged }: QueueItemDetailsPanelProps) {
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

  useEffect(() => {
    if (!actionError) {
      return
    }

    const timer = setTimeout(() => {
      setActionError(null)
    }, TRANSIENT_FEEDBACK_TTL_MS)

    return () => {
      clearTimeout(timer)
    }
  }, [actionError])

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

  const amountLabel = useMemo(() => {
    const valueEth = formatEther(item.value)
    return formatCompactEth(valueEth, 6) ?? valueEth
  }, [item.value])
  const reasonLines = useMemo(() => {
    const source = item.reasonLines.length > 0 ? item.reasonLines : fallbackSplitReasonLines(item.reason)
    return source.filter((line) => line.trim().length > 0)
  }, [item.reason, item.reasonLines])

  return (
    <section className="modal-section modal-section-compact queue-item-details">
      <h3>Transaction Details</h3>
      <div className="queue-item-details-grid">
        <p>
          <strong>ID:</strong> {shortHash(item.txId)} <CopyButton value={item.txId} label="Copy id" />
        </p>
        <p>
          <strong>Recipient:</strong>{' '}
          <a href={addressUrl(item.to)} target="_blank" rel="noreferrer">
            {shortAddress(item.to)}
          </a>{' '}
          <CopyButton value={item.to} />
        </p>
        <p><strong>Amount:</strong> {amountLabel} ETH</p>
        <p><strong>Unlock time:</strong> {formatDateTime(item.unlockTime)}</p>
      </div>
      <div>
        <p><strong>Reasons</strong></p>
        {reasonLines.length > 0 ? (
          <ul className="compact-list compact-list-tight queue-reasons-list">
            {reasonLines.map((line, index) => (
              <li key={`${item.txId}-reason-${index}`}>{line}</li>
            ))}
          </ul>
        ) : (
          <p className="muted">Reason details are unavailable right now.</p>
        )}
      </div>
      <p><strong>Status:</strong> {queueState.status}</p>
      <div className="row">
        <Button type="button" disabled={!queueState.ready || isPending} onClick={() => void runAction('executeScheduled')}>
          Execute when ready
        </Button>
        <Button type="button" variant="ghost" disabled={isPending} onClick={() => void runAction('cancelScheduled')}>
          Cancel action
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
    </section>
  )
}

type QueueBotInfoPanelProps = {
  walletAddress: Address
  onChanged: () => void
}

function QueueBotInfoPanel({ walletAddress, onChanged }: QueueBotInfoPanelProps) {
  const publicClient = usePublicClient()
  const { writeContractAsync, isPending } = useWriteContract()
  const bot = useVaultBot(walletAddress)
  const [isActionPending, setIsActionPending] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionNotice, setActionNotice] = useState<string | null>(null)
  const [actionTxHash, setActionTxHash] = useState<Hash | null>(null)
  const relayerAddress = bot.status?.relayerAddress ?? null
  const relayerBalance = useEthBalance(relayerAddress)
  const isBusy = isActionPending || isPending
  const isBotEnabled = bot.status?.serverEnabled === true && bot.status?.onchainExecutorEnabled === true
  const executionStatus = isBotEnabled ? 'Running' : 'Not running'
  const gasBalanceLabel = relayerBalance.balanceEth === null
    ? 'unavailable'
    : `${formatCompactEth(relayerBalance.balanceEth, 6) ?? relayerBalance.balanceEth} ETH`

  useEffect(() => {
    if (!actionError && !actionNotice) {
      return
    }

    const timer = setTimeout(() => {
      setActionError(null)
      setActionNotice(null)
    }, TRANSIENT_FEEDBACK_TTL_MS)

    return () => {
      clearTimeout(timer)
    }
  }, [actionError, actionNotice])

  async function setExecutorEnabled(enabled: boolean): Promise<Hash> {
    if (!publicClient || !relayerAddress) {
      throw new Error('Relayer address is unavailable. Check bot server status.')
    }

    const hash = await writeContractAsync({
      ...getQueueExecutorConfig(walletAddress),
      chainId: BASE_CHAIN_ID,
      functionName: 'setQueueExecutor',
      args: [relayerAddress, enabled],
    })

    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    if (receipt.status !== 'success') {
      throw new Error('Vault executor update reverted.')
    }

    return hash as Hash
  }

  async function handleEnable() {
    setIsActionPending(true)
    setActionError(null)
    setActionNotice(null)
    setActionTxHash(null)

    try {
      const hash = await setExecutorEnabled(true)
      setActionTxHash(hash)
      await bot.enableOnServer()
      setActionNotice('Automation enabled for this Vault.')
      onChanged()
      bot.refresh()
    } catch (error) {
      setActionError(normalizeQueueActionError(error))
    } finally {
      setIsActionPending(false)
    }
  }

  async function handleDisable() {
    setIsActionPending(true)
    setActionError(null)
    setActionNotice(null)
    setActionTxHash(null)

    try {
      const hash = await setExecutorEnabled(false)
      setActionTxHash(hash)
      await bot.disableOnServer()
      setActionNotice('Automation disabled for this Vault.')
      onChanged()
      bot.refresh()
    } catch (error) {
      setActionError(normalizeQueueActionError(error))
    } finally {
      setIsActionPending(false)
    }
  }

  return (
    <section className="modal-section modal-section-compact queue-bot-info-panel">
      <h3>Automation</h3>
      <div className="queue-bot-info-grid">
        <p><strong>Status:</strong> {executionStatus}</p>
        <p>
          <strong>Automation wallet:</strong>{' '}
          {relayerAddress ? (
            <>
              {shortAddress(relayerAddress)} <CopyButton value={relayerAddress} mode="icon" label="Copy relayer address" />
            </>
          ) : (
            'not configured'
          )}
        </p>
        <p><strong>Automation wallet balance:</strong> {relayerBalance.isLoading ? 'loading...' : gasBalanceLabel}</p>
      </div>
      <div className="row queue-bot-controls">
        <Button
          type="button"
          variant="primary"
          disabled={isBusy || !relayerAddress || isBotEnabled}
          onClick={() => void handleEnable()}
        >
          {isBusy ? 'Updating...' : 'Enable automation'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={isBusy || !relayerAddress || !isBotEnabled}
          onClick={() => void handleDisable()}
        >
          Disable automation
        </Button>
      </div>
      <p className="muted">Automation can execute already-unlocked delayed actions. It cannot withdraw arbitrary funds from your Vault.</p>
      {!bot.health.readyForAutomation ? <p className="muted">Automation service is not ready yet.</p> : null}
      {actionTxHash ? (
        <p>
          Bot setup tx:{' '}
          <a href={txUrl(actionTxHash)} target="_blank" rel="noreferrer">
            {shortHash(actionTxHash)}
          </a>{' '}
          <CopyButton value={actionTxHash} mode="icon" label="Copy bot setup tx hash" />
        </p>
      ) : null}
      {bot.status?.lastError ? <p className="status-warning">{bot.status.lastError}</p> : null}
      {bot.error ? <p className="status-warning">{bot.error}</p> : null}
      {actionError ? <p className="status-error">{actionError}</p> : null}
      {actionNotice ? <p className="muted">{actionNotice}</p> : null}
    </section>
  )
}

type QueueItemDetailsModalProps = {
  isOpen: boolean
  onClose: () => void
  walletAddress: Address
  item: QueueItemView | null
  onChanged: () => void
}

function QueueItemDetailsModal({ isOpen, onClose, walletAddress, item, onChanged }: QueueItemDetailsModalProps) {
  if (!isOpen || !item) {
    return null
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="modal-card modal-card-compact queue-item-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Transaction details"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <h2>Transaction Details</h2>
          <Button type="button" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </header>

        <QueueItemDetailsPanel walletAddress={walletAddress} item={item} onChanged={onChanged} />
      </section>
    </div>
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

const QUEUE_PAGE_SIZE = 20

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
  const [visiblePages, setVisiblePages] = useState(1)
  const [detailsTxId, setDetailsTxId] = useState<QueueItemView['txId'] | null>(null)

  const visibleCount = visiblePages * QUEUE_PAGE_SIZE
  const visibleItems = useMemo(
    () => items.slice(0, visibleCount),
    [items, visibleCount],
  )
  const canShowMore = visibleCount < items.length
  const detailsItem = useMemo(
    () => items.find((item) => item.txId === detailsTxId) ?? null,
    [detailsTxId, items],
  )

  const handleClose = useCallback(() => {
    setVisiblePages(1)
    setDetailsTxId(null)
    onClose()
  }, [onClose])

  if (!isOpen) {
    return null
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={handleClose}>
      <section
        className="modal-card modal-card-tight queue-details-modal"
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
            <Button type="button" variant="ghost" onClick={handleClose}>
              Close
            </Button>
          </div>
        </header>

        {isLoading ? <p className="muted">Loading delayed actions...</p> : null}
        {error ? <p className="status-warning">{error}</p> : null}

        <QueueBotInfoPanel walletAddress={walletAddress} onChanged={onChanged} />

        {items.length === 0 && !isLoading && !error ? (
          <p>
            No delayed actions right now for Vault {shortAddress(walletAddress)}.
            {' '}If you expected one, click Refresh and confirm that the selected Vault is correct.
          </p>
        ) : null}

        {visibleItems.length > 0 ? (
          <section className="queue-table-shell">
            <div className="queue-table-scroll">
              <table className="queue-table">
                <thead>
                  <tr>
                    <th scope="col">Tx</th>
                    <th scope="col">Recipient</th>
                    <th scope="col">Amount</th>
                    <th scope="col">Unlock</th>
                    <th scope="col">Status</th>
                    <th scope="col">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.map((item) => {
                    const readiness = describeQueueReadiness({ unlockTime: item.unlockTime })
                    const amountEth = formatCompactEth(formatEther(item.value), 6) ?? formatEther(item.value)

                    return (
                      <tr
                        key={item.txId}
                      >
                        <td>
                          <span className="queue-cell-inline">
                            {shortHash(item.txId)}
                            <CopyButton value={item.txId} label="Copy tx hash" mode="icon" />
                          </span>
                        </td>
                        <td>
                          <span className="queue-cell-inline">
                            {shortAddress(item.to)}
                            <CopyButton value={item.to} label="Copy recipient address" mode="icon" />
                          </span>
                        </td>
                        <td>{amountEth} ETH</td>
                        <td>{formatDateTime(item.unlockTime)}</td>
                        <td>
                          <span className={readiness.ready ? 'queue-status-pill is-ready' : 'queue-status-pill is-waiting'}>
                            {readiness.ready ? 'Ready' : 'Waiting'}
                          </span>
                        </td>
                        <td>
                          <Button type="button" variant="ghost" onClick={() => setDetailsTxId(item.txId)}>
                            Open
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {canShowMore ? (
          <div className="row">
            <Button type="button" onClick={() => setVisiblePages((previous) => previous + 1)}>
              Show {Math.min(QUEUE_PAGE_SIZE, items.length - visibleCount)} more
            </Button>
          </div>
        ) : null}

        <QueueItemDetailsModal
          isOpen={detailsItem !== null}
          onClose={() => setDetailsTxId(null)}
          walletAddress={walletAddress}
          item={detailsItem}
          onChanged={onChanged}
        />
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
  }>(RECEIVE_IDLE_STATUS)

  useEffect(() => {
    if (!isOpen) {
      queueMicrotask(() => {
        setRequestedAmountEth('')
        setTransferStatus(RECEIVE_IDLE_STATUS)
      })
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    if (transferStatus.kind !== 'success' && transferStatus.kind !== 'error') {
      return
    }

    const timer = setTimeout(() => {
      setTransferStatus(RECEIVE_IDLE_STATUS)
    }, TRANSIENT_FEEDBACK_TTL_MS)

    return () => {
      clearTimeout(timer)
    }
  }, [isOpen, transferStatus])

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
          <p className="muted">Use this amount to send from the currently connected wallet into the Vault.</p>
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
              {isSendPending ? 'Submitting...' : 'Send From Connected Wallet to Vault'}
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
            <summary>Share deposit link</summary>
            <p className="muted">Use this request URI in a compatible wallet or share it with someone funding the Vault:</p>
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

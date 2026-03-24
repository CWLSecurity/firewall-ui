import { formatEther, type Address } from 'viem'
import {
  BASE_PACK_CONSERVATIVE_ID,
  BASE_PACK_DEFI_ID,
} from '../../contracts/addresses/base'
import type { PolicyRuntimeDetails } from '../../contracts/policies'

export type SecurityLineId = 'vault-safe' | 'defi-trader'
export type AddonId = 'approval-hardening' | 'new-receiver-24h-delay' | 'large-transfer-24h-delay'

export type SecurityLineDefinition = {
  id: SecurityLineId
  basePackId: number
  title: string
  shortDescription: string
  details: string[]
  includedProtectionPreview: string[]
}

export type AddonDefinition = {
  id: AddonId
  packId: number
  title: string
  shortDescription: string
  details: string[]
}

export type PolicySourceContext = 'base' | 'addon' | 'unspecified'

export type PolicyBusinessMetadata = {
  displayName: string
  shortSummary: string
  businessDescription: string
  whyItMatters: string
  uiContextNote: string
  sourceLabel: string
  packContextLabel: string
  learnMoreHint: string
  metadataExtras?: Record<string, string>
}

export type PolicyView = {
  policyAddress: Address
  title: string
  summary: string
  why: string
  parameterSummary: string[]
  details: string[]
  metadata: PolicyBusinessMetadata
  technical: {
    policyName: string | null
    policyKey: `0x${string}` | null
    policyConfigVersion: number | null
  }
}

const MAX_UINT256 = (1n << 256n) - 1n

const DEFAULT_SOURCE_LABEL = 'Protection source is active.'
const DEFAULT_PACK_CONTEXT_LABEL = 'Rule context is unavailable.'

export const SECURITY_LINES: SecurityLineDefinition[] = [
  {
    id: 'vault-safe',
    basePackId: BASE_PACK_CONSERVATIVE_ID,
    title: 'Vault Safe',
    shortDescription: 'Stricter default line for everyday wallet safety.',
    details: [
      'Designed for lower-risk daily usage with strict approval behavior.',
      'Large transfers and first transfers to new receivers can be delayed for review.',
      'Unlimited approvals are blocked by default.',
    ],
    includedProtectionPreview: [
      'Unlimited approvals are blocked',
      'Large transfers are delayed',
      'First transfer to a new receiver is delayed',
    ],
  },
  {
    id: 'defi-trader',
    basePackId: BASE_PACK_DEFI_ID,
    title: 'DeFi Trader',
    shortDescription: 'More DeFi-compatible line with active delay protections.',
    details: [
      'Built for active protocol usage while keeping delay protections in place.',
      'Approval behavior follows the on-chain DeFi policy configuration.',
      'Includes additional first-time spender and recipient friction for DeFi flows.',
    ],
    includedProtectionPreview: [
      'Approval policy follows DeFi mode configuration',
      'First-time risky approvals can be delayed or blocked',
      'Large transfers are delayed',
      'First transfer to a new receiver can be delayed',
    ],
  },
]

export const ADDON_DEFINITIONS: AddonDefinition[] = [
  {
    id: 'approval-hardening',
    packId: 2,
    title: 'Approval Hardening',
    shortDescription: 'Adds strict approval checks for stronger token-spend protection.',
    details: [
      'Blocks unlimited approvals and high-risk approval patterns.',
      'Useful if you want stricter token approval boundaries.',
    ],
  },
  {
    id: 'new-receiver-24h-delay',
    packId: 3,
    title: '24-Hour New Receiver Delay',
    shortDescription: 'Adds a 24-hour delay to first transfers to new receivers.',
    details: [
      'Adds extra review time before funds can leave to a new destination.',
      'Once a receiver becomes known, future transfers are not delayed by this rule.',
    ],
  },
  {
    id: 'large-transfer-24h-delay',
    packId: 4,
    title: '24-Hour Large Transfer Delay',
    shortDescription: 'Adds a 24-hour delay for larger transfers.',
    details: [
      'Adds an additional high-value transfer delay layer.',
      'Threshold and timing are enforced on-chain by the active policy contract.',
    ],
  },
]

export function lineByBasePackId(basePackId: number | null): SecurityLineDefinition | null {
  if (basePackId === null) {
    return null
  }

  return SECURITY_LINES.find((line) => line.basePackId === basePackId) ?? null
}

export function addonByPackId(packId: number): AddonDefinition | null {
  return ADDON_DEFINITIONS.find((addon) => addon.packId === packId) ?? null
}

export function formatDelay(delaySeconds: bigint | null): string {
  if (delaySeconds === null) {
    return 'details temporarily unavailable'
  }

  const value = Number(delaySeconds)
  if (!Number.isFinite(value)) {
    return `${delaySeconds.toString()} seconds`
  }

  if (value % 86_400 === 0) {
    const days = value / 86_400
    return `${days} day${days === 1 ? '' : 's'}`
  }

  if (value % 3_600 === 0) {
    const hours = value / 3_600
    return `${hours} hour${hours === 1 ? '' : 's'}`
  }

  if (value % 60 === 0) {
    const minutes = value / 60
    return `${minutes} minute${minutes === 1 ? '' : 's'}`
  }

  return `${delaySeconds.toString()} seconds`
}

function formatThresholdEth(valueWei: bigint | null): string {
  if (valueWei === null) {
    return 'details temporarily unavailable'
  }

  return `${formatEther(valueWei)} ETH`
}

function formatLegacyApprovalLimit(value: bigint | null): string {
  if (value === null) {
    return 'details temporarily unavailable'
  }

  if (value === MAX_UINT256) {
    return 'max uint256'
  }

  return value.toString()
}

function humanizePolicyName(name: string): string {
  const cleaned = name.replace(/Policy$/u, '')
  const withSpaces = cleaned.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  return withSpaces.trim() || 'Protection'
}

function policyTitleFromName(name: string | null, fallback: string): string {
  if (!name) {
    return fallback
  }

  if (name === 'InfiniteApprovalPolicy') return 'Approval Safety'
  if (name === 'DeFiApprovalPolicy') return 'DeFi Approval Mode'
  if (name === 'LargeTransferDelayPolicy') return 'Large Transfer Delay'
  if (name === 'NewReceiverDelayPolicy') return 'New Receiver Delay'
  if (name === 'NewEOAReceiverDelayPolicy') return 'New Receiver Delay'
  if (name === 'ApprovalToNewSpenderDelayPolicy') return 'New Spender Approval Delay'
  if (name === 'Erc20FirstNewRecipientDelayPolicy') return 'New Token Recipient Delay'

  return humanizePolicyName(name)
}

function createBusinessMetadata(params: {
  displayName: string
  shortSummary: string
  businessDescription: string
  whyItMatters: string
  uiContextNote: string
  learnMoreHint: string
  sourceLabel?: string
  packContextLabel?: string
  metadataExtras?: Record<string, string>
}): PolicyBusinessMetadata {
  return {
    displayName: params.displayName,
    shortSummary: params.shortSummary,
    businessDescription: params.businessDescription,
    whyItMatters: params.whyItMatters,
    uiContextNote: params.uiContextNote,
    sourceLabel: params.sourceLabel ?? DEFAULT_SOURCE_LABEL,
    packContextLabel: params.packContextLabel ?? DEFAULT_PACK_CONTEXT_LABEL,
    learnMoreHint: params.learnMoreHint,
    metadataExtras: params.metadataExtras,
  }
}

function toPolicyView(params: {
  policyAddress: Address
  metadata: PolicyBusinessMetadata
  parameterSummary: string[]
  technical: {
    policyName: string | null
    policyKey: `0x${string}` | null
    policyConfigVersion: number | null
  }
}): PolicyView {
  const details = [
    params.metadata.businessDescription,
    params.metadata.whyItMatters,
    params.metadata.uiContextNote,
    ...params.parameterSummary,
  ]

  return {
    policyAddress: params.policyAddress,
    title: params.metadata.displayName,
    summary: params.metadata.shortSummary,
    why: params.metadata.whyItMatters,
    parameterSummary: params.parameterSummary,
    details: Array.from(new Set(details.filter((line) => line.trim().length > 0))),
    metadata: params.metadata,
    technical: params.technical,
  }
}

function sourceLabels(sourceContext: PolicySourceContext, addonTitle: string | null): Pick<PolicyBusinessMetadata, 'sourceLabel' | 'packContextLabel'> {
  if (sourceContext === 'base') {
    return {
      sourceLabel: 'Included in Base Protection',
      packContextLabel: 'Part of your base protection set.',
    }
  }

  if (sourceContext === 'addon') {
    return {
      sourceLabel: 'Enabled as Add-on',
      packContextLabel: addonTitle ? `Provided by add-on: ${addonTitle}.` : 'Provided by an enabled add-on.',
    }
  }

  return {
    sourceLabel: DEFAULT_SOURCE_LABEL,
    packContextLabel: DEFAULT_PACK_CONTEXT_LABEL,
  }
}

function knownScopeLabel(value: string | null): string {
  if (value === 'vault_token_spender') {
    return 'Known spender state is tracked per Vault, token, and spender.'
  }

  if (value === 'vault_token_rcpt') {
    return 'Known recipient state is tracked per Vault, token, and recipient.'
  }

  return 'Known-state scope details are temporarily unavailable.'
}

export function policyTooltipLines(view: PolicyView): string[] {
  const lines = [
    `Summary: ${view.metadata.shortSummary}`,
    `What it does: ${view.metadata.businessDescription}`,
    `Why it matters: ${view.metadata.whyItMatters}`,
    `Context: ${view.metadata.uiContextNote}`,
    ...view.parameterSummary.map((line) => `Active setting: ${line}`),
    `Learn more: ${view.metadata.learnMoreHint}`,
  ]

  return Array.from(new Set(lines.filter((line) => line.trim().length > 0)))
}

export function policyCompactTooltipLines(view: PolicyView): string[] {
  const lines: string[] = [`Summary: ${view.metadata.shortSummary}`]
  const parameterLines = view.parameterSummary.filter((line) => !line.toLowerCase().includes('temporarily unavailable'))
  const thresholdLine = parameterLines.find((line) => line.toLowerCase().includes('threshold'))
  const delayLine = parameterLines.find((line) => line.toLowerCase().includes('delay'))

  const selected: string[] = []
  if (thresholdLine) {
    selected.push(thresholdLine)
  }
  if (delayLine && delayLine !== thresholdLine) {
    selected.push(delayLine)
  }
  if (selected.length === 0 && parameterLines.length > 0) {
    selected.push(parameterLines[0])
  }

  return Array.from(new Set([...lines, ...selected].filter((line) => line.trim().length > 0)))
}

export function packAccessLabel(accessMode: 'free' | 'entitled' | null): string {
  if (accessMode === 'free') {
    return 'Free'
  }

  if (accessMode === 'entitled') {
    return 'Requires access'
  }

  return 'Access details unavailable'
}

export function packTitleFromSlug(params: {
  packId: number
  slug: string | null
  fallbackTitle: string
}): string {
  const normalizedSlug = params.slug?.trim().toLowerCase() ?? ''

  if (normalizedSlug === 'addon-approval-hardening') return 'Approval Hardening'
  if (normalizedSlug === 'addon-new-receiver-24h-delay') return '24-Hour New Receiver Delay'
  if (normalizedSlug === 'addon-large-transfer-24h-delay') return '24-Hour Large Transfer Delay'
  if (normalizedSlug === 'base-conservative') return 'Vault Safe'
  if (normalizedSlug === 'base-defi') return 'DeFi Trader'

  if (params.fallbackTitle.trim().length > 0) {
    return params.fallbackTitle
  }

  return `Pack ${params.packId}`
}

export function packTooltipLines(params: {
  accessLabel: string
  statusLabel: string
  policyViews: PolicyView[]
  fallbackDescription: string
}): string[] {
  const lines: string[] = [`Summary: ${params.fallbackDescription}`, `Status: ${params.statusLabel}`]

  if (params.policyViews.length === 0) {
    return Array.from(new Set(lines.filter((line) => line.trim().length > 0)))
  }

  const includedPolicies = params.policyViews
    .map((view) => view.metadata.displayName.trim())
    .filter((value) => value.length > 0)

  if (includedPolicies.length > 0) {
    lines.push(`Includes: ${includedPolicies.join(', ')}.`)
  }

  const keySettings = params.policyViews
    .flatMap((view) =>
      policyCompactTooltipLines(view).filter((line) => {
        const lowered = line.toLowerCase()
        return !lowered.startsWith('summary:') && !lowered.includes('temporarily unavailable')
      }),
    )
    .slice(0, 2)

  for (const setting of keySettings) {
    lines.push(`Key setting: ${setting}`)
  }

  return Array.from(new Set(lines.filter((line) => line.trim().length > 0)))
}

export function buildPolicyView(
  policyAddress: Address,
  details: PolicyRuntimeDetails,
  options?: {
    sourceContext?: PolicySourceContext
    addonTitle?: string | null
  },
): PolicyView {
  const technical = {
    policyName: details.policyName,
    policyKey: details.policyKey,
    policyConfigVersion: details.policyConfigVersion,
  }
  const sourceContext = options?.sourceContext ?? 'unspecified'
  const contextLabels = sourceLabels(sourceContext, options?.addonTitle ?? null)

  if (details.kind === 'infinite-approval') {
    const parameterSummary = [
      details.allowPermit === true
        ? 'Permit-based approvals are allowed by this configuration.'
        : details.allowPermit === false
          ? 'Permit-based approvals are blocked by this configuration.'
          : 'Permit-based approval behavior is temporarily unavailable.',
      details.strictNonZeroMode === true
        ? 'Strict non-zero approval mode is enabled.'
        : details.strictNonZeroMode === false
          ? 'Strict non-zero approval mode is disabled.'
          : 'Strict non-zero approval behavior is temporarily unavailable.',
      details.approvalLimitFunctional === true
        ? `Effective approval limit is ${formatLegacyApprovalLimit(details.legacyApprovalLimit)}.`
        : details.approvalLimitFunctional === false
          ? `Effective approval limit behavior: strict non-zero mode is active, and legacy approval_limit ${formatLegacyApprovalLimit(details.legacyApprovalLimit)} is informational.`
          : 'Effective approval limit behavior is temporarily unavailable.',
    ]

    return toPolicyView({
      policyAddress,
      metadata: createBusinessMetadata({
        displayName: sourceContext === 'addon' ? 'Approval Hardening' : 'Approval Safety',
        shortSummary:
          sourceContext === 'addon'
            ? 'Adds strict approval protection on top of your base protections.'
            : 'Blocks unsafe token approvals.',
        businessDescription:
          'This protection prevents apps and smart contracts from receiving unlimited access to your tokens. Depending on configuration, you can still approve only the amount you need.',
        whyItMatters:
          'Many DeFi losses happen because a wallet once granted overly broad token permissions. This protection reduces that risk before funds are moved.',
        uiContextNote:
          'Active settings below are read from on-chain config: permit handling, strict non-zero behavior, and effective approval-limit behavior.',
        learnMoreHint: 'Review token approvals regularly and remove stale permissions.',
        ...contextLabels,
        metadataExtras: {
          policyFamily: 'approval-safety',
        },
      }),
      parameterSummary,
      technical,
    })
  }

  if (details.kind === 'defi-approval') {
    const parameterSummary = [
      details.allowMaxApproval === true
        ? 'Max approval amounts are allowed in this mode.'
        : details.allowMaxApproval === false
          ? 'Max approval amounts are blocked in this mode.'
          : 'Max approval behavior is temporarily unavailable.',
      details.allowPermit === true
        ? 'Permit-based approvals are allowed.'
        : details.allowPermit === false
          ? 'Permit-based approvals are blocked.'
          : 'Permit behavior is temporarily unavailable.',
      details.blockSetApprovalForAllTrue === true
        ? 'Operator-wide approvals are blocked.'
        : details.blockSetApprovalForAllTrue === false
          ? 'Operator-wide approvals are allowed.'
          : 'Operator-wide approval behavior is temporarily unavailable.',
    ]

    return toPolicyView({
      policyAddress,
      metadata: createBusinessMetadata({
        displayName: 'DeFi Approval Mode',
        shortSummary: 'Allows practical DeFi approvals while blocking the riskiest approval pattern.',
        businessDescription:
          'This protection is designed for active DeFi use. It allows common approval workflows while blocking the most dangerous approval pattern.',
        whyItMatters:
          'It gives more flexibility for DeFi users without fully removing approval safety controls.',
        uiContextNote: 'Exact approval rules shown below are read from on-chain policy introspection.',
        learnMoreHint: 'Use this mode when you need frequent DeFi approvals but still want guardrails.',
        ...contextLabels,
        metadataExtras: {
          policyFamily: 'defi-approval',
        },
      }),
      parameterSummary,
      technical,
    })
  }

  if (details.kind === 'large-transfer-delay') {
    const delay = formatDelay(details.delaySeconds)
    const erc20Threshold = details.erc20ThresholdUnits !== null
      ? details.erc20ThresholdUnits.toString()
      : 'details temporarily unavailable'
    const comparatorLine = details.comparatorMode === 'gte'
      ? 'Trigger condition: transfer amount at or above the configured threshold.'
      : 'Trigger condition details are temporarily unavailable.'
    const scopeLine = details.selectorScope === 'eth+erc20xfers'
      ? 'Scope: native ETH transfers and ERC-20 transfer/transferFrom transfers.'
      : 'Scope: transfer coverage details are temporarily unavailable.'

    const parameterSummary = [
      `Native transfer threshold: ${formatThresholdEth(details.ethThresholdWei)}.`,
      `ERC-20 transfer threshold: ${erc20Threshold} token units (raw on-chain units).`,
      `Delay before execution: ${delay}.`,
      comparatorLine,
      scopeLine,
    ]

    return toPolicyView({
      policyAddress,
      metadata: createBusinessMetadata({
        displayName: sourceContext === 'addon' ? '24-Hour Large Transfer Delay' : 'Large Transfer Delay',
        shortSummary:
          sourceContext === 'addon'
            ? 'Adds a 24-hour delay for large transfers.'
            : 'Large transfers are delayed before they can be completed.',
        businessDescription:
          'Transfers above the configured threshold are not sent immediately. They are placed in a queue and can be executed later or canceled.',
        whyItMatters:
          'This gives you time to stop a suspicious or mistaken large transfer before funds leave permanently.',
        uiContextNote:
          'Exact native and ERC-20 thresholds and delay are shown below from on-chain config.',
        learnMoreHint: 'Use queue review and cancellation if a delayed transfer looks suspicious.',
        ...contextLabels,
        metadataExtras: {
          policyFamily: 'transfer-delay',
        },
      }),
      parameterSummary,
      technical,
    })
  }

  if (details.kind === 'new-receiver-delay') {
    const delay = formatDelay(details.delaySeconds)
    const scopeLine = details.eoaOnly === true
      ? 'Scope: first transfer to a new wallet address only.'
      : details.eoaOnly === false
        ? 'Scope: first transfer to any new address, including contracts.'
        : 'Scope details are temporarily unavailable.'

    const parameterSummary = [
      `Delay before first transfer: ${delay}.`,
      scopeLine,
      'Known receiver state is tracked per Vault, so later transfers to known addresses are not delayed by this rule.',
    ]

    return toPolicyView({
      policyAddress,
      metadata: createBusinessMetadata({
        displayName: sourceContext === 'addon' ? '24-Hour New Receiver Delay' : 'New Receiver Delay',
        shortSummary:
          sourceContext === 'addon'
            ? 'Adds a 24-hour delay for first transfers to new addresses.'
            : 'First transfers to new addresses are delayed.',
        businessDescription:
          'The first transfer to an address your Vault has not sent to before is delayed. Once that address becomes known to the Vault, later transfers are not delayed by this rule.',
        whyItMatters:
          'This reduces the chance of sending funds quickly to a malicious or mistaken address.',
        uiContextNote: 'Exact delay and address scope are shown below from on-chain config.',
        learnMoreHint: 'Confirm new recipient addresses carefully before first transfer execution.',
        ...contextLabels,
        metadataExtras: {
          policyFamily: 'new-receiver-delay',
        },
      }),
      parameterSummary,
      technical,
    })
  }

  if (details.kind === 'approval-to-new-spender-delay') {
    const delay = formatDelay(details.delaySeconds)
    const eoaActionLine = details.eoaNonZeroAction === 'revert'
      ? 'Non-zero approvals to wallet-address spenders are blocked.'
      : 'Wallet-address spender behavior is temporarily unavailable.'
    const newContractLine = details.newContractAction === 'delay'
      ? 'First non-zero approval to a new contract spender is delayed.'
      : 'New contract spender behavior is temporarily unavailable.'

    const parameterSummary = [
      `Delay before first non-zero approval to a new contract spender: ${delay}.`,
      knownScopeLabel(details.knownScope),
      eoaActionLine,
      newContractLine,
    ]

    return toPolicyView({
      policyAddress,
      metadata: createBusinessMetadata({
        displayName: 'New Spender Approval Delay',
        shortSummary: 'New token approval targets are delayed.',
        businessDescription:
          'The first approval to a new token spender is delayed before it can take effect.',
        whyItMatters:
          'This helps prevent sudden approval-based token theft through a new malicious contract.',
        uiContextNote: 'Exact delay and spender-scope behavior are shown below from on-chain config.',
        learnMoreHint: 'Treat first-time spender approvals as high-risk actions.',
        ...contextLabels,
        metadataExtras: {
          policyFamily: 'approval-delay',
        },
      }),
      parameterSummary,
      technical,
    })
  }

  if (details.kind === 'erc20-first-new-recipient-delay') {
    const delay = formatDelay(details.delaySeconds)
    const selectorScopeLine = details.selectorScope === 'transfer+from'
      ? 'Scope: ERC-20 transfer and transferFrom to a new recipient.'
      : 'Transfer selector scope is temporarily unavailable.'
    const firstRecipientActionLine = details.firstRecipientAction === 'delay'
      ? 'First transfer to a new token recipient is delayed.'
      : 'First-recipient action details are temporarily unavailable.'

    const parameterSummary = [
      `Delay before first transfer to a new token recipient: ${delay}.`,
      selectorScopeLine,
      knownScopeLabel(details.knownScope),
      firstRecipientActionLine,
    ]

    return toPolicyView({
      policyAddress,
      metadata: createBusinessMetadata({
        displayName: 'New Token Recipient Delay',
        shortSummary: 'First token transfers to a new recipient are delayed.',
        businessDescription:
          'The first ERC-20 transfer to a new recipient is delayed before it can complete.',
        whyItMatters:
          'This helps prevent accidental or malicious first-time token transfers.',
        uiContextNote: 'Exact delay and ERC-20 transfer scope are shown below from on-chain config.',
        learnMoreHint: 'Validate new token recipient addresses before releasing delayed transfers.',
        ...contextLabels,
        metadataExtras: {
          policyFamily: 'token-recipient-delay',
        },
      }),
      parameterSummary,
      technical,
    })
  }

  const parameterSummary = [
    details.policyConfigVersion !== null
      ? `Config version: ${details.policyConfigVersion}.`
      : 'Config version details are temporarily unavailable.',
  ]

  return toPolicyView({
    policyAddress,
    metadata: createBusinessMetadata({
      displayName: policyTitleFromName(details.policyName, 'Protection'),
      shortSummary: 'Protection is active.',
      businessDescription: details.policyDescription ?? 'Details are temporarily unavailable.',
      whyItMatters: 'This protection still affects whether a Vault action is allowed, delayed, or blocked.',
      uiContextNote: 'Policy details are temporarily unavailable.',
      learnMoreHint: 'Try refreshing to load full policy details.',
      ...contextLabels,
      metadataExtras: {
        policyFamily: 'unknown',
      },
    }),
    parameterSummary,
    technical,
  })
}

export function policyDelayReason(details: PolicyRuntimeDetails): string {
  if (details.kind === 'large-transfer-delay') {
    return 'Delayed by large transfer protection.'
  }

  if (details.kind === 'new-receiver-delay') {
    return 'Delayed because the receiver is new.'
  }

  if (details.kind === 'approval-to-new-spender-delay') {
    return 'Delayed because this is a new contract spender approval.'
  }

  if (details.kind === 'erc20-first-new-recipient-delay') {
    return 'Delayed because this is a first ERC-20 transfer to a new recipient.'
  }

  return 'Delayed by an active protection policy.'
}

export function policyBlockReason(details: PolicyRuntimeDetails): string {
  if (details.kind === 'infinite-approval') {
    return 'Blocked because unlimited approval is not allowed.'
  }

  if (details.kind === 'approval-to-new-spender-delay') {
    return 'Blocked because approval to this spender is not allowed by policy.'
  }

  return 'Blocked by an active protection policy.'
}

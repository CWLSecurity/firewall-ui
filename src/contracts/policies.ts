import type { Address, PublicClient } from 'viem'
import { policyIntrospectionAbi } from './abi'
import {
  POLICY_APPROVAL_TO_NEW_SPENDER_DELAY_ADDRESS,
  POLICY_ERC20_FIRST_NEW_RECIPIENT_DELAY_ADDRESS,
  POLICY_INFINITE_APPROVAL_CONSERVATIVE_ADDRESS,
  POLICY_INFINITE_APPROVAL_DEFI_ADDRESS,
  POLICY_LARGE_TRANSFER_DELAY_ADDON_ADDRESS,
  POLICY_LARGE_TRANSFER_DELAY_ADDRESS,
  POLICY_LARGE_TRANSFER_DELAY_DEFI_ADDRESS,
  POLICY_NEW_EOA_RECEIVER_DELAY_ADDRESS,
  POLICY_NEW_RECEIVER_DELAY_ADDON_ADDRESS,
  POLICY_NEW_RECEIVER_DELAY_ADDRESS,
} from './addresses/base'

export type PolicyConfigValueType = 'uint256' | 'bool' | 'address' | 'bytes32' | 'unknown'

export type PolicyConfigEntry = {
  key: string
  rawKey: `0x${string}`
  valueType: PolicyConfigValueType
  rawValue: `0x${string}`
  rawUnit: `0x${string}`
  unit: string
  uintValue: bigint | null
  boolValue: boolean | null
  addressValue: Address | null
  bytes32Value: string | null
}

export type PolicyKind =
  | 'infinite-approval'
  | 'defi-approval'
  | 'large-transfer-delay'
  | 'new-receiver-delay'
  | 'approval-to-new-spender-delay'
  | 'erc20-first-new-recipient-delay'
  | 'unknown'

type PolicyRuntimeCommon = {
  readError: string | null
  policyKey: `0x${string}` | null
  policyName: string | null
  policyDescription: string | null
  policyConfigVersion: number | null
  policyConfig: PolicyConfigEntry[]
}

export type PolicyRuntimeDetails =
  | (PolicyRuntimeCommon & {
      kind: 'infinite-approval'
      allowPermit: boolean | null
      strictNonZeroMode: boolean | null
      approvalLimitFunctional: boolean | null
      legacyApprovalLimit: bigint | null
    })
  | (PolicyRuntimeCommon & {
      kind: 'defi-approval'
      allowPermit: boolean | null
      allowMaxApproval: boolean | null
      blockSetApprovalForAllTrue: boolean | null
    })
  | (PolicyRuntimeCommon & {
      kind: 'large-transfer-delay'
      ethThresholdWei: bigint | null
      erc20ThresholdUnits: bigint | null
      delaySeconds: bigint | null
      comparatorMode: string | null
      selectorScope: string | null
    })
  | (PolicyRuntimeCommon & {
      kind: 'new-receiver-delay'
      delaySeconds: bigint | null
      eoaOnly: boolean | null
      receiverScope: string | null
    })
  | (PolicyRuntimeCommon & {
      kind: 'approval-to-new-spender-delay'
      delaySeconds: bigint | null
      knownScope: string | null
      eoaNonZeroAction: string | null
      newContractAction: string | null
    })
  | (PolicyRuntimeCommon & {
      kind: 'erc20-first-new-recipient-delay'
      delaySeconds: bigint | null
      knownScope: string | null
      selectorScope: string | null
      firstRecipientAction: string | null
    })
  | (PolicyRuntimeCommon & {
      kind: 'unknown'
    })

const POLICY_KEY_INFINITE_APPROVAL = '0xa65d627e59303369e7b4f388a565808b08eca273ff9d9c722aa939933b78d963'
const POLICY_KEY_DEFI_APPROVAL = '0x87b150af2a05b56005ea04e94fb5db71f5e80f9642927af6deef08e9acd06635'
const POLICY_KEY_LARGE_TRANSFER_DELAY = '0xbef8b32671d12321edc6cf9fdd5ca723cb22142120e78b804bd3a169db17e54b'
const POLICY_KEY_NEW_RECEIVER_DELAY = '0x1bd0c2dce1f6acb89d6f11a0e04e91154710d9d43725e31a799e90dd7d6e7981'
const POLICY_KEY_NEW_EOA_RECEIVER_DELAY = '0x6697e7d13c75e9d72de8f4efa74284759c9ba954d068d0812216140b09dcd197'
const POLICY_KEY_APPROVAL_TO_NEW_SPENDER_DELAY = '0x6414c51801a5243dd8022e758af090f7847ab2e18a308a4bdca30ca64965f4e3'
const POLICY_KEY_ERC20_FIRST_NEW_RECIPIENT_DELAY = '0xc8c1b3d5591fa12c07932c7491ffe434236f01b0c3b75c10d089a34b43416841'

// Legacy V2 policy deployments kept for fallback compatibility.
const LEGACY_POLICY_INFINITE_APPROVAL_CONSERVATIVE = '0x5fd8f3d4c40d3c414351f048ba47264d98d29499'
const LEGACY_POLICY_INFINITE_APPROVAL_DEFI = '0x1ef2d6ed582edf016e81c5e51e11c2fae8537207'
const LEGACY_POLICY_APPROVAL_TO_NEW_SPENDER_DELAY = '0x8384b91717c051fede7a6d5ef78cb168d28b92d1'
const LEGACY_POLICY_ERC20_FIRST_NEW_RECIPIENT_DELAY = '0x6e1b5933b94d7cb417b43ebbf905bd3040db15b7'
const LEGACY_POLICY_INFINITE_APPROVAL_ADDON_HARDENING = '0x3077b421c99179c0ae3fa2c9b2cb351a75c0913e'
const LEGACY_POLICY_LARGE_TRANSFER_DELAY = '0xa7c7da123ecbebb11a8f1588486142e1bc1f1226'
const LEGACY_POLICY_LARGE_TRANSFER_DELAY_DEFI = '0x0524d3c7b9825770f5519a2ba100ac9a8bb42de8'
const LEGACY_POLICY_LARGE_TRANSFER_DELAY_ADDON = '0x8c202efbec4ff805f5ad5d1789f0bd0e4193d112'
const LEGACY_POLICY_NEW_RECEIVER_DELAY = '0x32246f347c2509d4d9d3766f6e77472f0929c6b8'
const LEGACY_POLICY_NEW_EOA_RECEIVER_DELAY = '0x22daed61b2fa4d47ddc302ce9a01176855605ace'
const LEGACY_POLICY_NEW_RECEIVER_DELAY_ADDON = '0x87afce45f3b71fe404d5608a78888839ca8109d9'

function kindFromPolicyKey(policyKey: `0x${string}` | null): PolicyKind | null {
  if (!policyKey) {
    return null
  }

  if (policyKey === POLICY_KEY_INFINITE_APPROVAL) return 'infinite-approval'
  if (policyKey === POLICY_KEY_DEFI_APPROVAL) return 'defi-approval'
  if (policyKey === POLICY_KEY_LARGE_TRANSFER_DELAY) return 'large-transfer-delay'
  if (policyKey === POLICY_KEY_NEW_RECEIVER_DELAY || policyKey === POLICY_KEY_NEW_EOA_RECEIVER_DELAY) return 'new-receiver-delay'
  if (policyKey === POLICY_KEY_APPROVAL_TO_NEW_SPENDER_DELAY) return 'approval-to-new-spender-delay'
  if (policyKey === POLICY_KEY_ERC20_FIRST_NEW_RECIPIENT_DELAY) return 'erc20-first-new-recipient-delay'

  return null
}

function kindFromKnownPolicyAddress(policyAddress: Address): Exclude<PolicyKind, 'unknown'> | null {
  const normalized = policyAddress.toLowerCase()

  if (
    normalized === POLICY_INFINITE_APPROVAL_CONSERVATIVE_ADDRESS.toLowerCase()
    || normalized === POLICY_INFINITE_APPROVAL_DEFI_ADDRESS.toLowerCase()
    || normalized === LEGACY_POLICY_INFINITE_APPROVAL_CONSERVATIVE
    || normalized === LEGACY_POLICY_INFINITE_APPROVAL_DEFI
    || normalized === LEGACY_POLICY_INFINITE_APPROVAL_ADDON_HARDENING
  ) {
    if (
      normalized === POLICY_INFINITE_APPROVAL_DEFI_ADDRESS.toLowerCase()
      || normalized === LEGACY_POLICY_INFINITE_APPROVAL_DEFI
    ) {
      return 'defi-approval'
    }
    return 'infinite-approval'
  }

  if (
    normalized === POLICY_APPROVAL_TO_NEW_SPENDER_DELAY_ADDRESS.toLowerCase()
    || normalized === LEGACY_POLICY_APPROVAL_TO_NEW_SPENDER_DELAY
  ) {
    return 'approval-to-new-spender-delay'
  }

  if (
    normalized === POLICY_ERC20_FIRST_NEW_RECIPIENT_DELAY_ADDRESS.toLowerCase()
    || normalized === LEGACY_POLICY_ERC20_FIRST_NEW_RECIPIENT_DELAY
  ) {
    return 'erc20-first-new-recipient-delay'
  }

  if (
    normalized === POLICY_LARGE_TRANSFER_DELAY_ADDRESS.toLowerCase()
    || normalized === POLICY_LARGE_TRANSFER_DELAY_DEFI_ADDRESS.toLowerCase()
    || normalized === POLICY_LARGE_TRANSFER_DELAY_ADDON_ADDRESS.toLowerCase()
    || normalized === LEGACY_POLICY_LARGE_TRANSFER_DELAY
    || normalized === LEGACY_POLICY_LARGE_TRANSFER_DELAY_DEFI
    || normalized === LEGACY_POLICY_LARGE_TRANSFER_DELAY_ADDON
  ) {
    return 'large-transfer-delay'
  }

  if (
    normalized === POLICY_NEW_RECEIVER_DELAY_ADDRESS.toLowerCase()
    || normalized === POLICY_NEW_EOA_RECEIVER_DELAY_ADDRESS.toLowerCase()
    || normalized === POLICY_NEW_RECEIVER_DELAY_ADDON_ADDRESS.toLowerCase()
    || normalized === LEGACY_POLICY_NEW_RECEIVER_DELAY
    || normalized === LEGACY_POLICY_NEW_EOA_RECEIVER_DELAY
    || normalized === LEGACY_POLICY_NEW_RECEIVER_DELAY_ADDON
  ) {
    return 'new-receiver-delay'
  }

  return null
}

function withFallbackKind(
  common: PolicyRuntimeCommon,
  fallbackKind: Exclude<PolicyKind, 'unknown'> | null,
): PolicyRuntimeDetails {
  if (fallbackKind === 'infinite-approval') {
    return {
      ...common,
      kind: 'infinite-approval',
      allowPermit: null,
      strictNonZeroMode: null,
      approvalLimitFunctional: null,
      legacyApprovalLimit: null,
    }
  }

  if (fallbackKind === 'defi-approval') {
    return {
      ...common,
      kind: 'defi-approval',
      allowPermit: null,
      allowMaxApproval: null,
      blockSetApprovalForAllTrue: null,
    }
  }

  if (fallbackKind === 'large-transfer-delay') {
    return {
      ...common,
      kind: 'large-transfer-delay',
      ethThresholdWei: null,
      erc20ThresholdUnits: null,
      delaySeconds: null,
      comparatorMode: null,
      selectorScope: null,
    }
  }

  if (fallbackKind === 'new-receiver-delay') {
    return {
      ...common,
      kind: 'new-receiver-delay',
      delaySeconds: null,
      eoaOnly: null,
      receiverScope: null,
    }
  }

  if (fallbackKind === 'approval-to-new-spender-delay') {
    return {
      ...common,
      kind: 'approval-to-new-spender-delay',
      delaySeconds: null,
      knownScope: null,
      eoaNonZeroAction: null,
      newContractAction: null,
    }
  }

  if (fallbackKind === 'erc20-first-new-recipient-delay') {
    return {
      ...common,
      kind: 'erc20-first-new-recipient-delay',
      delaySeconds: null,
      knownScope: null,
      selectorScope: null,
      firstRecipientAction: null,
    }
  }

  return {
    ...common,
    kind: 'unknown',
  }
}

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value
  }

  if (
    typeof value === 'bigint'
    && value >= 0n
    && value <= BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    return Number(value)
  }

  return null
}

function asBytes32(value: unknown): `0x${string}` | null {
  if (typeof value !== 'string') {
    return null
  }

  if (!/^0x[a-fA-F0-9]{64}$/.test(value)) {
    return null
  }

  return value.toLowerCase() as `0x${string}`
}

function decodeBytes32Text(value: `0x${string}`): string {
  const hex = value.slice(2).replace(/(00)+$/, '')
  if (hex.length === 0) {
    return ''
  }

  try {
    const bytes = new Uint8Array(hex.length / 2)
    for (let index = 0; index < hex.length; index += 2) {
      bytes[index / 2] = Number.parseInt(hex.slice(index, index + 2), 16)
    }

    return new TextDecoder().decode(bytes).trim()
  } catch {
    return ''
  }
}

function parseValueType(value: unknown): PolicyConfigValueType {
  if (value === 0 || value === 0n) return 'uint256'
  if (value === 1 || value === 1n) return 'bool'
  if (value === 2 || value === 2n) return 'address'
  if (value === 3 || value === 3n) return 'bytes32'
  return 'unknown'
}

function parseEntry(value: unknown): PolicyConfigEntry | null {
  let rawKey: unknown
  let rawType: unknown
  let rawValue: unknown
  let rawUnit: unknown

  if (Array.isArray(value)) {
    ;[rawKey, rawType, rawValue, rawUnit] = value
  } else if (value && typeof value === 'object') {
    const objectValue = value as Record<string, unknown>
    rawKey = objectValue.key
    rawType = objectValue.valueType
    rawValue = objectValue.value
    rawUnit = objectValue.unit
  } else {
    return null
  }

  const keyHex = asBytes32(rawKey)
  const valueHex = asBytes32(rawValue)
  const unitHex = asBytes32(rawUnit)
  if (!keyHex || !valueHex || !unitHex) {
    return null
  }

  const valueType = parseValueType(rawType)
  const uintValue = valueType === 'uint256' || valueType === 'bool' || valueType === 'address'
    ? BigInt(valueHex)
    : null

  return {
    key: decodeBytes32Text(keyHex),
    rawKey: keyHex,
    valueType,
    rawValue: valueHex,
    rawUnit: unitHex,
    unit: decodeBytes32Text(unitHex),
    uintValue,
    boolValue: valueType === 'bool' ? uintValue !== null && uintValue !== 0n : null,
    addressValue:
      valueType === 'address'
        ? (`0x${valueHex.slice(26)}` as Address)
        : null,
    bytes32Value: valueType === 'bytes32' ? decodeBytes32Text(valueHex) : null,
  }
}

function parsePolicyConfigEntries(value: unknown): PolicyConfigEntry[] {
  if (!Array.isArray(value)) {
    return []
  }

  const entries: PolicyConfigEntry[] = []
  for (const item of value) {
    const parsed = parseEntry(item)
    if (parsed) {
      entries.push(parsed)
    }
  }

  return entries
}

function findConfigEntry(entries: PolicyConfigEntry[], key: string): PolicyConfigEntry | null {
  return entries.find((entry) => entry.key === key) ?? null
}

function getConfigBool(entries: PolicyConfigEntry[], key: string): boolean | null {
  return findConfigEntry(entries, key)?.boolValue ?? null
}

function getConfigUint(entries: PolicyConfigEntry[], key: string): bigint | null {
  return findConfigEntry(entries, key)?.uintValue ?? null
}

function getConfigBytes32Text(entries: PolicyConfigEntry[], key: string): string | null {
  const entry = findConfigEntry(entries, key)
  if (!entry) {
    return null
  }

  return entry.bytes32Value ?? null
}

function resolveKindFromIntrospection(params: {
  policyKey: `0x${string}` | null
  policyName: string | null
  entries: PolicyConfigEntry[]
}): PolicyKind {
  const byPolicyKey = kindFromPolicyKey(params.policyKey)
  if (byPolicyKey) {
    return byPolicyKey
  }

  const normalizedName = params.policyName?.trim().toLowerCase() ?? ''

  if (normalizedName === 'infiniteapprovalpolicy') {
    return 'infinite-approval'
  }

  if (normalizedName === 'defiapprovalpolicy') {
    return 'defi-approval'
  }

  if (normalizedName === 'largetransferdelaypolicy') {
    return 'large-transfer-delay'
  }

  if (normalizedName === 'newreceiverdelaypolicy' || normalizedName === 'neweoareceiverdelaypolicy') {
    return 'new-receiver-delay'
  }

  if (normalizedName === 'approvaltonewspenderdelaypolicy') {
    return 'approval-to-new-spender-delay'
  }

  if (normalizedName === 'erc20firstnewrecipientdelaypolicy') {
    return 'erc20-first-new-recipient-delay'
  }

  const keys = new Set(params.entries.map((entry) => entry.key))

  if (keys.has('eth_threshold_wei') || keys.has('erc20_threshold_units')) {
    return 'large-transfer-delay'
  }

  if (keys.has('delay_seconds') && keys.has('eoa_only')) {
    return 'new-receiver-delay'
  }

  if (keys.has('delay_seconds') && keys.has('known_scope')) {
    if (keys.has('eoa_nonzero_action')) {
      return 'approval-to-new-spender-delay'
    }

    if (keys.has('first_recipient_action')) {
      return 'erc20-first-new-recipient-delay'
    }
  }

  if (keys.has('allow_max_approval') && keys.has('allow_permit')) {
    return 'defi-approval'
  }

  if (keys.has('strict_nonzero_mode') || keys.has('legacy_approval_limit')) {
    return 'infinite-approval'
  }

  return 'unknown'
}

function isTransientPolicyReadError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase()
  return (
    message.includes('503')
    || message.includes('429')
    || message.includes('rate limit')
    || message.includes('too many requests')
    || message.includes('no backend is currently healthy')
    || message.includes('gateway')
    || message.includes('temporarily unavailable')
    || message.includes('timeout')
    || message.includes('network')
    || message.includes('fetch')
  )
}

async function waitMs(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function readPolicyFieldWithRetry(params: {
  publicClient: Pick<PublicClient, 'readContract'>
  policyAddress: Address
  functionName: 'policyKey' | 'policyName' | 'policyDescription' | 'policyConfigVersion' | 'policyConfig'
}): Promise<unknown> {
  const retryDelaysMs = [250, 700] as const
  let lastError: unknown = null

  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
    try {
      return await params.publicClient.readContract({
        address: params.policyAddress,
        abi: policyIntrospectionAbi,
        functionName: params.functionName,
      })
    } catch (error) {
      lastError = error
      const canRetry = attempt < retryDelaysMs.length && isTransientPolicyReadError(error)
      if (!canRetry) {
        return null
      }
      await waitMs(retryDelaysMs[attempt])
    }
  }

  if (lastError) {
    return null
  }

  return null
}

export async function readPolicyRuntimeDetails(params: {
  publicClient: Pick<PublicClient, 'readContract'>
  policyAddress: Address
}): Promise<PolicyRuntimeDetails> {
  const [policyKeyRaw, policyNameRaw, policyDescriptionRaw, policyConfigVersionRaw, policyConfigRaw] =
    await Promise.all([
      readPolicyFieldWithRetry({
        publicClient: params.publicClient,
        policyAddress: params.policyAddress,
        functionName: 'policyKey',
      }),
      readPolicyFieldWithRetry({
        publicClient: params.publicClient,
        policyAddress: params.policyAddress,
        functionName: 'policyName',
      }),
      readPolicyFieldWithRetry({
        publicClient: params.publicClient,
        policyAddress: params.policyAddress,
        functionName: 'policyDescription',
      }),
      readPolicyFieldWithRetry({
        publicClient: params.publicClient,
        policyAddress: params.policyAddress,
        functionName: 'policyConfigVersion',
      }),
      readPolicyFieldWithRetry({
        publicClient: params.publicClient,
        policyAddress: params.policyAddress,
        functionName: 'policyConfig',
      }),
    ])

  const policyKey = asBytes32(policyKeyRaw)
  const policyName = typeof policyNameRaw === 'string' && policyNameRaw.trim().length > 0
    ? policyNameRaw.trim()
    : null
  const policyDescription = typeof policyDescriptionRaw === 'string' && policyDescriptionRaw.trim().length > 0
    ? policyDescriptionRaw.trim()
    : null
  const policyConfigVersion = parseNumber(policyConfigVersionRaw)
  const policyConfig = parsePolicyConfigEntries(policyConfigRaw)

  const hasAnyIntrospectionData = Boolean(
    policyKey
    || policyName
    || policyDescription
    || policyConfigVersion !== null
    || policyConfig.length > 0,
  )

  const fallbackKind = kindFromKnownPolicyAddress(params.policyAddress)

  const commonBase: PolicyRuntimeCommon = {
    readError: hasAnyIntrospectionData ? null : 'Policy details temporarily unavailable.',
    policyKey,
    policyName,
    policyDescription,
    policyConfigVersion,
    policyConfig,
  }

  if (!hasAnyIntrospectionData) {
    return withFallbackKind(commonBase, fallbackKind)
  }

  const common = commonBase

  const kind = resolveKindFromIntrospection({
    policyKey,
    policyName,
    entries: policyConfig,
  })

  if (kind === 'unknown' && fallbackKind) {
    return withFallbackKind(common, fallbackKind)
  }

  if (kind === 'infinite-approval') {
    return {
      ...common,
      kind,
      allowPermit: getConfigBool(policyConfig, 'allow_permit'),
      strictNonZeroMode: getConfigBool(policyConfig, 'strict_nonzero_mode'),
      approvalLimitFunctional: getConfigBool(policyConfig, 'approval_limit_functional'),
      legacyApprovalLimit: getConfigUint(policyConfig, 'legacy_approval_limit'),
    }
  }

  if (kind === 'defi-approval') {
    return {
      ...common,
      kind,
      allowPermit: getConfigBool(policyConfig, 'allow_permit'),
      allowMaxApproval: getConfigBool(policyConfig, 'allow_max_approval'),
      blockSetApprovalForAllTrue: getConfigBool(policyConfig, 'block_setapproval_true'),
    }
  }

  if (kind === 'large-transfer-delay') {
    return {
      ...common,
      kind,
      ethThresholdWei: getConfigUint(policyConfig, 'eth_threshold_wei'),
      erc20ThresholdUnits: getConfigUint(policyConfig, 'erc20_threshold_units'),
      delaySeconds: getConfigUint(policyConfig, 'delay_seconds'),
      comparatorMode: getConfigBytes32Text(policyConfig, 'comparator_mode'),
      selectorScope: getConfigBytes32Text(policyConfig, 'selector_scope'),
    }
  }

  if (kind === 'new-receiver-delay') {
    return {
      ...common,
      kind,
      delaySeconds: getConfigUint(policyConfig, 'delay_seconds'),
      eoaOnly: getConfigBool(policyConfig, 'eoa_only'),
      receiverScope: getConfigBytes32Text(policyConfig, 'receiver_scope'),
    }
  }

  if (kind === 'approval-to-new-spender-delay') {
    return {
      ...common,
      kind,
      delaySeconds: getConfigUint(policyConfig, 'delay_seconds'),
      knownScope: getConfigBytes32Text(policyConfig, 'known_scope'),
      eoaNonZeroAction: getConfigBytes32Text(policyConfig, 'eoa_nonzero_action'),
      newContractAction: getConfigBytes32Text(policyConfig, 'new_contract_action'),
    }
  }

  if (kind === 'erc20-first-new-recipient-delay') {
    return {
      ...common,
      kind,
      delaySeconds: getConfigUint(policyConfig, 'delay_seconds'),
      knownScope: getConfigBytes32Text(policyConfig, 'known_scope'),
      selectorScope: getConfigBytes32Text(policyConfig, 'selector_scope'),
      firstRecipientAction: getConfigBytes32Text(policyConfig, 'first_recipient_action'),
    }
  }

  return {
    ...common,
    kind: 'unknown',
  }
}

import { keccak256, parseAbi, stringToHex, toHex, type Address, type Hex, type PublicClient } from 'viem'
import { POLICY_PACK_REGISTRY_ADDRESS } from './addresses/base'

const firewallModuleProbeAbi = parseAbi([
  'function getScheduled(bytes32 txId) view returns (bool exists, bool executed, address to, uint256 value, uint48 unlockTime, bytes32 dataHash)',
])

const firewallModuleViewProbeAbi = parseAbi([
  'function router() view returns (address)',
  'function owner() view returns (address)',
])

const policyRouterProbeAbi = parseAbi([
  'function firewallModule() view returns (address)',
  'function basePackId() view returns (uint256)',
  'function policyPackRegistry() view returns (address)',
])

const ZERO_BYTES32 = `0x${'0'.repeat(64)}` as const
const FIREWALL_STORAGE_SLOT = BigInt(keccak256(stringToHex('firewall.vault.storage.v1'))) - 1n
const BYTECODE_RETRY_DELAYS_MS = [300, 900, 1800] as const
const ROUTER_READ_RETRY_DELAYS_MS = [250, 700, 1400] as const
const LEGACY_POLICY_PACK_REGISTRY_ADDRESS = '0xdd63a2ecd5E7F029873598d1f708D64e89428c00' as Address
const CURRENT_ALT_POLICY_PACK_REGISTRY_ADDRESS = '0xCc68d5dCF2Dcdf8fa948FF255cF21E12D6eBd3Df' as Address
const KNOWN_POLICY_PACK_REGISTRY_ADDRESSES: readonly Address[] = [
  POLICY_PACK_REGISTRY_ADDRESS,
  LEGACY_POLICY_PACK_REGISTRY_ADDRESS,
  CURRENT_ALT_POLICY_PACK_REGISTRY_ADDRESS,
]

type WalletImportVerification =
  | {
      ok: true
      basePackId: number | null
    }
  | {
      ok: false
      reason: string
    }

type VerifyWalletQuickParams = {
  publicClient: Pick<PublicClient, 'getBytecode' | 'getStorageAt' | 'readContract'>
  ownerAddress: Address
  walletAddress: Address
}

function normalizeHexStorageWord(value: Hex | undefined): string | null {
  if (!value) {
    return null
  }

  const stripped = value.slice(2).toLowerCase()
  return stripped.padStart(64, '0')
}

function decodeAddressFromStorageWord(value: Hex | undefined): Address | null {
  const normalized = normalizeHexStorageWord(value)
  if (!normalized) {
    return null
  }

  const addressHex = normalized.slice(24)
  if (/^0{40}$/.test(addressHex)) {
    return null
  }

  return `0x${addressHex}` as Address
}

function sameAddress(left: Address, right: Address): boolean {
  return left.toLowerCase() === right.toLowerCase()
}

function isKnownPolicyPackRegistryAddress(address: Address): boolean {
  return KNOWN_POLICY_PACK_REGISTRY_ADDRESSES.some((knownAddress) => sameAddress(knownAddress, address))
}

function formatKnownPolicyPackRegistryAddresses(): string {
  return KNOWN_POLICY_PACK_REGISTRY_ADDRESSES.join(', ')
}

function parseBasePackId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value
  }
  if (typeof value === 'bigint' && value >= 0n && value <= BigInt(Number.MAX_SAFE_INTEGER)) {
    return Number(value)
  }
  return null
}

function isAddressLike(value: unknown): value is Address {
  return typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value)
}

async function waitMs(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function readBytecodeWithRetry(params: {
  publicClient: Pick<PublicClient, 'getBytecode'>
  address: Address
}): Promise<Hex | null> {
  let lastCode: Hex | null = null

  for (let attempt = 0; attempt <= BYTECODE_RETRY_DELAYS_MS.length; attempt += 1) {
    const code = await params.publicClient.getBytecode({ address: params.address })
    const normalized = (code ?? null) as Hex | null
    lastCode = normalized

    if (normalized && normalized !== '0x') {
      return normalized
    }

    if (attempt < BYTECODE_RETRY_DELAYS_MS.length) {
      await waitMs(BYTECODE_RETRY_DELAYS_MS[attempt])
    }
  }

  return lastCode
}

function isTransientRpcError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase()
  return (
    message.includes('503')
    || message.includes('no backend is currently healthy')
    || message.includes('gateway')
    || message.includes('temporarily unavailable')
    || message.includes('timeout')
    || message.includes('network')
    || message.includes('fetch')
    || message.includes('http request failed')
  )
}

async function readRouterValidationTupleWithRetry(params: {
  publicClient: Pick<PublicClient, 'readContract'>
  routerAddress: Address
}): Promise<{
  routerWallet: unknown
  basePackIdRaw: unknown
  registryAddressRaw: unknown
} | null> {
  let lastError: unknown = null

  for (let attempt = 0; attempt <= ROUTER_READ_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const [routerWallet, basePackIdRaw, registryAddressRaw] = await Promise.all([
        params.publicClient.readContract({
          address: params.routerAddress,
          abi: policyRouterProbeAbi,
          functionName: 'firewallModule',
        }),
        params.publicClient.readContract({
          address: params.routerAddress,
          abi: policyRouterProbeAbi,
          functionName: 'basePackId',
        }),
        params.publicClient.readContract({
          address: params.routerAddress,
          abi: policyRouterProbeAbi,
          functionName: 'policyPackRegistry',
        }),
      ])

      return {
        routerWallet,
        basePackIdRaw,
        registryAddressRaw,
      }
    } catch (error) {
      lastError = error
      const canRetry = attempt < ROUTER_READ_RETRY_DELAYS_MS.length && isTransientRpcError(error)
      if (!canRetry) {
        break
      }
      await waitMs(ROUTER_READ_RETRY_DELAYS_MS[attempt])
    }
  }

  void lastError
  return null
}

function parseRouterValidationTuple(value: {
  routerWallet: unknown
  basePackIdRaw: unknown
  registryAddressRaw: unknown
} | null, params: {
  walletAddress: Address
}): WalletImportVerification {
  if (!value) {
    return { ok: false, reason: 'Router validation failed for this wallet.' }
  }

  const { routerWallet, basePackIdRaw, registryAddressRaw } = value

  if (typeof routerWallet !== 'string' || !sameAddress(routerWallet as Address, params.walletAddress)) {
    return { ok: false, reason: 'Router is not linked to this Firewall Vault wallet.' }
  }

  if (
    typeof registryAddressRaw !== 'string'
    || !isKnownPolicyPackRegistryAddress(registryAddressRaw as Address)
  ) {
    return {
      ok: false,
      reason: `Wallet is not linked to the official Firewall Vault registry. Actual registry: ${typeof registryAddressRaw === 'string' ? registryAddressRaw : 'unreadable'}. Accepted registries: ${formatKnownPolicyPackRegistryAddresses()}.`,
    }
  }

  return {
    ok: true,
    basePackId: parseBasePackId(basePackIdRaw),
  }
}

export async function verifyImportedFirewallWalletQuick(params: VerifyWalletQuickParams): Promise<WalletImportVerification> {
  const walletCode = await params.publicClient.getBytecode({
    address: params.walletAddress,
  })
  if (!walletCode || walletCode === '0x') {
    return { ok: false, reason: 'No contract code found at this address.' }
  }

  let ownerFromView: Address | null = null
  let routerFromView: Address | null = null

  const [ownerResult, routerResult] = await Promise.allSettled([
    params.publicClient.readContract({
      address: params.walletAddress,
      abi: firewallModuleViewProbeAbi,
      functionName: 'owner',
    }),
    params.publicClient.readContract({
      address: params.walletAddress,
      abi: firewallModuleViewProbeAbi,
      functionName: 'router',
    }),
  ])
  if (ownerResult.status === 'fulfilled') {
    const ownerRaw = ownerResult.value
    if (isAddressLike(ownerRaw) && !/^0x0{40}$/i.test(ownerRaw)) {
      ownerFromView = ownerRaw
    }
  }
  if (routerResult.status === 'fulfilled') {
    const routerRaw = routerResult.value
    if (isAddressLike(routerRaw) && !/^0x0{40}$/i.test(routerRaw)) {
      routerFromView = routerRaw
    }
  }

  const [routerStorageWord, ownerStorageWord] = await Promise.all([
    params.publicClient.getStorageAt({
      address: params.walletAddress,
      slot: toHex(FIREWALL_STORAGE_SLOT),
    }),
    params.publicClient.getStorageAt({
      address: params.walletAddress,
      slot: toHex(FIREWALL_STORAGE_SLOT + 1n),
    }),
  ])

  const routerInStorage = decodeAddressFromStorageWord(routerStorageWord)
  const ownerInStorage = decodeAddressFromStorageWord(ownerStorageWord)

  const ownerResolved = ownerFromView ?? ownerInStorage
  if (!ownerResolved) {
    return { ok: false, reason: 'Firewall Vault owner could not be verified from contract state.' }
  }

  if (!sameAddress(ownerResolved, params.ownerAddress)) {
    return { ok: false, reason: 'Imported wallet owner does not match the connected owner.' }
  }

  const routerAddress = routerFromView ?? routerInStorage
  if (!routerAddress) {
    return { ok: false, reason: 'Firewall Vault router is not initialized for this wallet.' }
  }

  const routerCode = await params.publicClient.getBytecode({
    address: routerAddress,
  })
  if (!routerCode || routerCode === '0x') {
    return { ok: false, reason: 'Router contract code is missing for this wallet.' }
  }

  try {
    const [routerWallet, basePackIdRaw, registryAddressRaw] = await Promise.all([
      params.publicClient.readContract({
        address: routerAddress,
        abi: policyRouterProbeAbi,
        functionName: 'firewallModule',
      }),
      params.publicClient.readContract({
        address: routerAddress,
        abi: policyRouterProbeAbi,
        functionName: 'basePackId',
      }),
      params.publicClient.readContract({
        address: routerAddress,
        abi: policyRouterProbeAbi,
        functionName: 'policyPackRegistry',
      }),
    ])

    return parseRouterValidationTuple({
      routerWallet,
      basePackIdRaw,
      registryAddressRaw,
    }, {
      walletAddress: params.walletAddress,
    })
  } catch {
    return { ok: false, reason: 'Router validation failed for this wallet.' }
  }
}

export async function verifyImportedFirewallWallet(params: {
  publicClient: Pick<PublicClient, 'getBytecode' | 'getStorageAt' | 'readContract'>
  ownerAddress: Address
  walletAddress: Address
}): Promise<WalletImportVerification> {
  const walletCode = await readBytecodeWithRetry({
    publicClient: params.publicClient,
    address: params.walletAddress,
  })
  if (!walletCode || walletCode === '0x') {
    return { ok: false, reason: 'No contract code found at this address.' }
  }

  let moduleInterfaceConfirmed = false
  try {
    await params.publicClient.readContract({
      address: params.walletAddress,
      abi: firewallModuleProbeAbi,
      functionName: 'getScheduled',
      args: [ZERO_BYTES32],
    })
    moduleInterfaceConfirmed = true
  } catch {
    moduleInterfaceConfirmed = false
  }

  let ownerFromView: Address | null = null
  let routerFromView: Address | null = null
  if (!moduleInterfaceConfirmed) {
    try {
      const ownerRaw = await params.publicClient.readContract({
        address: params.walletAddress,
        abi: firewallModuleViewProbeAbi,
        functionName: 'owner',
      })
      if (isAddressLike(ownerRaw) && !/^0x0{40}$/i.test(ownerRaw)) {
        ownerFromView = ownerRaw
        moduleInterfaceConfirmed = true
      }
    } catch {
      // Keep fallback verification path.
    }

    try {
      const routerRaw = await params.publicClient.readContract({
        address: params.walletAddress,
        abi: firewallModuleViewProbeAbi,
        functionName: 'router',
      })
      if (isAddressLike(routerRaw) && !/^0x0{40}$/i.test(routerRaw)) {
        routerFromView = routerRaw
        moduleInterfaceConfirmed = true
      }
    } catch {
      // Keep fallback verification path.
    }
  }

  const [routerStorageWord, ownerStorageWord] = await Promise.all([
    params.publicClient.getStorageAt({
      address: params.walletAddress,
      slot: toHex(FIREWALL_STORAGE_SLOT),
    }),
    params.publicClient.getStorageAt({
      address: params.walletAddress,
      slot: toHex(FIREWALL_STORAGE_SLOT + 1n),
    }),
  ])

  const routerInStorage = decodeAddressFromStorageWord(routerStorageWord)
  const ownerInStorage = decodeAddressFromStorageWord(ownerStorageWord)
  if (!moduleInterfaceConfirmed && !routerInStorage && !ownerInStorage) {
    return { ok: false, reason: 'Address is not a Firewall Vault contract.' }
  }

  const ownerResolved = ownerFromView ?? ownerInStorage
  if (!ownerResolved) {
    return { ok: false, reason: 'Firewall Vault owner could not be verified from contract state.' }
  }

  if (!sameAddress(ownerResolved, params.ownerAddress)) {
    return { ok: false, reason: 'Imported wallet owner does not match the connected owner.' }
  }

  const routerAddress = routerFromView ?? routerInStorage
  if (!routerAddress) {
    return { ok: false, reason: 'Firewall Vault router is not initialized for this wallet.' }
  }

  const routerCode = await readBytecodeWithRetry({
    publicClient: params.publicClient,
    address: routerAddress,
  })
  if (!routerCode || routerCode === '0x') {
    return { ok: false, reason: 'Router contract code is missing for this wallet.' }
  }

  const routerValidationTuple = await readRouterValidationTupleWithRetry({
    publicClient: params.publicClient,
    routerAddress,
  })
  return parseRouterValidationTuple(routerValidationTuple, {
    walletAddress: params.walletAddress,
  })
}

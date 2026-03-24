import { parseAbi, type Address, type PublicClient } from 'viem'

export const policyRouterAbi = parseAbi([
  'function firewallModule() view returns (address)',
  'function basePackId() view returns (uint256)',
  'function policyPackRegistry() view returns (address)',
  'function policyCount() view returns (uint256)',
  'function policies(uint256 index) view returns (address)',
  'function evaluate(address vault, address to, uint256 value, bytes data) view returns (uint8 decision, uint48 delaySeconds)',
  'function addonPackCount() view returns (uint256)',
  'function enabledAddonPackAt(uint256 index) view returns (uint256)',
  'function isAddonPackEnabled(uint256 packId) view returns (bool)',
  'function enableAddonPack(uint256 packId)',
])

export type RouterDecision = 'allow' | 'delay' | 'revert' | 'unknown'

export function getPolicyRouterConfig(routerAddress: Address) {
  return {
    address: routerAddress,
    abi: policyRouterAbi,
  } as const
}

export function decodeRouterDecision(value: unknown): RouterDecision {
  if (value === 0 || value === 0n) return 'allow'
  if (value === 1 || value === 1n) return 'delay'
  if (value === 2 || value === 2n) return 'revert'
  return 'unknown'
}

function parsePackId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value
  }

  if (typeof value === 'bigint' && value >= 0n && value <= BigInt(Number.MAX_SAFE_INTEGER)) {
    return Number(value)
  }

  return null
}

export async function readEnabledAddonPackIds(params: {
  publicClient: Pick<PublicClient, 'readContract'>
  routerAddress: Address
}): Promise<number[]> {
  const countRaw = await params.publicClient.readContract({
    ...getPolicyRouterConfig(params.routerAddress),
    functionName: 'addonPackCount',
  })

  if (typeof countRaw !== 'bigint' && typeof countRaw !== 'number') {
    return []
  }

  const count = typeof countRaw === 'number' ? countRaw : Number(countRaw)
  if (!Number.isFinite(count) || count <= 0) {
    return []
  }

  const packIdsRaw = await Promise.all(
    Array.from({ length: count }, (_, index) =>
      params.publicClient.readContract({
        ...getPolicyRouterConfig(params.routerAddress),
        functionName: 'enabledAddonPackAt',
        args: [BigInt(index)],
      }),
    ),
  )

  const packIds: number[] = []
  for (const packIdRaw of packIdsRaw) {
    const parsed = parsePackId(packIdRaw)
    if (parsed !== null) {
      packIds.push(parsed)
    }
  }

  return Array.from(new Set(packIds))
}

export async function readAddonPackEnabledById(params: {
  publicClient: Pick<PublicClient, 'readContract'>
  routerAddress: Address
  packIds: number[]
}): Promise<Map<number, boolean | null>> {
  const entries = await Promise.all(
    params.packIds.map(async (packId) => {
      try {
        const raw = await params.publicClient.readContract({
          ...getPolicyRouterConfig(params.routerAddress),
          functionName: 'isAddonPackEnabled',
          args: [BigInt(packId)],
        })

        if (typeof raw === 'boolean') {
          return [packId, raw] as const
        }

        if (raw === 0 || raw === 0n) {
          return [packId, false] as const
        }

        if (raw === 1 || raw === 1n) {
          return [packId, true] as const
        }

        return [packId, null] as const
      } catch {
        return [packId, null] as const
      }
    }),
  )

  return new Map<number, boolean | null>(entries)
}

export async function readActivePolicyAddresses(params: {
  publicClient: Pick<PublicClient, 'readContract'>
  routerAddress: Address
}): Promise<Address[]> {
  const countRaw = await params.publicClient.readContract({
    ...getPolicyRouterConfig(params.routerAddress),
    functionName: 'policyCount',
  })

  if (typeof countRaw !== 'bigint' && typeof countRaw !== 'number') {
    return []
  }

  const count = typeof countRaw === 'number' ? countRaw : Number(countRaw)
  if (!Number.isFinite(count) || count <= 0) {
    return []
  }

  const policyAddressesRaw = await Promise.all(
    Array.from({ length: count }, (_, index) =>
      params.publicClient.readContract({
        ...getPolicyRouterConfig(params.routerAddress),
        functionName: 'policies',
        args: [BigInt(index)],
      }),
    ),
  )

  const policyAddresses: Address[] = []
  for (const value of policyAddressesRaw) {
    if (typeof value === 'string' && /^0x[a-fA-F0-9]{40}$/.test(value)) {
      policyAddresses.push(value as Address)
    }
  }

  return Array.from(new Set(policyAddresses.map((value) => value.toLowerCase())))
    .map((lower) => lower as Address)
}

export async function evaluateIntent(params: {
  publicClient: Pick<PublicClient, 'readContract'>
  routerAddress: Address
  vaultAddress: Address
  to: Address
  value: bigint
  data: `0x${string}`
}): Promise<{ decision: RouterDecision; delaySeconds: bigint | null }> {
  const result = await params.publicClient.readContract({
    ...getPolicyRouterConfig(params.routerAddress),
    functionName: 'evaluate',
    args: [params.vaultAddress, params.to, params.value, params.data],
  })

  if (!Array.isArray(result) || result.length < 2) {
    return { decision: 'unknown', delaySeconds: null }
  }

  const [decisionRaw, delayRaw] = result as readonly [unknown, unknown]

  return {
    decision: decodeRouterDecision(decisionRaw),
    delaySeconds: typeof delayRaw === 'bigint' ? delayRaw : null,
  }
}

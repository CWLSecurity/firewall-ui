import type { Address, PublicClient } from 'viem'
import { entitlementManagerAbi, policyPackRegistryAbi } from './abi'
import {
  BASE_PACK_CONSERVATIVE_ID,
  BASE_PACK_DEFI_ID,
  POLICY_PACK_REGISTRY_ADDRESS,
  SIMPLE_ENTITLEMENT_MANAGER_ADDRESS,
} from './addresses/base'
import { ADDON_PACK_CANDIDATE_IDS } from './runtimeConfig'

export const registryConfig = {
  address: POLICY_PACK_REGISTRY_ADDRESS,
  abi: policyPackRegistryAbi,
} as const

export const entitlementManagerConfig = {
  address: SIMPLE_ENTITLEMENT_MANAGER_ADDRESS,
  abi: entitlementManagerAbi,
} as const

export type PackType = 'base' | 'addon'
export type PackAccessMode = 'free' | 'entitled'

export type RegistryPack = {
  id: number
  packType: PackType
  packAccessMode: PackAccessMode
  isActive: boolean
  slug: string
  version: number
  metadata: `0x${string}`
  policyCount: number
  policies: Address[]
}

export type AddonPackView = {
  pack: RegistryPack
  entitled: boolean | null
}

export type PackCatalogSnapshot = {
  basePacks: RegistryPack[]
  addonPacks: AddonPackView[]
  candidateAddonPackIds: number[]
}

function normalizePackType(value: unknown): PackType | null {
  if (value === 0 || value === 0n) return 'base'
  if (value === 1 || value === 1n) return 'addon'
  return null
}

function normalizePackAccessMode(value: unknown): PackAccessMode | null {
  if (value === 0 || value === 0n) return 'free'
  if (value === 1 || value === 1n) return 'entitled'
  return null
}

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) return value
  if (
    typeof value === 'bigint'
    && value >= 0n
    && value <= BigInt(Number.MAX_SAFE_INTEGER)
  ) {
    return Number(value)
  }
  return null
}

type PackMetaTuple = {
  isActive: boolean
  packType: PackType
  packAccessMode: PackAccessMode
  metadata: `0x${string}`
  slug: string
  version: number
  policyCount: number
}

function normalizePackMetaTuple(value: unknown): PackMetaTuple | null {
  const tuple = Array.isArray(value) ? value : null
  if (!tuple || tuple.length < 7) {
    return null
  }

  const [isActiveRaw, packTypeRaw, packAccessModeRaw, metadataRaw, slugRaw, versionRaw, policyCountRaw] = tuple
  const packType = normalizePackType(packTypeRaw)
  const packAccessMode = normalizePackAccessMode(packAccessModeRaw)
  const version = parseNumber(versionRaw)
  const policyCount = parseNumber(policyCountRaw)

  if (!packType || !packAccessMode || version === null || policyCount === null) {
    return null
  }

  return {
    isActive: Boolean(isActiveRaw),
    packType,
    packAccessMode,
    metadata: typeof metadataRaw === 'string' ? (metadataRaw as `0x${string}`) : '0x',
    slug: typeof slugRaw === 'string' ? slugRaw : '',
    version,
    policyCount,
  }
}

export async function readPackById(params: {
  publicClient: Pick<PublicClient, 'readContract'>
  packId: number
}): Promise<RegistryPack | null> {
  const id = BigInt(params.packId)

  try {
    const [packMetaRaw, policiesRaw] =
      await Promise.all([
        params.publicClient.readContract({
          ...registryConfig,
          functionName: 'getPackMeta',
          args: [id],
        }),
        params.publicClient.readContract({
          ...registryConfig,
          functionName: 'getPackPolicies',
          args: [id],
        }),
      ])

    const packMeta = normalizePackMetaTuple(packMetaRaw)
    if (!packMeta) {
      return null
    }

    const policies = Array.isArray(policiesRaw)
      ? policiesRaw.filter((policy): policy is Address =>
          typeof policy === 'string' && /^0x[a-fA-F0-9]{40}$/.test(policy),
        )
      : []

    return {
      id: params.packId,
      packType: packMeta.packType,
      packAccessMode: packMeta.packAccessMode,
      isActive: packMeta.isActive,
      slug: packMeta.slug,
      version: packMeta.version,
      metadata: packMeta.metadata,
      policyCount: packMeta.policyCount,
      policies,
    }
  } catch {
    try {
      const [packTypeRaw, packAccessModeRaw, isActiveRaw, metadataRaw, policyCountRaw, policiesRaw] =
        await Promise.all([
          params.publicClient.readContract({
            ...registryConfig,
            functionName: 'packTypeOf',
            args: [id],
          }),
          params.publicClient.readContract({
            ...registryConfig,
            functionName: 'packAccessModeOf',
            args: [id],
          }),
          params.publicClient.readContract({
            ...registryConfig,
            functionName: 'isPackActive',
            args: [id],
          }),
          params.publicClient.readContract({
            ...registryConfig,
            functionName: 'metadataOf',
            args: [id],
          }),
          params.publicClient.readContract({
            ...registryConfig,
            functionName: 'policyCountOf',
            args: [id],
          }),
          params.publicClient.readContract({
            ...registryConfig,
            functionName: 'getPackPolicies',
            args: [id],
          }),
        ])

      const packType = normalizePackType(packTypeRaw)
      const packAccessMode = normalizePackAccessMode(packAccessModeRaw)
      const policyCount = parseNumber(policyCountRaw)
      if (!packType || !packAccessMode || policyCount === null) {
        return null
      }

      const policies = Array.isArray(policiesRaw)
        ? policiesRaw.filter((policy): policy is Address =>
            typeof policy === 'string' && /^0x[a-fA-F0-9]{40}$/.test(policy),
          )
        : []

      return {
        id: params.packId,
        packType,
        packAccessMode,
        isActive: Boolean(isActiveRaw),
        slug: '',
        version: 1,
        metadata: typeof metadataRaw === 'string' ? (metadataRaw as `0x${string}`) : '0x',
        policyCount,
        policies,
      }
    } catch {
      return null
    }
  }
}

export async function readEntitlement(params: {
  publicClient: Pick<PublicClient, 'readContract'>
  owner: Address
  packId: number
}): Promise<boolean | null> {
  try {
    const entitled = await params.publicClient.readContract({
      ...entitlementManagerConfig,
      functionName: 'isEntitled',
      args: [params.owner, BigInt(params.packId)],
    })
    return Boolean(entitled)
  } catch {
    return null
  }
}

export async function readPackCatalogSnapshot(params: {
  publicClient: Pick<PublicClient, 'readContract'>
  owner: Address
  candidateAddonPackIds?: number[]
}): Promise<PackCatalogSnapshot> {
  const basePackIds = [BASE_PACK_CONSERVATIVE_ID, BASE_PACK_DEFI_ID]
  const candidateAddonPackIds = params.candidateAddonPackIds ?? ADDON_PACK_CANDIDATE_IDS

  const basePackReads = await Promise.all(
    basePackIds.map((packId) => readPackById({ publicClient: params.publicClient, packId })),
  )
  const basePacks = basePackReads.filter(
    (pack): pack is RegistryPack => Boolean(pack && pack.packType === 'base'),
  )

  const addonPacks: AddonPackView[] = []
  for (const packId of candidateAddonPackIds) {
    const pack = await readPackById({ publicClient: params.publicClient, packId })
    if (!pack || pack.packType !== 'addon') {
      continue
    }

    const entitled =
      pack.packAccessMode === 'entitled'
        ? await readEntitlement({
            publicClient: params.publicClient,
            owner: params.owner,
            packId,
          })
        : null

    addonPacks.push({ pack, entitled })
  }

  return {
    basePacks,
    addonPacks,
    candidateAddonPackIds,
  }
}

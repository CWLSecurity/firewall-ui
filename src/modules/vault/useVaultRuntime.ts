import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Address } from 'viem'
import { usePublicClient } from 'wagmi'
import { firewallPolicyAbi } from '../../contracts/abi'
import {
  POLICY_INFINITE_APPROVAL_ADDON_HARDENING_ADDRESS,
  POLICY_LARGE_TRANSFER_DELAY_ADDON_ADDRESS,
  POLICY_NEW_RECEIVER_DELAY_ADDON_ADDRESS,
} from '../../contracts/addresses/base'
import { readEntitlement, readPackById, type RegistryPack } from '../../contracts/registry'
import {
  decodeRouterDecision,
  evaluateIntent,
  getPolicyRouterConfig,
  readActivePolicyAddresses,
  readAddonPackEnabledById,
  readEnabledAddonPackIds,
  type RouterDecision,
} from '../../contracts/policyRouter'
import { readPolicyRuntimeDetails, type PolicyRuntimeDetails } from '../../contracts/policies'
import { readRouterAddress } from '../../contracts/moduleViews'
import { verifyImportedFirewallWallet } from '../../contracts/walletVerification'
import {
  ADDON_DEFINITIONS,
  buildPolicyView,
  lineByBasePackId,
  packTitleFromSlug,
  policyBlockReason,
  policyDelayReason,
  type AddonDefinition,
  type PolicyView,
  type SecurityLineDefinition,
} from './model'
import { CREATE_FLOW_DEBUG_ENABLED, logCreateFlowDebug } from '../debug/createFlowDebug'

type PolicySource = 'line' | 'addon'

export type ActivePolicy = {
  policyAddress: Address
  details: PolicyRuntimeDetails
  view: PolicyView
  source: PolicySource
  packId: number
}

export type AddonState = {
  definition: AddonDefinition
  pack: RegistryPack | null
  policyViews: PolicyView[]
  accessMode: 'free' | 'entitled' | null
  enabled: boolean
  entitled: boolean | null
  eligibleToEnable: boolean
  availability: 'enabled' | 'available' | 'unavailable'
  availabilityReason:
    | 'Enabled'
    | 'Enable'
    | 'Requires access'
    | 'Access status unavailable'
    | 'Pack not found in registry'
    | 'Pack is inactive'
    | 'Pack type is not add-on'
    | 'Pack access mode is invalid'
    | 'Included in current protection line'
}

export type IntentEvaluation = {
  decision: RouterDecision
  delaySeconds: bigint | null
  reasons: string[]
}

const RUNTIME_RETRY_DELAYS_MS = [300, 900] as const

type UseVaultRuntimeResult = {
  routerAddress: Address | null
  basePackId: number | null
  securityLine: SecurityLineDefinition | null
  linePack: RegistryPack | null
  enabledAddonPackIds: number[]
  addOnStates: AddonState[]
  activePolicies: ActivePolicy[]
  isLoading: boolean
  error: string | null
  refresh: () => void
  evaluateTransferIntent: (params: { to: Address; value: bigint; data?: `0x${string}` }) => Promise<IntentEvaluation>
}

export function resolveAddonRuntimeState(params: {
  definition: AddonDefinition
  pack: RegistryPack | null
  enabledOnChain: boolean
  entitled: boolean | null
  activePolicyAddressSet: Set<string>
}): Pick<AddonState, 'enabled' | 'entitled' | 'eligibleToEnable' | 'availability' | 'availabilityReason'> {
  const enabled = params.enabledOnChain

  let availability: AddonState['availability'] = 'unavailable'
  let availabilityReason: AddonState['availabilityReason'] = 'Pack not found in registry'
  let nextEntitled: boolean | null = null

  if (enabled) {
    availability = 'enabled'
    availabilityReason = 'Enabled'
  } else if (!params.pack) {
    availability = 'unavailable'
    availabilityReason = 'Pack not found in registry'
  } else if (params.pack.packType !== 'addon') {
    availability = 'unavailable'
    availabilityReason = 'Pack type is not add-on'
  } else if (!params.pack.isActive) {
    availability = 'unavailable'
    availabilityReason = 'Pack is inactive'
  } else if (params.pack.packAccessMode === 'free') {
    availability = 'available'
    availabilityReason = 'Enable'
  } else if (params.pack.packAccessMode === 'entitled') {
    nextEntitled = params.entitled
    if (params.entitled === null) {
      availability = 'available'
      availabilityReason = 'Enable'
    } else if (params.entitled === false) {
      availability = 'unavailable'
      availabilityReason = 'Requires access'
    } else {
      availability = 'available'
      availabilityReason = 'Enable'
    }
  } else {
    availability = 'unavailable'
    availabilityReason = 'Pack access mode is invalid'
  }

  if (
    availability === 'available'
    && params.pack
    && params.pack.packType === 'addon'
    && params.pack.policies.some((policyAddress) => params.activePolicyAddressSet.has(policyAddress.toLowerCase()))
  ) {
    availability = 'unavailable'
    availabilityReason = 'Included in current protection line'
  }

  return {
    enabled,
    entitled: nextEntitled,
    eligibleToEnable: availability === 'available',
    availability,
    availabilityReason,
  }
}

export function resolveEnabledAddonPackIds(params: {
  definitions: ReadonlyArray<Pick<AddonDefinition, 'packId'>>
  enabledByPackId: ReadonlyMap<number, boolean | null>
  fallbackEnabledPackIds: ReadonlyArray<number>
}): number[] {
  const fallbackEnabledPackIdSet = new Set(params.fallbackEnabledPackIds)

  return params.definitions
    .map((definition) => {
      const directEnabled = params.enabledByPackId.get(definition.packId)
      if (directEnabled === true) {
        return definition.packId
      }
      if (directEnabled === false) {
        return null
      }
      return fallbackEnabledPackIdSet.has(definition.packId) ? definition.packId : null
    })
    .filter((packId): packId is number => packId !== null)
    .sort((a, b) => a - b)
}

export function inferEnabledAddonPackIdsFromRouterPolicies(params: {
  addonPacksById: ReadonlyMap<number, RegistryPack | null>
  routerPolicyAddresses: ReadonlyArray<Address>
}): number[] {
  const routerPolicyAddressSet = new Set(params.routerPolicyAddresses.map((address) => address.toLowerCase()))
  const inferred: number[] = []

  for (const [packId, pack] of params.addonPacksById.entries()) {
    if (!pack || pack.packType !== 'addon') {
      continue
    }

    if (pack.policies.some((policyAddress) => routerPolicyAddressSet.has(policyAddress.toLowerCase()))) {
      inferred.push(packId)
    }
  }

  return Array.from(new Set(inferred)).sort((a, b) => a - b)
}

const KNOWN_ADDON_POLICY_TO_PACK_ID = new Map<string, number>([
  [POLICY_INFINITE_APPROVAL_ADDON_HARDENING_ADDRESS.toLowerCase(), 2],
  [POLICY_NEW_RECEIVER_DELAY_ADDON_ADDRESS.toLowerCase(), 3],
  [POLICY_LARGE_TRANSFER_DELAY_ADDON_ADDRESS.toLowerCase(), 4],
])

export function inferEnabledAddonPackIdsFromKnownAddonPolicyAddresses(params: {
  routerPolicyAddresses: ReadonlyArray<Address>
}): number[] {
  const inferred: number[] = []

  for (const address of params.routerPolicyAddresses) {
    const packId = KNOWN_ADDON_POLICY_TO_PACK_ID.get(address.toLowerCase())
    if (typeof packId === 'number') {
      inferred.push(packId)
    }
  }

  return Array.from(new Set(inferred)).sort((a, b) => a - b)
}

function mergeEnabledAddonPackIds(...groups: ReadonlyArray<ReadonlyArray<number>>): number[] {
  return Array.from(new Set(groups.flatMap((group) => group))).sort((a, b) => a - b)
}

export function mergeMissingRouterPolicies(params: {
  activePackPolicies: Array<{ source: PolicySource; packId: number; address: Address }>
  routerPolicyAddresses: ReadonlyArray<Address>
  basePackId: number | null
}): Array<{ source: PolicySource; packId: number; address: Address }> {
  const merged = [...params.activePackPolicies]
  const seen = new Set(merged.map((entry) => entry.address.toLowerCase()))

  for (const routerPolicyAddress of params.routerPolicyAddresses) {
    const key = routerPolicyAddress.toLowerCase()
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    merged.push({
      source: 'line',
      packId: params.basePackId ?? -1,
      address: routerPolicyAddress,
    })
  }

  return merged
}

function unknownPolicyDetails(readError: string): PolicyRuntimeDetails {
  return {
    kind: 'unknown',
    readError,
    policyKey: null,
    policyName: null,
    policyDescription: null,
    policyConfigVersion: null,
    policyConfig: [],
  }
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

function uniqueAddresses(values: Address[]): Address[] {
  const seen = new Set<string>()
  const output: Address[] = []

  for (const value of values) {
    const key = value.toLowerCase()
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    output.push(value)
  }

  return output
}

function isTransientRuntimeError(error: unknown): boolean {
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

async function readPackByIdWithRetry(params: {
  publicClient: Parameters<typeof readPackById>[0]['publicClient']
  packId: number
}): Promise<RegistryPack | null> {
  for (let attempt = 0; attempt <= RUNTIME_RETRY_DELAYS_MS.length; attempt += 1) {
    const pack = await readPackById({
      publicClient: params.publicClient,
      packId: params.packId,
    })
    if (pack) {
      return pack
    }

    if (attempt < RUNTIME_RETRY_DELAYS_MS.length) {
      await waitMs(RUNTIME_RETRY_DELAYS_MS[attempt])
    }
  }

  return null
}

async function readEntitlementWithRetry(params: {
  publicClient: Parameters<typeof readEntitlement>[0]['publicClient']
  owner: Address
  packId: number
}): Promise<boolean | null> {
  for (let attempt = 0; attempt <= RUNTIME_RETRY_DELAYS_MS.length; attempt += 1) {
    const entitled = await readEntitlement({
      publicClient: params.publicClient,
      owner: params.owner,
      packId: params.packId,
    })

    if (entitled !== null) {
      return entitled
    }

    if (attempt < RUNTIME_RETRY_DELAYS_MS.length) {
      await waitMs(RUNTIME_RETRY_DELAYS_MS[attempt])
    }
  }

  return null
}

async function readPolicyRuntimeDetailsWithRetry(params: {
  publicClient: Parameters<typeof readPolicyRuntimeDetails>[0]['publicClient']
  policyAddress: Address
}): Promise<PolicyRuntimeDetails> {
  let fallbackDetails: PolicyRuntimeDetails | null = null

  for (let attempt = 0; attempt <= RUNTIME_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      const details = await readPolicyRuntimeDetails({
        publicClient: params.publicClient,
        policyAddress: params.policyAddress,
      })
      fallbackDetails = details

      if (!details.readError) {
        return details
      }
    } catch (error) {
      const canRetry = attempt < RUNTIME_RETRY_DELAYS_MS.length && isTransientRuntimeError(error)
      if (!canRetry) {
        return unknownPolicyDetails('Policy details temporarily unavailable.')
      }
    }

    if (attempt < RUNTIME_RETRY_DELAYS_MS.length) {
      await waitMs(RUNTIME_RETRY_DELAYS_MS[attempt])
    }
  }

  return fallbackDetails ?? unknownPolicyDetails('Policy details temporarily unavailable.')
}

export function useVaultRuntime(walletAddress: Address | null, ownerAddress: Address | null): UseVaultRuntimeResult {
  const publicClient = usePublicClient()
  const [routerAddress, setRouterAddress] = useState<Address | null>(null)
  const [basePackId, setBasePackId] = useState<number | null>(null)
  const [linePack, setLinePack] = useState<RegistryPack | null>(null)
  const [enabledAddonPackIds, setEnabledAddonPackIds] = useState<number[]>([])
  const [addOnStates, setAddOnStates] = useState<AddonState[]>([])
  const [activePolicies, setActivePolicies] = useState<ActivePolicy[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [refreshNonce, setRefreshNonce] = useState(0)
  const prevRuntimeLoadingRef = useRef(false)
  const prevRuntimeErrorRef = useRef<string | null>(null)
  const prevRouterAddressRef = useRef<Address | null>(null)
  const prevEnabledAddonPackIdsRef = useRef<number[]>([])
  const prevActivePolicyCountRef = useRef(0)
  const lastSuccessfulWalletRef = useRef<Address | null>(null)
  const verifiedWalletScopeRef = useRef<string | null>(null)

  const refresh = useCallback(() => {
    logCreateFlowDebug('handler_run', {
      handler: 'vault_runtime_refresh',
      trigger: 'vaultRuntime.refresh',
      source: 'src/modules/vault/useVaultRuntime.ts::refresh',
      walletAddress,
      ownerAddress,
    })
    setRefreshNonce((value) => value + 1)
  }, [ownerAddress, walletAddress])

  useEffect(() => {
    const previous = prevRuntimeLoadingRef.current
    if (previous === isLoading) {
      return
    }

    logCreateFlowDebug('state_transition', {
      key: 'vaultRuntime.isLoading',
      previous,
      next: isLoading,
      trigger: 'vault_runtime_state_update',
      source: 'src/modules/vault/useVaultRuntime.ts::useEffect[isLoading]',
    })
    prevRuntimeLoadingRef.current = isLoading
  }, [isLoading])

  useEffect(() => {
    const previous = prevRuntimeErrorRef.current
    if (previous === error) {
      return
    }

    logCreateFlowDebug('state_transition', {
      key: 'vaultRuntime.error',
      previous,
      next: error,
      trigger: 'vault_runtime_state_update',
      source: 'src/modules/vault/useVaultRuntime.ts::useEffect[error]',
    })
    prevRuntimeErrorRef.current = error
  }, [error])

  useEffect(() => {
    const previous = prevRouterAddressRef.current
    if (previous === routerAddress) {
      return
    }

    logCreateFlowDebug('state_transition', {
      key: 'vaultRuntime.routerAddress',
      previous,
      next: routerAddress,
      trigger: 'vault_runtime_state_update',
      source: 'src/modules/vault/useVaultRuntime.ts::useEffect[routerAddress]',
    })
    prevRouterAddressRef.current = routerAddress
  }, [routerAddress])

  useEffect(() => {
    const previous = prevEnabledAddonPackIdsRef.current
    const next = enabledAddonPackIds
    const unchanged =
      previous.length === next.length && previous.every((value, index) => value === next[index])
    if (unchanged) {
      return
    }

    logCreateFlowDebug('state_transition', {
      key: 'vaultRuntime.enabledAddonPackIds',
      previous,
      next,
      trigger: 'vault_runtime_state_update',
      source: 'src/modules/vault/useVaultRuntime.ts::useEffect[enabledAddonPackIds]',
    })
    prevEnabledAddonPackIdsRef.current = next
  }, [enabledAddonPackIds])

  useEffect(() => {
    const previous = prevActivePolicyCountRef.current
    const next = activePolicies.length
    if (previous === next) {
      return
    }

    logCreateFlowDebug('state_transition', {
      key: 'vaultRuntime.activePolicies.count',
      previous,
      next,
      trigger: 'vault_runtime_state_update',
      source: 'src/modules/vault/useVaultRuntime.ts::useEffect[activePolicies]',
    })
    prevActivePolicyCountRef.current = next
  }, [activePolicies])

  useEffect(() => {
    if (!walletAddress || !publicClient) {
      logCreateFlowDebug('handler_run', {
        handler: 'vault_runtime_refresh_complete',
        trigger: 'runtime_reset_missing_wallet_or_client',
        source: 'src/modules/vault/useVaultRuntime.ts::useEffect',
        walletAddress,
        hasPublicClient: Boolean(publicClient),
      })
      setRouterAddress(null)
      setBasePackId(null)
      setLinePack(null)
      setEnabledAddonPackIds([])
      setAddOnStates([])
      setActivePolicies([])
      setIsLoading(false)
      setError(null)
      lastSuccessfulWalletRef.current = null
      verifiedWalletScopeRef.current = null
      return
    }

    const client = publicClient
    const vaultAddress = walletAddress

    let cancelled = false

    async function run() {
      logCreateFlowDebug('handler_run', {
        handler: 'vault_runtime_refresh_started',
        trigger: 'effect_run',
        source: 'src/modules/vault/useVaultRuntime.ts::run',
        walletAddress: vaultAddress,
        ownerAddress,
      })
      setIsLoading(true)
      setError(null)

      try {
        let verifiedBasePackId: number | null = null
        const verificationOwner = ownerAddress
        const verificationScope = verificationOwner
          ? `${verificationOwner.toLowerCase()}:${vaultAddress.toLowerCase()}`
          : null

        if (verificationScope && verificationOwner && verifiedWalletScopeRef.current !== verificationScope) {
          const verification = await verifyImportedFirewallWallet({
            publicClient: client,
            ownerAddress: verificationOwner,
            walletAddress: vaultAddress,
          })

          if (!verification.ok) {
            throw new Error(`Selected Vault address is invalid for this owner: ${verification.reason}`)
          }

          verifiedBasePackId = verification.basePackId
          verifiedWalletScopeRef.current = verificationScope
        }

        let router: Address | null = null
        let basePackIdRaw: unknown = null
        let enabledAddonIds: number[] = []
        let routerReadError: unknown = null
        let basePackReadError: unknown = null
        let addonPackReadError: unknown = null

        for (let attempt = 0; attempt <= RUNTIME_RETRY_DELAYS_MS.length; attempt += 1) {
          try {
            const nextRouter = await readRouterAddress({
              publicClient: client,
              walletAddress: vaultAddress,
            })

            router = nextRouter
            basePackReadError = null
            addonPackReadError = null

            try {
              basePackIdRaw = await client.readContract({
                ...getPolicyRouterConfig(nextRouter),
                functionName: 'basePackId',
              })
            } catch (error) {
              basePackReadError = error
              basePackIdRaw = null
            }

            try {
              enabledAddonIds = await readEnabledAddonPackIds({
                publicClient: client,
                routerAddress: nextRouter,
              })
            } catch (error) {
              addonPackReadError = error
              enabledAddonIds = []
            }

            routerReadError = null
            break
          } catch (error) {
            routerReadError = error
            const canRetry =
              attempt < RUNTIME_RETRY_DELAYS_MS.length
              && isTransientRuntimeError(error)
            if (!canRetry) {
              break
            }
            await waitMs(RUNTIME_RETRY_DELAYS_MS[attempt])
          }
        }

        if (!router) {
          throw (routerReadError instanceof Error
            ? routerReadError
            : new Error('Could not load Vault router state.'))
        }

        const parsedBasePackId = parsePackId(basePackIdRaw) ?? verifiedBasePackId
        const routerPolicyAddresses = await readActivePolicyAddresses({
          publicClient: client,
          routerAddress: router,
        }).catch(() => [])
        const enabledByPackId = await readAddonPackEnabledById({
          publicClient: client,
          routerAddress: router,
          packIds: ADDON_DEFINITIONS.map((addon) => addon.packId),
        }).catch(() => new Map<number, boolean | null>())

        const enabledAddonPackIdsFromFlags = resolveEnabledAddonPackIds({
          definitions: ADDON_DEFINITIONS,
          enabledByPackId,
          fallbackEnabledPackIds: enabledAddonIds,
        })

        const [basePack, addonPacksByDefinition, entitlements] = await Promise.all([
          parsedBasePackId !== null
            ? readPackByIdWithRetry({ publicClient: client, packId: parsedBasePackId })
            : null,
          Promise.all(ADDON_DEFINITIONS.map((addon) => readPackByIdWithRetry({
            publicClient: client,
            packId: addon.packId,
          }))),
          Promise.all(
            ADDON_DEFINITIONS.map((addon) =>
              ownerAddress
                ? readEntitlementWithRetry({ publicClient: client, owner: ownerAddress, packId: addon.packId })
                : Promise.resolve(null),
            ),
          ),
        ])

        const entitlementByPackId = new Map<number, boolean | null>()
        for (let index = 0; index < ADDON_DEFINITIONS.length; index += 1) {
          entitlementByPackId.set(ADDON_DEFINITIONS[index].packId, entitlements[index] ?? null)
        }

        const addonPackById = new Map<number, RegistryPack | null>()
        for (let index = 0; index < ADDON_DEFINITIONS.length; index += 1) {
          addonPackById.set(ADDON_DEFINITIONS[index].packId, addonPacksByDefinition[index] ?? null)
        }

        const inferredEnabledAddonPackIds = inferEnabledAddonPackIdsFromRouterPolicies({
          addonPacksById: addonPackById,
          routerPolicyAddresses,
        })
        const inferredEnabledAddonPackIdsByKnownPolicies =
          inferEnabledAddonPackIdsFromKnownAddonPolicyAddresses({
            routerPolicyAddresses,
          })
        const nextEnabledAddonPackIds = mergeEnabledAddonPackIds(
          enabledAddonPackIdsFromFlags,
          inferredEnabledAddonPackIds,
          inferredEnabledAddonPackIdsByKnownPolicies,
        )

        const activePolicyAddressSet = new Set<string>()
        for (const policyAddress of routerPolicyAddresses) {
          activePolicyAddressSet.add(policyAddress.toLowerCase())
        }
        if (basePack && basePack.packType === 'base') {
          for (const policyAddress of basePack.policies) {
            activePolicyAddressSet.add(policyAddress.toLowerCase())
          }
        }
        for (const packId of nextEnabledAddonPackIds) {
          const enabledPack = addonPackById.get(packId)
          if (!enabledPack || enabledPack.packType !== 'addon') {
            continue
          }
          for (const policyAddress of enabledPack.policies) {
            activePolicyAddressSet.add(policyAddress.toLowerCase())
          }
        }

        const activePackPolicies: Array<{ source: PolicySource; packId: number; address: Address }> = []
        const allPolicyAddresses: Address[] = []

        if (basePack && basePack.packType === 'base') {
          for (const policyAddress of basePack.policies) {
            activePackPolicies.push({
              source: 'line',
              packId: basePack.id,
              address: policyAddress,
            })
            allPolicyAddresses.push(policyAddress)
          }
        }

        for (const definition of ADDON_DEFINITIONS) {
          const pack = addonPackById.get(definition.packId) ?? null
          if (!pack || pack.packType !== 'addon') {
            continue
          }

          for (const policyAddress of pack.policies) {
            allPolicyAddresses.push(policyAddress)
          }
        }

        for (let index = 0; index < nextEnabledAddonPackIds.length; index += 1) {
          const packId = nextEnabledAddonPackIds[index]
          const pack = addonPackById.get(packId) ?? null
          if (!pack || pack.packType !== 'addon') {
            continue
          }
          for (const policyAddress of pack.policies) {
            activePackPolicies.push({
              source: 'addon',
              packId,
              address: policyAddress,
            })
          }
        }

        const knownAddonEntrySet = new Set(activePackPolicies.map((entry) => `${entry.source}:${entry.packId}:${entry.address.toLowerCase()}`))
        for (const routerPolicyAddress of routerPolicyAddresses) {
          const knownPackId = KNOWN_ADDON_POLICY_TO_PACK_ID.get(routerPolicyAddress.toLowerCase())
          if (typeof knownPackId !== 'number') {
            continue
          }
          if (!nextEnabledAddonPackIds.includes(knownPackId)) {
            continue
          }

          const key = `addon:${knownPackId}:${routerPolicyAddress.toLowerCase()}`
          if (knownAddonEntrySet.has(key)) {
            continue
          }
          knownAddonEntrySet.add(key)
          activePackPolicies.push({
            source: 'addon',
            packId: knownPackId,
            address: routerPolicyAddress,
          })
        }

        const mergedActivePackPolicies = mergeMissingRouterPolicies({
          activePackPolicies,
          routerPolicyAddresses,
          basePackId: parsedBasePackId,
        })
        for (const policyAddress of routerPolicyAddresses) {
          allPolicyAddresses.push(policyAddress)
        }

        const mergedPolicies = uniqueAddresses(allPolicyAddresses)

        const policyDetailsPairs = await Promise.all(
          mergedPolicies.map(async (policyAddress) => {
            const details = await readPolicyRuntimeDetailsWithRetry({ publicClient: client, policyAddress })

            return [policyAddress.toLowerCase(), details] as const
          }),
        )

        const detailsByAddress = new Map<string, PolicyRuntimeDetails>(policyDetailsPairs)

        const nextAddOnStates: AddonState[] = ADDON_DEFINITIONS.map((definition) => {
          const pack = addonPackById.get(definition.packId) ?? null
          const enabledOnChain = nextEnabledAddonPackIds.includes(definition.packId)
          const entitled = entitlementByPackId.get(definition.packId) ?? null
          const accessMode = pack?.packAccessMode ?? null
          const policyViews =
            pack && pack.packType === 'addon'
              ? pack.policies.map((policyAddress) => {
                  const details = detailsByAddress.get(policyAddress.toLowerCase())
                    ?? unknownPolicyDetails('Policy details temporarily unavailable.')

                  return buildPolicyView(policyAddress, details, {
                    sourceContext: 'addon',
                    addonTitle: definition.title,
                  })
                })
              : []
          const resolved = resolveAddonRuntimeState({
            definition,
            pack,
            enabledOnChain,
            entitled,
            activePolicyAddressSet,
          })

          return {
            definition,
            pack,
            policyViews,
            accessMode,
            ...resolved,
          }
        })

        const nextPolicies: ActivePolicy[] = mergedActivePackPolicies.map((entry) => {
          const details = detailsByAddress.get(entry.address.toLowerCase())
            ?? unknownPolicyDetails('Policy details temporarily unavailable.')
          const addonTitle = entry.source === 'addon'
            ? packTitleFromSlug({
                packId: entry.packId,
                slug: addonPackById.get(entry.packId)?.slug ?? null,
                fallbackTitle: ADDON_DEFINITIONS.find((addon) => addon.packId === entry.packId)?.title ?? `Pack ${entry.packId}`,
              })
            : null

          return {
            policyAddress: entry.address,
            details,
            view: buildPolicyView(entry.address, details, {
              sourceContext: entry.source === 'line' ? 'base' : 'addon',
              addonTitle,
            }),
            source: entry.source,
            packId: entry.packId,
          }
        })

        if (!cancelled) {
          logCreateFlowDebug('handler_run', {
            handler: 'on_runtime_refresh_complete',
            trigger: 'runtime_refresh_success',
            source: 'src/modules/vault/useVaultRuntime.ts::run',
            walletAddress: vaultAddress,
            router,
            basePackId: parsedBasePackId,
            basePackReadWarning: basePackReadError instanceof Error ? basePackReadError.message : null,
            addonPackReadWarning: addonPackReadError instanceof Error ? addonPackReadError.message : null,
            enabledAddonPackIds: nextEnabledAddonPackIds,
            routerPolicyCount: routerPolicyAddresses.length,
            activePolicyCount: nextPolicies.length,
          })
          setRouterAddress(router)
          setBasePackId(parsedBasePackId)
          setLinePack(basePack)
          setEnabledAddonPackIds(nextEnabledAddonPackIds)
          setAddOnStates(nextAddOnStates)
          setActivePolicies(nextPolicies)
          lastSuccessfulWalletRef.current = vaultAddress
        }
      } catch (runtimeError) {
        if (!cancelled) {
          verifiedWalletScopeRef.current = null
          const runtimeErrorMessage = runtimeError instanceof Error ? runtimeError.message : String(runtimeError)
          logCreateFlowDebug('handler_run', {
            handler: 'on_runtime_refresh_complete',
            trigger: 'runtime_refresh_error',
            source: 'src/modules/vault/useVaultRuntime.ts::run',
            walletAddress: vaultAddress,
            error: runtimeErrorMessage,
          })
          const shouldClearStaleState =
            !lastSuccessfulWalletRef.current
            || lastSuccessfulWalletRef.current.toLowerCase() !== vaultAddress.toLowerCase()
          if (shouldClearStaleState) {
            setRouterAddress(null)
            setBasePackId(null)
            setLinePack(null)
            setEnabledAddonPackIds([])
            setAddOnStates([])
            setActivePolicies([])
          }
          setError(
            CREATE_FLOW_DEBUG_ENABLED
              ? `Could not load Vault protection state right now. Debug: ${runtimeErrorMessage}`
              : 'Could not load Vault protection state right now.',
          )
        }
      } finally {
        if (!cancelled) {
          logCreateFlowDebug('handler_run', {
            handler: 'on_runtime_refresh_complete',
            trigger: 'runtime_refresh_finally',
            source: 'src/modules/vault/useVaultRuntime.ts::run',
            walletAddress: vaultAddress,
          })
          setIsLoading(false)
        }
      }
    }

    void run()

    return () => {
      cancelled = true
    }
  }, [ownerAddress, publicClient, refreshNonce, walletAddress])

  const securityLine = useMemo(() => lineByBasePackId(basePackId), [basePackId])

  const evaluateTransferIntent = useCallback(
    async (params: { to: Address; value: bigint; data?: `0x${string}` }): Promise<IntentEvaluation> => {
      if (!publicClient || !walletAddress || !routerAddress) {
        throw new Error('Vault runtime is not ready yet.')
      }

      const data = params.data ?? '0x'

      const routerEvaluation = await evaluateIntent({
        publicClient,
        routerAddress,
        vaultAddress: walletAddress,
        to: params.to,
        value: params.value,
        data,
      })

      const policyEvaluations = await Promise.all(
        activePolicies.map(async (policy) => {
          try {
            const result = await publicClient.readContract({
              address: policy.policyAddress,
              abi: firewallPolicyAbi,
              functionName: 'evaluate',
              args: [walletAddress, params.to, params.value, data],
            })

            if (!Array.isArray(result) || result.length < 2) {
              return null
            }

            const tuple = result as readonly unknown[]
            if (tuple.length < 2) {
              return null
            }

            const decisionRaw = tuple[0]
            const delayRaw = tuple[1]

            return {
              policy,
              decision: decodeRouterDecision(decisionRaw),
              delaySeconds: typeof delayRaw === 'bigint' ? delayRaw : null,
            }
          } catch {
            return null
          }
        }),
      )

      const reasons: string[] = []

      for (const item of policyEvaluations) {
        if (!item) {
          continue
        }

        if (item.decision === 'delay') {
          reasons.push(policyDelayReason(item.policy.details))
        }

        if (item.decision === 'revert') {
          reasons.push(policyBlockReason(item.policy.details))
        }
      }

      if (reasons.length === 0 && routerEvaluation.decision === 'delay') {
        reasons.push('Delayed by active Vault protections.')
      }

      if (reasons.length === 0 && routerEvaluation.decision === 'revert') {
        reasons.push('Blocked by active Vault protections.')
      }

      return {
        decision: routerEvaluation.decision,
        delaySeconds: routerEvaluation.delaySeconds,
        reasons: Array.from(new Set(reasons)),
      }
    },
    [activePolicies, publicClient, routerAddress, walletAddress],
  )

  return {
    routerAddress,
    basePackId,
    securityLine,
    linePack,
    enabledAddonPackIds,
    addOnStates,
    activePolicies,
    isLoading,
    error,
    refresh,
    evaluateTransferIntent,
  }
}

import { describe, expect, it } from 'vitest'
import type { RegistryPack } from '../../contracts/registry'
import {
  POLICY_INFINITE_APPROVAL_ADDON_HARDENING_ADDRESS,
  POLICY_NEW_RECEIVER_DELAY_ADDON_ADDRESS,
} from '../../contracts/addresses/base'
import type { AddonDefinition } from './model'
import {
  inferEnabledAddonPackIdsFromRouterPolicies,
  inferEnabledAddonPackIdsFromKnownAddonPolicyAddresses,
  mergeMissingRouterPolicies,
  resolveAddonRuntimeState,
  resolveEnabledAddonPackIds,
} from './useVaultRuntime'

const ADDON_DEF: AddonDefinition = {
  id: 'large-transfer-24h-delay',
  packId: 4,
  title: '24-Hour Large Transfer Delay',
  shortDescription: 'Adds 24h delay for larger transfers.',
  details: [],
}

const ADDON_PACK: RegistryPack = {
  id: 4,
  packType: 'addon',
  packAccessMode: 'free',
  isActive: true,
  slug: 'large-transfer-24h',
  version: 1,
  metadata: '0x',
  policyCount: 1,
  policies: ['0x4444444444444444444444444444444444444444'],
}

const ADDON_PACK_2: RegistryPack = {
  id: 2,
  packType: 'addon',
  packAccessMode: 'free',
  isActive: true,
  slug: 'approval-hardening',
  version: 1,
  metadata: '0x',
  policyCount: 1,
  policies: ['0x2222222222222222222222222222222222222222'],
}

const ADDON_PACK_3: RegistryPack = {
  id: 3,
  packType: 'addon',
  packAccessMode: 'free',
  isActive: true,
  slug: 'new-receiver-24h',
  version: 1,
  metadata: '0x',
  policyCount: 1,
  policies: ['0x3333333333333333333333333333333333333333'],
}

describe('resolveAddonRuntimeState', () => {
  it('keeps addon enabled even when pack metadata is temporarily unavailable', () => {
    const result = resolveAddonRuntimeState({
      definition: ADDON_DEF,
      pack: null,
      enabledOnChain: true,
      entitled: null,
      activePolicyAddressSet: new Set<string>(),
    })

    expect(result).toEqual({
      enabled: true,
      entitled: null,
      eligibleToEnable: false,
      availability: 'enabled',
      availabilityReason: 'Enabled',
    })
  })

  it('does not offer enable action when pack metadata is unavailable and addon is not enabled', () => {
    const result = resolveAddonRuntimeState({
      definition: ADDON_DEF,
      pack: null,
      enabledOnChain: false,
      entitled: null,
      activePolicyAddressSet: new Set<string>(),
    })

    expect(result.availability).toBe('unavailable')
    expect(result.availabilityReason).toBe('Pack not found in registry')
    expect(result.eligibleToEnable).toBe(false)
  })

  it('marks addon unavailable when policy is already active in current line', () => {
    const result = resolveAddonRuntimeState({
      definition: ADDON_DEF,
      pack: ADDON_PACK,
      enabledOnChain: false,
      entitled: null,
      activePolicyAddressSet: new Set<string>(['0x4444444444444444444444444444444444444444']),
    })

    expect(result.availability).toBe('unavailable')
    expect(result.availabilityReason).toBe('Included in current protection line')
  })
})

describe('resolveEnabledAddonPackIds', () => {
  it('falls back to enabled list when direct read is unavailable for specific pack', () => {
    const definitions = [
      { packId: 2 },
      { packId: 3 },
      { packId: 4 },
    ] as const
    const enabledByPackId = new Map<number, boolean | null>([
      [2, false],
      [3, null],
      [4, false],
    ])

    const result = resolveEnabledAddonPackIds({
      definitions,
      enabledByPackId,
      fallbackEnabledPackIds: [3],
    })

    expect(result).toEqual([3])
  })

  it('prefers direct enabled value over fallback for each pack', () => {
    const definitions = [
      { packId: 2 },
      { packId: 3 },
      { packId: 4 },
    ] as const
    const enabledByPackId = new Map<number, boolean | null>([
      [2, true],
      [3, false],
      [4, null],
    ])

    const result = resolveEnabledAddonPackIds({
      definitions,
      enabledByPackId,
      fallbackEnabledPackIds: [3, 4],
    })

    expect(result).toEqual([2, 4])
  })
})

describe('inferEnabledAddonPackIdsFromRouterPolicies', () => {
  it('infers enabled add-ons from active router policy addresses', () => {
    const addonPacksById = new Map<number, RegistryPack | null>([
      [2, ADDON_PACK_2],
      [3, ADDON_PACK_3],
      [4, ADDON_PACK],
    ])

    const result = inferEnabledAddonPackIdsFromRouterPolicies({
      addonPacksById,
      routerPolicyAddresses: [
        '0x2222222222222222222222222222222222222222',
        '0x4444444444444444444444444444444444444444',
      ],
    })

    expect(result).toEqual([2, 4])
  })

  it('returns empty when router policies do not match add-on packs', () => {
    const addonPacksById = new Map<number, RegistryPack | null>([
      [2, ADDON_PACK_2],
      [3, ADDON_PACK_3],
    ])

    const result = inferEnabledAddonPackIdsFromRouterPolicies({
      addonPacksById,
      routerPolicyAddresses: ['0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
    })

    expect(result).toEqual([])
  })
})

describe('inferEnabledAddonPackIdsFromKnownAddonPolicyAddresses', () => {
  it('infers enabled add-ons by known policy addresses even without registry metadata', () => {
    const result = inferEnabledAddonPackIdsFromKnownAddonPolicyAddresses({
      routerPolicyAddresses: [
        POLICY_INFINITE_APPROVAL_ADDON_HARDENING_ADDRESS,
        POLICY_NEW_RECEIVER_DELAY_ADDON_ADDRESS,
      ],
    })

    expect(result).toEqual([2, 3])
  })

  it('returns empty for unknown policies', () => {
    const result = inferEnabledAddonPackIdsFromKnownAddonPolicyAddresses({
      routerPolicyAddresses: ['0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
    })

    expect(result).toEqual([])
  })
})

describe('mergeMissingRouterPolicies', () => {
  it('adds missing router policies even when active list already has addon entries', () => {
    const merged = mergeMissingRouterPolicies({
      activePackPolicies: [
        {
          source: 'addon',
          packId: 2,
          address: '0x2222222222222222222222222222222222222222',
        },
      ],
      routerPolicyAddresses: [
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        '0x2222222222222222222222222222222222222222',
      ],
      basePackId: 0,
    })

    expect(merged).toEqual([
      {
        source: 'addon',
        packId: 2,
        address: '0x2222222222222222222222222222222222222222',
      },
      {
        source: 'line',
        packId: 0,
        address: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      },
    ])
  })
})

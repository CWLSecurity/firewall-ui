import { describe, expect, it, vi } from 'vitest'
import { keccak256, stringToHex, toHex, type Address, type Hex } from 'viem'
import { POLICY_PACK_REGISTRY_ADDRESS } from './addresses/base'
import { verifyImportedFirewallWallet } from './walletVerification'

const FIREWALL_STORAGE_SLOT = BigInt(keccak256(stringToHex('firewall.vault.storage.v1'))) - 1n

const OWNER = '0x1111111111111111111111111111111111111111' as Address
const WALLET = '0x2222222222222222222222222222222222222222' as Address
const ROUTER = '0x3333333333333333333333333333333333333333' as Address

function asStorageWord(address: Address): Hex {
  return `0x${'0'.repeat(24)}${address.slice(2).toLowerCase()}` as Hex
}

describe('verifyImportedFirewallWallet', () => {
  it('accepts valid vault when view probes fail but storage slots are present', async () => {
    const readContract = vi.fn(async (params: {
      address: Address
      functionName: string
    }): Promise<unknown> => {
      if (params.address === WALLET && params.functionName === 'getScheduled') {
        throw new Error('execution reverted')
      }
      if (params.address === WALLET && params.functionName === 'owner') {
        throw new Error('execution reverted')
      }
      if (params.address === WALLET && params.functionName === 'router') {
        throw new Error('execution reverted')
      }
      if (params.address === ROUTER && params.functionName === 'firewallModule') {
        return WALLET
      }
      if (params.address === ROUTER && params.functionName === 'basePackId') {
        return 0n
      }
      if (params.address === ROUTER && params.functionName === 'policyPackRegistry') {
        return POLICY_PACK_REGISTRY_ADDRESS
      }

      throw new Error(`Unexpected readContract: ${params.address}:${params.functionName}`)
    })

    const getStorageAt = vi.fn(async (params: { slot: Hex }): Promise<Hex | undefined> => {
      if (params.slot === toHex(FIREWALL_STORAGE_SLOT)) {
        return asStorageWord(ROUTER)
      }
      if (params.slot === toHex(FIREWALL_STORAGE_SLOT + 1n)) {
        return asStorageWord(OWNER)
      }
      return undefined
    })

    const result = await verifyImportedFirewallWallet({
      publicClient: {
        getBytecode: vi.fn(async ({ address }: { address: Address }) =>
          address === WALLET || address === ROUTER ? '0x6001' : null,
        ),
        getStorageAt,
        readContract,
      } as never,
      ownerAddress: OWNER,
      walletAddress: WALLET,
    })

    expect(result).toEqual({
      ok: true,
      basePackId: 0,
    })
  })

  it('rejects non-vault contract when probes and storage are empty', async () => {
    const result = await verifyImportedFirewallWallet({
      publicClient: {
        getBytecode: vi.fn(async () => '0x6001'),
        getStorageAt: vi.fn(async () => undefined),
        readContract: vi.fn(async () => {
          throw new Error('execution reverted')
        }),
      } as never,
      ownerAddress: OWNER,
      walletAddress: WALLET,
    })

    expect(result).toEqual({
      ok: false,
      reason: 'Address is not a Firewall Vault contract.',
    })
  })
})

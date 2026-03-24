import { describe, expect, it, vi } from 'vitest'
import {
  encodeAbiParameters,
  encodeEventTopics,
  parseAbiItem,
  type Address,
  type Hex,
} from 'viem'
import { FACTORY_ADDRESS } from './addresses/base'
import { extractCreatedWalletFromReceipt } from './factory'
import { readRouterAddress } from './moduleViews'
import { readPolicyRuntimeDetails, type PolicyRuntimeDetails } from './policies'
import { readActivePolicyAddresses } from './policyRouter'

const walletCreatedEvent = parseAbiItem(
  'event WalletCreated(address indexed owner, address indexed wallet, address indexed router, address recovery, uint256 basePackId)',
)

const POLICY_KEY_INFINITE_APPROVAL =
  '0xa65d627e59303369e7b4f388a565808b08eca273ff9d9c722aa939933b78d963'
const POLICY_KEY_LARGE_TRANSFER_DELAY =
  '0xbef8b32671d12321edc6cf9fdd5ca723cb22142120e78b804bd3a169db17e54b'

type ContractReadParams = {
  address: Address
  functionName: string
  args?: readonly unknown[]
}

type MockPublicClient = {
  readContract: (params: ContractReadParams) => Promise<unknown>
  getStorageAt: (params: { address: Address; slot: Hex }) => Promise<Hex | undefined>
  getBlockNumber: () => Promise<bigint>
  getLogs: (params: {
    address: Address
    event: unknown
    args?: Record<string, unknown>
    fromBlock: bigint
    toBlock: bigint
  }) => Promise<readonly unknown[]>
}

function walletCreatedLog(params: {
  owner: Address
  wallet: Address
  router: Address
  recovery: Address
  basePackId: bigint
}): {
  address: Address
  topics: readonly `0x${string}`[]
  data: `0x${string}`
} {
  const topics = encodeEventTopics({
    abi: [walletCreatedEvent],
    eventName: 'WalletCreated',
    args: {
      owner: params.owner,
      wallet: params.wallet,
      router: params.router,
    },
  }) as readonly `0x${string}`[]

  const data = encodeAbiParameters(
    [
      { type: 'address', name: 'recovery' },
      { type: 'uint256', name: 'basePackId' },
    ],
    [params.recovery, params.basePackId],
  )

  return {
    address: FACTORY_ADDRESS,
    topics,
    data,
  }
}

function addressToStorageWord(address: Address): Hex {
  return `0x${'0'.repeat(24)}${address.slice(2).toLowerCase()}` as Hex
}

async function resolvePoliciesFromCreateReceipt(params: {
  publicClient: MockPublicClient
  logs: readonly {
    address: Address
    topics: readonly `0x${string}`[]
    data: `0x${string}`
  }[]
}): Promise<{
  walletAddress: Address
  routerAddress: Address
  policyAddresses: Address[]
  policyDetails: PolicyRuntimeDetails[]
}> {
  const walletAddress = extractCreatedWalletFromReceipt({ logs: params.logs })
  const routerAddress = await readRouterAddress({
    publicClient: params.publicClient as never,
    walletAddress,
  })
  const policyAddresses = await readActivePolicyAddresses({
    publicClient: params.publicClient as never,
    routerAddress,
  })
  const policyDetails = await Promise.all(
    policyAddresses.map((policyAddress) =>
      readPolicyRuntimeDetails({
        publicClient: params.publicClient as never,
        policyAddress,
      }),
    ),
  )

  return {
    walletAddress,
    routerAddress,
    policyAddresses,
    policyDetails,
  }
}

describe('Vault creation -> policy loading flow', () => {
  it('extracts wallet from receipt and resolves active policies via router()', async () => {
    const owner = '0x1000000000000000000000000000000000000001'
    const wallet = '0x2000000000000000000000000000000000000002'
    const router = '0x3000000000000000000000000000000000000003'
    const recovery = '0x4000000000000000000000000000000000000004'
    const policyA = '0x5000000000000000000000000000000000000005'
    const policyB = '0x6000000000000000000000000000000000000006'

    const readContract = vi.fn(async (params: ContractReadParams): Promise<unknown> => {
      if (params.address === wallet && params.functionName === 'router') return router

      if (params.address === router && params.functionName === 'policyCount') return 2n
      if (params.address === router && params.functionName === 'policies' && params.args?.[0] === 0n) return policyA
      if (params.address === router && params.functionName === 'policies' && params.args?.[0] === 1n) return policyB

      if (params.address === policyA && params.functionName === 'policyKey') return POLICY_KEY_LARGE_TRANSFER_DELAY
      if (params.address === policyA && params.functionName === 'policyName') return 'LargeTransferDelayPolicy'
      if (params.address === policyA && params.functionName === 'policyDescription') return 'Large transfer delay'
      if (params.address === policyA && params.functionName === 'policyConfigVersion') return 1n
      if (params.address === policyA && params.functionName === 'policyConfig') return []

      if (params.address === policyB && params.functionName === 'policyKey') return POLICY_KEY_INFINITE_APPROVAL
      if (params.address === policyB && params.functionName === 'policyName') return 'InfiniteApprovalPolicy'
      if (params.address === policyB && params.functionName === 'policyDescription') return 'Approval guard'
      if (params.address === policyB && params.functionName === 'policyConfigVersion') return 1n
      if (params.address === policyB && params.functionName === 'policyConfig') return []

      throw new Error(`Unexpected readContract: ${params.address}::${params.functionName}`)
    })

    const publicClient: MockPublicClient = {
      readContract,
      getStorageAt: vi.fn(async () => undefined),
      getBlockNumber: vi.fn(async () => 0n),
      getLogs: vi.fn(async () => []),
    }

    const result = await resolvePoliciesFromCreateReceipt({
      publicClient,
      logs: [
        walletCreatedLog({
          owner,
          wallet,
          router,
          recovery,
          basePackId: 0n,
        }),
      ],
    })

    expect(result.walletAddress).toBe(wallet)
    expect(result.routerAddress).toBe(router)
    expect(result.policyAddresses).toEqual([policyA, policyB])
    expect(result.policyDetails.map((item) => item.kind)).toEqual(['large-transfer-delay', 'infinite-approval'])
  })

  it('loads policies even when router() is unavailable and storage fallback is used', async () => {
    const owner = '0x7000000000000000000000000000000000000007'
    const wallet = '0x8000000000000000000000000000000000000008'
    const router = '0x9000000000000000000000000000000000000009'
    const recovery = '0xa00000000000000000000000000000000000000a'
    const policy = '0xb00000000000000000000000000000000000000b'

    const readContract = vi.fn(async (params: ContractReadParams): Promise<unknown> => {
      if (params.address === wallet && params.functionName === 'router') {
        throw new Error('router() unavailable')
      }

      if (params.address === router && params.functionName === 'policyCount') return 1n
      if (params.address === router && params.functionName === 'policies' && params.args?.[0] === 0n) return policy

      if (params.address === policy && params.functionName === 'policyKey') return POLICY_KEY_INFINITE_APPROVAL
      if (params.address === policy && params.functionName === 'policyName') return 'InfiniteApprovalPolicy'
      if (params.address === policy && params.functionName === 'policyDescription') return 'Approval guard'
      if (params.address === policy && params.functionName === 'policyConfigVersion') return 1n
      if (params.address === policy && params.functionName === 'policyConfig') return []

      throw new Error(`Unexpected readContract: ${params.address}::${params.functionName}`)
    })

    const publicClient: MockPublicClient = {
      readContract,
      getStorageAt: vi.fn(async () => addressToStorageWord(router)),
      getBlockNumber: vi.fn(async () => 0n),
      getLogs: vi.fn(async () => []),
    }

    const result = await resolvePoliciesFromCreateReceipt({
      publicClient,
      logs: [
        walletCreatedLog({
          owner,
          wallet,
          router,
          recovery,
          basePackId: 1n,
        }),
      ],
    })

    expect(result.walletAddress).toBe(wallet)
    expect(result.routerAddress).toBe(router)
    expect(result.policyAddresses).toEqual([policy])
    expect(result.policyDetails[0]?.kind).toBe('infinite-approval')
  })
})

import {
  keccak256,
  parseAbi,
  parseAbiItem,
  stringToHex,
  toHex,
  type Address,
  type Hex,
  type PublicClient,
} from 'viem'
import { FACTORY_ADDRESS } from './addresses/base'
import { FACTORY_LOG_LOOKBACK_BLOCKS } from './runtimeConfig'
import { getLogsInChunks, getLookbackStart } from '../lib/contracts/logs'

export const firewallModuleViewAbi = parseAbi([
  'function router() view returns (address)',
  'function owner() view returns (address)',
  'function nextNonce() view returns (uint96)',
  'function scheduledTxIdByNonce(uint96 nonce) view returns (bytes32)',
])

const FIREWALL_STORAGE_SLOT = BigInt(keccak256(stringToHex('firewall.vault.storage.v1'))) - 1n
const walletCreatedEventV2 = parseAbiItem(
  'event WalletCreated(address indexed owner, address indexed wallet, address indexed router, address recovery, uint256 basePackId)',
)
const walletCreatedEventLegacy = parseAbiItem(
  'event WalletCreated(address indexed owner, address indexed wallet, address indexed router, address recovery, uint8 presetId)',
)

type WalletCreatedLog = {
  args?: Record<string, unknown>
  blockNumber?: bigint | null
  logIndex?: number | bigint | null
  topics?: readonly Hex[]
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

function compactErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  const normalized = raw.replace(/\s+/g, ' ').trim()
  return normalized.length > 180 ? `${normalized.slice(0, 177)}...` : normalized
}

function decodeAddressFromTopic(topic: Hex | undefined): Address | null {
  if (!topic || !/^0x[a-fA-F0-9]{64}$/.test(topic)) {
    return null
  }

  const addressHex = topic.slice(26)
  if (/^0{40}$/i.test(addressHex)) {
    return null
  }

  return `0x${addressHex}` as Address
}

function extractRouterAddressFromWalletCreatedLog(log: WalletCreatedLog): Address | null {
  const routerRaw = log.args?.router
  if (typeof routerRaw === 'string' && /^0x[a-fA-F0-9]{40}$/.test(routerRaw) && !/^0x0{40}$/i.test(routerRaw)) {
    return routerRaw as Address
  }

  return decodeAddressFromTopic(log.topics?.[3])
}

function toComparableLogIndex(value: number | bigint | null | undefined): bigint {
  if (typeof value === 'bigint') {
    return value >= 0n ? value : -1n
  }
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return BigInt(value)
  }
  return -1n
}

async function readLatestRouterFromFactoryLogs(params: {
  publicClient: Pick<PublicClient, 'getLogs'>
  walletAddress: Address
  fromBlock: bigint
  toBlock: bigint
  event: unknown
}): Promise<Address | null> {
  const getLogs = params.publicClient.getLogs as unknown as (args: {
    address: Address
    event: unknown
    args?: Record<string, unknown>
    fromBlock: bigint
    toBlock: bigint
  }) => Promise<readonly WalletCreatedLog[]>

  const logs = await getLogsInChunks<WalletCreatedLog>({
    fromBlock: params.fromBlock,
    toBlock: params.toBlock,
    fetchChunk: ({ fromBlock, toBlock }) =>
      getLogs({
        address: FACTORY_ADDRESS,
        event: params.event,
        args: {
          wallet: params.walletAddress,
        },
        fromBlock,
        toBlock,
      }),
  })

  let latestRouter: Address | null = null
  let latestLogBlock = -1n
  let latestLogIndex = -1n

  for (const log of logs) {
    const router = extractRouterAddressFromWalletCreatedLog(log)
    if (!router) {
      continue
    }

    const block = log.blockNumber ?? 0n
    const logIndex = toComparableLogIndex(log.logIndex)
    const isNewer = block > latestLogBlock || (block === latestLogBlock && logIndex >= latestLogIndex)

    if (isNewer) {
      latestLogBlock = block
      latestLogIndex = logIndex
      latestRouter = router
    }
  }

  return latestRouter
}

export function getFirewallModuleViewConfig(walletAddress: Address) {
  return {
    address: walletAddress,
    abi: firewallModuleViewAbi,
  } as const
}

export async function readRouterAddress(params: {
  publicClient: Pick<PublicClient, 'readContract' | 'getStorageAt' | 'getBlockNumber' | 'getLogs'>
  walletAddress: Address
}): Promise<Address> {
  const diagnostics: string[] = []

  try {
    const routerRaw = await params.publicClient.readContract({
      ...getFirewallModuleViewConfig(params.walletAddress),
      functionName: 'router',
    })

    if (typeof routerRaw === 'string' && /^0x[a-fA-F0-9]{40}$/.test(routerRaw) && !/^0x0{40}$/i.test(routerRaw)) {
      return routerRaw as Address
    }

    diagnostics.push('router() returned zero/invalid address')
  } catch (error) {
    diagnostics.push(`router() read failed: ${compactErrorMessage(error)}`)
  }

  try {
    const routerStorageWord = await params.publicClient.getStorageAt({
      address: params.walletAddress,
      slot: toHex(FIREWALL_STORAGE_SLOT),
    })
    const routerFromStorage = decodeAddressFromStorageWord(routerStorageWord)
    if (routerFromStorage) {
      return routerFromStorage
    }

    diagnostics.push('router storage slot is empty')
  } catch {
    diagnostics.push('router storage read failed')
  }

  try {
    const latestBlock = await params.publicClient.getBlockNumber()
    const fromBlock = getLookbackStart(latestBlock, FACTORY_LOG_LOOKBACK_BLOCKS)

    const routerFromV2Event = await readLatestRouterFromFactoryLogs({
      publicClient: params.publicClient,
      walletAddress: params.walletAddress,
      fromBlock,
      toBlock: latestBlock,
      event: walletCreatedEventV2,
    })
    if (routerFromV2Event) {
      return routerFromV2Event
    }
    diagnostics.push('WalletCreated(v2) log not found in lookback')

    const routerFromLegacyEvent = await readLatestRouterFromFactoryLogs({
      publicClient: params.publicClient,
      walletAddress: params.walletAddress,
      fromBlock,
      toBlock: latestBlock,
      event: walletCreatedEventLegacy,
    })
    if (routerFromLegacyEvent) {
      return routerFromLegacyEvent
    }
    diagnostics.push('WalletCreated(legacy) log not found in lookback')
  } catch (error) {
    diagnostics.push(`factory log fallback failed: ${compactErrorMessage(error)}`)
  }

  throw new Error(`Vault router address is unavailable. ${diagnostics.join(' | ')}`)
}

export async function readQueueTxIds(params: {
  publicClient: Pick<PublicClient, 'readContract'>
  walletAddress: Address
}): Promise<`0x${string}`[]> {
  const nonceRaw = await params.publicClient.readContract({
    ...getFirewallModuleViewConfig(params.walletAddress),
    functionName: 'nextNonce',
  })

  if (typeof nonceRaw !== 'bigint' && typeof nonceRaw !== 'number') {
    return []
  }

  const nonce = typeof nonceRaw === 'number' ? nonceRaw : Number(nonceRaw)
  if (!Number.isFinite(nonce) || nonce <= 0) {
    return []
  }

  const txIdsRaw = await Promise.all(
    Array.from({ length: nonce }, (_, index) =>
      params.publicClient.readContract({
        ...getFirewallModuleViewConfig(params.walletAddress),
        functionName: 'scheduledTxIdByNonce',
        args: [BigInt(index)],
      }),
    ),
  )

  const nonZeroTxIds: `0x${string}`[] = []
  const zeroBytes32 = `0x${'0'.repeat(64)}`

  for (const txIdRaw of txIdsRaw) {
    if (typeof txIdRaw === 'string' && /^0x[a-fA-F0-9]{64}$/.test(txIdRaw) && txIdRaw !== zeroBytes32) {
      nonZeroTxIds.push(txIdRaw as `0x${string}`)
    }
  }

  return Array.from(new Set(nonZeroTxIds)).reverse()
}

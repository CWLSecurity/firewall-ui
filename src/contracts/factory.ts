import {
  parseAbiItem,
  parseEventLogs,
  type Address,
  type Hash,
  type PublicClient,
} from 'viem'
import { firewallFactoryAbi } from './abi'
import { FACTORY_ADDRESS } from './addresses/base'
import { FACTORY_LOG_LOOKBACK_BLOCKS } from './runtimeConfig'
import { getLogsInChunks, getLookbackStart } from '../lib/contracts/logs'

export const factoryConfig = {
  address: FACTORY_ADDRESS,
  abi: firewallFactoryAbi,
} as const

// Contract has no owner->wallet mapping view, so wallet discovery relies on WalletCreated logs.
// Lookback is runtime-configurable via VITE_FACTORY_LOG_LOOKBACK_BLOCKS.
export const DEFAULT_WALLET_LOOKBACK_BLOCKS = FACTORY_LOG_LOOKBACK_BLOCKS
const walletCreatedEvent = parseAbiItem(
  'event WalletCreated(address indexed owner, address indexed wallet, address indexed router, address recovery, uint256 basePackId)',
)

export type WalletRecord = {
  walletAddress: Address
  basePackId: number | null
  blockNumber: bigint
  transactionHash: Hash | null
}

type WalletCreatedLog = {
  args?: Record<string, unknown>
  blockNumber?: bigint | null
  transactionHash?: Hash | null
}

const HISTORY_RETRY_DELAYS_MS = [250, 750] as const

function parsePackId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0) {
    return value
  }

  if (typeof value === 'bigint' && value >= 0n && value <= BigInt(Number.MAX_SAFE_INTEGER)) {
    return Number(value)
  }

  return null
}

function isTransientHistoryError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase()
  return (
    message.includes('503') ||
    message.includes('no backend is currently healthy') ||
    message.includes('gateway') ||
    message.includes('temporarily unavailable') ||
    message.includes('rate limit') ||
    message.includes('timeout')
  )
}

async function waitMs(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function readWalletCreatedLogs(params: {
  publicClient: Pick<PublicClient, 'getLogs'>
  owner: Address
  fromBlock: bigint
  toBlock: bigint
}): Promise<WalletCreatedLog[]> {
  let lastError: unknown = null

  for (let attempt = 0; attempt <= HISTORY_RETRY_DELAYS_MS.length; attempt += 1) {
    try {
      return await getLogsInChunks<WalletCreatedLog>({
        fromBlock: params.fromBlock,
        toBlock: params.toBlock,
        fetchChunk: ({ fromBlock: chunkFrom, toBlock: chunkTo }) =>
          params.publicClient.getLogs({
            address: FACTORY_ADDRESS,
            event: walletCreatedEvent,
            args: { owner: params.owner },
            fromBlock: chunkFrom,
            toBlock: chunkTo,
          }) as Promise<WalletCreatedLog[]>,
      })
    } catch (error) {
      lastError = error
      const canRetry = attempt < HISTORY_RETRY_DELAYS_MS.length && isTransientHistoryError(error)
      if (!canRetry) {
        break
      }
      await waitMs(HISTORY_RETRY_DELAYS_MS[attempt])
    }
  }

  if (isTransientHistoryError(lastError)) {
    throw new Error('Wallet history sync is temporarily unavailable on Base RPC. Retry in a moment.')
  }

  if (lastError instanceof Error) {
    throw lastError
  }
  throw new Error('Failed to load wallet history from chain.')
}

export function extractCreatedWalletFromReceipt(params: {
  logs: readonly {
    address: Address
    topics: readonly `0x${string}`[]
    data: `0x${string}`
  }[]
}): Address {
  const factoryLogs = params.logs.filter(
    (log) => log.address.toLowerCase() === FACTORY_ADDRESS.toLowerCase(),
  )

  if (factoryLogs.length === 0) {
    throw new Error('No FirewallFactory logs found in transaction receipt.')
  }

  const parsedLogs = parseEventLogs({
    abi: firewallFactoryAbi,
    eventName: 'WalletCreated',
    logs: factoryLogs as unknown as never[],
    strict: false,
  })

  for (const parsed of parsedLogs as Array<{ args?: Record<string, unknown> }>) {
    const wallet = parsed.args?.wallet
    if (typeof wallet === 'string' && /^0x[a-fA-F0-9]{40}$/.test(wallet)) {
      return wallet as Address
    }
  }

  throw new Error('WalletCreated event not found in receipt logs.')
}

function selectLatestWallet(params: {
  logs: Array<{
    args?: Record<string, unknown>
    blockNumber?: bigint | null
    transactionHash?: Hash | null
  }>
  owner: Address
}): WalletRecord | null {
  let latest: WalletRecord | null = null

  for (const log of params.logs) {
    const args = log.args as
      | { owner?: unknown; wallet?: unknown; basePackId?: unknown }
      | undefined
    const owner = args?.owner
    if (typeof owner !== 'string' || owner.toLowerCase() !== params.owner.toLowerCase()) {
      continue
    }

    const wallet = args?.wallet
    if (typeof wallet !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
      continue
    }

    const blockNumber = log.blockNumber ?? 0n
    const txHash = log.transactionHash ?? null

    const packId = parsePackId(args?.basePackId)

    const candidate: WalletRecord = {
      walletAddress: wallet as Address,
      basePackId: packId,
      blockNumber,
      transactionHash: txHash,
    }

    if (!latest || candidate.blockNumber >= latest.blockNumber) {
      latest = candidate
    }
  }

  return latest
}

export async function findLatestWalletByOwner(params: {
  publicClient: Pick<PublicClient, 'getBlockNumber' | 'getLogs'>
  owner: Address
  lookbackBlocks?: bigint
}): Promise<WalletRecord | null> {
  const latestBlock = await params.publicClient.getBlockNumber()
  const fromBlock = getLookbackStart(
    latestBlock,
    params.lookbackBlocks ?? DEFAULT_WALLET_LOOKBACK_BLOCKS,
  )

  const logs = await readWalletCreatedLogs({
    publicClient: params.publicClient,
    owner: params.owner,
    fromBlock,
    toBlock: latestBlock,
  })

  return selectLatestWallet({ logs, owner: params.owner })
}

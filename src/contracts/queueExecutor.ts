import { parseAbi, type Address, type PublicClient } from 'viem'

export const firewallModuleQueueExecutorAbi = parseAbi([
  'function setQueueExecutor(address executor, bool enabled)',
  'function isQueueExecutor(address executor) view returns (bool)',
])

export function getQueueExecutorConfig(walletAddress: Address) {
  return {
    address: walletAddress,
    abi: firewallModuleQueueExecutorAbi,
  } as const
}

export async function readIsQueueExecutor(params: {
  publicClient: Pick<PublicClient, 'readContract'>
  walletAddress: Address
  executorAddress: Address
}): Promise<boolean | null> {
  try {
    const enabledRaw = await params.publicClient.readContract({
      ...getQueueExecutorConfig(params.walletAddress),
      functionName: 'isQueueExecutor',
      args: [params.executorAddress],
    })

    return typeof enabledRaw === 'boolean' ? enabledRaw : null
  } catch {
    return null
  }
}

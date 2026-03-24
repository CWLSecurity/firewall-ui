export const BASE_RPC_MAX_LOG_RANGE_BLOCKS = 10_000n

export function getLookbackStart(latest: bigint, lookbackBlocks: bigint): bigint {
  return latest > lookbackBlocks ? latest - lookbackBlocks : 0n
}

export async function getLogsInChunks<TLog>(params: {
  fromBlock: bigint
  toBlock: bigint
  fetchChunk: (params: { fromBlock: bigint; toBlock: bigint }) => Promise<readonly TLog[]>
}): Promise<TLog[]> {
  if (params.toBlock < params.fromBlock) {
    return []
  }

  const logs: TLog[] = []
  let cursor = params.fromBlock

  while (cursor <= params.toBlock) {
    const chunkEnd = cursor + BASE_RPC_MAX_LOG_RANGE_BLOCKS - 1n
    const toBlock = chunkEnd > params.toBlock ? params.toBlock : chunkEnd
    const chunkLogs = await params.fetchChunk({ fromBlock: cursor, toBlock })
    logs.push(...chunkLogs)
    cursor = toBlock + 1n
  }

  return logs
}

function parsePositiveBigInt(value: string | undefined, fallback: bigint): bigint {
  if (!value) return fallback

  try {
    const parsed = BigInt(value)
    return parsed > 0n ? parsed : fallback
  } catch {
    return fallback
  }
}

function parsePackIdList(value: string | undefined, fallback: number[]): number[] {
  if (!value) {
    return fallback
  }

  const parsed = value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .map((item) => Number.parseInt(item, 10))
    .filter((item) => Number.isInteger(item) && item >= 0)

  return parsed.length > 0 ? Array.from(new Set(parsed)) : fallback
}

const DEFAULT_FACTORY_LOG_LOOKBACK_BLOCKS = 1_500_000n
const DEFAULT_QUEUE_LOG_LOOKBACK_BLOCKS = 1_000_000n
const DEFAULT_ADDON_PACK_CANDIDATE_IDS = [2, 3, 4, 5, 6, 7, 8, 9, 10]

export const FACTORY_LOG_LOOKBACK_BLOCKS = parsePositiveBigInt(
  import.meta.env.VITE_FACTORY_LOG_LOOKBACK_BLOCKS,
  DEFAULT_FACTORY_LOG_LOOKBACK_BLOCKS,
)

export const QUEUE_LOG_LOOKBACK_BLOCKS = parsePositiveBigInt(
  import.meta.env.VITE_QUEUE_LOG_LOOKBACK_BLOCKS,
  DEFAULT_QUEUE_LOG_LOOKBACK_BLOCKS,
)

export const ADDON_PACK_CANDIDATE_IDS = parsePackIdList(
  import.meta.env.VITE_ADDON_PACK_CANDIDATE_IDS,
  DEFAULT_ADDON_PACK_CANDIDATE_IDS,
)

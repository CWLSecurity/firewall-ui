import { useQuery } from '@tanstack/react-query'
import { formatEther, type Address } from 'viem'
import { useChainId, usePublicClient } from 'wagmi'

const BALANCE_READ_TIMEOUT_MS = 8_000
const BALANCE_AUTO_REFETCH_MS = 12_000

async function readBalanceWithTimeout(params: {
  read: () => Promise<bigint>
}): Promise<bigint> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error('Balance read timed out.'))
      }, BALANCE_READ_TIMEOUT_MS)
    })
    return await Promise.race([params.read(), timeoutPromise])
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  }
}

export function useEthBalance(address: Address | null) {
  const publicClient = usePublicClient()
  const chainId = useChainId()

  const query = useQuery({
    queryKey: ['eth-balance', chainId, address],
    enabled: Boolean(address && publicClient),
    queryFn: async () => {
      if (!address || !publicClient) {
        throw new Error('Address or public client missing')
      }
      const value = await readBalanceWithTimeout({
        read: () => publicClient.getBalance({ address }),
      })
      return formatEther(value)
    },
    retry: 1,
    refetchInterval: address && publicClient ? BALANCE_AUTO_REFETCH_MS : false,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  })

  return {
    balanceEth: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error ? query.error.message : null,
    refetch: query.refetch,
  }
}

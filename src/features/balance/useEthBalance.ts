import { useQuery } from '@tanstack/react-query'
import { formatEther, type Address } from 'viem'
import { useChainId, usePublicClient } from 'wagmi'

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
      const value = await publicClient.getBalance({ address })
      return formatEther(value)
    },
  })

  return {
    balanceEth: query.data ?? null,
    isLoading: query.isLoading,
    error: query.error ? query.error.message : null,
    refetch: query.refetch,
  }
}

import { fallback } from 'viem'
import { createConfig, http, injected } from 'wagmi'
import { BASE_CHAIN_ID, baseChain } from '../chains/base'

function parseRpcUrlList(raw: string | undefined): string[] {
  if (!raw) {
    return []
  }

  return raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values))
}

const envPrimaryRpc = import.meta.env.VITE_BASE_RPC_URL as string | undefined
const envFallbackRpcs = parseRpcUrlList(import.meta.env.VITE_BASE_RPC_FALLBACK_URLS as string | undefined)

const baseRpcUrls = unique([
  ...(envPrimaryRpc ? [envPrimaryRpc] : []),
  ...envFallbackRpcs,
  'https://mainnet.base.org',
  'https://base-rpc.publicnode.com',
  'https://base.llamarpc.com',
])

export const wagmiConfig = createConfig({
  chains: [baseChain],
  connectors: [injected()],
  storage: null,
  transports: {
    [BASE_CHAIN_ID]: fallback(
      baseRpcUrls.map((url) => http(url)),
      {
        rank: false,
      },
    ),
  },
})

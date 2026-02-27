import { createConfig, http, injected } from 'wagmi'
import { BASE_CHAIN_ID, baseChain } from '../chains/base'

export const wagmiConfig = createConfig({
  chains: [baseChain],
  connectors: [injected()],
  transports: {
    [BASE_CHAIN_ID]: http(),
  },
})

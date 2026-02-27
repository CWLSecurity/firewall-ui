import { isAddress, type Address } from 'viem'

export const LS_WALLET = 'firewall.walletAddress'
export const LS_PRESET = 'firewall.preset'

export function loadPersistedWallet(): {
  walletAddress: Address | null
  preset: 0 | 1 | null
} {
  try {
    const walletRaw = localStorage.getItem(LS_WALLET)
    const presetRaw = localStorage.getItem(LS_PRESET)
    const walletParsed = walletRaw ? (JSON.parse(walletRaw) as unknown) : null
    const presetParsed = presetRaw ? (JSON.parse(presetRaw) as unknown) : null

    const walletAddress =
      typeof walletParsed === 'string' && isAddress(walletParsed) ? walletParsed : null
    const preset = presetParsed === 0 ? 0 : presetParsed === 1 ? 1 : null

    return { walletAddress, preset }
  } catch {
    return { walletAddress: null, preset: null }
  }
}

export function persistWallet(params: { walletAddress: Address; preset: 0 | 1 | null }): void {
  localStorage.setItem(LS_WALLET, JSON.stringify(params.walletAddress))
  localStorage.setItem(LS_PRESET, JSON.stringify(params.preset))
}

export function clearPersistedWallet(): void {
  localStorage.removeItem(LS_WALLET)
  localStorage.removeItem(LS_PRESET)
}

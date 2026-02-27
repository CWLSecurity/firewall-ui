export const BASE_EXPLORER = 'https://basescan.org'

export function addressUrl(address: string): string {
  return `${BASE_EXPLORER}/address/${address}`
}

export function txUrl(hash: string): string {
  return `${BASE_EXPLORER}/tx/${hash}`
}

export function shortHash(x: string): string {
  return `${x.slice(0, 6)}...${x.slice(-4)}`
}

export function shortAddress(x: string): string {
  return `${x.slice(0, 6)}...${x.slice(-4)}`
}

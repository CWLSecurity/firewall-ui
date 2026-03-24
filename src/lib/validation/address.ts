export function isHexAddress(x: string): x is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(x)
}

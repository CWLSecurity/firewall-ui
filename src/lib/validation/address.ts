export function isHexAddress(x: string): x is `0x${string}` {
  return x.startsWith('0x') && x.length === 42
}

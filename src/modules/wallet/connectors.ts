export function isProviderNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false
  }

  const withMeta = error as { name?: unknown; shortMessage?: unknown; message?: unknown }
  if (withMeta.name === 'ProviderNotFoundError') {
    return true
  }

  const short = typeof withMeta.shortMessage === 'string' ? withMeta.shortMessage : ''
  const message = typeof withMeta.message === 'string' ? withMeta.message : ''
  return short.includes('Provider not found') || message.includes('Provider not found')
}

export function orderConnectorsByProviderPriority<T extends { id: string }>(connectors: readonly T[]): T[] {
  return [...connectors].sort((left, right) => {
    const leftIsGeneric = left.id === 'injected'
    const rightIsGeneric = right.id === 'injected'
    if (leftIsGeneric === rightIsGeneric) {
      return 0
    }
    return leftIsGeneric ? 1 : -1
  })
}

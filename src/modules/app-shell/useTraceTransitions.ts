import { useEffect, useRef } from 'react'
import { logCreateFlowDebug } from '../debug/createFlowDebug'

type TraceField = {
  key: string
  value: unknown
  trigger: string
  source: string
}

export function useTraceTransitions(fields: TraceField[]) {
  const previousByKeyRef = useRef<Record<string, unknown>>({})

  useEffect(() => {
    const previousByKey = previousByKeyRef.current
    const nextByKey: Record<string, unknown> = { ...previousByKey }

    for (const field of fields) {
      const previous = previousByKey[field.key]
      const next = field.value

      if (previous === next) {
        continue
      }

      logCreateFlowDebug('state_transition', {
        key: field.key,
        previous,
        next,
        trigger: field.trigger,
        source: field.source,
      })

      nextByKey[field.key] = next
    }

    previousByKeyRef.current = nextByKey
  }, [fields])
}

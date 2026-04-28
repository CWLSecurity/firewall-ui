import { useEffect, useState } from 'react'

type CopyButtonProps = {
  value: string
  label?: string
  mode?: 'text' | 'icon'
}

function CopyIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M4.25 2A2.25 2.25 0 0 0 2 4.25v7.5A2.25 2.25 0 0 0 4.25 14h5.5A2.25 2.25 0 0 0 12 11.75v-1h1A2.25 2.25 0 0 0 15.25 8.5v-4A2.25 2.25 0 0 0 13 2.25h-4A2.25 2.25 0 0 0 6.75 4.5v1h-2.5Zm3.75 2.5c0-.55.45-1 1-1h4c.55 0 1 .45 1 1v4c0 .55-.45 1-1 1h-1V4.25A2.25 2.25 0 0 0 9.75 2h-1.5V4.5Zm-4.75-.25c0-.55.45-1 1-1h5.5c.55 0 1 .45 1 1v7.5c0 .55-.45 1-1 1h-5.5c-.55 0-1-.45-1-1v-7.5Z"
      />
    </svg>
  )
}

function CopySuccessIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M13.78 4.22a.75.75 0 0 0-1.06 0L6.5 10.44 3.28 7.22a.75.75 0 1 0-1.06 1.06l3.75 3.75a.75.75 0 0 0 1.06 0l6.75-6.75a.75.75 0 0 0 0-1.06Z" />
    </svg>
  )
}

function CopyFailedIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M8 1.5A6.5 6.5 0 1 0 8 14.5 6.5 6.5 0 0 0 8 1.5Zm0 3a.75.75 0 0 1 .75.75v3.5a.75.75 0 1 1-1.5 0v-3.5A.75.75 0 0 1 8 4.5Zm0 7a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z" />
    </svg>
  )
}

export function CopyButton({ value, label = 'Copy', mode = 'text' }: CopyButtonProps) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const feedbackLabel = state === 'copied' ? 'Copied!' : state === 'failed' ? 'Copy failed' : label

  useEffect(() => {
    if (state === 'idle') {
      return
    }
    const timer = window.setTimeout(() => setState('idle'), 1200)
    return () => window.clearTimeout(timer)
  }, [state])

  return (
    <button
      type="button"
      className={`copy-button${mode === 'icon' ? ' copy-button--icon' : ''}`}
      title={feedbackLabel}
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setState('copied')
        } catch {
          setState('failed')
        }
      }}
    >
      {mode === 'icon'
        ? state === 'copied'
          ? <CopySuccessIcon />
          : state === 'failed'
            ? <CopyFailedIcon />
            : <CopyIcon />
        : feedbackLabel}
    </button>
  )
}

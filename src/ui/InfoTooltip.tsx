import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

type InfoTooltipProps = {
  label: string
  children: ReactNode
}

const VIEWPORT_MARGIN = 12
const TOOLTIP_GAP = 8

let activeTooltipId: string | null = null
const activeTooltipListeners = new Set<(value: string | null) => void>()

function getActiveTooltipId(): string | null {
  return activeTooltipId
}

function setActiveTooltipId(value: string | null) {
  if (activeTooltipId === value) {
    return
  }

  activeTooltipId = value
  for (const listener of activeTooltipListeners) {
    listener(activeTooltipId)
  }
}

function subscribeActiveTooltip(listener: (value: string | null) => void) {
  activeTooltipListeners.add(listener)
  return () => {
    activeTooltipListeners.delete(listener)
  }
}

export function InfoTooltip({ label, children }: InfoTooltipProps) {
  const [isFocusVisible, setIsFocusVisible] = useState(false)
  const [isHoveringTrigger, setIsHoveringTrigger] = useState(false)
  const [isHoveringTooltip, setIsHoveringTooltip] = useState(false)
  const [currentActiveTooltipId, setCurrentActiveTooltipId] = useState<string | null>(() => getActiveTooltipId())
  const [positionStyle, setPositionStyle] = useState<CSSProperties | null>(null)

  const tooltipId = useId()
  const wrapperRef = useRef<HTMLSpanElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  const closeTimerRef = useRef<number | null>(null)
  const isFocusVisibleRef = useRef(false)
  const isHoveringTriggerRef = useRef(false)
  const isHoveringTooltipRef = useRef(false)

  const isOpen = currentActiveTooltipId === tooltipId && (isFocusVisible || isHoveringTrigger || isHoveringTooltip)

  function clearCloseTimer() {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }

  function closeIfInactive() {
    if (
      isFocusVisibleRef.current ||
      isHoveringTriggerRef.current ||
      isHoveringTooltipRef.current
    ) {
      return
    }

    if (getActiveTooltipId() === tooltipId) {
      setActiveTooltipId(null)
    }
  }

  function scheduleCloseIfInactive() {
    clearCloseTimer()
    closeTimerRef.current = window.setTimeout(() => {
      closeIfInactive()
      closeTimerRef.current = null
    }, 80)
  }

  useEffect(() => subscribeActiveTooltip(setCurrentActiveTooltipId), [])

  useEffect(() => {
    isFocusVisibleRef.current = isFocusVisible
  }, [isFocusVisible])

  useEffect(() => {
    isHoveringTriggerRef.current = isHoveringTrigger
  }, [isHoveringTrigger])

  useEffect(() => {
    isHoveringTooltipRef.current = isHoveringTooltip
  }, [isHoveringTooltip])

  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current || !tooltipRef.current) {
      return
    }

    function computePosition() {
      if (!triggerRef.current || !tooltipRef.current) {
        return
      }

      const triggerRect = triggerRef.current.getBoundingClientRect()
      const tooltip = tooltipRef.current
      const maxWidth = Math.min(360, window.innerWidth - VIEWPORT_MARGIN * 2)

      tooltip.style.maxWidth = `${maxWidth}px`

      const tooltipRect = tooltip.getBoundingClientRect()
      let left = triggerRect.left
      if (left + tooltipRect.width > window.innerWidth - VIEWPORT_MARGIN) {
        left = window.innerWidth - VIEWPORT_MARGIN - tooltipRect.width
      }
      if (left < VIEWPORT_MARGIN) {
        left = VIEWPORT_MARGIN
      }

      let top = triggerRect.bottom + TOOLTIP_GAP
      if (
        top + tooltipRect.height > window.innerHeight - VIEWPORT_MARGIN &&
        triggerRect.top - TOOLTIP_GAP - tooltipRect.height >= VIEWPORT_MARGIN
      ) {
        top = triggerRect.top - TOOLTIP_GAP - tooltipRect.height
      } else if (top + tooltipRect.height > window.innerHeight - VIEWPORT_MARGIN) {
        top = window.innerHeight - VIEWPORT_MARGIN - tooltipRect.height
      }

      if (top < VIEWPORT_MARGIN) {
        top = VIEWPORT_MARGIN
      }

      setPositionStyle({
        position: 'fixed',
        top,
        left,
        zIndex: 2600,
      })
    }

    computePosition()
    window.addEventListener('resize', computePosition)
    window.addEventListener('scroll', computePosition, true)

    return () => {
      window.removeEventListener('resize', computePosition)
      window.removeEventListener('scroll', computePosition, true)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setActiveTooltipId(null)
        setIsFocusVisible(false)
        setIsHoveringTrigger(false)
        setIsHoveringTooltip(false)
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  useEffect(() => {
    return () => {
      clearCloseTimer()
      if (getActiveTooltipId() === tooltipId) {
        setActiveTooltipId(null)
      }
    }
  }, [tooltipId])

  return (
    <span className={`info-tooltip ${isOpen ? 'info-tooltip--open' : ''}`} ref={wrapperRef}>
      <button
        ref={triggerRef}
        type="button"
        className="info-tooltip-trigger"
        aria-label={label}
        aria-describedby={isOpen ? tooltipId : undefined}
        aria-expanded={isOpen}
        onClick={(event) => {
          event.preventDefault()
        }}
        onMouseEnter={() => {
          clearCloseTimer()
          setIsHoveringTrigger(true)
          setActiveTooltipId(tooltipId)
        }}
        onMouseLeave={() => {
          setIsHoveringTrigger(false)
          scheduleCloseIfInactive()
        }}
        onFocus={() => {
          clearCloseTimer()
          setIsFocusVisible(true)
          setActiveTooltipId(tooltipId)
        }}
        onBlur={() => {
          window.setTimeout(() => {
            const active = document.activeElement
            const inTrigger = wrapperRef.current?.contains(active) ?? false
            const inTooltip = tooltipRef.current?.contains(active) ?? false
            if (!inTrigger && !inTooltip) {
              setIsFocusVisible(false)
              scheduleCloseIfInactive()
            }
          }, 0)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setActiveTooltipId(null)
            setIsFocusVisible(false)
            setIsHoveringTrigger(false)
            setIsHoveringTooltip(false)
            triggerRef.current?.blur()
          }
        }}
      >
        ?
      </button>
      {isOpen
        ? createPortal(
            <div
              id={tooltipId}
              ref={tooltipRef}
              role="tooltip"
              className="info-tooltip-content"
              style={positionStyle ?? undefined}
              onMouseEnter={() => {
                clearCloseTimer()
                setIsHoveringTooltip(true)
                setActiveTooltipId(tooltipId)
              }}
              onMouseLeave={() => {
                setIsHoveringTooltip(false)
                scheduleCloseIfInactive()
              }}
            >
              {children}
            </div>,
            document.body,
          )
        : null}
    </span>
  )
}

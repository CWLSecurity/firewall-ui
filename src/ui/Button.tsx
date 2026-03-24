import type { ButtonHTMLAttributes, PropsWithChildren } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost'

type ButtonProps = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: Variant
  }
>

export function Button({ variant = 'secondary', className, children, ...rest }: ButtonProps) {
  const mergedClassName = ['button', `button--${variant}`, className].filter(Boolean).join(' ')

  return (
    <button className={mergedClassName} {...rest}>
      {children}
    </button>
  )
}

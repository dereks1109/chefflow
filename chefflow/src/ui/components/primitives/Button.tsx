import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Slot for an icon rendered before the label */
  iconLeft?: ReactNode;
  /** Slot for an icon rendered after the label */
  iconRight?: ReactNode;
  children?: ReactNode;
}

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-accent text-black hover:bg-accent-dim active:scale-95 ' +
    'focus-visible:ring-accent',
  secondary:
    'bg-surface-3 text-slate-100 border border-[rgba(255,255,255,0.08)] ' +
    'hover:bg-surface-2 active:scale-95 focus-visible:ring-accent ' +
    'light:bg-slate-100 light:text-slate-900 light:hover:bg-slate-200',
  ghost:
    'bg-transparent text-slate-400 hover:text-slate-100 hover:bg-surface-2 ' +
    'active:scale-95 focus-visible:ring-accent',
  danger:
    'bg-danger text-white hover:opacity-90 active:scale-95 ' +
    'focus-visible:ring-danger',
};

const sizeClasses: Record<Size, string> = {
  sm: 'h-9 min-h-9 px-3 text-sm gap-1.5',
  md: 'min-h-touch px-4 text-base gap-2',
  lg: 'min-h-[52px] px-6 text-lg gap-2.5',
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    iconLeft,
    iconRight,
    children,
    className = '',
    disabled,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled}
      className={[
        'inline-flex items-center justify-center font-medium rounded-md',
        'transition-all duration-150',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        'dark:focus-visible:ring-offset-surface-1',
        'disabled:opacity-40 disabled:pointer-events-none',
        'select-none',
        variantClasses[variant],
        sizeClasses[size],
        className,
      ].join(' ')}
      {...rest}
    >
      {iconLeft && <span className="shrink-0 flex items-center" aria-hidden="true">{iconLeft}</span>}
      {children && <span>{children}</span>}
      {iconRight && <span className="shrink-0 flex items-center" aria-hidden="true">{iconRight}</span>}
    </button>
  );
});

export default Button;

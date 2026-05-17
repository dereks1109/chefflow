import { type HTMLAttributes, type ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Render a teal glow border on hover */
  glowOnHover?: boolean;
  children?: ReactNode;
}

export default function Card({
  glowOnHover = false,
  children,
  className = '',
  ...rest
}: CardProps) {
  return (
    <div
      className={[
        'rounded-xl border border-[rgba(255,255,255,0.08)] bg-surface-2',
        'transition-all duration-200',
        glowOnHover
          ? 'hover:border-[rgba(94,234,212,0.25)] hover:shadow-[0_0_16px_rgba(94,234,212,0.10)]'
          : '',
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </div>
  );
}

import { type HTMLAttributes, type ReactNode } from 'react';

type Elevation = 0 | 1 | 2 | 3;

interface SurfaceProps extends HTMLAttributes<HTMLDivElement> {
  elevation?: Elevation;
  children?: ReactNode;
}

const elevationClasses: Record<Elevation, string> = {
  0: 'bg-surface-0',
  1: 'bg-surface-1',
  2: 'bg-surface-2',
  3: 'bg-surface-3',
};

export default function Surface({
  elevation = 1,
  children,
  className = '',
  ...rest
}: SurfaceProps) {
  return (
    <div
      className={[
        elevationClasses[elevation],
        'border border-[rgba(255,255,255,0.08)]',
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </div>
  );
}

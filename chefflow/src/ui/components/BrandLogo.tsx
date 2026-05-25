import { ChefHat } from 'lucide-react';

interface BrandLogoProps {
  showText?: boolean;
  className?: string;
  iconClassName?: string;
  textClassName?: string;
}

// Single source of truth for the ChefFlow wordmark. Renders the lucide
// chef-hat in accent colour plus the "ChefFlow" text. Callers wrap in
// their own Link/NavLink/anchor — keeps this component routing-agnostic.
export default function BrandLogo({
  showText = true,
  className,
  iconClassName = 'h-5 w-5 text-accent',
  textClassName = 'font-medium',
}: BrandLogoProps) {
  return (
    <span className={['inline-flex items-center gap-2', className].filter(Boolean).join(' ')}>
      <ChefHat className={iconClassName} aria-hidden="true" />
      {showText && <span className={textClassName}>ChefFlow</span>}
    </span>
  );
}

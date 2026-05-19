/**
 * Logo — ChefFlow brand mark and wordmark.
 *
 * Renders as inline SVG so it stays crisp at any DPI, inherits text colour via
 * currentColor, and requires no asset request.
 *
 * Props
 *   variant  — 'mark' (icon only, 32x32 viewBox) | 'wordmark' (icon + text, 140x32 viewBox)
 *   className — applied to the root <svg> element; callers control rendered size
 *
 * Conceptual mark: minimalist chef's toque.
 *   - Dome arc + brim bar in two strokes — legible at 24 px.
 *   - Dome and crown band use currentColor (follows text colour in light/dark modes).
 *   - Brim bar uses the resolved accent colour #f97316 for brand warmth.
 */

const ACCENT = '#f97316';

interface LogoProps {
  variant?: 'mark' | 'wordmark';
  className?: string;
}

export default function Logo({ variant = 'wordmark', className }: LogoProps) {
  if (variant === 'mark') {
    return (
      <svg
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
        role="img"
        aria-label="ChefFlow"
      >
        {/* Toque dome — smooth arc from left brim edge to right brim edge */}
        <path
          d="M6 21 C6 21 6 8 16 8 C26 8 26 21 26 21"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          fill="none"
        />
        {/* Crown horizontal band just below dome peak */}
        <line
          x1="8"
          y1="15"
          x2="24"
          y2="15"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          opacity="0.45"
        />
        {/* Brim bar — accent colour */}
        <rect
          x="5"
          y="21"
          width="22"
          height="2.8"
          rx="1.4"
          fill={ACCENT}
        />
        {/* Short motion line beneath brim — suggests flow/process */}
        <line
          x1="10"
          y1="26"
          x2="22"
          y2="26"
          stroke={ACCENT}
          strokeWidth="1.4"
          strokeLinecap="round"
          opacity="0.5"
        />
      </svg>
    );
  }

  // wordmark variant — 140x32 viewBox
  return (
    <svg
      viewBox="0 0 140 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="ChefFlow"
    >
      {/* --- Mark (scaled to fit 32-tall viewBox, centred in first 32px col) --- */}

      {/* Toque dome */}
      <path
        d="M4 22 C4 22 4 7 16 7 C28 7 28 22 28 22"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />
      {/* Crown band */}
      <line
        x1="6.5"
        y1="15.5"
        x2="25.5"
        y2="15.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.45"
      />
      {/* Brim — accent */}
      <rect
        x="3"
        y="22"
        width="26"
        height="2.8"
        rx="1.4"
        fill={ACCENT}
      />
      {/* Flow line */}
      <line
        x1="8"
        y1="27"
        x2="24"
        y2="27"
        stroke={ACCENT}
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.5"
      />

      {/* --- Wordmark text (SVG text for crisp rendering without webfonts) --- */}

      {/* "Chef" — currentColor */}
      <text
        x="36"
        y="22"
        fontFamily="ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        fontSize="17"
        fontWeight="700"
        letterSpacing="-0.55"
        fill="currentColor"
      >
        Chef
      </text>
      {/* "Flow" — accent colour */}
      <text
        x="79"
        y="22"
        fontFamily="ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        fontSize="17"
        fontWeight="700"
        letterSpacing="-0.55"
        fill={ACCENT}
      >
        Flow
      </text>
    </svg>
  );
}

import type { ReactNode } from 'react';
import { useTierStore } from '../../state/useTierStore';
import { meetsTier, type Tier } from './limits';

/**
 * Renders `children` only when the current user's tier meets `require`.
 * Otherwise renders `fallback` (default: null).
 *
 * Usage:
 *   <TierGate require="pro">
 *     <PlacesAutocompleteField />
 *   </TierGate>
 *
 *   <TierGate require="pro" fallback={<UpgradePrompt feature="autocomplete" />}>
 *     <PlacesAutocompleteField />
 *   </TierGate>
 *
 * Subscribes to `useTierStore` so upgrades surface immediately when the
 * store is updated (typically via `<TierSync />` after a Clerk metadata
 * refresh).
 */
interface Props {
  require: Tier;
  children: ReactNode;
  fallback?: ReactNode;
}

export default function TierGate({ require, children, fallback = null }: Props) {
  const tier = useTierStore((s) => s.tier);
  return <>{meetsTier(tier, require) ? children : fallback}</>;
}

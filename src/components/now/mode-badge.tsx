import { AppText } from '@/components/ui';
import type { SensingMode } from '@/lib/score';

/**
 * Where the scene comes from, in plain words: "Live" while Score senses it
 * automatically, "Your scene" when it was set by hand on the Scene tab.
 * (The engine calls the hand-set mode 'simulated'.)
 */
export function ModeBadge({ mode }: { mode: SensingMode }) {
  const label = mode === 'live' ? 'Live' : 'Your scene';
  return (
    <AppText accessibilityLabel={`Scene source: ${label}`} numberOfLines={1} tone="muted" variant="meta">
      {label}
    </AppText>
  );
}

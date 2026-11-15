import { LiveBadge } from '@/components/ui';
import type { SensingMode } from '@/lib/score';

/**
 * Where the scene comes from: LIVE (amber) while Score senses it automatically,
 * YOUR SCENE (neutral) when it was set by hand on the Scene tab. The dot pulses
 * only while a session runs.
 */
export function ModeBadge({ mode, active }: { mode: SensingMode; active: boolean }) {
  return (
    <LiveBadge
      active={active}
      label={mode === 'live' ? 'Live' : 'Your scene'}
      tone={mode === 'live' ? 'accent' : 'neutral'}
    />
  );
}

import { LiveBadge } from '@/components/ui';
import type { SensingMode } from '@/lib/score';

/** LIVE (amber) or SIMULATED (blue). The dot pulses only while a session runs. */
export function ModeBadge({ mode, active }: { mode: SensingMode; active: boolean }) {
  return (
    <LiveBadge
      active={active}
      label={mode === 'live' ? 'Live' : 'Simulated'}
      tone={mode === 'live' ? 'accent' : 'calm'}
    />
  );
}

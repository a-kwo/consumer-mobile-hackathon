import { AppText } from '@/components/ui';
import type { Scene } from '@/lib/score';

import { occasionShort } from './format';

type Props = {
  /** A scene from `buildScene` or from the server; it may carry no occasion. */
  scene: Scene | null | undefined;
  testID: string;
};

/** True when the scene carries an occasion that `OccasionText` would show. */
export function hasOccasion(scene: Scene | null | undefined): boolean {
  return occasionShort(scene) !== null;
}

/**
 * The occasion steering the score, as a few words to nest inside the Now
 * screen's meta line: " · Game in 45 min". Screen readers get the whole line
 * ("Game in 45 min · building up"). Renders nothing when the scene has none.
 *
 * (The file keeps its first name; the identity has no chips.)
 */
export function OccasionText({ scene, testID }: Props) {
  const short = occasionShort(scene);
  if (!short) return null;
  return (
    <AppText accessibilityLabel={scene?.occasionLine} testID={testID} tone="primary" variant="meta">
      {` · ${short}`}
    </AppText>
  );
}

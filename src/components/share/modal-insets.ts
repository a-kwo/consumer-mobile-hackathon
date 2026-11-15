import { Platform } from 'react-native';

import { useScreenInsets } from '@/components/ui';
import { space } from '@/theme';

/**
 * Top padding for a screen presented with `presentation: 'modal'`.
 *
 * On iOS such a screen is a page sheet that starts below the status bar, but
 * the safe-area inset it reads is still the window's, so padding by it leaves
 * a band of dead space at the top of the sheet. A small fixed padding is
 * right there. On Android and the web the modal covers the whole window, so
 * the status-bar inset still applies.
 */
export function useModalTopPadding(): number {
  const insets = useScreenInsets();
  return Platform.OS === 'ios' ? space.lg : insets.top + space.md;
}

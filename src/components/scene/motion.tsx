import { useEffect, useState, type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, { css, useReducedMotion } from 'react-native-reanimated';

/**
 * The few motions the Scene and Now screens share. All of them are short
 * fades with at most a few points of travel; nothing bounces. They are
 * Reanimated CSS animations, which run the same on iOS, Android and web. With
 * the platform's reduced-motion setting on, nothing moves: things appear.
 */

const rise = css.keyframes({
  from: { opacity: 0, transform: [{ translateY: 10 }] },
  to: { opacity: 1, transform: [{ translateY: 0 }] },
});

const dissolve = css.keyframes({
  from: { opacity: 0 },
  to: { opacity: 1 },
});

type EnterProps = {
  children?: ReactNode;
  /** Milliseconds to wait, to stagger a group. */
  delay?: number;
  /** @default 520 */
  duration?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

function Enter({
  children,
  delay = 0,
  duration = 520,
  style,
  testID,
  name,
}: EnterProps & { name: typeof rise }) {
  const reduceMotion = useReducedMotion();
  return (
    <Animated.View
      style={[
        style,
        reduceMotion
          ? null
          : {
              animationName: name,
              animationDuration: duration,
              animationDelay: delay,
              animationTimingFunction: 'ease-out',
              animationFillMode: 'both',
            },
      ]}
      testID={testID}>
      {children}
    </Animated.View>
  );
}

/** Children fade and rise a few points into place when this mounts. */
export function Rise(props: EnterProps) {
  return <Enter {...props} name={rise} />;
}

/** Children dissolve in when this mounts. Give it a `key` to replay on a change. */
export function Dissolve(props: EnterProps) {
  return <Enter {...props} name={dissolve} />;
}

/** How long the outgoing half of a cross-fade takes. */
export const CROSS_FADE_OUT_MS = 300;

/**
 * Cross-fades a value: when `key` changes, the old value stays for a moment
 * with `visible` false (fade it out), then the new value arrives with
 * `visible` true (fade it in). While the key is unchanged the live value
 * passes straight through.
 *
 *   const song = useCrossFade(track, String(track?.deezerId));
 *   <Animated.View style={{ opacity: song.visible ? 1 : 0, transitionProperty: 'opacity', … }}>
 *     {song.value?.title}
 */
export function useCrossFade<T>(value: T, key: string): { value: T; visible: boolean } {
  const reduceMotion = useReducedMotion();
  const [shown, setShown] = useState({ key, value });
  const changing = shown.key !== key;

  useEffect(() => {
    if (!changing) return;
    const timer = setTimeout(() => setShown({ key, value }), reduceMotion ? 0 : CROSS_FADE_OUT_MS);
    return () => clearTimeout(timer);
  }, [changing, key, value, reduceMotion]);

  return { value: changing ? shown.value : value, visible: !changing };
}

/** The style that goes with `useCrossFade`: opacity eased both ways. */
export function crossFadeStyle(visible: boolean, reduceMotion: boolean) {
  return {
    opacity: visible ? 1 : 0,
    transitionProperty: 'opacity' as const,
    transitionDuration: reduceMotion ? 0 : visible ? 620 : CROSS_FADE_OUT_MS,
    transitionTimingFunction: 'ease-in-out' as const,
  };
}

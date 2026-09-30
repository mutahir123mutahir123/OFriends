/**
 * Skeleton / Bone — shared pulse animation system.
 *
 * All <Bone> elements on screen share ONE Animated.Value (module-level)
 * so they pulse perfectly in sync — no context / provider needed.
 *
 * Usage:
 *   import { Bone } from '@/components/Skeleton';
 *   <Bone width={120} height={16} radius={8} />
 *   <Bone width={60} height={60} radius={30} />   // circle
 */

import { Animated, ViewStyle } from 'react-native';
import { Colors } from '@/lib/theme';

/* ── Module-level shared pulse ──────────────────────────── */
const pulse = new Animated.Value(0);
Animated.loop(
  Animated.sequence([
    Animated.timing(pulse, { toValue: 1, duration: 850, useNativeDriver: true }),
    Animated.timing(pulse, { toValue: 0, duration: 850, useNativeDriver: true }),
  ])
).start();

const SKEL_BASE = Colors.surfaceContainerHigh;   // #2a2a2a

/* ── Bone ───────────────────────────────────────────────── */
type BoneProps = {
  width:   number | `${number}%`;
  height:  number;
  radius?: number;
  style?:  ViewStyle;
};

export function Bone({ width, height, radius = 8, style }: BoneProps) {
  const opacity = pulse.interpolate({
    inputRange:  [0, 1],
    outputRange: [0.38, 0.72],
  });

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: SKEL_BASE,
          opacity,
        },
        style,
      ]}
    />
  );
}

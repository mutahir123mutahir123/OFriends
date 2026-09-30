import { useEffect, useState } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '@/lib/theme';
import { Duration, Curves } from '@/lib/motion';

type Props = {
  size?: number;
  seen?: boolean;
  children: React.ReactNode;
};

export function StoryRing({ size = 64, seen = false, children }: Props) {
  const padding = seen ? 2 : 3;
  const innerSize = size - padding * 2;

  // Unseen rings scale in once on mount so a fresh story reads as new.
  const [entrance] = useState(() => new Animated.Value(seen ? 1 : 0));

  useEffect(() => {
    if (seen) return;
    Animated.timing(entrance, {
      toValue: 1,
      duration: Duration.sheet,
      easing: Curves.standard,
      useNativeDriver: true,
    }).start();
  }, [entrance, seen]);

  const ring = seen ? (
    <View style={[styles.seenRing, { width: size, height: size, borderRadius: size / 2 }]}>
      <View style={[styles.inner, { width: innerSize, height: innerSize, borderRadius: innerSize / 2 }]}>
        {children}
      </View>
    </View>
  ) : (
    <LinearGradient
      colors={['#bd00ff', '#00eefc']}
      start={{ x: 0, y: 1 }}
      end={{ x: 1, y: 0 }}
      style={{ width: size, height: size, borderRadius: size / 2, padding, alignItems: 'center', justifyContent: 'center' }}
    >
      <View style={[styles.inner, { width: innerSize, height: innerSize, borderRadius: innerSize / 2 }]}>
        {children}
      </View>
    </LinearGradient>
  );

  return (
    <Animated.View
      style={{
        transform: [
          { scale: entrance },
          {
            rotate: entrance.interpolate({
              inputRange: [0, 1],
              outputRange: ['-8deg', '0deg'],
            }),
          },
        ],
      }}
    >
      {ring}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  seenRing: {
    backgroundColor: Colors.surfaceContainerHighest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: {
    backgroundColor: Colors.background,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

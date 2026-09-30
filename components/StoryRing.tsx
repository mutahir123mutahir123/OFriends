import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors } from '@/lib/theme';

type Props = {
  size?: number;
  seen?: boolean;
  children: React.ReactNode;
};

export function StoryRing({ size = 64, seen = false, children }: Props) {
  const padding = seen ? 2 : 3;
  const innerSize = size - padding * 2;

  if (seen) {
    return (
      <View style={[styles.seenRing, { width: size, height: size, borderRadius: size / 2 }]}>
        <View style={[styles.inner, { width: innerSize, height: innerSize, borderRadius: innerSize / 2 }]}>
          {children}
        </View>
      </View>
    );
  }

  return (
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

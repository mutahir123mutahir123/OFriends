import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { Colors, FontFamily } from '@/lib/theme';
import { getAvatarInitials } from '@/lib/helpers';

type Props = {
  uri?: string | null;
  name?: string;
  size?: number;
};

export function Avatar({ uri, name = '?', size = 40 }: Props) {
  const initials = getAvatarInitials(name);
  const fontSize = size * 0.38;

  if (uri) {
    return (
      <Image
        source={uri}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        contentFit="cover"
        transition={150}
      />
    );
  }

  return (
    <View style={[styles.fallback, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.initials, { fontSize }]}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: Colors.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontFamily: FontFamily.bold,
    color: Colors.white,
  },
});

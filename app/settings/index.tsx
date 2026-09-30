import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontFamily, FontSize, Spacing, BorderRadius } from '@/lib/theme';
import { useAuth } from '@/lib/auth';
import { PostOptionsSheet } from '@/components/PostOptionsSheet';
import { Spring } from '@/lib/motion';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export default function SettingsScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const [signOutVisible, setSignOutVisible] = useState(false);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={Colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Section: How you use OFriends */}
        <Text style={styles.sectionLabel}>How you use OFriends</Text>
        <View style={styles.section}>
          <MenuItem
            icon="bookmark-outline"
            label="Saved"
            onPress={() => router.push('/settings/saved')}
          />
          <Divider />
          <MenuItem
            icon="pulse-outline"
            label="Your Activity"
            onPress={() => router.push('/settings/activity')}
          />
        </View>

        {/* Section: Account */}
        <Text style={styles.sectionLabel}>Account</Text>
        <View style={styles.section}>
          <MenuItem
            icon="lock-closed-outline"
            label="Privacy & Security"
            onPress={() => router.push('/settings/privacy')}
          />
        </View>

        {/* Sign Out */}
        <TouchableOpacity
          style={styles.signOutBtn}
          onPress={() => setSignOutVisible(true)}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
        >
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>

      {signOutVisible && (
        <PostOptionsSheet
          visible={signOutVisible}
          onClose={() => setSignOutVisible(false)}
          options={[
            { label: 'Sign out', icon: 'log-out-outline', destructive: true, onPress: () => {} },
          ]}
          confirm={{
            title: 'Sign out?',
            body: 'You’ll need to sign in again to post, like, and message.',
            confirmLabel: 'Sign out',
            onConfirm: signOut,
          }}
        />
      )}
    </View>
  );
}

function MenuItem({ icon, label, onPress }: { icon: IoniconName; label: string; onPress: () => void }) {
  const [press] = useState(() => new Animated.Value(1));

  const animate = (to: number) =>
    Animated.spring(press, { toValue: to, ...Spring.gentle, useNativeDriver: true }).start();

  return (
    <TouchableOpacity
      style={styles.menuItem}
      onPressIn={() => animate(0.97)}
      onPressOut={() => animate(1)}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Animated.View style={[styles.menuRowInner, { transform: [{ scale: press }] }]}>
        <Ionicons name={icon} size={22} color={Colors.onSurface} style={styles.menuIcon} />
        <Text style={styles.menuLabel}>{label}</Text>
        <Ionicons name="chevron-forward" size={18} color={Colors.onSurfaceVariant} />
      </Animated.View>
    </TouchableOpacity>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  backBtn: { width: 40, alignItems: 'flex-start' },
  headerTitle: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.bodyLg,
    color: Colors.onSurface,
  },
  scroll: { paddingBottom: 60 },
  sectionLabel: {
    fontFamily: FontFamily.semiBold,
    fontSize: FontSize.labelSm,
    color: Colors.onSurfaceVariant,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  section: {
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: BorderRadius.lg,
    marginHorizontal: Spacing.md,
    overflow: 'hidden',
  },
  menuItem: {
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  menuRowInner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 15,
  },
  menuIcon: { marginRight: Spacing.md },
  menuLabel: {
    flex: 1,
    fontFamily: FontFamily.regular,
    fontSize: FontSize.bodyMd,
    color: Colors.onSurface,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginLeft: Spacing.md + 22 + Spacing.md,
  },
  signOutBtn: {
    marginHorizontal: Spacing.md,
    marginTop: Spacing.xxl,
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: BorderRadius.lg,
    paddingVertical: 15,
    alignItems: 'center',
  },
  signOutText: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.bodyMd,
    color: Colors.error,
  },
});

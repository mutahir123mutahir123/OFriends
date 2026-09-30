/**
 * ProfileSkeleton — mirrors the Profile screen layout:
 *   • Header bar  (back / title / edit)
 *   • Avatar  +  follower stats row
 *   • Display name + bio lines
 *   • Post / Stories tab bar
 *   • 3×3 thumbnail grid
 */

import { View, StyleSheet, Dimensions, Platform } from 'react-native';
import { Bone } from '@/components/Skeleton';
import { Colors, Spacing, BorderRadius } from '@/lib/theme';

const W        = Dimensions.get('window').width;
const GRID_GAP = 2;
const THUMB    = (W - GRID_GAP * 2) / 3;

export function ProfileSkeleton() {
  return (
    <View style={styles.container}>

      {/* ── Top bar ── */}
      <View style={styles.topBar}>
        <Bone width={32} height={32} radius={16} />
        <Bone width={80} height={16} radius={7} />
        <Bone width={32} height={32} radius={16} />
      </View>

      {/* ── Avatar row ── */}
      <View style={styles.avatarRow}>
        {/* Big avatar */}
        <Bone width={88} height={88} radius={44} />

        {/* Stats: posts / followers / following */}
        <View style={styles.statsRow}>
          {[0, 1, 2].map(i => (
            <View key={i} style={styles.statItem}>
              <Bone width={38} height={18} radius={7} />
              <Bone width={56} height={11} radius={5} style={{ marginTop: 6 }} />
            </View>
          ))}
        </View>
      </View>

      {/* ── Name + bio ── */}
      <View style={styles.bioBlock}>
        <Bone width={140} height={15} radius={7} />
        <Bone width={200} height={12} radius={5} style={{ marginTop: 8 }} />
        <Bone width={160} height={12} radius={5} style={{ marginTop: 6 }} />
      </View>

      {/* ── Edit profile button ── */}
      <View style={styles.editBtnRow}>
        <Bone width={W - Spacing.lg * 2} height={38} radius={BorderRadius.xl} />
      </View>

      {/* ── Tab bar ── */}
      <View style={styles.tabBar}>
        {[0, 1].map(i => (
          <Bone key={i} width={60} height={14} radius={6} />
        ))}
      </View>

      {/* ── 3×3 grid ── */}
      <View style={styles.grid}>
        {Array.from({ length: 9 }).map((_, i) => (
          <Bone
            key={i}
            width={THUMB}
            height={THUMB}
            radius={0}
            style={styles.thumb}
          />
        ))}
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },

  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.xl,
    marginTop: Spacing.sm,
  },
  statsRow: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: { alignItems: 'center' },

  bioBlock: {
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.md,
  },

  editBtnRow: {
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.md,
  },

  tabBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    marginTop: Spacing.sm,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
    marginTop: GRID_GAP,
  },
  thumb: {
    // gap between cells handled by flexWrap + gap
  },
});

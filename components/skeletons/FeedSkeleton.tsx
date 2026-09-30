/**
 * FeedSkeleton — mirrors the exact layout of the Home feed:
 *   • App bar  (logo | toggle pill | bell)
 *   • Stories tray  (4 circles)
 *   • 2 post cards  (header + image + actions + caption)
 */

import { View, StyleSheet, Dimensions, Platform, ScrollView } from 'react-native';
import { Bone } from '@/components/Skeleton';
import { Colors, Spacing, BorderRadius } from '@/lib/theme';

const W = Dimensions.get('window').width;
const POST_H = W * (5 / 4);   // same 4:5 ratio as real posts

export function FeedSkeleton() {
  return (
    <ScrollView
      style={styles.container}
      scrollEnabled={false}
      showsVerticalScrollIndicator={false}
    >
      {/* ── App bar ── */}
      <View style={styles.appBar}>
        <Bone width={80} height={28} radius={6} />
        <Bone width={140} height={34} radius={BorderRadius.full} />
        <Bone width={28} height={28} radius={14} />
      </View>

      {/* ── Stories tray ── */}
      <View style={styles.storiesTray}>
        {[0, 1, 2, 3, 4].map(i => (
          <View key={i} style={styles.storyItem}>
            <Bone width={64} height={64} radius={32} />
            <Bone width={48} height={10} radius={5} style={styles.storyLabel} />
          </View>
        ))}
      </View>

      {/* ── Divider ── */}
      <View style={styles.divider} />

      {/* ── 2 post card skeletons ── */}
      <PostCardSkeleton />
      <PostCardSkeleton />
    </ScrollView>
  );
}

function PostCardSkeleton() {
  return (
    <View style={styles.postCard}>
      {/* Header row */}
      <View style={styles.postHeader}>
        <Bone width={40} height={40} radius={20} />
        <View style={styles.postHeaderText}>
          <Bone width={110} height={13} radius={6} />
          <Bone width={60}  height={10} radius={5} style={{ marginTop: 6 }} />
        </View>
        <Bone width={24} height={24} radius={12} />
      </View>

      {/* Image block */}
      <Bone width={W} height={POST_H} radius={0} />

      {/* Actions row */}
      <View style={styles.actionsRow}>
        <View style={styles.actionsLeft}>
          <Bone width={28} height={28} radius={14} />
          <Bone width={28} height={28} radius={14} />
          <Bone width={28} height={28} radius={14} />
        </View>
        <Bone width={28} height={28} radius={14} />
      </View>

      {/* Caption lines */}
      <View style={styles.captionBlock}>
        <Bone width={W - Spacing.md * 2} height={12} radius={6} />
        <Bone width={(W - Spacing.md * 2) * 0.65} height={12} radius={6} style={{ marginTop: 8 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingBottom: Spacing.sm,
  },

  storiesTray: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    gap: Spacing.md,
  },
  storyItem: { alignItems: 'center', gap: 6, width: 72 },
  storyLabel: { marginTop: 2 },

  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginBottom: Spacing.md,
  },

  postCard: { marginBottom: Spacing.xl },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  postHeaderText: { flex: 1, gap: 4 },

  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  actionsLeft: { flexDirection: 'row', gap: Spacing.lg },

  captionBlock: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
  },
});

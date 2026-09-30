/**
 * MessagesSkeleton — mirrors the Messages screen layout:
 *   • Header  (title + bell icon)
 *   • Search bar
 *   • Instants bar  (5 circles)
 *   • 6 conversation rows  (avatar + name + preview + time)
 */

import { View, StyleSheet, Platform } from 'react-native';
import { Bone } from '@/components/Skeleton';
import { Colors, Spacing, BorderRadius } from '@/lib/theme';

export function MessagesSkeleton() {
  return (
    <View style={styles.container}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Bone width={120} height={28} radius={7} />
          <Bone width={28}  height={28} radius={14} />
        </View>
        {/* Search bar */}
        <Bone width="100%" height={46} radius={BorderRadius.xl} />
      </View>

      {/* ── Instants bar ── */}
      <View style={styles.instantsBar}>
        {[0, 1, 2, 3, 4].map(i => (
          <View key={i} style={styles.instantItem}>
            <Bone width={62} height={62} radius={31} />
            <Bone width={44} height={10} radius={5} style={styles.instantLabel} />
          </View>
        ))}
      </View>

      {/* ── Conversation rows ── */}
      <View style={styles.list}>
        {[0, 1, 2, 3, 4, 5].map(i => (
          <ConversationRowSkeleton key={i} />
        ))}
      </View>

    </View>
  );
}

function ConversationRowSkeleton() {
  return (
    <View style={styles.row}>
      <Bone width={56} height={56} radius={28} />
      <View style={styles.rowContent}>
        <View style={styles.rowTop}>
          <Bone width={100} height={13} radius={6} />
          <Bone width={36}  height={10} radius={5} />
        </View>
        <Bone width={170} height={11} radius={5} style={{ marginTop: 7 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },

  header: {
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: Spacing.md,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  instantsBar: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    gap: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  instantItem: { alignItems: 'center', gap: 6, width: 70 },
  instantLabel: { marginTop: 2 },

  list: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    gap: Spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
  },
  rowContent: { flex: 1, gap: 0 },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});

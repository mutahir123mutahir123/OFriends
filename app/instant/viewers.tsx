/**
 * /instant/viewers — Owner's view of who has seen their instant
 *
 * Shows a scrollable list of everyone who viewed the instant,
 * with their emoji reaction (if any) and a DM shortcut.
 *
 * Route params:
 *   instantId  — UUID of the instant
 *   mediaUrl   — encoded public URL of the instant image
 */

import { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { Avatar } from '@/components/Avatar';
import { Colors, FontFamily, FontSize, Spacing, BorderRadius } from '@/lib/theme';

const { width: W } = Dimensions.get('window');
const IMG_SIZE = W * 0.72;
const IMG_RADIUS = IMG_SIZE * 0.18;

type ViewerRow = {
  viewer_id: string;
  emoji: string | null;
  viewed_at: string;
  username: string;
  avatar_url: string | null;
};

export default function InstantViewersScreen() {
  const { instantId, mediaUrl } = useLocalSearchParams<{
    instantId: string;
    mediaUrl: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [viewers, setViewers] = useState<ViewerRow[]>([]);
  const [loading, setLoading] = useState(true);

  const decodedUrl = mediaUrl ? decodeURIComponent(mediaUrl) : '';

  const load = useCallback(async () => {
    if (!instantId) return;
    setLoading(true);

    // Fetch views with viewer profiles
    const { data: viewData } = await supabase
      .from('instant_views')
      .select('viewer_id, emoji, viewed_at')
      .eq('instant_id', instantId)
      .order('viewed_at', { ascending: false });

    if (!viewData || viewData.length === 0) {
      setViewers([]);
      setLoading(false);
      return;
    }

    const ids = viewData.map((v: any) => v.viewer_id);
    const { data: profileData } = await supabase
      .from('profiles')
      .select('id, username, avatar_url')
      .in('id', ids);

    const profileMap: Record<string, any> = {};
    for (const p of (profileData ?? [])) profileMap[p.id] = p;

    const rows: ViewerRow[] = viewData.map((v: any) => ({
      viewer_id: v.viewer_id,
      emoji: v.emoji ?? null,
      viewed_at: v.viewed_at,
      username: profileMap[v.viewer_id]?.username ?? 'Unknown',
      avatar_url: profileMap[v.viewer_id]?.avatar_url ?? null,
    }));

    setViewers(rows);
    setLoading(false);
  }, [instantId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const reactionCount = viewers.filter(v => v.emoji).length;

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>

      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: Platform.OS === 'ios' ? 58 : 44 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={Colors.onSurface} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Seen by {viewers.length}</Text>
          {reactionCount > 0 && (
            <Text style={styles.headerSub}>{reactionCount} reaction{reactionCount !== 1 ? 's' : ''}</Text>
          )}
        </View>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* ── Instant image ── */}
        <View style={styles.imgWrap}>
          <Image
            source={decodedUrl}
            style={styles.img}
            contentFit="cover"
            transition={120}
          />
        </View>

        {/* ── Viewer list ── */}
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={Colors.primary} />
          </View>
        ) : viewers.length === 0 ? (
          <View style={styles.centered}>
            <Ionicons name="eye-off-outline" size={48} color={Colors.outlineVariant} />
            <Text style={styles.emptyText}>No one has viewed this yet</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {viewers.map((item) => (
              <View key={item.viewer_id} style={styles.row}>

                {/* Avatar + emoji badge */}
                <View style={styles.avatarWrap}>
                  <Avatar uri={item.avatar_url} name={item.username} size={48} />
                  {item.emoji && (
                    <View style={styles.emojiBadge}>
                      <Text style={styles.emojiBadgeText}>{item.emoji}</Text>
                    </View>
                  )}
                </View>

                {/* Name */}
                <Text style={styles.username} numberOfLines={1}>{item.username}</Text>

                {/* DM button */}
                <TouchableOpacity
                  style={styles.dmBtn}
                  onPress={() => router.push(`/chat/${item.viewer_id}` as any)}
                  hitSlop={8}
                >
                  <Ionicons name="paper-plane-outline" size={20} color={Colors.primary} />
                </TouchableOpacity>

              </View>
            ))}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  headerBtn: {
    width: 44, height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  headerTitle: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.bodyLg,
    color: Colors.onSurface,
  },
  headerSub: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.labelSm,
    color: Colors.onSurfaceVariant,
  },

  /* Scroll content */
  scroll: {
    paddingTop: Spacing.lg,
    alignItems: 'center',
  },

  /* Instant image */
  imgWrap: {
    width: IMG_SIZE,
    height: IMG_SIZE,
    borderRadius: IMG_RADIUS,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceContainerHigh,
    marginBottom: Spacing.xl,
  },
  img: {
    width: '100%',
    height: '100%',
  },

  /* Viewer list */
  list: {
    width: '100%',
    paddingHorizontal: Spacing.lg,
    gap: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: BorderRadius.xl,
  },
  avatarWrap: {
    position: 'relative',
  },
  emojiBadge: {
    position: 'absolute',
    bottom: -2,
    right: -4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.background,
  },
  emojiBadgeText: {
    fontSize: 12,
    lineHeight: 16,
  },
  username: {
    flex: 1,
    fontFamily: FontFamily.semiBold,
    fontSize: FontSize.bodyMd,
    color: Colors.onSurface,
  },
  dmBtn: {
    width: 36, height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* States */
  centered: {
    paddingTop: 40,
    alignItems: 'center',
    gap: Spacing.md,
  },
  emptyText: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.bodyMd,
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
  },
});

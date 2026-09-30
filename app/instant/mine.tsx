/**
 * "Your Instants" â€” /instant/mine
 *
 * Shows every instant the current user has ever posted, grouped by
 * "Today" / "This week" / "Earlier".  Each thumbnail shows how many
 * friends have viewed it (â¤ï¸ N).  Camera button in the header lets
 * the user post a new instant.
 *
 * Subtitle: "This is only visible to you"
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
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useFocusEffect } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { PostOptionsSheet } from '@/components/PostOptionsSheet';
import { Colors, FontFamily, FontSize, Spacing, BorderRadius } from '@/lib/theme';

/* â”€â”€ Layout constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const SCREEN_W = Dimensions.get('window').width;
const H_PAD    = Spacing.lg;          // horizontal page padding
const GAP      = 6;                   // gap between thumbnails
const COLS     = 3;
const THUMB_W  = (SCREEN_W - H_PAD * 2 - GAP * (COLS - 1)) / COLS;
const THUMB_R  = THUMB_W * 0.2;       // squircle radius

/* â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
type InstantRow = {
  id: string;
  media_url: string;
  created_at: string;
  expires_at: string;
  viewCount: number;
};

type Sections = {
  today:    InstantRow[];
  thisWeek: InstantRow[];
  earlier:  InstantRow[];
};

/* â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function groupByPeriod(rows: InstantRow[]): Sections {
  const now   = new Date();
  const sod   = new Date(now); sod.setHours(0, 0, 0, 0);       // start of today
  const weekAgo = new Date(sod); weekAgo.setDate(sod.getDate() - 6);

  const today:    InstantRow[] = [];
  const thisWeek: InstantRow[] = [];
  const earlier:  InstantRow[] = [];

  for (const r of rows) {
    const d = new Date(r.created_at);
    if (d >= sod)      today.push(r);
    else if (d >= weekAgo) thisWeek.push(r);
    else               earlier.push(r);
  }
  return { today, thisWeek, earlier };
}

function isActive(row: InstantRow) {
  return new Date(row.expires_at) > new Date();
}

type SectionProps = {
  title: string;
  rows: InstantRow[];
  onOpen: (item: InstantRow) => void;
  onLongPress: (item: InstantRow) => void;
};

/* â”€â”€ Thumbnail â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function Thumb({ item, onOpen, onLongPress }: { item: InstantRow } & Omit<SectionProps, 'title' | 'rows'>) {
  return (
    <TouchableOpacity
      style={styles.thumb}
      onPress={() => onOpen(item)}
      onLongPress={() => onLongPress(item)}
      activeOpacity={0.85}
      delayLongPress={400}
    >
      <Image
        source={item.media_url}
        style={styles.thumbImg}
        contentFit="cover"
        transition={120}
      />

      {/* Expired dim overlay */}
      {!isActive(item) && <View style={styles.expiredOverlay} />}

      {/* View count badge â€” top right */}
      {item.viewCount > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeEmoji}>â¤ï¸</Text>
          <Text style={styles.badgeCount}>{item.viewCount}</Text>
        </View>
      )}

      {/* Active indicator dot */}
      {isActive(item) && <View style={styles.activeDot} />}
    </TouchableOpacity>
  );
}

/* â”€â”€ Section block â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
function Section({ title, rows, onOpen, onLongPress }: SectionProps) {
  if (rows.length === 0) return null;
  // Chunk into rows of 3
  const rowChunks: InstantRow[][] = [];
  for (let i = 0; i < rows.length; i += COLS) {
    rowChunks.push(rows.slice(i, i + COLS));
  }
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {rowChunks.map((chunk, ri) => (
        <View key={ri} style={styles.gridRow}>
          {chunk.map(item => (
            <Thumb key={item.id} item={item} onOpen={onOpen} onLongPress={onLongPress} />
          ))}
          {/* Fill empty slots in last row */}
          {chunk.length < COLS &&
            Array.from({ length: COLS - chunk.length }).map((_, ei) => (
              <View key={`empty-${ei}`} style={styles.thumbPlaceholder} />
            ))
          }
        </View>
      ))}
    </View>
  );
}

/* â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
   Screen
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
export default function MyInstantsScreen() {
  const { user } = useAuth();
  const router   = useRouter();

  const [sections, setSections] = useState<Sections>({ today: [], thisWeek: [], earlier: [] });
  const [loading,  setLoading]  = useState(true);
  const [total,    setTotal]    = useState(0);
  const [actionItem, setActionItem] = useState<InstantRow | null>(null);

  /* â”€â”€ Fetch â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    // All my instants, newest first
    const { data: instData, error } = await supabase
      .from('instants')
      .select('id, media_url, created_at, expires_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error || !instData || instData.length === 0) {
      setSections({ today: [], thisWeek: [], earlier: [] });
      setTotal(0);
      setLoading(false);
      return;
    }

    // View counts for all my instants
    const ids = instData.map((i: any) => i.id);
    const { data: viewData } = await supabase
      .from('instant_views')
      .select('instant_id')
      .in('instant_id', ids);

    // Count views per instant
    const countMap: Record<string, number> = {};
    for (const v of (viewData ?? [])) {
      countMap[v.instant_id] = (countMap[v.instant_id] ?? 0) + 1;
    }

    const rows: InstantRow[] = instData.map((i: any) => ({
      id:         i.id,
      media_url:  i.media_url,
      created_at: i.created_at,
      expires_at: i.expires_at,
      viewCount:  countMap[i.id] ?? 0,
    }));

    setSections(groupByPeriod(rows));
    setTotal(rows.length);
    setLoading(false);
  }, [user]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  /* â”€â”€ Save instant to camera roll â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  const saveToRoll = useCallback(async (item: InstantRow) => {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow access to your photo library in Settings.');
        return;
      }
      const dest = `${FileSystem.cacheDirectory}instant_save_${Date.now()}.jpg`;
      await FileSystem.downloadAsync(item.media_url, dest);
      await MediaLibrary.saveToLibraryAsync(dest);
      Alert.alert('Saved!', 'Instant saved to your camera roll.');
    } catch {
      Alert.alert('Error', 'Could not save image. Please try again.');
    } finally {
      setActionItem(null);
    }
  }, []);

  /* â”€â”€ Delete a single instant â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  const deleteInstant = useCallback(async (id: string) => {
    setActionItem(null);
    await supabase.from('instants').delete().eq('id', id);
    load();
  }, [load]);

  const handleOpenThumb = useCallback((item: InstantRow) => {
    router.push(`/instant/viewers?instantId=${item.id}&mediaUrl=${encodeURIComponent(item.media_url)}` as any);
  }, [router]);

  const handleLongPressThumb = useCallback((item: InstantRow) => {
    setActionItem(item);
  }, []);

  const hasAny = total > 0;

  /* â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
  return (
    <View style={styles.container}>

      {/* â”€â”€ Header â”€â”€ */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerSideBtn} hitSlop={12}>
          <Ionicons name="chevron-back" size={26} color={Colors.onSurface} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Your instants</Text>
          <Text style={styles.headerSub}>Only visible to you</Text>
        </View>

        {/* Camera button â€” post a new instant */}
        <TouchableOpacity
          style={styles.headerSideBtn}
          onPress={() => router.push('/instant/camera' as any)}
          hitSlop={12}
        >
          <Ionicons name="camera-outline" size={26} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {/* â”€â”€ Body â”€â”€ */}
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : !hasAny ? (
        /* Empty state */
        <View style={styles.centered}>
          <Ionicons name="images-outline" size={64} color={Colors.outlineVariant} />
          <Text style={styles.emptyTitle}>No instants yet</Text>
          <Text style={styles.emptyBody}>
            Tap the camera to share your first instant with friends.
          </Text>
          <TouchableOpacity
            style={styles.emptyBtn}
            onPress={() => router.push('/instant/camera' as any)}
            activeOpacity={0.85}
          >
            <Ionicons name="camera" size={18} color={Colors.white} />
            <Text style={styles.emptyBtnText}>Take an Instant</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <Section title="Today"     rows={sections.today}    onOpen={handleOpenThumb} onLongPress={handleLongPressThumb} />
          <Section title="This week" rows={sections.thisWeek} onOpen={handleOpenThumb} onLongPress={handleLongPressThumb} />
          <Section title="Earlier"   rows={sections.earlier}  onOpen={handleOpenThumb} onLongPress={handleLongPressThumb} />
          <View style={{ height: 120 }} />
        </ScrollView>
      )}

      {/* â”€â”€ "Create recap" floating button (only when content exists) â”€â”€ */}
      {hasAny && !loading && (
        <View style={styles.fabRow}>
          <TouchableOpacity
            style={styles.fab}
            onPress={() => Alert.alert('Recap', 'Recap feature coming soon!')}
            activeOpacity={0.88}
          >
            <Ionicons name="add-circle-outline" size={20} color={Colors.onSurface} />
            <Text style={styles.fabText}>Create recap</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* â”€â”€ Action sheet (long-press on thumbnail) â”€â”€ */}
      {actionItem && (
        <PostOptionsSheet
          visible={!!actionItem}
          onClose={() => setActionItem(null)}
          title="Instant"
          options={[
            {
              label: 'Save to camera roll',
              icon: 'download-outline',
              onPress: () => void saveToRoll(actionItem),
            },
            { label: 'Delete instant', icon: 'trash-outline', destructive: true, onPress: () => {} },
          ]}
          confirm={{
            title: 'Delete this instant?',
            body: 'Friends who havenâ€™t seen it wonâ€™t be able to view it.',
            confirmLabel: 'Delete',
            onConfirm: () => deleteInstant(actionItem.id),
          }}
        />
      )}

    </View>
  );
}

/* â”€â”€ Styles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xxl,
  },

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 58 : 44,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  headerSideBtn: {
    width: 44,
    height: 44,
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

  /* Grid */
  scroll: { flex: 1 },
  scrollContent: {
    paddingHorizontal: H_PAD,
    paddingTop: Spacing.lg,
  },

  section: { marginBottom: Spacing.lg },
  sectionTitle: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.bodyLg,
    color: Colors.onSurface,
    marginBottom: Spacing.sm,
  },

  gridRow: {
    flexDirection: 'row',
    gap: GAP,
    marginBottom: GAP,
  },

  thumb: {
    width: THUMB_W,
    height: THUMB_W,
    borderRadius: THUMB_R,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceContainerHigh,
  },
  thumbImg: {
    width: '100%',
    height: '100%',
  },
  thumbPlaceholder: {
    width: THUMB_W,
    height: THUMB_W,
  },

  /* Overlays */
  expiredOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },

  /* View count badge */
  badge: {
    position: 'absolute',
    top: 7,
    right: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeEmoji: {
    fontSize: 11,
    lineHeight: 14,
  },
  badgeCount: {
    fontFamily: FontFamily.bold,
    fontSize: 11,
    color: Colors.white,
    lineHeight: 14,
  },

  /* Active dot */
  activeDot: {
    position: 'absolute',
    bottom: 7,
    right: 7,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.secondaryContainer,
    borderWidth: 1.5,
    borderColor: Colors.background,
  },

  /* Empty state */
  emptyTitle: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.bodyLg,
    color: Colors.onSurface,
    textAlign: 'center',
  },
  emptyBody: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.bodyMd,
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 24,
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
    backgroundColor: Colors.primaryContainer,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
  },
  emptyBtnText: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.bodyMd,
    color: Colors.white,
  },


  /* FAB */
  fabRow: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 40 : 28,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.surfaceContainerHighest,
    paddingHorizontal: Spacing.xl,
    paddingVertical: 14,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    // subtle shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  fabText: {
    fontFamily: FontFamily.semiBold,
    fontSize: FontSize.bodyMd,
    color: Colors.onSurface,
  },
});

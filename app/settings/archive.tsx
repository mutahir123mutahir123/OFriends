import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Platform,
  ActivityIndicator,
  FlatList,
  Dimensions,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Colors, FontFamily, FontSize, Spacing } from '@/lib/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_SIZE = (SCREEN_WIDTH - 2) / 3;

export default function ArchiveScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [stories, setStories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('stories')
      .select('id, media_url, created_at, expires_at')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false });
    setStories(data ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void (async () => {
      if (user) await load();
    })();
  }, [user, load]);

  const deleteStory = (storyId: string) => {
    Alert.alert('Delete Story', 'Remove this story permanently?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('stories').delete().eq('id', storyId);
          if (error) Alert.alert('Error', error.message);
          else setStories((prev) => prev.filter((s) => s.id !== storyId));
        },
      },
    ]);
  };

  const isExpired = (expiresAt: string) => new Date(expiresAt) < new Date();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={Colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Stories Archive</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : stories.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="time-outline" size={48} color={Colors.outlineVariant} />
          <Text style={styles.emptyText}>No stories yet</Text>
        </View>
      ) : (
        <>
          <Text style={styles.hint}>
            Archived stories are only visible to you. Long-press to delete.
          </Text>
          <FlatList
            data={stories}
            keyExtractor={(item) => item.id}
            numColumns={3}
            columnWrapperStyle={styles.row}
            contentContainerStyle={styles.grid}
            renderItem={({ item }) => {
              const expired = isExpired(item.expires_at);
              const date = new Date(item.created_at);
              const dateLabel = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              return (
                <TouchableOpacity
                  style={styles.cell}
                  onLongPress={() => deleteStory(item.id)}
                  delayLongPress={500}
                  activeOpacity={0.85}
                >
                  <Image source={{ uri: item.media_url }} style={styles.cellImage} resizeMode="cover" />
                  {expired && <View style={styles.expiredOverlay} />}
                  <Text style={styles.dateLabel}>{dateLabel}</Text>
                </TouchableOpacity>
              );
            }}
          />
        </>
      )}
    </View>
  );
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
  hint: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.labelSm,
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  emptyText: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.bodyMd,
    color: Colors.onSurfaceVariant,
  },
  grid: { paddingBottom: 40 },
  row: { gap: 1 },
  cell: { width: GRID_SIZE, height: GRID_SIZE, position: 'relative', overflow: 'hidden' },
  cellImage: { width: '100%', height: '100%' },
  expiredOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  dateLabel: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    fontFamily: FontFamily.bold,
    fontSize: 10,
    color: Colors.white,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 3,
  },
});

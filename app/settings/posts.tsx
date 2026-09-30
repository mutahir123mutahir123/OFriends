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
import { PostOptionsSheet } from '@/components/PostOptionsSheet';
import { Colors, FontFamily, FontSize, Spacing } from '@/lib/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_SIZE = (SCREEN_WIDTH - 2) / 3;

export default function PostsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('posts')
      .select('id, media_url, type')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false });
    setPosts(data ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void (async () => {
      if (user) await load();
    })();
  }, [user, load]);

  const deletePost = async (postId: string) => {
    const { error } = await supabase.from('posts').delete().eq('id', postId);
    if (error) Alert.alert('Error', error.message);
    else setPosts((prev) => prev.filter((p) => p.id !== postId));
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={Colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Posts</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : posts.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="grid-outline" size={48} color={Colors.outlineVariant} />
          <Text style={styles.emptyText}>No posts yet</Text>
        </View>
      ) : (
        <>
          <Text style={styles.hint}>Tap a post to view it. Long-press to delete.</Text>
          <FlatList
            data={posts}
            keyExtractor={(item) => item.id}
            numColumns={3}
            columnWrapperStyle={styles.row}
            contentContainerStyle={styles.grid}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.cell}
                onPress={() => router.push(`/post/${item.id}` as any)}
                onLongPress={() => setDeleting(item.id)}
                delayLongPress={500}
                activeOpacity={0.85}
                accessibilityLabel="Post. Long press for options."
              >
                <Image
                  source={{ uri: item.media_url }}
                  style={styles.cellImage}
                  resizeMode="cover"
                />
                <View style={styles.cellBadge}>
                  <Ionicons name="ellipsis-horizontal" size={12} color={Colors.onSurface} />
                </View>
              </TouchableOpacity>
            )}
          />
        </>
      )}

      {deleting && (
        <PostOptionsSheet
          visible={!!deleting}
          onClose={() => setDeleting(null)}
          options={[
            { label: 'Delete post', icon: 'trash-outline', destructive: true, onPress: () => {} },
          ]}
          confirm={{
            title: 'Delete this post?',
            body: "This can't be undone.",
            confirmLabel: 'Delete',
            onConfirm: () => deletePost(deleting),
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  cellBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 9,
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
});

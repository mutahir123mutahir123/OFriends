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
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { PostOptionsSheet } from '@/components/PostOptionsSheet';
import { formatRelativeTime } from '@/lib/helpers';
import { Colors, FontFamily, FontSize, Spacing, BorderRadius } from '@/lib/theme';

export default function CommentsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('comments')
      .select('id, content, created_at, posts(id, media_url)')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false });
    setItems(data ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void (async () => {
      if (user) await load();
    })();
  }, [user, load]);

  const deleteComment = async (commentId: string) => {
    const { error } = await supabase.from('comments').delete().eq('id', commentId);
    if (error) Alert.alert('Error', error.message);
    else setItems((prev) => prev.filter((c) => c.id !== commentId));
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={Colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Comments</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="chatbubble-outline" size={48} color={Colors.outlineVariant} />
          <Text style={styles.emptyText}>No comments yet</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.commentRow}
              onPress={() => item.posts?.id && router.push(`/post/${item.posts.id}` as any)}
              activeOpacity={0.8}
            >
              {item.posts?.media_url ? (
                <Image source={{ uri: item.posts.media_url }} style={styles.thumb} resizeMode="cover" />
              ) : (
                <View style={[styles.thumb, styles.thumbPlaceholder]} />
              )}
              <View style={styles.commentMeta}>
                <Text style={styles.commentContent} numberOfLines={2}>{item.content}</Text>
                <Text style={styles.commentTime}>{formatRelativeTime(item.created_at)}</Text>
              </View>
              <TouchableOpacity
                onPress={() => setDeleting(item.id)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.6}
                accessibilityRole="button"
                accessibilityLabel="Delete comment"
              >
                <Ionicons name="trash-outline" size={18} color={Colors.error} />
              </TouchableOpacity>
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      {deleting && (
        <PostOptionsSheet
          visible={!!deleting}
          onClose={() => setDeleting(null)}
          options={[
            { label: 'Delete comment', icon: 'trash-outline', destructive: true, onPress: () => {} },
          ]}
          confirm={{
            title: 'Delete this comment?',
            body: 'This can’t be undone.',
            confirmLabel: 'Delete',
            onConfirm: () => deleteComment(deleting),
          }}
        />
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
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  emptyText: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.bodyMd,
    color: Colors.onSurfaceVariant,
  },
  list: { paddingVertical: Spacing.sm, paddingHorizontal: Spacing.md, paddingBottom: 40 },
  commentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surfaceContainerLow,
    flexShrink: 0,
  },
  thumbPlaceholder: { backgroundColor: Colors.surfaceContainerHigh },
  commentMeta: { flex: 1, gap: 4 },
  commentContent: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.bodyMd,
    color: Colors.onSurface,
    lineHeight: 20,
  },
  commentTime: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.labelSm,
    color: Colors.onSurfaceVariant,
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    marginVertical: 4,
  },
});

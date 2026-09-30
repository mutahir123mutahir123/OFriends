import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Avatar } from '@/components/Avatar';
import { formatRelativeTime } from '@/lib/helpers';
import { Colors, FontFamily, FontSize, Spacing, BorderRadius } from '@/lib/theme';

type NotifType = 'like' | 'comment' | 'follow';

type Notification = {
  id: string;
  type: NotifType;
  actor: { id: string; username: string; avatar_url: string | null } | null;
  created_at: string | null;
  body?: string;
  post?: { id: string; media_url: string } | null;
};

export default function NotificationsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      // 1. Fetch my post IDs and thumbnails
      const { data: myPosts } = await supabase
        .from('posts')
        .select('id, media_url')
        .eq('user_id', user.id);

      const postMap: Record<string, { id: string; media_url: string }> = {};
      for (const p of myPosts ?? []) postMap[p.id] = p;
      const myPostIds = Object.keys(postMap);

      // 2. Parallel fetch: likes, comments, followers
      const [likesRes, commentsRes, followsRes] = await Promise.all([
        myPostIds.length
          ? supabase
              .from('likes')
              .select('id, user_id, post_id')
              .in('post_id', myPostIds)
              .neq('user_id', user.id)
              .limit(30)
          : Promise.resolve({ data: [] as any[] }),

        myPostIds.length
          ? supabase
              .from('comments')
              .select('id, user_id, post_id, content, created_at')
              .in('post_id', myPostIds)
              .neq('user_id', user.id)
              .order('created_at', { ascending: false })
              .limit(30)
          : Promise.resolve({ data: [] as any[] }),

        supabase
          .from('follows')
          .select('follower_id, created_at')
          .eq('following_id', user.id)
          .order('created_at', { ascending: false })
          .limit(30),
      ]);

      // 3. Collect all actor IDs and fetch profiles in one shot
      const actorIds = new Set<string>([
        ...(likesRes.data ?? []).map((l: any) => l.user_id),
        ...(commentsRes.data ?? []).map((c: any) => c.user_id),
        ...(followsRes.data ?? []).map((f: any) => f.follower_id),
      ]);

      const profileMap: Record<string, { id: string; username: string; avatar_url: string | null }> = {};
      if (actorIds.size > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, username, avatar_url')
          .in('id', [...actorIds]);
        for (const p of profiles ?? []) profileMap[p.id] = p;
      }

      // 4. Build unified list
      const all: Notification[] = [
        ...(likesRes.data ?? []).map((l: any): Notification => ({
          id: `like_${l.id}`,
          type: 'like',
          actor: profileMap[l.user_id] ?? null,
          created_at: null,            // likes table has no created_at
          post: postMap[l.post_id] ?? null,
        })),
        ...(commentsRes.data ?? []).map((c: any): Notification => ({
          id: `comment_${c.id}`,
          type: 'comment',
          actor: profileMap[c.user_id] ?? null,
          created_at: c.created_at,
          body: c.content,
          post: postMap[c.post_id] ?? null,
        })),
        ...(followsRes.data ?? []).map((f: any): Notification => ({
          id: `follow_${f.follower_id}`,
          type: 'follow',
          actor: profileMap[f.follower_id] ?? null,
          created_at: f.created_at,
        })),
      ];

      // Sort newest first; nulls (likes without timestamps) go to end
      all.sort((a, b) => {
        const at = a.created_at ? new Date(a.created_at).getTime() : 0;
        const bt = b.created_at ? new Date(b.created_at).getTime() : 0;
        return bt - at;
      });

      setNotifications(all);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  const notifText = (n: Notification) => {
    switch (n.type) {
      case 'like':    return 'liked your post';
      case 'comment': return `commented: "${n.body}"`;
      case 'follow':  return 'started following you';
    }
  };

  const notifIcon = (type: NotifType) => {
    switch (type) {
      case 'like':    return <Ionicons name="heart" size={16} color={Colors.tertiary} />;
      case 'comment': return <Ionicons name="chatbubble" size={16} color={Colors.secondaryFixedDim} />;
      case 'follow':  return <Ionicons name="person-add" size={16} color={Colors.primary} />;
    }
  };

  const handlePress = (n: Notification) => {
    if (n.type === 'follow' && n.actor) {
      router.push(`/user/${n.actor.id}` as any);
    } else if (n.post) {
      router.push(`/post/${n.post.id}` as any);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={26} color={Colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.title}>Notifications</Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyEmoji}>🔔</Text>
          <Text style={styles.emptyTitle}>All quiet</Text>
          <Text style={styles.emptyBody}>You’ll see likes, comments, and new followers here.</Text>
        </View>
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          onRefresh={load}
          refreshing={loading}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.75}
              onPress={() => handlePress(item)}
            >
              {/* Avatar with type badge */}
              <View style={styles.avatarWrap}>
                <Avatar
                  uri={item.actor?.avatar_url ?? null}
                  name={item.actor?.username ?? '?'}
                  size={46}
                />
                <View style={styles.typeBadge}>{notifIcon(item.type)}</View>
              </View>

              {/* Text */}
              <View style={styles.rowText}>
                <Text style={styles.rowBody} numberOfLines={2}>
                  <Text style={styles.rowUsername}>{item.actor?.username ?? 'Someone'} </Text>
                  <Text>{notifText(item)}</Text>
                </Text>
                {item.created_at ? (
                  <Text style={styles.rowTime}>{formatRelativeTime(item.created_at)}</Text>
                ) : null}
              </View>

              {/* Post thumbnail (for likes and comments) */}
              {item.post ? (
                <Image
                  source={{ uri: item.post.media_url }}
                  style={styles.thumbnail}
                  resizeMode="cover"
                />
              ) : null}
            </TouchableOpacity>
          )}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
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
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
    gap: Spacing.sm,
  },
  backBtn: { padding: 4 },
  title: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.headlineMd,
    color: Colors.onSurface,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xl,
  },
  emptyEmoji: { fontSize: 52 },
  emptyTitle: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.headlineMd,
    color: Colors.onSurface,
  },
  emptyBody: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.bodyMd,
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 22,
  },
  list: { paddingBottom: 100 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  avatarWrap: { position: 'relative' },
  typeBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.surfaceContainerHighest,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.background,
  },
  rowText: { flex: 1, gap: 2 },
  rowBody: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.bodyMd,
    color: Colors.onSurface,
    lineHeight: 20,
  },
  rowUsername: { fontFamily: FontFamily.bold },
  rowTime: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.labelSm,
    color: Colors.onSurfaceVariant,
  },
  thumbnail: {
    width: 46,
    height: 46,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surfaceContainerLow,
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    marginHorizontal: Spacing.lg,
  },
});

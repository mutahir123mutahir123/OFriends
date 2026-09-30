import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Dimensions,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { StoryRing } from '@/components/StoryRing';
import { Avatar } from '@/components/Avatar';
import { Colors, FontFamily, FontSize, Spacing, BorderRadius } from '@/lib/theme';
import { formatCount } from '@/lib/helpers';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_SIZE = (SCREEN_WIDTH - 2) / 3;

export default function UserProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [counts, setCounts] = useState({ posts: 0, followers: 0, following: 0 });
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!id || !user) return;
    setLoading(true);
    const [profileRes, postsRes, followersRes, followingRes, followCheckRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', id).single(),
      supabase.from('posts').select('id, media_url, type').eq('user_id', id).order('created_at', { ascending: false }),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', id),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', id),
      supabase.from('follows').select('*').eq('follower_id', user.id).eq('following_id', id).maybeSingle(),
    ]);

    setProfile(profileRes.data);
    setPosts(postsRes.data ?? []);
    setCounts({ posts: postsRes.data?.length ?? 0, followers: followersRes.count ?? 0, following: followingRes.count ?? 0 });
    setIsFollowing(!!followCheckRes.data);
    setLoading(false);
  }, [id, user]);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        if (id) await loadData();
      })();
    }, [id, loadData])
  );

  const toggleFollow = async () => {
    if (!user || !id) return;
    if (isFollowing) {
      await supabase.from('follows').delete().match({ follower_id: user.id, following_id: id });
      setIsFollowing(false);
      setCounts((c) => ({ ...c, followers: c.followers - 1 }));
    } else {
      await supabase.from('follows').insert({ follower_id: user.id, following_id: id });
      setIsFollowing(true);
      setCounts((c) => ({ ...c, followers: c.followers + 1 }));
    }
  };

  if (loading) {
    return <View style={[styles.container, styles.centered]}><ActivityIndicator color={Colors.primary} size="large" /></View>;
  }

  const isOwn = id === user?.id;

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerUsername}>{profile?.username ?? ''}</Text>
        {!isOwn && (
          <TouchableOpacity
            onPress={() => router.push(`/chat/${id}` as any)}
            style={styles.dmBtn}
          >
            <Text style={styles.dmBtnText}>💬</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Profile */}
      <View style={styles.profileSection}>
        <StoryRing size={88}>
          <Avatar uri={profile?.avatar_url} name={profile?.username ?? '?'} size={80} />
        </StoryRing>
        <View style={styles.profileInfo}>
          <Text style={styles.displayName}>{profile?.display_name || profile?.username}</Text>
          <View style={styles.statsRow}>
            <Stat label="Posts" value={counts.posts} />
            <Stat
              label="Followers"
              value={counts.followers}
              onPress={() => router.push(`/user/${id}/follows?tab=followers` as any)}
            />
            <Stat
              label="Following"
              value={counts.following}
              onPress={() => router.push(`/user/${id}/follows?tab=following` as any)}
            />
          </View>
          {profile?.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}

          {!isOwn && (
            <TouchableOpacity onPress={toggleFollow} activeOpacity={0.85}>
              {isFollowing ? (
                <View style={styles.unfollowBtn}>
                  <Text style={styles.unfollowBtnText}>Following</Text>
                </View>
              ) : (
                <LinearGradient
                  colors={['#bd00ff', '#00eefc']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.followBtn}
                >
                  <Text style={styles.followBtnText}>Follow</Text>
                </LinearGradient>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Posts Grid */}
      <View style={styles.grid}>
        {posts.map((post) => (
          <TouchableOpacity
            key={post.id}
            style={styles.gridItem}
            onPress={() => router.push(`/post/${post.id}` as any)}
          >
            <Image source={{ uri: post.media_url }} style={styles.gridImage} resizeMode="cover" />
            {post.type === 'reel' && (
              <View style={styles.reelOverlay}><Text style={styles.reelPlay}>▶</Text></View>
            )}
          </TouchableOpacity>
        ))}
      </View>
      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

function Stat({ label, value, onPress }: { label: string; value: number; onPress?: () => void }) {
  const content = (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ fontFamily: FontFamily.bold, fontSize: FontSize.bodyLg, color: Colors.onSurface }}>{formatCount(value)}</Text>
      <Text style={{ fontFamily: FontFamily.regular, fontSize: FontSize.labelLg, color: Colors.onSurfaceVariant }}>{label}</Text>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered: { alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    gap: Spacing.sm,
  },
  backBtn: { padding: 4 },
  backIcon: { fontSize: 32, color: Colors.primary, lineHeight: 36 },
  headerUsername: {
    flex: 1,
    fontFamily: FontFamily.bold,
    fontSize: FontSize.bodyLg,
    color: Colors.onSurface,
  },
  dmBtn: { padding: 8 },
  dmBtnText: { fontSize: 22 },
  profileSection: {
    flexDirection: 'row',
    gap: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
    alignItems: 'flex-start',
  },
  profileInfo: { flex: 1, gap: Spacing.sm },
  displayName: { fontFamily: FontFamily.bold, fontSize: FontSize.headlineMd, color: Colors.onSurface },
  statsRow: { flexDirection: 'row', gap: Spacing.xl },
  bio: { fontFamily: FontFamily.regular, fontSize: FontSize.bodyMd, color: Colors.onSurface, lineHeight: 22 },
  followBtn: { borderRadius: BorderRadius.xl, paddingVertical: 8, paddingHorizontal: Spacing.lg, alignSelf: 'flex-start' },
  followBtnText: { fontFamily: FontFamily.bold, fontSize: FontSize.labelLg, color: Colors.white },
  unfollowBtn: {
    borderRadius: BorderRadius.xl,
    paddingVertical: 8,
    paddingHorizontal: Spacing.lg,
    alignSelf: 'flex-start',
    borderWidth: 1.5,
    borderColor: Colors.outlineVariant,
  },
  unfollowBtnText: { fontFamily: FontFamily.bold, fontSize: FontSize.labelLg, color: Colors.onSurface },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 1 },
  gridItem: { width: GRID_SIZE, height: GRID_SIZE, overflow: 'hidden' },
  gridImage: { width: '100%', height: '100%' },
  reelOverlay: { position: 'absolute', bottom: 6, left: 6, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2 },
  reelPlay: { color: Colors.white, fontSize: 10 },
});

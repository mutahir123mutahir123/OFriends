import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Avatar } from '@/components/Avatar';
import { Colors, FontFamily, FontSize, Spacing, BorderRadius } from '@/lib/theme';

type TabType = 'followers' | 'following';

type ListUser = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

export default function FollowsScreen() {
  const { id, tab } = useLocalSearchParams<{ id: string; tab?: TabType }>();
  const { user } = useAuth();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<TabType>(tab || 'followers');
  const [profile, setProfile] = useState<any>(null);
  const [listUsers, setListUsers] = useState<ListUser[]>([]);
  const [myFollowing, setMyFollowing] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadProfileAndFollows = useCallback(async (isRef = false) => {
    if (!id || !user) return;
    if (!isRef) setLoading(true);

    try {
      // 1. Fetch target user profile details
      const profilePromise = supabase
        .from('profiles')
        .select('username, display_name')
        .eq('id', id)
        .single();

      // 2. Fetch follows data
      const followsPromise =
        activeTab === 'followers'
          ? supabase.from('follows').select('follower_id').eq('following_id', id)
          : supabase.from('follows').select('following_id').eq('follower_id', id);

      // 3. Fetch logged in user's following list (to determine buttons state)
      const myFollowingPromise = supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', user.id);

      const [profileRes, followsRes, myFollowingRes] = await Promise.all([
        profilePromise,
        followsPromise,
        myFollowingPromise,
      ]);

      if (profileRes.error) throw profileRes.error;
      setProfile(profileRes.data);

      const myFollowingSet = new Set(
        (myFollowingRes.data ?? []).map((f: any) => f.following_id)
      );
      setMyFollowing(myFollowingSet);

      // 4. Retrieve details of followed/following users
      const targetUserIds = (followsRes.data ?? []).map((f: any) =>
        activeTab === 'followers' ? f.follower_id : f.following_id
      );

      if (targetUserIds.length > 0) {
        const { data: usersDetails, error: usersErr } = await supabase
          .from('profiles')
          .select('id, username, display_name, avatar_url')
          .in('id', targetUserIds);

        if (usersErr) throw usersErr;

        // Preserve original follow order if possible
        const userMap = new Map(usersDetails?.map((u) => [u.id, u]));
        const orderedUsers = targetUserIds
          .map((uid) => userMap.get(uid))
          .filter(Boolean) as ListUser[];

        setListUsers(orderedUsers);
      } else {
        setListUsers([]);
      }
    } catch (err: any) {
      console.error('Error fetching follows:', err);
      Alert.alert('Error', err?.message ?? 'Failed to load follow data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [id, user, activeTab]);

  useEffect(() => {
    void (async () => {
      if (id) await loadProfileAndFollows();
    })();
  }, [id, activeTab, loadProfileAndFollows]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadProfileAndFollows(true);
  };

  const toggleFollowUser = async (targetId: string) => {
    if (!user) return;
    const isCurrentlyFollowing = myFollowing.has(targetId);

    // Optimistic Update
    const updatedFollowing = new Set(myFollowing);
    if (isCurrentlyFollowing) {
      updatedFollowing.delete(targetId);
    } else {
      updatedFollowing.add(targetId);
    }
    setMyFollowing(updatedFollowing);

    try {
      if (isCurrentlyFollowing) {
        const { error } = await supabase
          .from('follows')
          .delete()
          .match({ follower_id: user.id, following_id: targetId });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('follows')
          .insert({ follower_id: user.id, following_id: targetId });
        if (error) throw error;
      }
    } catch (err: any) {
      console.error('Error updating follow status:', err);
      // Revert on failure
      const revertedFollowing = new Set(myFollowing);
      setMyFollowing(revertedFollowing);
      Alert.alert('Error', 'Could not update follow status. Please try again.');
    }
  };

  const renderItem = ({ item }: { item: ListUser }) => {
    const isOwnUser = item.id === user?.id;
    const isFollowingThisUser = myFollowing.has(item.id);

    return (
      <TouchableOpacity
        style={styles.userRow}
        activeOpacity={0.7}
        onPress={() => router.push(`/user/${item.id}` as any)}
      >
        <Avatar uri={item.avatar_url ?? undefined} name={item.username} size={48} />
        <View style={styles.userInfo}>
          <Text style={styles.username}>{item.username}</Text>
          {item.display_name && (
            <Text style={styles.displayName}>{item.display_name}</Text>
          )}
        </View>

        {!isOwnUser && (
          <TouchableOpacity
            onPress={() => toggleFollowUser(item.id)}
            activeOpacity={0.85}
          >
            {isFollowingThisUser ? (
              <View style={styles.followingBtn}>
                <Text style={styles.followingBtnText}>Following</Text>
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
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {profile?.display_name || profile?.username || 'Loading...'}
        </Text>
        <View style={styles.headerPlaceholder} />
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'followers' && styles.tabBtnActive]}
          onPress={() => setActiveTab('followers')}
        >
          <Text
            style={[styles.tabText, activeTab === 'followers' && styles.tabTextActive]}
          >
            Followers
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'following' && styles.tabBtnActive]}
          onPress={() => setActiveTab('following')}
        >
          <Text
            style={[styles.tabText, activeTab === 'following' && styles.tabTextActive]}
          >
            Following
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={listUsers}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>
                {activeTab === 'followers' ? '👥' : '✨'}
              </Text>
              <Text style={styles.emptyTitle}>
                {activeTab === 'followers' ? 'No Followers Yet' : 'Not Following Anyone'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {activeTab === 'followers'
                  ? "When people follow this user, they'll show up here."
                  : 'Start discovering and following people!'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: `${Colors.outlineVariant}33`,
  },
  backBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  backIcon: {
    fontSize: 32,
    color: Colors.primary,
    lineHeight: 36,
  },
  headerTitle: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.bodyLg,
    color: Colors.onSurface,
    textAlign: 'center',
    flex: 1,
  },
  headerPlaceholder: {
    width: 40,
  },
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: `${Colors.outlineVariant}22`,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabBtnActive: {
    borderBottomColor: Colors.primary,
  },
  tabText: {
    fontFamily: FontFamily.semiBold,
    fontSize: FontSize.labelLg,
    color: Colors.onSurfaceVariant,
  },
  tabTextActive: {
    color: Colors.primary,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingVertical: Spacing.md,
    paddingBottom: 100,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  userInfo: {
    flex: 1,
    marginLeft: Spacing.md,
    justifyContent: 'center',
  },
  username: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.bodyMd,
    color: Colors.onSurface,
  },
  displayName: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.labelLg,
    color: Colors.onSurfaceVariant,
    marginTop: 2,
  },
  followBtn: {
    borderRadius: BorderRadius.lg,
    paddingVertical: 6,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 88,
  },
  followBtnText: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.labelSm,
    color: Colors.white,
  },
  followingBtn: {
    borderRadius: BorderRadius.lg,
    paddingVertical: 6,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 88,
  },
  followingBtnText: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.labelSm,
    color: Colors.onSurface,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xxl,
    marginTop: 80,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: Spacing.md,
  },
  emptyTitle: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.bodyLg,
    color: Colors.onSurface,
    marginBottom: Spacing.xs,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.labelLg,
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 20,
  },
});

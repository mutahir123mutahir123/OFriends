import { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image as RNImage,
  Dimensions,
  Platform,
  Alert,
  Animated,
  Modal,
  ActivityIndicator,
  TextInput,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontFamily, FontSize, Spacing, BorderRadius } from '@/lib/theme';
import { Duration, Curves, Spring } from '@/lib/motion';
import { useAuth } from '@/lib/auth';
import { useNotifications } from '@/lib/notifications';
import { useFeed, FeedMode } from '@/hooks/useFeed';
import { useStories } from '@/hooks/useStories';
import { StoryRing } from '@/components/StoryRing';
import { Avatar } from '@/components/Avatar';
import { FeedSkeleton } from '@/components/skeletons/FeedSkeleton';
import { PostOptionsSheet } from '@/components/PostOptionsSheet';
import { formatRelativeTime, parseMentions } from '@/lib/helpers';
import { supabase } from '@/lib/supabase';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const TOGGLE_INSET = 3;   // matches toggle container padding in styles

export default function FeedScreen() {
  const { user } = useAuth();
  const { unreadCount, markAllRead } = useNotifications();
  const [mode, setMode] = useState<FeedMode>('following');
  const { posts, loading, refresh: refreshFeed } = useFeed(user?.id ?? '', mode);
  const { stories, seenUserIds, refresh: refreshStories } = useStories();
  const router = useRouter();

  const [sharingPost, setSharingPost] = useState<any>(null);
  const [menuPost, setMenuPost] = useState<any>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const [toggleW, setToggleW] = useState(0);
  const [modeAnim] = useState(() => new Animated.Value(mode === 'following' ? 0 : 1));
  const [badgeAnim] = useState(() => new Animated.Value(0));
  const [skeletonAnim] = useState(() => new Animated.Value(1));
  const [skeletonDismissed, setSkeletonDismissed] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refreshFeed();
      refreshStories();
    }, [refreshFeed, refreshStories])
  );

  useEffect(() => {
    Animated.timing(modeAnim, {
      toValue: mode === 'following' ? 0 : 1,
      duration: Duration.base,
      easing: Curves.standard,
      useNativeDriver: true,
    }).start();
  }, [mode, modeAnim]);

  useEffect(() => {
    if (unreadCount <= 0) {
      badgeAnim.setValue(0);
      return;
    }
    badgeAnim.setValue(0);
    Animated.spring(badgeAnim, { toValue: 1, ...Spring.pop, useNativeDriver: true }).start();
  }, [unreadCount, badgeAnim]);

  useEffect(() => {
    if (skeletonDismissed) return;
    if (loading && posts.length === 0) {
      skeletonAnim.setValue(1);
      return;
    }
    Animated.timing(skeletonAnim, {
      toValue: 0,
      duration: Duration.fast,
      easing: Curves.standard,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setSkeletonDismissed(true);
    });
  }, [loading, posts.length, skeletonDismissed, skeletonAnim]);

  const handleDeletePost = async (post: any) => {
    const { error } = await supabase.from('posts').delete().eq('id', post.id);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setRemovingId(post.id);
  };

  const handleRemoved = useCallback(() => {
    setRemovingId(null);
    refreshFeed();
  }, [refreshFeed]);

  const ListHeader = () => (
    <>
      {/* Top App Bar */}
      <View style={styles.appBar}>
        <RNImage source={require('@/assets/logo.png')} style={styles.appNameLogo} resizeMode="contain" />

        <View
          style={styles.toggle}
          onLayout={(e) => setToggleW(e.nativeEvent.layout.width)}
        >
          {toggleW > 0 && (
            <Animated.View
              style={[
                styles.togglePill,
                {
                  width: (toggleW - TOGGLE_INSET * 2) / 2,
                  transform: [
                    {
                      translateX: modeAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [
                          TOGGLE_INSET,
                          TOGGLE_INSET + (toggleW - TOGGLE_INSET * 2) / 2,
                        ],
                      }),
                    },
                  ],
                },
              ]}
            />
          )}
          <TouchableOpacity
            style={styles.toggleBtn}
            onPress={() => setMode('following')}
            activeOpacity={0.8}
          >
            <Text style={[styles.toggleText, mode === 'following' && styles.toggleTextActive]}>
              Following
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.toggleBtn}
            onPress={() => setMode('discover')}
            activeOpacity={0.8}
          >
            <Text style={[styles.toggleText, mode === 'discover' && styles.toggleTextActive]}>
              Discover
            </Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={() => { markAllRead(); router.push('/notifications' as any); }} style={styles.bellBtn}>
          <View>
            <Ionicons name="notifications-outline" size={24} color={Colors.onSurface} />
            {unreadCount > 0 && (
              <Animated.View
                style={[
                  styles.bellBadge,
                  { opacity: badgeAnim, transform: [{ scale: badgeAnim }] },
                ]}
              >
                <Text style={styles.bellBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </Animated.View>
            )}
          </View>
        </TouchableOpacity>
      </View>

      {/* Stories Tray */}
      <FlatList
        horizontal
        data={[
          { id: 'add', user_id: user?.id ?? '', media_url: '', expires_at: '', profiles: null },
          ...stories,
        ]}
        keyExtractor={(item) => item.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.storiesContainer}
        renderItem={({ item, index }) => {
          if (index === 0) {
            return (
              <TouchableOpacity
                style={styles.storyItem}
                onPress={() => router.push('/(tabs)/upload?type=story' as any)}
              >
                <View style={styles.addStoryRing}>
                  <Ionicons name="add" size={28} color={Colors.outlineVariant} />
                </View>
                <Text style={styles.storyLabel}>Your Story</Text>
              </TouchableOpacity>
            );
          }
          const isSeen = seenUserIds.has(item.user_id);
          return (
            <TouchableOpacity
              style={styles.storyItem}
              onPress={() => router.push(`/story/${item.user_id}` as any)}
            >
              <StoryRing size={64} seen={isSeen}>
                <Avatar
                  uri={(item as any).profiles?.avatar_url}
                  name={(item as any).profiles?.username ?? '?'}
                  size={58}
                />
              </StoryRing>
              <Text style={styles.storyLabel} numberOfLines={1}>
                {(item as any).profiles?.username ?? ''}
              </Text>
            </TouchableOpacity>
          );
        }}
      />
    </>
  );

  const ListEmpty = () => {
    if (loading) return null;
    if (mode === 'following') {
      return (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>👀</Text>
          <Text style={styles.emptyTitle}>Nothing here yet</Text>
          <Text style={styles.emptyBody}>
            Follow people to see their posts here, or check out Discover.
          </Text>
          <TouchableOpacity
            style={styles.discoverBtn}
            onPress={() => setMode('discover')}
            activeOpacity={0.8}
          >
            <Text style={styles.discoverBtnText}>Explore Discover</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyEmoji}>📭</Text>
        <Text style={styles.emptyTitle}>No posts yet</Text>
        <Text style={styles.emptyBody}>Be the first to post something!</Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={posts}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <PostCard
            post={item}
            currentUserId={user?.id ?? ''}
            onOpenOptions={setMenuPost}
            menuOpen={menuPost?.id === item.id}
            removing={removingId === item.id}
            onRemoved={handleRemoved}
            onShare={setSharingPost}
          />
        )}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={ListEmpty}
        contentContainerStyle={styles.feedContent}
        onRefresh={() => { refreshFeed(); refreshStories(); }}
        refreshing={loading}
        showsVerticalScrollIndicator={false}
      />

      {/* Skeleton crossfade — overlays the list until the first payload lands */}
      {!skeletonDismissed && (
        <Animated.View
          style={[styles.skeletonLayer, { opacity: skeletonAnim }]}
          pointerEvents="none"
        >
          <FeedSkeleton />
        </Animated.View>
      )}

      {/* In-app share sheet */}
      {sharingPost && (
        <ShareModal
          post={sharingPost}
          userId={user?.id ?? ''}
          onClose={() => setSharingPost(null)}
        />
      )}

      {/* Post options / delete sheet */}
      {menuPost && (
        <PostOptionsSheet
          visible={!!menuPost}
          onClose={() => setMenuPost(null)}
          options={[
            {
              label: 'Delete post',
              icon: 'trash-outline',
              destructive: true,
              onPress: () => handleDeletePost(menuPost),
            },
          ]}
          confirm={{
            title: 'Delete this post?',
            body: "This can't be undone.",
            confirmLabel: 'Delete',
            onConfirm: () => handleDeletePost(menuPost),
          }}
        />
      )}
    </View>
  );
}

type PostCardProps = {
  post: any;
  currentUserId: string;
  onOpenOptions: (post: any) => void;
  menuOpen: boolean;
  removing: boolean;
  onRemoved: () => void;
  onShare: (post: any) => void;
};

function PostCard({
  post,
  currentUserId,
  onOpenOptions,
  menuOpen,
  removing,
  onRemoved,
  onShare,
}: PostCardProps) {
  const router = useRouter();
  const imageHeight = SCREEN_WIDTH * (5 / 4);
  const isOwner = post.user_id === currentUserId;

  // Like state (managed locally so toggles are instant)
  const [liked, setLiked] = useState(post.is_liked_by_me ?? false);
  const [likeCount, setLikeCount] = useState<number>(post.likes_count ?? 0);
  const [toggling, setToggling] = useState(false);

  // Sync local like state when parent updates (e.g. from Realtime)
  useEffect(() => {
    void (async () => {
      setLiked(post.is_liked_by_me ?? false);
      setLikeCount(post.likes_count ?? 0);
    })();
  }, [post.id, post.is_liked_by_me, post.likes_count]);

  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!currentUserId) return;
    void (async () => {
      const { data } = await supabase
        .from('saved_posts')
        .select('id')
        .eq('user_id', currentUserId)
        .eq('post_id', post.id)
        .maybeSingle();
      setSaved(!!data);
    })();
  }, [post.id, currentUserId]);

  const toggleSave = async () => {
    const next = !saved;
    setSaved(next);
    popIcon(bookmarkPop, 1.26);
    if (next) {
      await supabase.from('saved_posts').insert({ user_id: currentUserId, post_id: post.id });
    } else {
      await supabase.from('saved_posts').delete().match({ user_id: currentUserId, post_id: post.id });
    }
  };

  // Heart burst animation
  const [heartScale] = useState(() => new Animated.Value(0));
  const [heartOpacity] = useState(() => new Animated.Value(0));

  // Micro-interactions
  const [moreAnim] = useState(() => new Animated.Value(0));
  const [iconPop] = useState(() => new Animated.Value(1));
  const [countAnim] = useState(() => new Animated.Value(0));
  const [bookmarkPop] = useState(() => new Animated.Value(1));
  const [collapseOpacity] = useState(() => new Animated.Value(1));
  const [collapseY] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.spring(moreAnim, {
      toValue: menuOpen ? 1 : 0,
      ...Spring.pop,
      useNativeDriver: true,
    }).start();
  }, [menuOpen, moreAnim]);

  useEffect(() => {
    if (!removing) return;
    Animated.parallel([
      Animated.timing(collapseOpacity, {
        toValue: 0,
        duration: Duration.fast,
        easing: Curves.exit,
        useNativeDriver: true,
      }),
      Animated.timing(collapseY, {
        toValue: -14,
        duration: Duration.fast,
        easing: Curves.exit,
        useNativeDriver: true,
      }),
    ]).start(() => onRemoved());
  }, [removing, collapseOpacity, collapseY, onRemoved]);

  const popIcon = (anim: Animated.Value, to: number) => {
    anim.setValue(1);
    Animated.sequence([
      Animated.spring(anim, { toValue: to, ...Spring.pop, useNativeDriver: true }),
      Animated.spring(anim, { toValue: 1, ...Spring.pop, useNativeDriver: true }),
    ]).start();
  };

  const pulseCount = () => {
    countAnim.setValue(0);
    Animated.timing(countAnim, {
      toValue: 1,
      duration: Duration.fast,
      easing: Curves.standard,
      useNativeDriver: true,
    }).start();
  };

  // Double-tap detection
  const lastTap = useRef<number>(0);

  const burstHeart = () => {
    heartScale.setValue(0);
    heartOpacity.setValue(1);
    popIcon(iconPop, 1.32);
    pulseCount();
    Animated.parallel([
      Animated.spring(heartScale, { toValue: 1, useNativeDriver: true, bounciness: 12 }),
      Animated.sequence([
        Animated.delay(600),
        Animated.timing(heartOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
      ]),
    ]).start();
  };

  const handleDoubleTap = async () => {
    const now = Date.now();
    if (now - lastTap.current < 350) {
      if (!liked) {
        setLiked(true);
        setLikeCount((c) => c + 1);
        burstHeart();
        const { error } = await supabase.from('likes').insert({ user_id: currentUserId, post_id: post.id });
        if (error) {
          setLiked(false);
          setLikeCount((c) => Math.max(0, c - 1));
        }
      } else {
        burstHeart();
      }
    }
    lastTap.current = now;
  };

  const toggleLike = async () => {
    if (toggling) return;
    setToggling(true);
    if (liked) {
      setLiked(false);
      setLikeCount((c) => Math.max(0, c - 1));
      const { error } = await supabase.from('likes').delete().match({ user_id: currentUserId, post_id: post.id });
      if (error) {
        setLiked(true);
        setLikeCount((c) => c + 1);
      }
    } else {
      setLiked(true);
      setLikeCount((c) => c + 1);
      popIcon(iconPop, 1.32);
      pulseCount();
      const { error } = await supabase.from('likes').insert({ user_id: currentUserId, post_id: post.id });
      if (error) {
        setLiked(false);
        setLikeCount((c) => Math.max(0, c - 1));
      }
    }
    setToggling(false);
  };

  const handleShare = () => {
    onShare(post);
  };

  const handleLongPress = () => {
    if (!isOwner || menuOpen) return;
    onOpenOptions(post);
  };

  return (
    <Animated.View
      style={[
        styles.postCard,
        { opacity: collapseOpacity, transform: [{ translateY: collapseY }] },
      ]}
    >
      {/* Header */}
      <TouchableOpacity
        style={styles.postHeader}
        onPress={() => router.push(`/user/${post.user_id}` as any)}
        onLongPress={handleLongPress}
        delayLongPress={500}
      >
        <StoryRing size={40}>
          <Avatar uri={post.profiles?.avatar_url} name={post.profiles?.username ?? '?'} size={34} />
        </StoryRing>
        <View style={styles.postHeaderText}>
          <Text style={styles.postUsername}>{post.profiles?.username ?? ''}</Text>
          <Text style={styles.postTime}>{formatRelativeTime(post.created_at)}</Text>
        </View>
        {isOwner && (
          <TouchableOpacity
            onPress={handleLongPress}
            style={styles.moreBtn}
            hitSlop={12}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel="Post options"
            accessibilityHint="Double tap to delete this post"
          >
            <Animated.View
              style={{
                transform: [
                  {
                    rotate: moreAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0deg', '90deg'],
                    }),
                  },
                  {
                    scale: moreAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.88, 1],
                    }),
                  },
                ],
              }}
            >
              <Ionicons
                name="ellipsis-horizontal"
                size={20}
                color={Colors.onSurfaceVariant}
              />
            </Animated.View>
          </TouchableOpacity>
        )}
      </TouchableOpacity>

      {/* Media — double-tap to like */}
      <TouchableOpacity
        activeOpacity={1}
        onPress={handleDoubleTap}
        onLongPress={handleLongPress}
        delayLongPress={500}
      >
        <View style={[styles.postMedia, { height: imageHeight }]}>
          <Image
            source={{ uri: post.media_url }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={200}
          />
          {/* Floating heart burst on double tap */}
          <Animated.View
            style={[styles.heartBurst, { opacity: heartOpacity, transform: [{ scale: heartScale }] }]}
            pointerEvents="none"
          >
            <Text style={styles.heartBurstIcon}>❤️</Text>
          </Animated.View>
        </View>
      </TouchableOpacity>

      {/* Actions */}
      <View style={styles.postActions}>
        <View style={styles.postActionsLeft}>
          <TouchableOpacity style={styles.actionBtn} onPress={toggleLike} activeOpacity={0.6}>
            <Animated.View style={{ transform: [{ scale: iconPop }] }}>
              <Ionicons
                name={liked ? 'heart' : 'heart-outline'}
                size={26}
                color={liked ? '#ff3b6f' : Colors.onSurface}
              />
            </Animated.View>
            <Animated.Text
              style={[
                styles.likeCount,
                {
                  opacity: countAnim.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }),
                  transform: [{
                    translateY: countAnim.interpolate({ inputRange: [0, 1], outputRange: [4, 0] }),
                  }],
                },
              ]}
            >
              {likeCount}
            </Animated.Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => router.push(`/post/${post.id}` as any)}
            activeOpacity={0.6}
          >
            <Ionicons name="chatbubble-outline" size={24} color={Colors.onSurface} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={handleShare} activeOpacity={0.6}>
            <Ionicons name="paper-plane-outline" size={24} color={Colors.onSurface} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={toggleSave} activeOpacity={0.6}>
          <Animated.View style={{ transform: [{ scale: bookmarkPop }] }}>
            <Ionicons
              name={saved ? 'bookmark' : 'bookmark-outline'}
              size={24}
              color={saved ? Colors.primary : Colors.onSurface}
            />
          </Animated.View>
        </TouchableOpacity>
      </View>

      {/* Caption */}
      {post.caption ? (
        <View style={styles.caption}>
          <Text style={styles.captionText}>
            <Text style={styles.captionUsername}>{post.profiles?.username} </Text>
            {parseMentions(post.caption).map((seg, i) =>
              seg.isMention ? (
                <Text key={i} style={styles.mention}>{seg.text}</Text>
              ) : (
                <Text key={i}>{seg.text}</Text>
              )
            )}
          </Text>
          <TouchableOpacity onPress={() => router.push(`/post/${post.id}` as any)}>
            <Text style={styles.viewComments}>View all comments</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  feedContent: { paddingBottom: 100 },
  skeletonLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.background,
  },

  // App bar
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  appNameLogo: {
    width: 90,
    height: 36,
  },

  // Following / Discover pill toggle
  toggle: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: Colors.surfaceContainerLow,
    borderRadius: BorderRadius.full,
    padding: 3,
    gap: 2,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: BorderRadius.full,
  },
  togglePill: {
    position: 'absolute',
    top: TOGGLE_INSET,
    bottom: TOGGLE_INSET,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primaryContainer,
  },
  toggleText: {
    fontFamily: FontFamily.semiBold,
    fontSize: FontSize.labelSm,
    color: Colors.onSurfaceVariant,
  },
  toggleTextActive: { color: Colors.white },
  bellBtn: { padding: 2 },
  bellBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#ff3b6f',
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  bellBadgeText: {
    fontFamily: FontFamily.bold,
    fontSize: 10,
    color: Colors.white,
  },

  // Stories tray
  storiesContainer: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    gap: Spacing.md,
  },
  storyItem: { alignItems: 'center', gap: 6, width: 72 },
  addStoryRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: Colors.outlineVariant,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyLabel: {
    fontFamily: FontFamily.semiBold,
    fontSize: FontSize.labelSm,
    color: Colors.onSurface,
    textAlign: 'center',
    maxWidth: 70,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: 60,
    gap: Spacing.md,
  },
  emptyEmoji: { fontSize: 48 },
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
  discoverBtn: {
    marginTop: Spacing.sm,
    paddingVertical: 10,
    paddingHorizontal: Spacing.xl,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primaryContainer,
  },
  discoverBtnText: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.labelLg,
    color: Colors.white,
  },

  // Post card
  postCard: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
    marginBottom: Spacing.xl,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  postHeaderText: { flex: 1 },
  postUsername: {
    fontFamily: FontFamily.semiBold,
    fontSize: FontSize.labelLg,
    color: Colors.onSurface,
  },
  postTime: {
    fontFamily: FontFamily.regular,
    fontSize: 10,
    color: Colors.onSurfaceVariant,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  moreBtn: { padding: 4 },
  postMedia: {
    width: SCREEN_WIDTH,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceContainerLow,
  },
  heartBurst: {
    position: 'absolute',
    alignSelf: 'center',
    top: '35%',
  },
  heartBurstIcon: {
    fontSize: 90,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  postActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  postActionsLeft: { flexDirection: 'row', gap: Spacing.lg },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  likeCount: {
    fontFamily: FontFamily.semiBold,
    fontSize: FontSize.labelLg,
    color: Colors.onSurface,
  },
  caption: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.md, gap: 4 },
  captionText: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.bodyMd,
    color: Colors.onSurface,
    lineHeight: 22,
  },
  captionUsername: { fontFamily: FontFamily.bold },
  mention: { color: Colors.secondaryFixedDim, fontFamily: FontFamily.bold },
  viewComments: {
    fontFamily: FontFamily.semiBold,
    fontSize: FontSize.labelSm,
    color: Colors.onSurfaceVariant,
    marginTop: 2,
  },
});

// ─── In-App Share Modal ───────────────────────────────────────────────────────

type ShareModalProps = {
  post: any;
  userId: string;
  onClose: () => void;
};

function ShareModal({ post, userId, onClose }: ShareModalProps) {
  const [contacts, setContacts] = useState<any[]>([]);
  const [loadingContacts, setLoadingContacts] = useState(true);
  const [searchFocused, setSearchFocused] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);

  const loadContacts = useCallback(async () => {
    setLoadingContacts(true);
    const [followingRes, followersRes] = await Promise.all([
      supabase.from('follows').select('following_id').eq('follower_id', userId),
      supabase.from('follows').select('follower_id').eq('following_id', userId),
    ]);
    const idSet = new Set<string>([
      ...(followingRes.data ?? []).map((f: any) => f.following_id),
      ...(followersRes.data ?? []).map((f: any) => f.follower_id),
    ]);

    if (idSet.size === 0) {
      setContacts([]);
      setLoadingContacts(false);
      return;
    }

    const { data } = await supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .in('id', Array.from(idSet));

    setContacts(data ?? []);
    setLoadingContacts(false);
  }, [userId]);

  useEffect(() => {
    void (async () => {
      await loadContacts();
    })();
  }, [loadContacts]);

  useEffect(() => {
    if (!searchQuery.trim()) {
      void (async () => { setSearchResults([]); })();
      return;
    }
    const q = searchQuery.trim().toLowerCase();
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, username, display_name, avatar_url')
        .ilike('username', `%${q}%`)
        .limit(20);
      setSearchResults(data ?? []);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const openSearch = () => {
    setSearchFocused(true);
  };

  const closeSearch = () => {
    setSearchFocused(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  const sendToUser = async (receiverId: string) => {
    if (sending) return;
    setSending(receiverId);
    const caption = post.caption ? post.caption.slice(0, 80) : '';
    const text = caption ? `📸 ${caption}` : '📸 Shared a post';
    const { error } = await supabase.from('messages').insert({
      sender_id: userId,
      receiver_id: receiverId,
      text,
      media_url: post.media_url,
      post_id: post.id,
    });
    if (error) {
      Alert.alert('Error', 'Failed to share the post. Please try again.');
      setSending(null);
      return;
    }
    setSent((prev) => new Set([...prev, receiverId]));
    setSending(null);
  };

  const combined = searchQuery.trim()
    ? searchResults
    : contacts;

  return (
    <Modal visible animationType="slide" transparent={!searchFocused} onRequestClose={searchFocused ? closeSearch : onClose}>
      {!searchFocused && (
        <TouchableOpacity style={shareStyles.backdrop} activeOpacity={1} onPress={onClose} />
      )}
      <View style={[shareStyles.sheet, searchFocused && shareStyles.sheetFull]}>
        {searchFocused ? (
          <>
            <View style={shareStyles.searchTopBar}>
              <TouchableOpacity onPress={closeSearch} style={shareStyles.searchBack}>
                <Ionicons name="arrow-back" size={24} color={Colors.onSurface} />
              </TouchableOpacity>
              <View style={shareStyles.searchBarFull}>
                <TextInput
                  style={shareStyles.searchInput}
                  placeholder="Search people..."
                  placeholderTextColor={Colors.outlineVariant}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoCapitalize="none"
                  autoFocus
                  selectionColor={Colors.primary}
                />
              </View>
            </View>
            {combined.length === 0 ? (
              <View style={shareStyles.center}>
                <Text style={shareStyles.emptyIcon}>🔍</Text>
                <Text style={shareStyles.emptyText}>
                  {searchQuery.trim() ? 'No users found' : 'Search for anyone to share with'}
                </Text>
              </View>
            ) : (
              <FlatList
                data={combined}
                keyExtractor={(c) => c.id}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 24 }}
                renderItem={({ item }) => {
                  const isSent = sent.has(item.id);
                  const isSending = sending === item.id;
                  return (
                    <View style={shareStyles.contactRow}>
                      <Avatar uri={item.avatar_url} name={item.username} size={46} />
                      <View style={shareStyles.contactInfo}>
                        <Text style={shareStyles.contactName}>{item.username}</Text>
                        {item.display_name ? (
                          <Text style={shareStyles.contactSub}>{item.display_name}</Text>
                        ) : null}
                      </View>
                      <TouchableOpacity
                        style={[shareStyles.sendBtn, isSent && shareStyles.sentBtn]}
                        onPress={() => sendToUser(item.id)}
                        disabled={isSent || !!sending}
                        activeOpacity={0.8}
                      >
                        {isSending ? (
                          <ActivityIndicator size="small" color={Colors.white} />
                        ) : (
                          <Text style={shareStyles.sendBtnText}>{isSent ? '✓ Sent' : 'Send'}</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  );
                }}
              />
            )}
          </>
        ) : (
          <>
            <View style={shareStyles.handle} />
            <Text style={shareStyles.title}>Send to</Text>
            <TouchableOpacity activeOpacity={0.85} onPress={openSearch} style={shareStyles.searchBar}>
              <Ionicons name="search" size={18} color={Colors.onSurfaceVariant} />
              <Text style={shareStyles.searchPlaceholder}>Search people...</Text>
            </TouchableOpacity>
            {loadingContacts ? (
              <View style={shareStyles.center}>
                <ActivityIndicator color={Colors.primary} size="large" />
              </View>
            ) : combined.length === 0 ? (
              <View style={shareStyles.center}>
                <Text style={shareStyles.emptyIcon}>👥</Text>
                <Text style={shareStyles.emptyText}>Follow people to share posts with them</Text>
              </View>
            ) : (
              <FlatList
                data={combined}
                keyExtractor={(c) => c.id}
                showsVerticalScrollIndicator={false}
                style={{ maxHeight: 400 }}
                contentContainerStyle={{ paddingBottom: 24 }}
                renderItem={({ item }) => {
                  const isSent = sent.has(item.id);
                  const isSending = sending === item.id;
                  return (
                    <View style={shareStyles.contactRow}>
                      <Avatar uri={item.avatar_url} name={item.username} size={46} />
                      <View style={shareStyles.contactInfo}>
                        <Text style={shareStyles.contactName}>{item.username}</Text>
                        {item.display_name ? (
                          <Text style={shareStyles.contactSub}>{item.display_name}</Text>
                        ) : null}
                      </View>
                      <TouchableOpacity
                        style={[shareStyles.sendBtn, isSent && shareStyles.sentBtn]}
                        onPress={() => sendToUser(item.id)}
                        disabled={isSent || !!sending}
                        activeOpacity={0.8}
                      >
                        {isSending ? (
                          <ActivityIndicator size="small" color={Colors.white} />
                        ) : (
                          <Text style={shareStyles.sendBtnText}>{isSent ? '✓ Sent' : 'Send'}</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  );
                }}
              />
            )}
          </>
        )}
      </View>
    </Modal>
  );
}

const shareStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    backgroundColor: Colors.surfaceContainerLow,
    borderTopLeftRadius: BorderRadius.xxl,
    borderTopRightRadius: BorderRadius.xxl,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
    maxHeight: '70%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.outlineVariant,
    alignSelf: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  sheetFull: {
    flex: 1,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    paddingTop: Platform.OS === 'ios' ? 50 : 30,
    maxHeight: '100%',
  },
  searchTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  searchBack: { padding: 4 },
  searchBarFull: {
    flex: 1,
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    paddingHorizontal: Spacing.md,
  },
  title: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.bodyLg,
    color: Colors.onSurface,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  center: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
    gap: Spacing.md,
  },
  emptyIcon: { fontSize: 40 },
  emptyText: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.bodyMd,
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  searchPlaceholder: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.bodyMd,
    color: Colors.outlineVariant,
    paddingVertical: 10,
    flex: 1,
  },
  searchInput: {
    flex: 1,
    fontFamily: FontFamily.regular,
    fontSize: FontSize.bodyMd,
    color: Colors.onSurface,
    paddingVertical: 10,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    gap: Spacing.md,
  },
  contactInfo: { flex: 1 },
  contactName: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.bodyMd,
    color: Colors.onSurface,
  },
  contactSub: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.labelLg,
    color: Colors.onSurfaceVariant,
  },
  sendBtn: {
    backgroundColor: Colors.primaryContainer,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    minWidth: 68,
    alignItems: 'center',
  },
  sentBtn: {
    backgroundColor: Colors.surfaceContainerHighest,
  },
  sendBtnText: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.labelSm,
    color: Colors.white,
  },
});


import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
  ActivityIndicator,
  StatusBar,
  Image,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Avatar } from '@/components/Avatar';
import { StoryRing } from '@/components/StoryRing';
import { Bone } from '@/components/Skeleton';
import { ReelCommentSheet } from '@/components/ReelCommentSheet';
import { formatRelativeTime } from '@/lib/helpers';
import { Colors, FontFamily, FontSize, Spacing, BorderRadius } from '@/lib/theme';

const { width: W, height: H } = Dimensions.get('window');
const TAB_BAR_H = Platform.OS === 'ios' ? 88 : 68;

// ─── Skeleton shown while first load ─────────────────────────────────────────
function ReelSkeleton() {
  return (
    <View style={{ width: W, height: H, backgroundColor: '#0a0a0a', justifyContent: 'flex-end' }}>
      {/* shimmer block fills screen */}
      <Bone width={W} height={H} radius={0} />
      {/* bottom overlay skeleton */}
      <View style={skeletonStyles.bottom}>
        <View style={skeletonStyles.authorRow}>
          <Bone width={38} height={38} radius={19} />
          <Bone width={110} height={13} radius={6} />
        </View>
        <Bone width={W * 0.6} height={12} radius={6} style={{ marginTop: 8 }} />
        <Bone width={W * 0.4} height={12} radius={6} style={{ marginTop: 6 }} />
      </View>
      {/* side actions skeleton */}
      <View style={skeletonStyles.side}>
        {[0, 1, 2, 3].map(i => (
          <Bone key={i} width={32} height={32} radius={16} style={{ marginBottom: 24 }} />
        ))}
      </View>
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
  bottom: {
    position: 'absolute',
    left: Spacing.md,
    right: 64,
    bottom: TAB_BAR_H + 24,
    gap: 4,
  },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: 8 },
  side: {
    position: 'absolute',
    right: Spacing.md,
    bottom: TAB_BAR_H + 80,
    alignItems: 'center',
  },
});

// ─── Individual reel item ─────────────────────────────────────────────────────
type ReelItemProps = {
  reel: any;
  isActive: boolean;
  muted: boolean;
  onMuteToggle: () => void;
  currentUserId: string;
};

function ReelItem({ reel, isActive, muted, onMuteToggle, currentUserId }: ReelItemProps) {
  const router = useRouter();
  const [liked, setLiked] = useState(reel.is_liked_by_me ?? false);
  const [likeCount, setLikeCount] = useState<number>(reel.likes_count ?? 0);
  const [commentCount, setCommentCount] = useState<number>(reel.comments_count ?? 0);
  const [following, setFollowing] = useState(reel.is_following ?? false);
  const [commentsOpen, setCommentsOpen] = useState(false);

  const player = useVideoPlayer(reel.media_url, (p) => {
    p.loop = true;
    p.muted = muted;
  });
  const { status: playerStatus } = useEvent(player, 'statusChange', { status: player.status });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability -- imperative write on SharedObject is the documented expo-video API
    player.muted = muted;
  }, [player, muted]);

  useEffect(() => {
    if (isActive) player.play();
    else player.pause();
  }, [player, isActive]);

  const buffering = playerStatus === 'loading';

  const toggleLike = async () => {
    if (liked) {
      setLiked(false); setLikeCount((c) => Math.max(0, c - 1));
      await supabase.from('likes').delete().match({ user_id: currentUserId, post_id: reel.id });
    } else {
      setLiked(true); setLikeCount((c) => c + 1);
      await supabase.from('likes').insert({ user_id: currentUserId, post_id: reel.id });
    }
  };

  const toggleFollow = async () => {
    const ownerId = reel.profiles?.id;
    if (!ownerId || ownerId === currentUserId) return;
    if (following) {
      setFollowing(false);
      await supabase.from('follows').delete().match({ follower_id: currentUserId, following_id: ownerId });
    } else {
      setFollowing(true);
      await supabase.from('follows').insert({ follower_id: currentUserId, following_id: ownerId });
    }
  };

  const isOwn = reel.profiles?.id === currentUserId;
  const bottomPad = TAB_BAR_H + 16;

  return (
    <View style={styles.reelItem}>
      {/* ── Thumbnail shown until video renders ────────────────────────── */}
      {reel.thumbnail_url ? (
        <Image
          source={{ uri: reel.thumbnail_url }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      ) : null}

      {/* ── Video ──────────────────────────────────────────────────────── */}
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        nativeControls={false}
      />

      {/* Buffering spinner */}
      {isActive && buffering && (
        <View style={styles.bufferCenter}>
          <ActivityIndicator color="rgba(255,255,255,0.85)" size="large" />
        </View>
      )}

      {/* Bottom gradient */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.75)']}
        style={styles.gradient}
        pointerEvents="none"
      />

      {/* ── Side actions: spread evenly over the bottom overlay area ──── */}
      <View style={[styles.sideActions, { bottom: bottomPad - 8 }]}>
        {/* Like */}
        <TouchableOpacity style={styles.actionItem} onPress={toggleLike} activeOpacity={0.8}>
          <Ionicons
            name={liked ? 'heart' : 'heart-outline'}
            size={32}
            color={liked ? '#ff3b6f' : Colors.white}
          />
          <Text style={styles.actionLabel}>{likeCount}</Text>
        </TouchableOpacity>

        {/* Comment — opens inline sheet, video keeps playing */}
        <TouchableOpacity
          style={styles.actionItem}
          onPress={() => setCommentsOpen(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="chatbubble-outline" size={30} color={Colors.white} />
          <Text style={styles.actionLabel}>{commentCount}</Text>
        </TouchableOpacity>

        {/* Mute */}
        <TouchableOpacity style={styles.actionItem} onPress={onMuteToggle} activeOpacity={0.8}>
          <Ionicons name={muted ? 'volume-mute' : 'volume-medium'} size={28} color={Colors.white} />
        </TouchableOpacity>
      </View>

      {/* ── Author + caption ────────────────────────────────────────────── */}
      <View style={[styles.bottomInfo, { bottom: bottomPad }]}>
        {/* Author row: avatar + name + follow (profile nav wraps only avatar+name) */}
        <View style={styles.authorRow}>
          <TouchableOpacity
            style={styles.authorLeft}
            onPress={() => router.push(`/user/${reel.profiles?.id}` as any)}
            activeOpacity={0.85}
          >
            <StoryRing size={42}>
              <Avatar uri={reel.profiles?.avatar_url} name={reel.profiles?.username ?? '?'} size={36} />
            </StoryRing>
            <Text style={styles.authorName}>{reel.profiles?.username}</Text>
          </TouchableOpacity>

          {/* Follow button sits right after the username, outside nav touchable */}
          {!isOwn && (
            <TouchableOpacity
              style={[styles.followBtn, following && styles.followingBtn]}
              onPress={toggleFollow}
              activeOpacity={0.8}
            >
              <Text style={[styles.followBtnText, following && styles.followingBtnText]}>
                {following ? 'Following' : 'Follow'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {reel.caption ? (
          <Text style={styles.caption} numberOfLines={2}>{reel.caption}</Text>
        ) : null}

        <Text style={styles.timeLabel}>{formatRelativeTime(reel.created_at)}</Text>
      </View>

      {/* ── Inline comment sheet (video keeps playing) ──────────────────── */}
      <ReelCommentSheet
        postId={reel.id}
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        onCountChange={setCommentCount}
      />
    </View>
  );
}

// ─── Main Reels Screen ────────────────────────────────────────────────────────
export default function ReelsScreen() {
  const { user } = useAuth();
  const [reels, setReels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setIsFocused(true);
      return () => setIsFocused(false);
    }, [])
  );

  const loadReels = useCallback(async () => {
    setLoading(true);
    const { data: reelsData } = await supabase
      .from('posts')
      .select('*, profiles(id, username, avatar_url)')
      .eq('type', 'reel')
      .order('created_at', { ascending: false })
      .limit(50);

    if (!reelsData || reelsData.length === 0) {
      setReels([]);
      setLoading(false);
      return;
    }

    // Enrich with like count + is_liked_by_me + is_following
    const ids = reelsData.map((r: any) => r.id);
    const ownerIds = [...new Set(reelsData.map((r: any) => r.profiles?.id).filter(Boolean))];

    const [likesRes, followsRes] = await Promise.all([
      supabase.from('likes').select('post_id, user_id').in('post_id', ids),
      ownerIds.length > 0
        ? supabase.from('follows').select('following_id').eq('follower_id', user!.id).in('following_id', ownerIds)
        : Promise.resolve({ data: [] }),
    ]);

    const myLikes = new Set((likesRes.data ?? []).filter((l: any) => l.user_id === user!.id).map((l: any) => l.post_id));
    const likeCountMap = new Map<string, number>();
    for (const l of likesRes.data ?? []) {
      likeCountMap.set(l.post_id, (likeCountMap.get(l.post_id) ?? 0) + 1);
    }
    const followingSet = new Set((followsRes.data ?? []).map((f: any) => f.following_id));

    setReels(
      reelsData.map((r: any) => ({
        ...r,
        likes_count: likeCountMap.get(r.id) ?? 0,
        is_liked_by_me: myLikes.has(r.id),
        is_following: followingSet.has(r.profiles?.id),
      }))
    );
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void (async () => {
      if (user) await loadReels();
    })();
  }, [user, loadReels]);

  const [viewabilityConfig] = useState(() => ({ viewAreaCoveragePercentThreshold: 60 }));

  const onViewableItemsChanged = useCallback(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setActiveIndex(viewableItems[0].index ?? 0);
    }
  }, []);

  if (loading) {
    return <ReelSkeleton />;
  }

  if (reels.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <StatusBar hidden />
        <Ionicons name="film-outline" size={64} color={Colors.outlineVariant} />
        <Text style={styles.emptyTitle}>No Reels Yet</Text>
        <Text style={styles.emptyBody}>Be the first to share a reel!</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <StatusBar hidden />
      <FlatList
        data={reels}
        keyExtractor={(item) => item.id}
        pagingEnabled
        snapToInterval={H}
        snapToAlignment="start"
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        viewabilityConfig={viewabilityConfig}
        onViewableItemsChanged={onViewableItemsChanged}
        windowSize={3}
        maxToRenderPerBatch={2}
        initialNumToRender={1}
        getItemLayout={(_, index) => ({ length: H, offset: H * index, index })}
        renderItem={({ item, index }) => (
          <ReelItem
            reel={item}
            isActive={index === activeIndex && isFocused}
            muted={muted}
            onMuteToggle={() => setMuted(m => !m)}
            currentUserId={user?.id ?? ''}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  reelItem: {
    width: W,
    height: H,
    backgroundColor: '#000',
  },
  bufferCenter: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradient: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    height: H * 0.5,
  },
  sideActions: {
    position: 'absolute',
    right: Spacing.md,
    height: 180,
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  actionItem: { alignItems: 'center', gap: 4 },
  actionLabel: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.labelSm,
    color: Colors.white,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  bottomInfo: {
    position: 'absolute',
    left: Spacing.md,
    right: 58,
    gap: 6,
    zIndex: 10,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  authorLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
  },
  authorName: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.bodyMd,
    color: Colors.white,
    flexShrink: 1,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  followBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    borderColor: Colors.white,
  },
  followingBtn: {
    borderColor: 'rgba(255,255,255,0.4)',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  followBtnText: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.labelSm,
    color: Colors.white,
  },
  followingBtnText: { color: 'rgba(255,255,255,0.6)' },
  caption: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.bodyMd,
    color: Colors.white,
    lineHeight: 22,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  timeLabel: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.labelSm,
    color: 'rgba(255,255,255,0.6)',
  },
  emptyContainer: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  emptyTitle: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.headlineMd,
    color: Colors.onSurface,
  },
  emptyBody: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.bodyMd,
    color: Colors.onSurfaceVariant,
  },
});

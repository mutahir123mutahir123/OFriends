import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
  ActivityIndicator,
  Image,
  StatusBar,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView } from 'expo-video';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Avatar } from '@/components/Avatar';
import { StoryRing } from '@/components/StoryRing';
import { ReelCommentSheet } from '@/components/ReelCommentSheet';
import { formatRelativeTime } from '@/lib/helpers';
import { Colors, FontFamily, FontSize, Spacing, BorderRadius } from '@/lib/theme';

const { height: H } = Dimensions.get('window');

export default function ReelPlayerScreen() {
  // mediaUrl / thumbUrl passed from feed/profile so video starts instantly
  const { id, mediaUrl, thumbUrl } = useLocalSearchParams<{
    id: string;
    mediaUrl?: string;
    thumbUrl?: string;
  }>();
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // ── Video state ──────────────────────────────────────────────────────────────
  const [videoUri, setVideoUri] = useState<string>(mediaUrl ?? '');
  const [thumbUri, setThumbUri] = useState<string>(thumbUrl ?? '');
  const [muted, setMuted] = useState(false);

  const lastSource = useRef(videoUri);
  const player = useVideoPlayer(videoUri || null, (p) => {
    p.loop = true;
  });
  const { status: playerStatus } = useEvent(player, 'statusChange', { status: player.status });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });

  const buffering = playerStatus === 'loading';
  const videoError = playerStatus === 'error';

  useEffect(() => {
    // eslint-disable-next-line react-hooks/immutability -- imperative write on SharedObject is the documented expo-video API
    player.muted = muted;
  }, [player, muted]);

  // Handle videoUri arriving after mount (loaded via loadPost)
  useEffect(() => {
    if (videoUri && lastSource.current !== videoUri) {
      lastSource.current = videoUri;
      player.replace(videoUri);
      player.play();
    }
  }, [player, videoUri]);

  // ── Metadata state ───────────────────────────────────────────────────────────
  const [post, setPost] = useState<any>(null);
  const [metaLoading, setMetaLoading] = useState(true);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [commentCount, setCommentCount] = useState(0);
  const [following, setFollowing] = useState(false);

  // ── Comments ─────────────────────────────────────────────────────────────────
  const [commentsOpen, setCommentsOpen] = useState(false);

  const loadPost = useCallback(async () => {
    setMetaLoading(true);
    const [postRes, likesCountRes, likedRes, commentsCountRes] = await Promise.all([
      supabase.from('posts').select('*, profiles(id, username, avatar_url)').eq('id', id).single(),
      supabase.from('likes').select('*', { count: 'exact', head: true }).eq('post_id', id),
      supabase.from('likes').select('id').eq('post_id', id).eq('user_id', user!.id).maybeSingle(),
      supabase.from('comments').select('*', { count: 'exact', head: true }).eq('post_id', id),
    ]);

    const p = postRes.data;
    setPost(p);
    setLikeCount(likesCountRes.count ?? 0);
    setLiked(!!likedRes.data);
    setCommentCount(commentsCountRes.count ?? 0);

    // Populate video/thumb if not already set from nav params
    if (!videoUri && p?.media_url) setVideoUri(p.media_url);
    if (!thumbUri && p?.thumbnail_url) setThumbUri(p.thumbnail_url);

    // Check follow state
    if (p?.profiles?.id && p.profiles.id !== user!.id) {
      const { data: fol } = await supabase
        .from('follows')
        .select('follower_id')
        .eq('follower_id', user!.id)
        .eq('following_id', p.profiles.id)
        .maybeSingle();
      setFollowing(!!fol);
    }

    setMetaLoading(false);
  }, [id, user, videoUri, thumbUri]);

  useEffect(() => {
    void (async () => {
      if (id && user) await loadPost();
    })();
  }, [id, user, loadPost]);

  useFocusEffect(
    useCallback(() => {
      player.play();
      return () => {
        player.pause();
        setCommentsOpen(false);
      };
    }, [player])
  );

  const toggleLike = async () => {
    if (!user || !id) return;
    if (liked) {
      setLiked(false); setLikeCount((c) => Math.max(0, c - 1));
      await supabase.from('likes').delete().match({ user_id: user.id, post_id: id });
    } else {
      setLiked(true); setLikeCount((c) => c + 1);
      await supabase.from('likes').insert({ user_id: user.id, post_id: id });
    }
  };

  const toggleFollow = async () => {
    if (!post?.profiles?.id || post.profiles.id === user?.id) return;
    const ownerId = post.profiles.id;
    if (following) {
      setFollowing(false);
      await supabase.from('follows').delete().match({ follower_id: user!.id, following_id: ownerId });
    } else {
      setFollowing(true);
      await supabase.from('follows').insert({ follower_id: user!.id, following_id: ownerId });
    }
  };

  const togglePlay = () => {
    if (isPlaying) player.pause();
    else player.play();
  };

  // Only block render if we have no video URI at all
  if (!videoUri) {
    if (metaLoading) {
      return (
        <View style={styles.loadingScreen}>
          <ActivityIndicator color={Colors.primary} size="large" />
        </View>
      );
    }
    if (!post) {
      return (
        <View style={styles.loadingScreen}>
          <Text style={styles.missingText}>Reel not found.</Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.backFallback}>
            <Text style={styles.backFallbackText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      );
    }
  }

  const isOwn = post?.profiles?.id === user?.id;

  return (
    <View style={styles.container}>
      <StatusBar hidden />

      {/* ── Thumbnail poster (shown until video loads) ───────────────────────── */}
      {thumbUri ? (
        <Image
          source={{ uri: thumbUri }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      ) : null}

      {/* ── Video ─────────────────────────────────────────────────────────────── */}
      <TouchableOpacity activeOpacity={1} style={StyleSheet.absoluteFill} onPress={togglePlay}>
        {videoUri ? (
          <VideoView
            player={player}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            nativeControls={false}
          />
        ) : null}

        {/* Buffering spinner */}
        {buffering && (
          <View style={styles.overlay}>
            <ActivityIndicator color={Colors.white} size="large" />
          </View>
        )}

        {/* Video error */}
        {videoError && (
          <View style={styles.overlay}>
            <Ionicons name="alert-circle-outline" size={48} color="rgba(255,255,255,0.7)" />
            <Text style={styles.errorText}>Couldn’t load video</Text>
          </View>
        )}

        {/* Pause indicator */}
        {!isPlaying && !buffering && !videoError && (
          <View style={styles.overlay}>
            <Ionicons name="play" size={56} color="rgba(255,255,255,0.85)" />
          </View>
        )}
      </TouchableOpacity>

      {/* Bottom gradient */}
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.78)']}
        style={styles.gradient}
        pointerEvents="none"
      />

      {/* ── Back button ───────────────────────────────────────────────────────── */}
      <TouchableOpacity
        style={[styles.backBtn, { top: insets.top + (Platform.OS === 'android' ? 8 : 4) }]}
        onPress={() => router.back()}
      >
        <Ionicons name="chevron-back" size={28} color={Colors.white} />
      </TouchableOpacity>

      {/* ── Mute button ───────────────────────────────────────────────────────── */}
      <TouchableOpacity
        style={[styles.muteBtn, { top: insets.top + (Platform.OS === 'android' ? 8 : 4) }]}
        onPress={() => setMuted((m) => !m)}
      >
        <Ionicons name={muted ? 'volume-mute' : 'volume-medium'} size={22} color={Colors.white} />
      </TouchableOpacity>

      {/* ── Side actions — bottom aligned with the author row ────────────────── */}
      <View style={[styles.sideActions, { bottom: insets.bottom + 28 }]}>
        {/* Like */}
        <TouchableOpacity style={styles.actionItem} onPress={toggleLike}>
          <Ionicons
            name={liked ? 'heart' : 'heart-outline'}
            size={30}
            color={liked ? '#ff3b6f' : Colors.white}
          />
          <Text style={styles.actionCount}>{likeCount}</Text>
        </TouchableOpacity>

        {/* Comment */}
        <TouchableOpacity style={styles.actionItem} onPress={() => setCommentsOpen(true)}>
          <Ionicons name="chatbubble-outline" size={28} color={Colors.white} />
          <Text style={styles.actionCount}>{commentCount}</Text>
        </TouchableOpacity>
      </View>

      {/* ── Author + caption + follow ──────────────────────────────────────────── */}
      <View style={[styles.bottomInfo, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.authorRow}>
          <TouchableOpacity
            style={styles.authorLeft}
            onPress={() => post?.profiles?.id && router.push(`/user/${post.profiles.id}` as any)}
          >
            <StoryRing size={38}>
              <Avatar uri={post?.profiles?.avatar_url} name={post?.profiles?.username ?? '?'} size={32} />
            </StoryRing>
            <Text style={styles.authorName}>{post?.profiles?.username ?? ''}</Text>
          </TouchableOpacity>

          {/* Follow button — next to username, hidden for own reels */}
          {!metaLoading && !isOwn && (
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

          {post?.created_at ? (
            <Text style={styles.postTime}>{formatRelativeTime(post.created_at)}</Text>
          ) : null}
        </View>

        {post?.caption ? (
          <Text style={styles.caption} numberOfLines={3}>{post.caption}</Text>
        ) : null}
      </View>

      {/* ── Inline comment sheet (video keeps playing) ────────────────────────── */}
      <ReelCommentSheet
        postId={id ?? ''}
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        onCountChange={setCommentCount}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  loadingScreen: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  missingText: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.bodyMd,
    color: Colors.onSurfaceVariant,
  },
  backFallback: {
    backgroundColor: Colors.primaryContainer,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.xl,
    paddingVertical: 10,
  },
  backFallbackText: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.labelLg,
    color: Colors.white,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
    gap: Spacing.sm,
  },
  errorText: {
    fontFamily: FontFamily.semiBold,
    fontSize: FontSize.labelLg,
    color: 'rgba(255,255,255,0.8)',
  },
  gradient: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    height: H * 0.45,
    zIndex: 5,
  },
  backBtn: {
    position: 'absolute',
    left: Spacing.md,
    zIndex: 20,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 20,
    padding: 6,
  },
  muteBtn: {
    position: 'absolute',
    right: Spacing.md,
    zIndex: 20,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 20,
    padding: 8,
  },
  sideActions: {
    position: 'absolute',
    right: Spacing.md,
    height: 140,
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  actionItem: { alignItems: 'center', gap: 4 },
  actionCount: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.labelSm,
    color: Colors.white,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  bottomInfo: {
    position: 'absolute',
    left: 0,
    right: 56,
    bottom: 0,
    paddingHorizontal: Spacing.md,
    gap: Spacing.xs,
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
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    flexShrink: 1,
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
  postTime: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.labelSm,
    color: 'rgba(255,255,255,0.65)',
  },
  caption: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.bodyMd,
    color: Colors.white,
    lineHeight: 22,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});

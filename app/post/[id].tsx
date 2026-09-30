import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
  ScrollView,
  KeyboardAvoidingView,
  ActivityIndicator,
  Alert,
  Share,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { StoryRing } from '@/components/StoryRing';
import { Avatar } from '@/components/Avatar';
import { PostOptionsSheet } from '@/components/PostOptionsSheet';
import { formatRelativeTime, parseMentions } from '@/lib/helpers';
import { Colors, FontFamily, FontSize, Spacing, BorderRadius } from '@/lib/theme';
import { Duration, Curves, Spring } from '@/lib/motion';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [post, setPost] = useState<any>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [likeCount, setLikeCount] = useState(0);
  const [liked, setLiked] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [loading, setLoading] = useState(true);
  const [deleteVisible, setDeleteVisible] = useState(false);

  const [iconPop] = useState(() => new Animated.Value(1));
  const [countAnim] = useState(() => new Animated.Value(1));

  const loadPost = useCallback(async () => {
    if (!id || !user) return;
    const [postRes, commentsRes, likesRes, likedRes] = await Promise.all([
      supabase.from('posts').select('*, profiles(id, username, avatar_url)').eq('id', id).single(),
      supabase.from('comments').select('*, profiles(id, username, avatar_url)').eq('post_id', id).order('created_at', { ascending: true }),
      supabase.from('likes').select('*', { count: 'exact', head: true }).eq('post_id', id),
      supabase.from('likes').select('*').eq('post_id', id).eq('user_id', user.id).maybeSingle(),
    ]);
    setPost(postRes.data);
    setComments(commentsRes.data ?? []);
    setLikeCount(likesRes.count ?? 0);
    setLiked(!!likedRes.data);
    setLoading(false);
  }, [id, user]);

  useEffect(() => {
    void (async () => {
      if (id) await loadPost();
    })();
  }, [id, loadPost]);

  // Real-time subscription for likes on this post
  useEffect(() => {
    if (!id) return;
    const channel = supabase
      .channel(`post-likes-${id}-${Date.now()}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'likes', filter: `post_id=eq.${id}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const like = payload.new as any;
            if (like.user_id !== user?.id) setLikeCount((c) => c + 1);
            if (like.user_id === user?.id) setLiked(true);
          } else if (payload.eventType === 'DELETE') {
            const oldLike = payload.old as any;
            if (oldLike.user_id !== user?.id) setLikeCount((c) => Math.max(0, c - 1));
            if (oldLike.user_id === user?.id) setLiked(false);
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [id, user?.id]);

  const popIcon = (to: number) => {
    iconPop.setValue(1);
    Animated.sequence([
      Animated.spring(iconPop, { toValue: to, ...Spring.pop, useNativeDriver: true }),
      Animated.spring(iconPop, { toValue: 1, ...Spring.pop, useNativeDriver: true }),
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

  const toggleLike = async () => {
    if (!user || !id) return;
    if (liked) {
      await supabase.from('likes').delete().match({ user_id: user.id, post_id: id });
      setLiked(false);
      setLikeCount((c) => c - 1);
    } else {
      await supabase.from('likes').insert({ user_id: user.id, post_id: id });
      setLiked(true);
      setLikeCount((c) => c + 1);
      popIcon(1.32);
      pulseCount();
    }
  };

  const deletePost = async () => {
    const { error } = await supabase.from('posts').delete().eq('id', id);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    router.back();
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: post?.caption
          ? `Check out this post: "${post.caption}"`
          : 'Check out this post!',
        url: post?.media_url,
      });
    } catch (err: any) {
      console.warn('Share error:', err?.message);
    }
  };

  const addComment = async () => {
    if (!commentText.trim() || !user || !id) return;
    const text = commentText.trim();
    setCommentText('');
    const { data } = await supabase
      .from('comments')
      .insert({ user_id: user.id, post_id: id, content: text })
      .select('*, profiles(id, username, avatar_url)')
      .single();
    if (data) setComments((prev) => [...prev, data]);
  };

  if (loading) {
    return <View style={[styles.container, styles.centered]}><ActivityIndicator color={Colors.primary} size="large" /></View>;
  }
  if (!post) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Text style={{ fontFamily: FontFamily.regular, fontSize: FontSize.bodyMd, color: Colors.onSurfaceVariant, marginBottom: Spacing.md }}>This post has been deleted.</Text>
        <TouchableOpacity onPress={() => router.back()} style={{ backgroundColor: Colors.primaryContainer, borderRadius: BorderRadius.full, paddingHorizontal: Spacing.lg, paddingVertical: 10 }}>
          <Text style={{ fontFamily: FontFamily.bold, fontSize: FontSize.labelLg, color: Colors.white }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
        {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Post</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={handleShare} style={styles.headerAction}>
            <Ionicons name="paper-plane-outline" size={22} color={Colors.onSurface} />
          </TouchableOpacity>
          {post.user_id === user?.id && (
            <TouchableOpacity
              onPress={() => setDeleteVisible(true)}
              style={styles.headerAction}
              hitSlop={10}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel="Delete post"
            >
              <Ionicons name="trash-outline" size={22} color={Colors.onSurface} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Post Author */}
        <TouchableOpacity style={styles.postHeader} onPress={() => router.push(`/user/${post.user_id}` as any)}>
          <StoryRing size={40}><Avatar uri={post.profiles?.avatar_url} name={post.profiles?.username ?? '?'} size={34} /></StoryRing>
          <View>
            <Text style={styles.username}>{post.profiles?.username}</Text>
            <Text style={styles.time}>{formatRelativeTime(post.created_at)}</Text>
          </View>
        </TouchableOpacity>

        {/* Media */}
        <Image
          source={{ uri: post.media_url }}
          style={[styles.media, { height: SCREEN_WIDTH * 1.25 }]}
          resizeMode="cover"
        />

        {/* Actions */}
        <View style={styles.actions}>
          <TouchableOpacity onPress={toggleLike} style={styles.actionBtn} activeOpacity={0.6}>
            <Animated.View style={{ transform: [{ scale: iconPop }] }}>
              <Ionicons
                name={liked ? 'heart' : 'heart-outline'}
                size={26}
                color={liked ? '#ff3b6f' : Colors.onSurface}
              />
            </Animated.View>
            <Animated.Text
              style={[
                styles.actionCount,
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
          <TouchableOpacity style={styles.actionBtn}>
            <Ionicons name="chatbubble-outline" size={24} color={Colors.onSurface} />
            <Text style={styles.actionCount}>{comments.length}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionBtn} onPress={handleShare}>
            <Ionicons name="paper-plane-outline" size={24} color={Colors.onSurface} />
          </TouchableOpacity>
        </View>

        {/* Caption */}
        {post.caption ? (
          <View style={styles.caption}>
            <Text style={styles.captionText}>
              <Text style={styles.captionUser}>{post.profiles?.username} </Text>
              {parseMentions(post.caption).map((seg, i) =>
                seg.isMention ? <Text key={i} style={styles.mention}>{seg.text}</Text> : <Text key={i}>{seg.text}</Text>
              )}
            </Text>
          </View>
        ) : null}

        {/* Comments */}
        <View style={styles.commentsSection}>
          {comments.map((c) => (
            <CommentRow key={c.id} comment={c} />
          ))}
        </View>
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Comment Input */}
      <View style={[styles.commentInput, { paddingBottom: Platform.OS === 'ios' ? 32 : Math.max(Spacing.md, insets.bottom) }]}>
        <Avatar uri={null} name={user?.email ?? '?'} size={32} />
        <TextInput
          style={styles.commentTextInput}
          placeholder="Add a comment..."
          placeholderTextColor={Colors.outlineVariant}
          value={commentText}
          onChangeText={setCommentText}
          multiline
          selectionColor={Colors.primary}
        />
        <TouchableOpacity onPress={addComment} disabled={!commentText.trim()}>
          <Text style={[styles.postBtn, !commentText.trim() && styles.postBtnDisabled]}>Post</Text>
        </TouchableOpacity>
      </View>

      {/* Delete options sheet */}
      {deleteVisible && (
        <PostOptionsSheet
          visible={deleteVisible}
          onClose={() => setDeleteVisible(false)}
          options={[
            { label: 'Delete post', icon: 'trash-outline', destructive: true, onPress: () => {} },
          ]}
          confirm={{
            title: 'Delete this post?',
            body: "This can't be undone.",
            confirmLabel: 'Delete',
            onConfirm: deletePost,
          }}
        />
      )}
    </KeyboardAvoidingView>
  );
}

function CommentRow({ comment }: { comment: any }) {
  const [anim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: Duration.base,
      easing: Curves.standard,
      useNativeDriver: true,
    }).start();
  }, [anim]);

  return (
    <Animated.View
      style={[
        styles.commentRow,
        {
          opacity: anim,
          transform: [{
            translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }),
          }],
        },
      ]}
    >
      <Avatar uri={comment.profiles?.avatar_url} name={comment.profiles?.username ?? '?'} size={32} />
      <View style={styles.commentBubble}>
        <Text style={styles.commentUser}>{comment.profiles?.username} </Text>
        <Text style={styles.commentText}>{comment.content}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered: { alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  backBtn: { padding: 4 },
  backIcon: { fontSize: 32, color: Colors.primary, lineHeight: 36 },
  headerTitle: { fontFamily: FontFamily.bold, fontSize: FontSize.bodyLg, color: Colors.onSurface, flex: 1 },
  headerRight: { flexDirection: 'row', gap: Spacing.sm },
  headerAction: { padding: 4 },
  headerActionIcon: { fontSize: 20 },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  username: { fontFamily: FontFamily.bold, fontSize: FontSize.labelLg, color: Colors.onSurface },
  time: { fontFamily: FontFamily.regular, fontSize: 10, color: Colors.onSurfaceVariant, textTransform: 'uppercase', letterSpacing: 1 },
  media: { width: SCREEN_WIDTH, backgroundColor: Colors.surfaceContainerLow },
  actions: {
    flexDirection: 'row',
    gap: Spacing.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },

  actionCount: { fontFamily: FontFamily.semiBold, fontSize: FontSize.labelLg, color: Colors.onSurface },
  caption: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.sm },
  captionText: { fontFamily: FontFamily.regular, fontSize: FontSize.bodyMd, color: Colors.onSurface, lineHeight: 22 },
  captionUser: { fontFamily: FontFamily.bold },
  mention: { color: Colors.secondaryFixedDim, fontFamily: FontFamily.bold },
  commentsSection: { paddingHorizontal: Spacing.md, gap: Spacing.sm, marginTop: Spacing.sm },
  commentRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
  commentBubble: { flex: 1, backgroundColor: Colors.surfaceContainerLow, borderRadius: BorderRadius.lg, padding: Spacing.sm },
  commentUser: { fontFamily: FontFamily.bold, fontSize: FontSize.labelLg, color: Colors.onSurface },
  commentText: { fontFamily: FontFamily.regular, fontSize: FontSize.bodyMd, color: Colors.onSurface },
  commentInput: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
    backgroundColor: Colors.background,
  },
  commentTextInput: {
    flex: 1,
    fontFamily: FontFamily.regular,
    fontSize: FontSize.bodyMd,
    color: Colors.onSurface,
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 20,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    maxHeight: 80,
  },
  postBtn: { fontFamily: FontFamily.bold, fontSize: FontSize.bodyMd, color: Colors.primary },
  postBtnDisabled: { opacity: 0.3 },
});

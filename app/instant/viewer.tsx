import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Image,
  TextInput,
  TouchableWithoutFeedback,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
  ActivityIndicator,
  KeyboardAvoidingView,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Avatar } from '@/components/Avatar';
import { formatRelativeTime } from '@/lib/helpers';
import { Colors, FontFamily, FontSize, Spacing } from '@/lib/theme';

const PRESET_EMOJIS = ['😂', '❤️', '😊', '👽', '🔥'];

/* ── Types ──────────────────────────────────────────────── */
type InstantItem = {
  id: string;
  user_id: string;
  media_url: string;
  created_at: string;
  username: string;
  avatar_url: string | null;
  viewed: boolean;
};

const { width: W } = Dimensions.get('window');

/* ══════════════════════════════════════════════════════════
   Instant Viewer
   Route: /instant/viewer?startUserId=<uuid>

   Opens a full-screen stack of the current user's friends'
   active instants.  Tapping the right 65% advances to the
   next instant; tapping the left 35% goes back one.
   Each instant is auto-marked as viewed on first open.
   When the last instant is dismissed the screen closes.
══════════════════════════════════════════════════════════ */
export default function InstantViewerScreen() {
  const { startUserId } = useLocalSearchParams<{ startUserId?: string }>();
  const { user } = useAuth();
  const router = useRouter();

  const insets = useSafeAreaInsets();
  const [instants, setInstants] = useState<InstantItem[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [myEmoji, setMyEmoji] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  // keep track of which instant IDs we've already marked viewed
  const markedRef = useRef(new Set<string>());

  /* ── Load data ─────────────────────────────────────────── */
  const loadInstants = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const now = new Date().toISOString();

    // 1. Who do I follow?
    const { data: followData } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', user.id);

    const followingIds = (followData ?? []).map((f: any) => f.following_id);

    if (followingIds.length === 0) {
      setLoading(false);
      return;
    }

    // 2. All active instants from those people, latest first
    const { data: rawInstants } = await supabase
      .from('instants')
      .select('id, user_id, media_url, created_at, profiles!instants_user_id_fkey(username, avatar_url)')
      .in('user_id', followingIds)
      .gt('expires_at', now)
      .order('created_at', { ascending: false });

    if (!rawInstants || rawInstants.length === 0) {
      setLoading(false);
      return;
    }

    // 3. Deduplicate — one instant per friend (the latest)
    const seenUsers = new Set<string>();
    const deduped = rawInstants.filter((i: any) => {
      if (seenUsers.has(i.user_id)) return false;
      seenUsers.add(i.user_id);
      return true;
    });

    // 4. Which have I already seen?
    const ids = deduped.map((i: any) => i.id);
    const { data: viewData } = await supabase
      .from('instant_views')
      .select('instant_id')
      .eq('viewer_id', user.id)
      .in('instant_id', ids);

    const viewedSet = new Set((viewData ?? []).map((v: any) => v.instant_id));

    // 5. Shape the data — ONLY unseen instants enter the viewer queue.
    //    Once an instant is viewed it is never shown again to this user.
    const items: InstantItem[] = deduped
      .filter((i: any) => !viewedSet.has(i.id))   // strict view-once
      .map((i: any) => {
        const profile = Array.isArray(i.profiles) ? i.profiles[0] : i.profiles;
        return {
          id: i.id,
          user_id: i.user_id,
          media_url: i.media_url,
          created_at: i.created_at,
          username: profile?.username ?? '',
          avatar_url: profile?.avatar_url ?? null,
          viewed: false,
        };
      });

    setInstants(items);

    // 7. Start at the tapped user (if supplied)
    if (startUserId) {
      const idx = items.findIndex(i => i.user_id === startUserId);
      setIndex(idx >= 0 ? idx : 0);
    } else {
      setIndex(0);
    }

    setLoading(false);
  }, [user, startUserId]);

  useEffect(() => {
    void (async () => {
      await loadInstants();
    })();
  }, [loadInstants]);

  /* ── Mark current instant as viewed ───────────────────── */
  const markViewed = useCallback(async (instantId: string) => {
    if (!user || markedRef.current.has(instantId)) return;
    markedRef.current.add(instantId);
    await supabase
      .from('instant_views')
      .upsert({ instant_id: instantId, viewer_id: user.id });
  }, [user]);

  const current = instants[index];

  useEffect(() => {
    if (current) markViewed(current.id);
  }, [current, markViewed]);

  /* ── Load my existing reaction for current instant ───────── */
  useEffect(() => {
    void (async () => {
      if (!current || !user) return;
      setMyEmoji(null);
      setReplyText('');
      const { data } = await supabase
        .from('instant_views')
        .select('emoji')
        .eq('instant_id', current.id)
        .eq('viewer_id', user.id)
        .maybeSingle();
      if (data?.emoji) setMyEmoji(data.emoji);
    })();
  }, [current, user]);

  /* ── Send emoji reaction ───────────────────────────────── */
  const sendReaction = useCallback(async (emoji: string) => {
    if (!current || !user) return;
    const next = myEmoji === emoji ? null : emoji; // toggle off if same
    setMyEmoji(next);
    await supabase
      .from('instant_views')
      .upsert(
        { instant_id: current.id, viewer_id: user.id, emoji: next },
        { onConflict: 'instant_id,viewer_id' }
      );
  }, [current, user, myEmoji]);

  /* ── Send reply as DM ─────────────────────────────────── */
  const sendReply = useCallback(async () => {
    if (!replyText.trim() || !current || !user) return;
    setSendingReply(true);
    const text = replyText.trim();
    setReplyText('');
    await supabase.from('messages').insert({
      sender_id: user.id,
      receiver_id: current.user_id,
      text: `↩ Replied to your instant: ${text}`,
    });
    setSendingReply(false);
  }, [replyText, current, user]);

  /* ── Navigation ────────────────────────────────────────── */
  const advance = useCallback(() => {
    if (index < instants.length - 1) {
      setIndex(i => i + 1);
    } else {
      router.back();
    }
  }, [index, instants.length, router]);

  const goBack = useCallback(() => {
    if (index > 0) {
      setIndex(i => i - 1);
    } else {
      router.back();
    }
  }, [index, router]);

  /* ── Loading state ─────────────────────────────────────── */
  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator color={Colors.primary} size="large" />
      </View>
    );
  }

  /* ── Empty state ───────────────────────────────────────── */
  if (!current) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Ionicons name="images-outline" size={52} color={Colors.onSurfaceVariant} />
        <Text style={styles.emptyTitle}>No Instants</Text>
        <Text style={styles.emptyBody}>
          None of your friends have posted an Instant in the last 24 hours.
        </Text>
        <TouchableOpacity style={styles.closeBtn} onPress={() => router.back()}>
          <Text style={styles.closeBtnText}>Close</Text>
        </TouchableOpacity>
      </View>
    );
  }

  /* ── Viewer ────────────────────────────────────────────── */
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      {/* Full-screen photo */}
      <Image
        source={{ uri: current.media_url }}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
      />

      {/* Dark vignette — top */}
      <View style={styles.vignetteTop} pointerEvents="none" />
      {/* Dark vignette — bottom (taller to cover reaction area) */}
      <View style={styles.vignetteBottom} pointerEvents="none" />

      {/* Progress bars */}
      <View style={styles.progressRow}>
        {instants.map((item, i) => (
          <View
            key={item.id}
            style={[
              styles.progressSegment,
              { flex: 1 },
              i < index   ? styles.segDone   :
              i === index ? styles.segActive :
                            styles.segPending,
            ]}
          />
        ))}
      </View>

      {/* Close button */}
      <TouchableOpacity style={styles.closeBtnOverlay} onPress={() => router.back()} hitSlop={10}>
        <Ionicons name="close" size={22} color={Colors.white} />
      </TouchableOpacity>

      {/* Tap zones — stop above the reaction bar (200px from bottom) */}
      <TouchableWithoutFeedback onPress={goBack}>
        <View style={styles.tapLeft} />
      </TouchableWithoutFeedback>
      <TouchableWithoutFeedback onPress={advance}>
        <View style={styles.tapRight} />
      </TouchableWithoutFeedback>

      {/* User info — sits above reaction bar */}
      <View style={styles.userRow} pointerEvents="none">
        <Avatar uri={current.avatar_url} name={current.username} size={38} />
        <View style={styles.userText}>
          <Text style={styles.username}>{current.username}</Text>
          <Text style={styles.timeAgo}>{formatRelativeTime(current.created_at)}</Text>
        </View>
        {current.viewed && (
          <View style={styles.seenBadge}>
            <Text style={styles.seenBadgeText}>Seen</Text>
          </View>
        )}
      </View>

      {/* Counter pill */}
      <View style={styles.counterPill} pointerEvents="none">
        <Text style={styles.counterText}>{index + 1} / {instants.length}</Text>
      </View>

      {/* ── Reaction bar + reply input ─────────────────────── */}
      <View style={[styles.bottomPanel, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        {/* Emoji row */}
        <View style={styles.emojiRow}>
          {PRESET_EMOJIS.map((emoji) => (
            <TouchableOpacity
              key={emoji}
              style={[
                styles.emojiBtn,
                myEmoji === emoji && styles.emojiBtnActive,
                emoji === '❤️' && styles.emojiBtnFeatured,
                myEmoji === emoji && emoji === '❤️' && styles.emojiBtnFeaturedActive,
              ]}
              onPress={() => sendReaction(emoji)}
              activeOpacity={0.75}
            >
              <Text style={[styles.emojiText, emoji === '❤️' && styles.emojiTextFeatured]}>
                {emoji}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Reply input */}
        <View style={styles.replyRow}>
          <TextInput
            style={styles.replyInput}
            placeholder={`Reply to ${current.username}…`}
            placeholderTextColor="rgba(255,255,255,0.45)"
            value={replyText}
            onChangeText={setReplyText}
            selectionColor={Colors.primary}
            returnKeyType="send"
            onSubmitEditing={sendReply}
          />
          {replyText.trim().length > 0 && (
            <TouchableOpacity onPress={sendReply} disabled={sendingReply} style={styles.replySendBtn}>
              <Ionicons name="send" size={18} color={Colors.primary} />
            </TouchableOpacity>
          )}
        </View>
      </View>

    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.xxl,
  },

  /* Vignettes */
  vignetteTop: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 140,
    backgroundColor: 'rgba(0,0,0,0.50)',
  },
  vignetteBottom: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    height: 220,  // taller to cover reaction bar
    backgroundColor: 'rgba(0,0,0,0.55)',
  },

  /* Progress bar row */
  progressRow: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 58 : 44,
    left: Spacing.md,
    right: Spacing.md,
    flexDirection: 'row',
    gap: 4,
  },
  progressSegment: {
    height: 3,
    borderRadius: 2,
  },
  segDone:    { backgroundColor: 'rgba(255,255,255,0.85)' },
  segActive:  { backgroundColor: Colors.primary },
  segPending: { backgroundColor: 'rgba(255,255,255,0.30)' },

  /* Close button */
  closeBtnOverlay: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 68 : 52,
    right: Spacing.lg,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Tap zones — stop 210px from bottom to leave room for reaction bar */
  tapLeft: {
    position: 'absolute',
    top: 0, bottom: 210, left: 0,
    width: W * 0.35,
  },
  tapRight: {
    position: 'absolute',
    top: 0, bottom: 210, right: 0,
    width: W * 0.65,
  },

  /* User info — sits above the reaction bar */
  userRow: {
    position: 'absolute',
    bottom: 210,
    left: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  userText: { gap: 2 },
  username: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.bodyMd,
    color: Colors.white,
  },
  timeAgo: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.labelSm,
    color: 'rgba(255,255,255,0.65)',
  },
  seenBadge: {
    marginLeft: 6,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  seenBadgeText: {
    fontFamily: FontFamily.semiBold,
    fontSize: FontSize.labelSm,
    color: 'rgba(255,255,255,0.75)',
  },

  /* Counter pill — sits above the reaction bar */
  counterPill: {
    position: 'absolute',
    bottom: 215,
    right: Spacing.lg,
    backgroundColor: 'rgba(0,0,0,0.40)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  counterText: {
    fontFamily: FontFamily.semiBold,
    fontSize: FontSize.labelSm,
    color: 'rgba(255,255,255,0.80)',
  },

  /* Reaction + reply bottom panel */
  bottomPanel: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    gap: Spacing.sm,
  },
  emojiRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  emojiBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  emojiBtnActive: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderColor: 'rgba(255,255,255,0.60)',
  },
  emojiBtnFeatured: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,59,111,0.25)',
  },
  emojiBtnFeaturedActive: {
    backgroundColor: 'rgba(255,59,111,0.50)',
    borderColor: '#ff3b6f',
  },
  emojiText: {
    fontSize: 24,
  },
  emojiTextFeatured: {
    fontSize: 28,
  },
  replyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 24,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  replyInput: {
    flex: 1,
    fontFamily: FontFamily.regular,
    fontSize: FontSize.bodyMd,
    color: Colors.white,
  },
  replySendBtn: {
    padding: 4,
  },

  /* Empty state */
  emptyTitle: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.bodyLg,
    color: Colors.onSurface,
    textAlign: 'center',
  },
  emptyBody: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.bodyMd,
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 24,
  },
  closeBtn: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.surfaceContainerHigh,
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.md,
    borderRadius: 99,
  },
  closeBtnText: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.bodyMd,
    color: Colors.onSurface,
  },
});

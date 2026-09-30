/**
 * InstantsBar
 *
 * Horizontal scrollable row shown at the top of the Messages screen.
 * • First item is always the current user ("Add" / camera button).
 * • Subsequent items are friends who have an active (non-expired) instant.
 *   – Purple/teal gradient ring  → unseen instant
 *   – Grey ring                  → already seen
 * Tapping a friend opens the full-screen viewer starting at that person.
 */

import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Avatar } from '@/components/Avatar';
import {
  Colors,
  FontFamily,
  FontSize,
  Spacing,
  Gradients,
} from '@/lib/theme';

/* ── Types ──────────────────────────────────────────────── */
type FriendInstant = {
  userId: string;
  username: string;
  avatarUrl: string | null;
  hasUnseen: boolean;
};

type Props = {
  /** Bump this number to force a refresh (e.g. after posting a new instant) */
  refreshKey?: number;
};

/* ── Component ──────────────────────────────────────────── */
export function InstantsBar({ refreshKey }: Props) {
  const { user } = useAuth();
  const router = useRouter();

  const [myProfile, setMyProfile] = useState<{ username: string; avatar_url: string | null } | null>(null);
  const [friends, setFriends] = useState<FriendInstant[]>([]);
  const [loading, setLoading] = useState(true);

  /* ── Fetch ───────────────────────────────────────────── */
  const fetchAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const now = new Date().toISOString();

    // Current user's profile (for the "Add" bubble)
    const { data: profileData } = await supabase
      .from('profiles')
      .select('username, avatar_url')
      .eq('id', user.id)
      .maybeSingle();

    setMyProfile(profileData ?? null);

    // Who I follow
    const { data: followData } = await supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', user.id);

    const followingIds: string[] = (followData ?? []).map((f: any) => f.following_id);

    if (followingIds.length === 0) {
      setFriends([]);
      setLoading(false);
      return;
    }

    // Latest active instant per followed user
    const { data: instantData } = await supabase
      .from('instants')
      .select('id, user_id, profiles!instants_user_id_fkey(username, avatar_url)')
      .in('user_id', followingIds)
      .gt('expires_at', now)
      .order('created_at', { ascending: false });

    if (!instantData || instantData.length === 0) {
      setFriends([]);
      setLoading(false);
      return;
    }

    // Deduplicate — one bubble per person (latest instant only)
    const seenUsers = new Set<string>();
    const deduped = instantData.filter((i: any) => {
      if (seenUsers.has(i.user_id)) return false;
      seenUsers.add(i.user_id);
      return true;
    });

    // Which have I already seen?
    const instantIds = deduped.map((i: any) => i.id);
    const { data: viewData } = await supabase
      .from('instant_views')
      .select('instant_id')
      .eq('viewer_id', user.id)
      .in('instant_id', instantIds);

    const viewedSet = new Set((viewData ?? []).map((v: any) => v.instant_id));

    const items: FriendInstant[] = deduped.map((i: any) => {
      const profile = Array.isArray(i.profiles) ? i.profiles[0] : i.profiles;
      return {
        userId: i.user_id,
        username: profile?.username ?? '',
        avatarUrl: profile?.avatar_url ?? null,
        hasUnseen: !viewedSet.has(i.id),
      };
    });

    // Unseen friends first
    items.sort((a, b) => (a.hasUnseen === b.hasUnseen ? 0 : a.hasUnseen ? -1 : 1));
    setFriends(items);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void (async () => {
      await fetchAll();
    })();
  }, [fetchAll, refreshKey]);

  /* ── Realtime: refresh when a new instant is posted ──── */
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('instants-bar')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'instants' },
        () => fetchAll()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, fetchAll]);

  /* ── Render ──────────────────────────────────────────── */
  if (loading) {
    return (
      <View style={styles.loadingRow}>
        <ActivityIndicator color={Colors.primary} size="small" />
      </View>
    );
  }

  // Only render the bar if there is something to show
  // (always show at least the "Add" button so users can post)
  return (
    <View style={styles.wrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* ── Your Instant bubble — always opens "Your Instants" page ── */}
        <TouchableOpacity
          style={styles.item}
          onPress={() => router.push('/instant/mine' as any)}
          activeOpacity={0.75}
        >
          <View style={styles.myBubble}>
            <Avatar
              uri={myProfile?.avatar_url}
              name={myProfile?.username ?? user?.email ?? '?'}
              size={54}
            />
            {/* camera / add badge */}
            <View style={styles.cameraBadge}>
              <Ionicons name="camera" size={11} color={Colors.white} />
            </View>
          </View>
          <Text style={styles.label} numberOfLines={1}>
            My Instants
          </Text>
        </TouchableOpacity>

        {/* ── Friends' instants ── */}
        {friends.map(friend => {
          const bubble = (
            <>
              {friend.hasUnseen ? (
                /* Gradient ring — unseen, tappable */
                <LinearGradient
                  colors={Gradients.storyRing}
                  start={{ x: 0, y: 1 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.ringOuter}
                >
                  <View style={styles.ringInner}>
                    <Avatar uri={friend.avatarUrl} name={friend.username} size={50} />
                  </View>
                </LinearGradient>
              ) : (
                /* Grey ring — already seen, non-tappable */
                <View style={[styles.ringOuter, styles.ringOuterSeen]}>
                  <View style={[styles.ringInner, styles.ringInnerSeen]}>
                    <Avatar uri={friend.avatarUrl} name={friend.username} size={50} />
                  </View>
                </View>
              )}
              <Text
                style={[styles.label, !friend.hasUnseen && styles.labelSeen]}
                numberOfLines={1}
              >
                {friend.username}
              </Text>
            </>
          );

          /* Unseen → tappable. Already seen → static View, no tap */
          if (friend.hasUnseen) {
            return (
              <TouchableOpacity
                key={friend.userId}
                style={styles.item}
                onPress={() =>
                  router.push(`/instant/viewer?startUserId=${friend.userId}` as any)
                }
                activeOpacity={0.75}
              >
                {bubble}
              </TouchableOpacity>
            );
          }

          return (
            <View key={friend.userId} style={styles.item}>
              {bubble}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

/* ── Styles ─────────────────────────────────────────────── */
const BUBBLE_OUTER = 62; // gradient ring outer diameter
const BUBBLE_INNER = 56; // avatar diameter inside ring

const styles = StyleSheet.create({
  wrapper: {
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  loadingRow: {
    height: 90,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
    alignItems: 'flex-start',
  },

  /* Each avatar column */
  item: {
    alignItems: 'center',
    gap: 6,
    width: 70,
  },

  /* Your own avatar with camera badge */
  myBubble: {
    width: BUBBLE_OUTER,
    height: BUBBLE_OUTER,
    borderRadius: BUBBLE_OUTER / 2,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceContainerHigh,
  },
  cameraBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.background,
  },

  /* Gradient / grey ring for friends */
  ringOuter: {
    width: BUBBLE_OUTER,
    height: BUBBLE_OUTER,
    borderRadius: BUBBLE_OUTER / 2,
    padding: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringOuterSeen: {
    backgroundColor: Colors.outlineVariant,
  },
  ringInner: {
    width: BUBBLE_INNER,
    height: BUBBLE_INNER,
    borderRadius: BUBBLE_INNER / 2,
    overflow: 'hidden',
    borderWidth: 2.5,
    borderColor: Colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceContainerHigh,
  },

  /* Username label */
  label: {
    fontFamily: FontFamily.semiBold,
    fontSize: FontSize.labelSm,
    color: Colors.onSurfaceVariant,
    maxWidth: 66,
    textAlign: 'center',
  },
  labelSeen: {
    opacity: 0.45,
  },

  /* Extra dim on already-seen avatar */
  ringInnerSeen: {
    opacity: 0.50,
  },
});

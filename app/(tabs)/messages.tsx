import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Avatar } from '@/components/Avatar';
import { InstantsBar } from '@/components/InstantsBar';
import { MessagesSkeleton } from '@/components/skeletons/MessagesSkeleton';
import { formatRelativeTime } from '@/lib/helpers';
import { Colors, FontFamily, FontSize, Spacing, BorderRadius } from '@/lib/theme';
import { playMessageSound } from '@/lib/notificationSound';

export default function MessagesScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);
  const [instantsRefreshKey, setInstantsRefreshKey] = useState(0);
  const soundPlayedKeys = useRef(new Set<string>());
  // Search-all-users state
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  // Prevent reload flicker — only show spinner on very first load
  const hasLoaded = useRef(false);

  const fetchUnreadCount = useCallback(async () => {
    if (!user) return;
    const { count } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('receiver_id', user.id)
      .eq('read', false);
    setUnreadCount(count ?? 0);
  }, [user]);

  const fetchConversations = useCallback(async () => {
    if (!user) return;
    // Only show the full-screen spinner on the very first load.
    // Re-focus refreshes happen silently so there's no flicker.
    if (!hasLoaded.current) setLoading(true);

    // Only fetch messages from the last 24 hours — expired ones are invisible.
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data } = await supabase
      .from('messages')
      .select('*, sender:profiles!messages_sender_id_fkey(id, username, avatar_url), receiver:profiles!messages_receiver_id_fkey(id, username, avatar_url)')
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .gt('created_at', cutoff)          // only non-expired messages
      .order('created_at', { ascending: false });

    if (data) {
      const seen = new Set<string>();
      const deduped = data.filter((msg) => {
        const partnerId = msg.sender_id === user.id ? msg.receiver_id : msg.sender_id;
        if (seen.has(partnerId)) return false;
        seen.add(partnerId);
        return true;
      });
      setConversations(deduped);
    }
    hasLoaded.current = true;
    setLoading(false);
  }, [user]);

  // Auto-mark all messages as read and refresh when screen gains focus.
  // This is the correct place: we mark read BEFORE fetching the count so
  // the count comes back as 0 and the badge never flashes on re-entry.
  useFocusEffect(
    useCallback(() => {
      if (!user) return;

      const markAndRefresh = async () => {
        // Mark read first (RLS UPDATE policy added in migration 008)
        await supabase
          .from('messages')
          .update({ read: true })
          .eq('receiver_id', user.id)
          .eq('read', false);

        // Then fetch fresh data — count will now be 0
        fetchConversations();
        fetchUnreadCount();
      };

      markAndRefresh();
    }, [user, fetchConversations, fetchUnreadCount])
  );

  // Realtime subscription — messages
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('messages-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, (payload) => {
        fetchConversations();
        fetchUnreadCount();
        if (payload.eventType === 'INSERT') {
          const msg = payload.new as any;
          if (msg.receiver_id === user.id && msg.sender_id !== user.id) {
            const key = `${msg.id}_${msg.created_at}`;
            if (!soundPlayedKeys.current.has(key)) {
              soundPlayedKeys.current.add(key);
              playMessageSound();
            }
          }
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, fetchConversations, fetchUnreadCount]);

  // Realtime subscription — instants (bump refresh key when new one posted)
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('messages-instants')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'instants' }, () => {
        setInstantsRefreshKey(k => k + 1);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // When the user types, search ALL profiles (not just existing chats)
  useEffect(() => {
    if (!query.trim() || !user) {
      void (async () => { setSearchResults([]); })();
      return;
    }
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      const { data } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .ilike('username', `%${query.trim()}%`)
        .neq('id', user.id)
        .limit(25);
      setSearchResults(data ?? []);
      setSearchLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, user]);

  // Show skeleton only on first load (no conversations yet)
  if (loading && conversations.length === 0) {
    return <MessagesSkeleton />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Text style={styles.title}>Messages</Text>
          {/* Unread badge — auto-clears on focus, no tap needed */}
          <View style={styles.bellBtn}>
            <Ionicons name="chatbubbles-outline" size={24} color={Colors.onSurface} />
            {unreadCount > 0 && (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
              </View>
            )}
          </View>
        </View>
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Find friends..."
            placeholderTextColor={Colors.outlineVariant}
            value={query}
            onChangeText={setQuery}
            selectionColor={Colors.primary}
          />
        </View>
      </View>

      {/* ── Instants bar ── */}
      <InstantsBar refreshKey={instantsRefreshKey} />

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.primary} />
        </View>
      ) : query.trim() ? (
        /* ── Search mode: show ALL matching users ── */
        searchLoading ? (
          <View style={styles.centered}><ActivityIndicator color={Colors.primary} /></View>
        ) : (
          <FlatList
            data={searchResults}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.row}
                onPress={() => router.push(`/chat/${item.id}` as any)}
              >
                <Avatar uri={item.avatar_url} name={item.username ?? '?'} size={56} />
                <View style={styles.rowContent}>
                  <Text style={styles.rowName}>{item.username ?? ''}</Text>
                  <Text style={styles.rowPreview}>Tap to message</Text>
                </View>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={styles.centered}>
                <Text style={styles.emptyText}>No users found for &ldquo;{query}&rdquo;</Text>
              </View>
            }
          />
        )
      ) : (
        /* ── Default mode: show existing conversations ── */
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const partner = item.sender_id === user?.id ? item.receiver : item.sender;
            const isUnread = item.receiver_id === user?.id && !item.read;
            return (
              <TouchableOpacity
                style={[styles.row, isUnread && styles.rowUnread]}
                onPress={() => router.push(`/chat/${partner?.id}` as any)}
              >
                <Avatar uri={partner?.avatar_url} name={partner?.username ?? '?'} size={56} />
                <View style={styles.rowContent}>
                  <View style={styles.rowTop}>
                    <Text style={styles.rowName}>{partner?.username ?? ''}</Text>
                    <Text style={[styles.rowTime, isUnread && styles.rowTimeUnread]}>
                      {formatRelativeTime(item.created_at)}
                    </Text>
                  </View>
                  <Text style={[styles.rowPreview, isUnread && styles.rowPreviewUnread]} numberOfLines={1}>
                    {item.sender_id === user?.id ? `You: ${item.text ?? '📷'}` : (item.text ?? '📷')}
                  </Text>
                </View>
                {isUnread && <View style={styles.unreadDot} />}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.centered}>
              <Text style={styles.emptyText}>No messages yet.{'\n'}Search for a friend above to start chatting.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: Spacing.md,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.headlineMd,
    color: Colors.onSurface,
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
  },
  searchIcon: { fontSize: 16 },
  searchInput: {
    flex: 1,
    fontFamily: FontFamily.regular,
    fontSize: FontSize.bodyMd,
    color: Colors.onSurface,
    paddingVertical: 12,
  },
  list: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.xxl,
    marginBottom: Spacing.xs,
  },
  rowUnread: {
    backgroundColor: Colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  rowContent: { flex: 1 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 2 },
  rowName: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.bodyLg,
    color: Colors.onSurface,
  },
  rowTime: {
    fontFamily: FontFamily.semiBold,
    fontSize: FontSize.labelSm,
    color: Colors.onSurfaceVariant,
  },
  rowTimeUnread: { color: Colors.primary },
  rowPreview: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.bodyMd,
    color: Colors.onSurfaceVariant,
  },
  rowPreviewUnread: {
    fontFamily: FontFamily.semiBold,
    color: Colors.onSurface,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
  },
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
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 80, gap: Spacing.md },
  emptyText: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.bodyMd,
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 26,
  },
});

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  Alert,
  Image,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Avatar } from '@/components/Avatar';
import { Colors, FontFamily, FontSize, Spacing, BorderRadius } from '@/lib/theme';

/** Returns an ISO timestamp 24 hours ago — the expiry cutoff. */
const get24hCutoff = () =>
  new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

export default function ChatScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [partner, setPartner] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState('');
  const flatListRef = useRef<FlatList>(null);
  const IMAGE_WIDTH = Dimensions.get('window').width * 0.55;

  const markAsRead = useCallback(async () => {
    if (!user || !userId) return;
    await supabase
      .from('messages')
      .update({ read: true })
      .eq('sender_id', userId)
      .eq('receiver_id', user.id)
      .eq('read', false);
  }, [user, userId]);

  const fetchMessages = useCallback(async () => {
    if (!user || !userId) return;
    const { data } = await supabase
      .from('messages')
      .select('*, posts!post_id(id, type)')
      .or(`and(sender_id.eq.${user.id},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${user.id})`)
      .gt('created_at', get24hCutoff())   // only messages < 24h old
      .order('created_at', { ascending: true });
    if (data) setMessages(data);
  }, [user, userId]);

  useEffect(() => {
    if (!userId || !user) return;
    supabase.from('profiles').select('*').eq('id', userId).single()
      .then(({ data }) => setPartner(data));

    void (async () => {
      await fetchMessages();
    })();
    markAsRead();

    const channel = supabase
      .channel(`chat_${user.id}_${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const msg = payload.new as any;
        const isOurs = (msg.sender_id === user.id && msg.receiver_id === userId)
          || (msg.sender_id === userId && msg.receiver_id === user.id);
        if (isOurs) {
          setMessages((prev) => [...prev, msg]);
          if (msg.sender_id !== user.id) {
            supabase.from('messages').update({ read: true }).eq('id', msg.id);
          }
        }
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, () => {
        fetchMessages();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId, user, fetchMessages, markAsRead]);

  // Client-side expiry: prune messages from state every 60 s so they
  // disappear smoothly mid-conversation without waiting for the cron job.
  useEffect(() => {
    const timer = setInterval(() => {
      setMessages(prev => prev.filter(m => m.created_at > get24hCutoff()));
    }, 60_000);
    return () => clearInterval(timer);
  }, []);

  const deleteChat = () => {
    if (!user || !userId) return;
    Alert.alert('Delete Chat', 'This will delete the entire conversation for both users. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          const { error } = await supabase
            .from('messages')
            .delete()
            .or(`and(sender_id.eq.${user.id},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${user.id})`);
          if (error) {
            Alert.alert('Error', error.message);
          } else {
            router.back();
          }
        },
      },
    ]);
  };

  const sendMessage = async () => {
    if (!inputText.trim() || !user || !userId) return;
    const text = inputText.trim();
    setInputText('');
    const { error } = await supabase.from('messages').insert({ sender_id: user.id, receiver_id: userId, text });
    if (error) {
      setInputText(text);
      Alert.alert('Error', 'Failed to send the message. Please try again.');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior="padding"
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Header */}
      <SafeAreaView style={styles.headerSafe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backIcon}>‹</Text>
          </TouchableOpacity>
          <Avatar uri={partner?.avatar_url} name={partner?.username ?? '?'} size={36} />
          <Text style={styles.partnerName}>{partner?.username ?? ''}</Text>
          <TouchableOpacity onPress={deleteChat} style={styles.deleteBtn}>
            <Text style={styles.deleteIcon}>🗑</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* 24h disappearing notice */}
      <View style={styles.expiryBanner}>
        <Text style={styles.expiryBannerText}>🔥 Messages disappear after 24 hours</Text>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          <View style={styles.emptyChat}>
            <Text style={styles.emptyChatEmoji}>💬</Text>
            <Text style={styles.emptyChatText}>No messages yet — or previous ones have expired.</Text>
            <Text style={styles.emptyChatSub}>Say something! It’ll vanish in 24 hours.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const isMe = item.sender_id === user?.id;
          const hasMedia = !!item.media_url;
          const isReel = item.posts?.type === 'reel';
          return (
            <View style={[styles.bubbleRow, isMe ? styles.bubbleRowMe : styles.bubbleRowThem]}>
              <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem, hasMedia && { paddingHorizontal: 0, paddingVertical: 0, overflow: 'hidden', maxWidth: '70%' }]}>
                {hasMedia ? (
                  <>
                    <View>
                      <Image
                        source={{ uri: item.media_url }}
                        style={{ width: IMAGE_WIDTH, height: IMAGE_WIDTH * 1.25, borderRadius: 12 }}
                        resizeMode="cover"
                      />
                      {isReel && (
                        <View style={styles.reelPlayOverlay} pointerEvents="none">
                          <Ionicons name="play-circle" size={42} color="rgba(255,255,255,0.85)" />
                        </View>
                      )}
                    </View>
                    {item.text ? (
                      <Text style={[styles.bubbleText, isMe ? styles.bubbleTextMe : styles.bubbleTextThem, { paddingHorizontal: 10, paddingVertical: 6 }]}>
                        {item.text}
                      </Text>
                    ) : null}
                    <TouchableOpacity
                      style={styles.viewPostBtn}
                      onPress={() =>
                        isReel
                          ? router.push(`/reel/${item.post_id}` as any)
                          : router.push(`/post/${item.post_id}` as any)
                      }
                    >
                      <Ionicons name={isReel ? 'film-outline' : 'eye-outline'} size={14} color={Colors.white} />
                      <Text style={styles.viewPostText}>{isReel ? 'View Reel' : 'View Post'}</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <Text style={[styles.bubbleText, isMe ? styles.bubbleTextMe : styles.bubbleTextThem]}>
                    {item.text}
                  </Text>
                )}
              </View>
            </View>
          );
        }}
      />

      {/* Input */}
      <View style={[styles.inputRow, { paddingBottom: Platform.OS === 'ios' ? 32 : Math.max(Spacing.md, insets.bottom) }]}>
        <TextInput
          style={styles.input}
          placeholder="Message..."
          placeholderTextColor={Colors.outlineVariant}
          value={inputText}
          onChangeText={setInputText}
          multiline
          maxLength={500}
          selectionColor={Colors.primary}
        />
        <TouchableOpacity onPress={sendMessage} disabled={!inputText.trim()}>
          <Text style={[styles.sendBtn, !inputText.trim() && styles.sendBtnDisabled]}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  headerSafe: { backgroundColor: 'rgba(19,19,19,0.9)' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingTop: Platform.OS === 'ios' ? 0 : 40,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  backBtn: { padding: 4 },
  backIcon: { fontSize: 32, color: Colors.primary, lineHeight: 36 },
  deleteBtn: { padding: 4 },
  deleteIcon: { fontSize: 20 },
  partnerName: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.bodyLg,
    color: Colors.onSurface,
    flex: 1,
  },
  expiryBanner: {
    alignItems: 'center',
    paddingVertical: 7,
    backgroundColor: 'rgba(255,107,0,0.08)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,107,0,0.12)',
  },
  expiryBannerText: {
    fontFamily: FontFamily.semiBold,
    fontSize: FontSize.labelSm,
    color: 'rgba(255,160,60,0.90)',
    letterSpacing: 0.2,
  },
  emptyChat: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: Spacing.xxl,
    gap: Spacing.sm,
  },
  emptyChatEmoji: { fontSize: 44 },
  emptyChatText: {
    fontFamily: FontFamily.semiBold,
    fontSize: FontSize.bodyMd,
    color: Colors.onSurface,
    textAlign: 'center',
  },
  emptyChatSub: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.labelLg,
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
  },
  messageList: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.md, gap: 4 },
  bubbleRow: { flexDirection: 'row', marginVertical: 2 },
  bubbleRowMe: { justifyContent: 'flex-end' },
  bubbleRowThem: { justifyContent: 'flex-start' },
  bubble: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.xl,
    maxWidth: '75%',
  },
  bubbleMe: { backgroundColor: Colors.primaryContainer },
  bubbleThem: { backgroundColor: Colors.surfaceContainerHigh },
  bubbleText: { fontFamily: FontFamily.regular, fontSize: FontSize.bodyMd, lineHeight: 22 },
  bubbleTextMe: { color: Colors.white },
  bubbleTextThem: { color: Colors.onSurface },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
    gap: Spacing.sm,
    backgroundColor: Colors.background,
  },
  input: {
    flex: 1,
    fontFamily: FontFamily.regular,
    fontSize: FontSize.bodyMd,
    color: Colors.onSurface,
    backgroundColor: Colors.surfaceContainerLowest,
    borderRadius: 24,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    maxHeight: 100,
  },
  sendBtn: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.bodyMd,
    color: Colors.primary,
    paddingBottom: 2,
  },
  sendBtnDisabled: { opacity: 0.3 },
  reelPlayOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  viewPostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: Colors.primaryContainer,
    paddingVertical: 6,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  viewPostText: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.labelSm,
    color: Colors.white,
  },
});

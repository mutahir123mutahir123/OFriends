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
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Avatar } from '@/components/Avatar';
import { PostOptionsSheet } from '@/components/PostOptionsSheet';
import { Colors, FontFamily, FontSize, Spacing, BorderRadius } from '@/lib/theme';
import { Duration, Curves, Spring } from '@/lib/motion';

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
  const [deleteVisible, setDeleteVisible] = useState(false);
  const [sendPop] = useState(() => new Animated.Value(1));
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

  const deleteChat = async () => {
    if (!user || !userId) return;
    const { error } = await supabase
      .from('messages')
      .delete()
      .or(`and(sender_id.eq.${user.id},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${user.id})`);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    router.back();
  };

  const sendMessage = async () => {
    if (!inputText.trim() || !user || !userId) return;
    const text = inputText.trim();
    setInputText('');
    sendPop.setValue(1);
    Animated.sequence([
      Animated.spring(sendPop, { toValue: 1.2, ...Spring.pop, useNativeDriver: true }),
      Animated.spring(sendPop, { toValue: 1, ...Spring.pop, useNativeDriver: true }),
    ]).start();
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
          <TouchableOpacity
            onPress={() => setDeleteVisible(true)}
            style={styles.deleteBtn}
            hitSlop={10}
            activeOpacity={0.6}
            accessibilityRole="button"
            accessibilityLabel="Delete chat"
          >
            <Ionicons name="trash-outline" size={20} color={Colors.onSurface} />
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
          return (
            <MessageBubble item={item} isMe={isMe} hasMedia={hasMedia} imageWidth={IMAGE_WIDTH} />
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
        <TouchableOpacity onPress={sendMessage} disabled={!inputText.trim()} activeOpacity={0.6}>
          <Animated.Text style={[styles.sendBtn, !inputText.trim() && styles.sendBtnDisabled, { transform: [{ scale: sendPop }] }]}>
            Send
          </Animated.Text>
        </TouchableOpacity>
      </View>

      {/* Delete options sheet */}
      {deleteVisible && (
        <PostOptionsSheet
          visible={deleteVisible}
          onClose={() => setDeleteVisible(false)}
          options={[
            { label: 'Delete chat', icon: 'trash-outline', destructive: true, onPress: () => {} },
          ]}
          confirm={{
            title: 'Delete this chat?',
            body: 'This deletes the conversation for both of you. This can’t be undone.',
            confirmLabel: 'Delete',
            onConfirm: deleteChat,
          }}
        />
      )}
    </KeyboardAvoidingView>
  );
}

function MessageBubble({
  item,
  isMe,
  hasMedia,
  imageWidth,
}: {
  item: any;
  isMe: boolean;
  hasMedia: boolean;
  imageWidth: number;
}) {
  const router = useRouter();
  const [anim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: Duration.fast,
      easing: Curves.standard,
      useNativeDriver: true,
    }).start();
  }, [anim]);

  return (
    <Animated.View
      style={[
        styles.bubbleRow,
        isMe ? styles.bubbleRowMe : styles.bubbleRowThem,
        {
          opacity: anim,
          transform: [{
            translateX: anim.interpolate({
              inputRange: [0, 1],
              outputRange: isMe ? [12, 0] : [-12, 0],
            }),
          }],
        },
      ]}
    >
      <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem, hasMedia && { paddingHorizontal: 0, paddingVertical: 0, overflow: 'hidden', maxWidth: '70%' }]}>
        {hasMedia ? (
          <>
            <View>
              <Image
                source={{ uri: item.media_url }}
                style={{ width: imageWidth, height: imageWidth * 1.25, borderRadius: 12 }}
                resizeMode="cover"
              />
            </View>
            {item.text ? (
              <Text style={[styles.bubbleText, isMe ? styles.bubbleTextMe : styles.bubbleTextThem, { paddingHorizontal: 10, paddingVertical: 6 }]}>
                {item.text}
              </Text>
            ) : null}
            <TouchableOpacity
              style={styles.viewPostBtn}
              onPress={() => router.push(`/post/${item.post_id}` as any)}
            >
              <Ionicons name="eye-outline" size={14} color={Colors.white} />
              <Text style={styles.viewPostText}>View Post</Text>
            </TouchableOpacity>
          </>
        ) : (
          <Text style={[styles.bubbleText, isMe ? styles.bubbleTextMe : styles.bubbleTextThem]}>
            {item.text}
          </Text>
        )}
      </View>
    </Animated.View>
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

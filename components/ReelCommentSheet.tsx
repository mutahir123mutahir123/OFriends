import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Keyboard,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Avatar } from '@/components/Avatar';
import { formatRelativeTime } from '@/lib/helpers';
import { Colors, FontFamily, FontSize, Spacing, BorderRadius } from '@/lib/theme';

const SHEET_H = 480;

interface Props {
  postId: string;
  open: boolean;
  onClose: () => void;
  onCountChange?: (count: number) => void;
}

export function ReelCommentSheet({ postId, open, onClose, onCountChange }: Props) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const [comments, setComments] = useState<any[]>([]);
  const [commentText, setCommentText] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [keyboardOffset, setKeyboardOffset] = useState(0);

  const [sheetAnim] = useState(() => new Animated.Value(SHEET_H));
  const listRef = useRef<FlatList>(null);

  // Keyboard height tracking — moves sheet above keyboard
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvt, (e) => setKeyboardOffset(e.endCoordinates.height));
    const hide = Keyboard.addListener(hideEvt, () => setKeyboardOffset(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  const loadComments = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('comments')
      .select('*, profiles(id, username, avatar_url)')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });
    const loaded = data ?? [];
    setComments(loaded);
    onCountChange?.(loaded.length);
    setLoading(false);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 80);
  }, [postId, onCountChange]);

  useEffect(() => {
    if (open) {
      Animated.spring(sheetAnim, { toValue: 0, useNativeDriver: true, bounciness: 0, speed: 16 }).start();
    } else {
      Animated.timing(sheetAnim, { toValue: SHEET_H, duration: 200, useNativeDriver: true }).start();
    }

    void (async () => {
      if (open) {
        await loadComments();
      } else {
        setComments([]);
        setCommentText('');
      }
    })();
  }, [open, sheetAnim, loadComments]);

  const submitComment = async () => {
    const text = commentText.trim();
    if (!text || !user || sending) return;
    setSending(true);
    setCommentText('');
    const { data } = await supabase
      .from('comments')
      .insert({ user_id: user.id, post_id: postId, content: text })
      .select('*, profiles(id, username, avatar_url)')
      .single();
    if (data) {
      setComments((prev) => {
        const next = [...prev, data];
        onCountChange?.(next.length);
        return next;
      });
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 80);
    }
    setSending(false);
  };

  const handleClose = () => { Keyboard.dismiss(); onClose(); };

  if (!open) return null;

  // iOS home indicator is ~34 px. When keyboard is up it sits above it already;
  // when it's down we need explicit clearance so the input isn't hidden.
  const bottomPad = keyboardOffset > 0
    ? (Platform.OS === 'ios' ? insets.bottom + Spacing.xs : Spacing.xs)
    : insets.bottom + Spacing.lg;

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 50 }]} pointerEvents="box-none">
      {/* Tap-away backdrop */}
      <TouchableOpacity
        style={[StyleSheet.absoluteFill, styles.backdrop]}
        activeOpacity={1}
        onPress={handleClose}
      />

      {/* Sheet */}
      <Animated.View
        style={[
          styles.sheet,
          { transform: [{ translateY: sheetAnim }], bottom: keyboardOffset, paddingBottom: bottomPad },
        ]}
      >
        <View style={styles.handle} />

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Comments</Text>
          <TouchableOpacity onPress={handleClose} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Ionicons name="close" size={22} color={Colors.onSurface} />
          </TouchableOpacity>
        </View>

        {/* List */}
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={Colors.primary} />
          </View>
        ) : comments.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyText}>No comments yet — be the first!</Text>
          </View>
        ) : (
          <FlatList
            ref={listRef}
            data={comments}
            keyExtractor={(c) => c.id}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <View style={styles.commentRow}>
                <Avatar uri={item.profiles?.avatar_url} name={item.profiles?.username ?? '?'} size={32} />
                <View style={styles.commentBody}>
                  <Text style={styles.commentUser}>{item.profiles?.username}</Text>
                  <Text style={styles.commentText}>{item.content}</Text>
                  <Text style={styles.commentTime}>{formatRelativeTime(item.created_at)}</Text>
                </View>
              </View>
            )}
          />
        )}

        {/* Input row */}
        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Add a comment…"
            placeholderTextColor={Colors.outlineVariant}
            value={commentText}
            onChangeText={setCommentText}
            multiline
            maxLength={300}
            selectionColor={Colors.primary}
            returnKeyType="send"
            blurOnSubmit
            onSubmitEditing={submitComment}
          />
          <TouchableOpacity
            onPress={submitComment}
            disabled={!commentText.trim() || sending}
            style={[styles.sendBtn, (!commentText.trim() || sending) && styles.sendBtnDisabled]}
          >
            {sending
              ? <ActivityIndicator size="small" color={Colors.white} />
              : <Ionicons name="send" size={17} color={Colors.white} />}
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: SHEET_H,
    backgroundColor: Colors.surfaceContainerLow,
    borderTopLeftRadius: BorderRadius.xxl,
    borderTopRightRadius: BorderRadius.xxl,
    overflow: 'hidden',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.outlineVariant,
    alignSelf: 'center',
    marginTop: Spacing.sm,
    marginBottom: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: `${Colors.outlineVariant}40`,
  },
  title: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.bodyLg,
    color: Colors.onSurface,
    flex: 1,
    textAlign: 'center',
  },
  closeBtn: { padding: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.bodyMd,
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
  },
  list: { flex: 1, paddingHorizontal: Spacing.md },
  listContent: { paddingVertical: Spacing.sm, gap: Spacing.xs },
  commentRow: { flexDirection: 'row', gap: Spacing.sm, alignItems: 'flex-start' },
  commentBody: { flex: 1, gap: 2 },
  commentUser: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.labelLg,
    color: Colors.onSurface,
  },
  commentText: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.bodyMd,
    color: Colors.onSurface,
    lineHeight: 20,
  },
  commentTime: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.labelSm,
    color: Colors.onSurfaceVariant,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: `${Colors.outlineVariant}40`,
  },
  input: {
    flex: 1,
    fontFamily: FontFamily.regular,
    fontSize: FontSize.bodyMd,
    color: Colors.onSurface,
    backgroundColor: Colors.surfaceContainerHigh,
    borderRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    maxHeight: 80,
    minHeight: 36,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primaryContainer,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.35 },
});

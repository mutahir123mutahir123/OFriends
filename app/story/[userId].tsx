import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  useWindowDimensions,
  AppState,
  type GestureResponderEvent,
  type ImageStyle,
  type StyleProp,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Avatar } from '@/components/Avatar';
import { PostOptionsSheet } from '@/components/PostOptionsSheet';
import { markUserSeen } from '@/lib/seenStories';
import { Colors, FontFamily, FontSize, Spacing } from '@/lib/theme';

const STORY_DURATION = 5000;
/** A press shorter than this counts as a tap (navigate) rather than a hold (pause). */
const TAP_THRESHOLD_MS = 250;
/** Left third of the screen goes back, matching the original layout. */
const PREV_ZONE_RATIO = 0.38;

export default function StoryViewerScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [stories, setStories] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [index, setIndex] = useState(0);
  const [deleteVisible, setDeleteVisible] = useState(false);

  const progress = useSharedValue(0);

  // Refs mirror render state so the animation callbacks stay referentially
  // stable and never need to be torn down when `index` / `stories` change.
  const indexRef = useRef(0);
  const storiesCountRef = useRef(0);
  const nextStoryRef = useRef<() => void>(() => {});
  const isPausedRef = useRef(false);
  const pressStartRef = useRef(0);
  const pressXRef = useRef(0);

  const isOwnStory = userId === user?.id;

  const nextStory = useCallback(() => {
    if (indexRef.current < storiesCountRef.current - 1) {
      setIndex((i) => i + 1);
    } else {
      router.back();
    }
  }, [router]);

  const prevStory = useCallback(() => {
    if (indexRef.current > 0) {
      setIndex((i) => i - 1);
    }
  }, []);

  useEffect(() => {
    nextStoryRef.current = nextStory;
  }, [nextStory]);

  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  useEffect(() => {
    storiesCountRef.current = stories.length;
  }, [stories.length]);

  /** Restarts the bar from zero and runs the full duration. */
  const startProgress = useCallback(() => {
    cancelAnimation(progress);
    progress.set(0);
    progress.set(
      withTiming(1, { duration: STORY_DURATION, easing: Easing.linear }, (finished) => {
        if (finished) runOnJS(nextStoryRef.current)();
      }),
    );
  }, [progress]);

  /** Freezes the bar exactly where it is. */
  const pauseProgress = useCallback(() => {
    cancelAnimation(progress);
    isPausedRef.current = true;
  }, [progress]);

  /** Continues from the frozen value for exactly the time that's left. */
  const resumeProgress = useCallback(() => {
    isPausedRef.current = false;
    const remaining = STORY_DURATION * (1 - progress.get());
    if (remaining <= 0) {
      nextStoryRef.current();
      return;
    }
    progress.set(
      withTiming(1, { duration: remaining, easing: Easing.linear }, (finished) => {
        if (finished) runOnJS(nextStoryRef.current)();
      }),
    );
  }, [progress]);

  useEffect(() => {
    if (!userId) return;
    const now = new Date().toISOString();

    supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
      .then(({ data }) => setProfile(data));

    supabase
      .from('stories')
      .select('*')
      .eq('user_id', userId)
      .gt('expires_at', now)
      .order('created_at')
      .then(({ data }) => {
        if (data && data.length > 0) {
          setStories(data);
          markUserSeen(userId);
        } else {
          router.back();
        }
      });
  }, [userId, router]);

  useEffect(() => {
    if (!stories.length) return;
    isPausedRef.current = false;
    startProgress();
    return () => cancelAnimation(progress);
  }, [index, stories.length, startProgress, progress]);

  // Don't burn through stories while the app is backgrounded.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        if (!isPausedRef.current) pauseProgress();
        return;
      }
      if (isPausedRef.current) resumeProgress();
    });
    return () => sub.remove();
  }, [pauseProgress, resumeProgress]);

  const handleDeleteStory = async () => {
    const current = stories[index];
    if (!current) return;
    cancelAnimation(progress);
    const { error } = await supabase.from('stories').delete().eq('id', current.id);
    if (error) {
      Alert.alert('Error', error.message);
    } else {
      const remaining = stories.filter((s) => s.id !== current.id);
      if (remaining.length === 0) {
        router.back();
      } else {
        setStories(remaining);
        if (index >= remaining.length) setIndex(remaining.length - 1);
      }
    }
  };

  const handleGrant = useCallback(
    (evt: GestureResponderEvent) => {
      pressStartRef.current = Date.now();
      pressXRef.current = evt.nativeEvent.locationX;
      pauseProgress();
    },
    [pauseProgress],
  );

  const handleRelease = useCallback(
    (evt: GestureResponderEvent) => {
      const held = Date.now() - pressStartRef.current;
      const x = evt.nativeEvent.locationX ?? pressXRef.current;

      if (held >= TAP_THRESHOLD_MS) {
        // A hold, not a tap — just resume.
        resumeProgress();
        return;
      }

      // Quick tap: previous on the left third, next everywhere else.
      if (x < screenWidth * PREV_ZONE_RATIO) {
        if (indexRef.current > 0) {
          prevStory();
        } else {
          startProgress(); // at the first story — rewind the bar
        }
        return;
      }
      nextStoryRef.current();
    },
    [prevStory, resumeProgress, screenWidth, startProgress],
  );

  const progressFillStyle = useAnimatedStyle(() => ({
    transform: [{ scaleX: progress.get() }],
  }));

  if (!stories.length) {
    return <View style={styles.container} />;
  }

  const current = stories[index];
  const mediaStyle: StyleProp<ImageStyle> = [
    StyleSheet.absoluteFill,
    { width: screenWidth, height: screenHeight },
  ];

  return (
    <View style={styles.container}>
      {/* Blurred copy of the same photo filling the frame — avoids letterbox bars */}
      <Image
        source={{ uri: current.media_url }}
        style={mediaStyle}
        contentFit="cover"
        blurRadius={40}
        cachePolicy="memory-disk"
      />

      {/* Dim the backdrop so the foreground photo stays the focus */}
      <View style={styles.backdropScrim} pointerEvents="none" />

      {/* The actual photo, fitted entirely inside the screen — nothing cropped */}
      <Image
        source={{ uri: current.media_url }}
        style={mediaStyle}
        contentFit="contain"
        transition={200}
        recyclingKey={current.id}
        cachePolicy="memory-disk"
      />

      {/* Top scrim so the header and progress bars stay legible on any photo */}
      <LinearGradient
        colors={['rgba(0,0,0,0.6)', 'rgba(0,0,0,0.25)', 'rgba(0,0,0,0)']}
        locations={[0, 0.5, 1]}
        style={[styles.topGradient, { height: insets.top + 100 }]}
        pointerEvents="none"
      />

      {/* Segmented progress bars */}
      <View style={[styles.progressBars, { top: insets.top + Spacing.sm }]}>
        {stories.map((_, i) => (
          <View key={i} style={styles.progressBar}>
            {i < index ? (
              <View style={[styles.progressFill, { transform: [{ scaleX: 1 }] }]} />
            ) : i > index ? (
              <View style={styles.progressFill} />
            ) : (
              <Animated.View style={[styles.progressFill, progressFillStyle]} />
            )}
          </View>
        ))}
      </View>

      {/* Gesture layer: hold to pause, quick tap to navigate.
          Rendered before the header so the header buttons sit on top. */}
      <View
        style={StyleSheet.absoluteFill}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => false}
        onResponderTerminationRequest={() => false}
        onResponderGrant={handleGrant}
        onResponderRelease={handleRelease}
        onResponderTerminate={handleRelease}
      />

      {/* Header */}
      <View style={[styles.header, { top: insets.top + Spacing.xl }]} pointerEvents="box-none">
        <View style={styles.headerLeft}>
          <Avatar uri={profile?.avatar_url} name={profile?.username ?? '?'} size={32} />
          <Text style={styles.username} numberOfLines={1}>
            {profile?.username ?? ''}
          </Text>
        </View>
        <View style={styles.headerRight}>
          {isOwnStory && (
            <TouchableOpacity
              onPress={() => setDeleteVisible(true)}
              style={styles.iconBtn}
              hitSlop={8}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel="Delete story"
            >
              <Ionicons name="trash-outline" size={22} color={Colors.white} />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn} hitSlop={8}>
            <Ionicons name="close" size={24} color={Colors.white} />
          </TouchableOpacity>
        </View>
      </View>

      {deleteVisible && (
        <PostOptionsSheet
          visible={deleteVisible}
          onClose={() => setDeleteVisible(false)}
          options={[
            { label: 'Delete story', icon: 'trash-outline', destructive: true, onPress: () => {} },
          ]}
          confirm={{
            title: 'Delete this story?',
            body: "This can't be undone.",
            confirmLabel: 'Delete',
            onConfirm: handleDeleteStory,
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  backdropScrim: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  progressBars: {
    position: 'absolute',
    left: Spacing.sm,
    right: Spacing.sm,
    flexDirection: 'row',
    gap: 4,
  },
  progressBar: {
    flex: 1,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.35)',
    borderRadius: 1,
    overflow: 'hidden',
  },
  progressFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.white,
    // scaleX shrinks toward this edge, so the bar fills left-to-right.
    transformOrigin: 'left',
  },
  header: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flexShrink: 1,
  },
  username: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.bodyMd,
    color: Colors.white,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  iconBtn: { padding: 4 },
});

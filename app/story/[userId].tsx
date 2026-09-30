import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Platform,
  Animated,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Avatar } from '@/components/Avatar';
import { markUserSeen } from '@/lib/seenStories';
import { Colors, FontFamily, FontSize, Spacing } from '@/lib/theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const STORY_DURATION = 5000;

export default function StoryViewerScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { user } = useAuth();
  const router = useRouter();
  const [stories, setStories] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [index, setIndex] = useState(0);
  const [progress] = useState(() => new Animated.Value(0));
  const animation = useRef<Animated.CompositeAnimation | null>(null);
  const isOwnStory = userId === user?.id;

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
          // Mark this user's stories as seen
          markUserSeen(userId);
        } else {
          // No valid stories — go back
          router.back();
        }
      });
  }, [userId, router]);

  const nextStory = useCallback(() => {
    if (index < stories.length - 1) {
      setIndex((i) => i + 1);
    } else {
      router.back();
    }
  }, [index, stories.length, router]);

  const startProgress = useCallback(() => {
    progress.setValue(0);
    animation.current = Animated.timing(progress, {
      toValue: 1,
      duration: STORY_DURATION,
      useNativeDriver: false,
    });
    animation.current.start(({ finished }) => {
      if (finished) nextStory();
    });
  }, [progress, nextStory]);

  useEffect(() => {
    if (!stories.length) return;
    startProgress();
    return () => animation.current?.stop();
  }, [index, stories, startProgress]);

  const prevStory = () => {
    if (index > 0) {
      setIndex((i) => i - 1);
    } else {
      // At the first story — rewind progress bar to start
      startProgress();
    }
  };

  const handleDeleteStory = () => {
    const current = stories[index];
    if (!current) return;
    Alert.alert('Delete Story', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          animation.current?.stop();
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
        },
      },
    ]);
  };

  if (!stories.length) {
    return <View style={styles.container} />;
  }

  const current = stories[index];

  return (
    <View style={styles.container}>
      <Image source={{ uri: current.media_url }} style={styles.media} resizeMode="cover" />

      {/* Gradient overlay at top for readability */}
      <View style={styles.topGradient} />

      {/* Progress bars */}
      <View style={styles.progressBars}>
        {stories.map((_, i) => (
          <View key={i} style={styles.progressBar}>
            <Animated.View
              style={[
                styles.progressFill,
                {
                  width:
                    i < index
                      ? '100%'
                      : i === index
                      ? progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] })
                      : '0%',
                },
              ]}
            />
          </View>
        ))}
      </View>

      {/* Tap zones — rendered first so header renders on top */}
      <TouchableOpacity style={styles.leftZone} onPress={prevStory} activeOpacity={1} />
      <TouchableOpacity style={styles.rightZone} onPress={nextStory} activeOpacity={1} />

      {/* Header */}
      <View style={styles.header} pointerEvents="box-none">
        <View style={styles.headerLeft}>
          <Avatar uri={profile?.avatar_url} name={profile?.username ?? '?'} size={32} />
          <Text style={styles.username}>{profile?.username ?? ''}</Text>
        </View>
        <View style={styles.headerRight}>
          {isOwnStory && (
            <TouchableOpacity onPress={handleDeleteStory} style={styles.deleteBtn}>
              <Ionicons name="trash-outline" size={22} color={Colors.white} />
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color={Colors.white} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  media: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    position: 'absolute',
  },
  topGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    backgroundColor: 'transparent',
    // Simple dark fade — on iOS the shadow gives a gradient-like top overlay
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 60 },
    shadowOpacity: 0.5,
    shadowRadius: 40,
  },
  progressBars: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 32,
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
  progressFill: { height: '100%', backgroundColor: Colors.white },
  header: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 68 : 44,
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
  },
  username: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.bodyMd,
    color: Colors.white,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  deleteBtn: { padding: 4 },
  closeBtn: { padding: 4 },
  leftZone: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: '38%',
    height: '100%',
  },
  rightZone: {
    position: 'absolute',
    right: 0,
    top: 0,
    width: '62%',
    height: '100%',
  },
});

import { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  Dimensions,
  Platform,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useFocusEffect } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { compressImage } from '@/lib/compress';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase, supabaseAnonKey, supabaseUrl } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { StoryRing } from '@/components/StoryRing';
import { Avatar } from '@/components/Avatar';
import { ProfileSkeleton } from '@/components/skeletons/ProfileSkeleton';
import { PostOptionsSheet } from '@/components/PostOptionsSheet';
import { Colors, FontFamily, FontSize, Spacing, BorderRadius } from '@/lib/theme';
import { Duration, Curves } from '@/lib/motion';
import { formatCount } from '@/lib/helpers';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_SIZE = (SCREEN_WIDTH - 2) / 3;

export default function ProfileScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [profile, setProfile] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [counts, setCounts] = useState({ posts: 0, followers: 0, following: 0 });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'posts' | 'stories'>('posts');

  // Create sheet state
  const [createSheetVisible, setCreateSheetVisible] = useState(false);
  const [sheetAnim] = useState(() => new Animated.Value(400));
  const [createBackdrop] = useState(() => new Animated.Value(0));

  // Delete options sheet state
  const [deleting, setDeleting] = useState<{ id: string; type: 'post' | 'story' } | null>(null);

  const openCreateSheet = () => {
    setCreateSheetVisible(true);
    createBackdrop.setValue(0);
    Animated.parallel([
      Animated.timing(createBackdrop, {
        toValue: 1,
        duration: Duration.fast,
        easing: Curves.standard,
        useNativeDriver: true,
      }),
      Animated.spring(sheetAnim, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 0,
        speed: 16,
      }),
    ]).start();
  };

  const closeCreateSheet = (cb?: () => void) => {
    Animated.parallel([
      Animated.timing(createBackdrop, {
        toValue: 0,
        duration: Duration.instant,
        easing: Curves.exit,
        useNativeDriver: true,
      }),
      Animated.timing(sheetAnim, {
        toValue: 400,
        duration: Duration.fast,
        easing: Curves.exit,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setCreateSheetVisible(false);
      cb?.();
    });
  };

  // Edit Profile State
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [updating, setUpdating] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const [profileRes, postsRes, storiesRes, followersRes, followingRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('posts').select('id, media_url, type').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('stories').select('id, media_url').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', user.id),
      supabase.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', user.id),
    ]);

    // Merge stories in as type='story' so the grid can render them
    const allItems = [
      ...(postsRes.data ?? []),
      ...(storiesRes.data ?? []).map((s: any) => ({ ...s, type: 'story' })),
    ];

    setProfile(profileRes.data);
    setPosts(allItems);
    setCounts({
      posts: postsRes.data?.length ?? 0,
      followers: followersRes.count ?? 0,
      following: followingRes.count ?? 0,
    });
    setLoading(false);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        if (user) await loadProfile();
      })();
    }, [user, loadProfile])
  );

  const changeAvatar = async () => {
    if (!user) return;
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please allow access to your photo library in Settings.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !result.assets[0]) return;

    setLoading(true);
    try {
      const picked = result.assets[0];
      const compressedUri = await compressImage(picked.uri, picked.width, picked.height);
      const fileName = `${user.id}/avatar_${Date.now()}.jpg`;

      // Upload using FileSystem.uploadAsync natively (fixes react native blob issues)
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? supabaseAnonKey;

      const uploadResponse = await FileSystem.uploadAsync(
        `${supabaseUrl}/storage/v1/object/avatars/${fileName}`,
        compressedUri,
        {
          httpMethod: 'POST',
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'image/jpeg',
          },
        }
      );

      if (uploadResponse.status !== 200 && uploadResponse.status !== 201) {
        throw new Error(`Upload failed (${uploadResponse.status}): ${uploadResponse.body}`);
      }

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(fileName);
      const publicUrl = urlData.publicUrl;

      // Update user profile with the new avatar URL
      const { error: dbError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id);

      if (dbError) throw dbError;

      // Silently clean up the old avatar file from storage to free up space
      if (profile?.avatar_url) {
        try {
          const parts = profile.avatar_url.split('/avatars/');
          if (parts.length > 1) {
            const oldPath = parts[1].split('?')[0]; // strip query string if any
            await supabase.storage.from('avatars').remove([oldPath]);
          }
        } catch (cleanupErr) {
          console.warn('Failed to clean up old avatar:', cleanupErr);
        }
      }
      
      loadProfile();
    } catch (err: any) {
      console.error('Error changing avatar:', err);
      Alert.alert('Upload failed', err?.message ?? 'Something went wrong.');
      setLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!user) return;
    setUpdating(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          display_name: editDisplayName.trim() || null,
          bio: editBio.trim() || null,
        })
        .eq('id', user.id);

      if (error) throw error;
      setEditModalVisible(false);
      loadProfile();
    } catch (err: any) {
      console.error('Error updating profile:', err);
      Alert.alert('Update failed', err?.message ?? 'Something went wrong.');
    } finally {
      setUpdating(false);
    }
  };

  const deletePost = async (postId: string) => {
    const { error } = await supabase.from('posts').delete().eq('id', postId);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    // Optimistic: remove from local list and decrement count immediately
    setPosts((prev) => prev.filter((p) => p.id !== postId));
    setCounts((prev) => ({ ...prev, posts: Math.max(0, prev.posts - 1) }));
  };

  const deleteStory = async (storyId: string) => {
    const { error } = await supabase.from('stories').delete().eq('id', storyId);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    // Optimistic: remove from merged posts list immediately
    setPosts((prev) => prev.filter((p) => p.id !== storyId));
  };

  const filteredPosts = posts.filter((p) => p.type === 'picture');
  const myStories = (posts as any[]).filter((p: any) => p.type === 'story');

  if (loading) {
    return <ProfileSkeleton />;
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Header */}
      <View style={styles.header}>
        <Image source={require('@/assets/logo.png')} style={styles.appNameLogo} resizeMode="contain" />
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={openCreateSheet} style={styles.headerIconBtn}>
            <Ionicons name="add" size={28} color={Colors.onSurface} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/settings' as any)} style={styles.headerIconBtn}>
            <Ionicons name="settings-outline" size={22} color={Colors.onSurface} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Profile Info */}
      <View style={styles.profileSection}>
        <TouchableOpacity onPress={changeAvatar}>
          <StoryRing size={88}>
            <Avatar uri={profile?.avatar_url} name={profile?.username ?? '?'} size={80} />
          </StoryRing>
          <View style={styles.editAvatarBadge}>
            <Text style={styles.editAvatarIcon}>✏️</Text>
          </View>
        </TouchableOpacity>

        <View style={styles.profileInfo}>
          <Text style={styles.displayName}>{profile?.display_name || profile?.username}</Text>
          <View style={styles.statsRow}>
            <Stat label="Posts" value={counts.posts} />
            <Stat
              label="Followers"
              value={counts.followers}
              onPress={() => user?.id && router.push(`/user/${user.id}/follows?tab=followers` as any)}
            />
            <Stat
              label="Following"
              value={counts.following}
              onPress={() => user?.id && router.push(`/user/${user.id}/follows?tab=following` as any)}
            />
          </View>
          {profile?.bio ? (
            <Text style={styles.bio}>{profile.bio}</Text>
          ) : null}

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => {
              setEditDisplayName(profile?.display_name || '');
              setEditBio(profile?.bio || '');
              setEditModalVisible(false); // reset state just in case
              setTimeout(() => {
                setEditModalVisible(true);
              }, 50);
            }}
          >
            <LinearGradient
              colors={['#bd00ff', '#00eefc']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.editProfileBtn}
            >
              <Text style={styles.editProfileText}>Edit Profile</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>

      {/* Tabs */}
      <View style={styles.tabRow}>
        <TouchableOpacity style={[styles.tabBtn, tab === 'posts' && styles.tabBtnActive]} onPress={() => setTab('posts')}>
          <Text style={[styles.tabText, tab === 'posts' && styles.tabTextActive]}>Posts</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabBtn, tab === 'stories' && styles.tabBtnActive]} onPress={() => setTab('stories')}>
          <Text style={[styles.tabText, tab === 'stories' && styles.tabTextActive]}>Stories</Text>
        </TouchableOpacity>
      </View>

      {/* Grid */}
      <View style={styles.grid}>
        {(tab === 'stories' ? myStories : filteredPosts).map((post) => (
          <View key={post.id} style={styles.gridItemWrapper}>
            <TouchableOpacity
              style={styles.gridItem}
              activeOpacity={0.9}
              onPress={() => {
                if (tab === 'stories') return;
                router.push(`/post/${post.id}` as any);
              }}
              onLongPress={() =>
                tab === 'stories' ? deleteStory(post.id) : deletePost(post.id)
              }
              delayLongPress={500}
            >
              <Image
                source={{ uri: post.media_url }}
                style={styles.gridImage}
                resizeMode="cover"
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.deleteBadge}
              onPress={() => setDeleting({ id: post.id, type: tab === 'stories' ? 'story' : 'post' })}
              hitSlop={8}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel="Delete"
            >
              <Ionicons
                name="trash-outline"
                size={16}
                color={Colors.onSurface}
              />
            </TouchableOpacity>
          </View>
        ))}
      </View>

      {/* Edit Profile Modal */}
      <Modal
        visible={editModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => !updating && setEditModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.modalContainer}
          >
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setEditModalVisible(false)} disabled={updating}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>Edit Profile</Text>
              <TouchableOpacity onPress={handleSaveProfile} disabled={updating}>
                {updating ? (
                  <ActivityIndicator color={Colors.primary} size="small" />
                ) : (
                  <Text style={styles.modalSaveText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalScrollContent} keyboardShouldPersistTaps="handled">
              {/* Avatar Section */}
              <View style={styles.modalAvatarSection}>
                <TouchableOpacity onPress={changeAvatar} disabled={updating}>
                  <StoryRing size={108}>
                    <Avatar uri={profile?.avatar_url} name={profile?.username ?? '?'} size={100} />
                  </StoryRing>
                  <View style={styles.modalChangeBadge}>
                    <Text style={styles.modalChangeBadgeText}>📷</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity onPress={changeAvatar} disabled={updating} style={styles.changePhotoBtn}>
                  <Text style={styles.changePhotoText}>Change Profile Photo</Text>
                </TouchableOpacity>
              </View>

              {/* Form Fields */}
              <View style={styles.formContainer}>
                <Text style={styles.label}>Display Name</Text>
                <TextInput
                  style={styles.input}
                  value={editDisplayName}
                  onChangeText={setEditDisplayName}
                  placeholder="Enter display name"
                  placeholderTextColor={Colors.outlineVariant}
                  maxLength={50}
                  editable={!updating}
                />

                <Text style={styles.label}>Bio</Text>
                <TextInput
                  style={[styles.input, styles.bioInput]}
                  value={editBio}
                  onChangeText={setEditBio}
                  placeholder="Tell us about yourself..."
                  placeholderTextColor={Colors.outlineVariant}
                  multiline
                  numberOfLines={4}
                  maxLength={150}
                  editable={!updating}
                />
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <View style={{ height: 100 }} />

      {/* Create bottom sheet */}
      <Modal
        visible={createSheetVisible}
        transparent
        animationType="none"
        onRequestClose={() => closeCreateSheet()}
        statusBarTranslucent
      >
        <View style={styles.createModalBg}>
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              styles.createBackdropLayer,
              { opacity: createBackdrop },
            ]}
          >
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={() => closeCreateSheet()}
            />
          </Animated.View>
          <Animated.View style={[styles.createSheet, { transform: [{ translateY: sheetAnim }] }]}>
            <View style={styles.createHandle} />
            <Text style={styles.createTitle}>Create</Text>

            {CREATE_OPTIONS.map(({ label, icon, type: uploadType }, i, arr) => (
              <View key={label}>
                <TouchableOpacity
                  style={styles.createOption}
                  activeOpacity={0.7}
                  onPress={() =>
                    closeCreateSheet(() =>
                      router.push(`/(tabs)/upload?type=${uploadType}` as any)
                    )
                  }
                >
                  <Ionicons name={icon as any} size={26} color={Colors.onSurface} />
                  <Text style={styles.createOptionText}>{label}</Text>
                </TouchableOpacity>
                {i < arr.length - 1 && <View style={styles.createDivider} />}
              </View>
            ))}

            <View style={{ height: Platform.OS === 'ios' ? 32 : 12 }} />
          </Animated.View>
        </View>
      </Modal>

      {/* Delete options sheet */}
      {deleting && (
        <PostOptionsSheet
          visible={!!deleting}
          onClose={() => setDeleting(null)}
          options={[
            {
              label: deleting.type === 'story' ? 'Delete story' : 'Delete post',
              icon: 'trash-outline',
              destructive: true,
              onPress: () => { void 0; },
            },
          ]}
          confirm={{
            title: deleting.type === 'story' ? 'Delete this story?' : 'Delete this post?',
            body: "This can't be undone.",
            confirmLabel: 'Delete',
            onConfirm: () =>
              deleting.type === 'story' ? deleteStory(deleting.id) : deletePost(deleting.id),
          }}
        />
      )}
    </ScrollView>
  );
}

const CREATE_OPTIONS = [
  { label: 'Story', icon: 'add-circle-outline', type: 'story' },
  { label: 'Post', icon: 'image-outline', type: 'picture' },
] as const;

function Stat({ label, value, onPress }: { label: string; value: number; onPress?: () => void }) {
  const content = (
    <View style={{ alignItems: 'center' }}>
      <Text style={{ fontFamily: FontFamily.bold, fontSize: FontSize.bodyLg, color: Colors.onSurface }}>
        {formatCount(value)}
      </Text>
      <Text style={{ fontFamily: FontFamily.regular, fontSize: FontSize.labelLg, color: Colors.onSurfaceVariant }}>
        {label}
      </Text>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {content}
      </TouchableOpacity>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  centered: { alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  appNameLogo: {
    width: 90,
    height: 36,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  headerIconBtn: {
    padding: 4,
  },
  profileSection: {
    flexDirection: 'row',
    gap: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.xl,
    alignItems: 'flex-start',
  },
  editAvatarBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: Colors.primaryContainer,
    borderRadius: 12,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.background,
  },
  editAvatarIcon: { fontSize: 10 },
  profileInfo: { flex: 1, gap: Spacing.sm },
  displayName: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.headlineMd,
    color: Colors.onSurface,
  },
  statsRow: { flexDirection: 'row', gap: Spacing.xl },
  bio: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.bodyMd,
    color: Colors.onSurface,
    lineHeight: 22,
  },
  editProfileBtn: {
    borderRadius: BorderRadius.xl,
    paddingVertical: 8,
    paddingHorizontal: Spacing.lg,
    alignSelf: 'flex-start',
  },
  editProfileText: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.labelLg,
    color: Colors.white,
  },
  tabRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.05)',
    marginBottom: 2,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabBtnActive: { borderBottomColor: Colors.primary },
  tabText: {
    fontFamily: FontFamily.semiBold,
    fontSize: FontSize.labelLg,
    color: Colors.onSurfaceVariant,
  },
  tabTextActive: { color: Colors.primary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 1 },
  gridItem: { width: GRID_SIZE, height: GRID_SIZE, overflow: 'hidden' },
  gridImage: { width: '100%', height: '100%' },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: Colors.surfaceContainerLow,
    borderTopLeftRadius: BorderRadius.xxl,
    borderTopRightRadius: BorderRadius.xxl,
    maxHeight: '90%',
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: `${Colors.outlineVariant}22`,
  },
  modalTitle: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.bodyLg,
    color: Colors.onSurface,
  },
  modalCancelText: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.bodyMd,
    color: Colors.onSurfaceVariant,
  },
  modalSaveText: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.bodyMd,
    color: Colors.primary,
  },
  modalScrollContent: {
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.lg,
  },
  modalAvatarSection: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
    position: 'relative',
  },
  modalChangeBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: Colors.primaryContainer,
    borderRadius: 16,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: Colors.surfaceContainerLow,
  },
  modalChangeBadgeText: {
    fontSize: 14,
  },
  changePhotoBtn: {
    marginTop: Spacing.sm,
  },
  changePhotoText: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.labelLg,
    color: Colors.primary,
  },
  formContainer: {
    gap: Spacing.md,
  },
  label: {
    fontFamily: FontFamily.semiBold,
    fontSize: FontSize.labelLg,
    color: Colors.onSurfaceVariant,
    marginBottom: 4,
  },
  input: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.bodyMd,
    color: Colors.onSurface,
    backgroundColor: Colors.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: `${Colors.outlineVariant}44`,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    marginBottom: Spacing.md,
  },
  bioInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  gridItemWrapper: { position: 'relative', width: GRID_SIZE, height: GRID_SIZE, overflow: 'visible' },
  deleteBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 10,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Create sheet
  createBackdropLayer: { backgroundColor: 'rgba(0,0,0,0.6)' },
  createModalBg: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
  },
  createSheet: {
    backgroundColor: Colors.surfaceContainerLow,
    borderTopLeftRadius: BorderRadius.xxl,
    borderTopRightRadius: BorderRadius.xxl,
    paddingTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  createHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.outlineVariant,
    alignSelf: 'center',
    marginBottom: Spacing.md,
  },
  createTitle: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.bodyLg,
    color: Colors.onSurface,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  createOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: 16,
  },
  createOptionText: {
    fontFamily: FontFamily.semiBold,
    fontSize: FontSize.bodyLg,
    color: Colors.onSurface,
  },
  createDivider: {
    height: 1,
    backgroundColor: `${Colors.outlineVariant}33`,
  },
});

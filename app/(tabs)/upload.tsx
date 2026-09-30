import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
  Animated,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { createVideoPlayer } from 'expo-video';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { compressImage, compressStoryImage, formatBytes } from '@/lib/compress';
import { Colors, FontFamily, FontSize, Spacing, BorderRadius } from '@/lib/theme';

type MediaType = 'picture' | 'reel' | 'story';

type PickedAsset = {
  uri: string;
  type: 'image' | 'video';
  fileSize?: number;
  thumbnailUri?: string; // extracted poster frame for videos
};

// ── Upload steps & their progress weights ─────────────────────────────────────
const STEPS = {
  thumbnail: { label: 'Extracting thumbnail…', progress: 0.15 },
  compressThumb: { label: 'Processing…',           progress: 0.25 },
  uploadThumb: { label: 'Uploading thumbnail…',   progress: 0.40 },
  uploadMedia: { label: 'Uploading video…',        progress: 0.85 },
  save: { label: 'Saving…',                        progress: 0.95 },
};

export default function UploadScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const { type } = useLocalSearchParams<{ type?: string }>();
  const [asset, setAsset] = useState<PickedAsset | null>(null);
  const [mediaType, setMediaType] = useState<MediaType>('picture');

  useEffect(() => {
    void (async () => {
      const validTypes: MediaType[] = ['picture', 'reel', 'story'];
      if (type && validTypes.includes(type as MediaType)) {
        setMediaType(type as MediaType);
        setAsset(null);
      }
    })();
  }, [type]);
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const [stepLabel, setStepLabel] = useState('');
  const [progressAnim] = useState(() => new Animated.Value(0));

  // ── Smoothly animate the progress bar ──────────────────────────────────────
  const setProgress = (toValue: number) => {
    Animated.timing(progressAnim, {
      toValue,
      duration: 350,
      useNativeDriver: false,
    }).start();
  };

  const pickMedia = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'Please allow access to your photo library in Settings.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes:
        mediaType === 'reel'
          ? ImagePicker.MediaTypeOptions.Videos
          : ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: mediaType === 'reel' ? [9, 16] : [4, 5],
      quality: 1.0,
      videoMaxDuration: 30, // 30 s cap — keeps file size manageable
    });

    if (!result.canceled && result.assets[0]) {
      const picked = result.assets[0];
      const isVideo = picked.type === 'video';

      let thumbnailUri: string | undefined;
      if (isVideo) {
        const player = createVideoPlayer(picked.uri);
        try {
          const [thumbnail] = await player.generateThumbnailsAsync(0);
          const rendered = await ImageManipulator.manipulate(thumbnail);
          const saved = await rendered.renderAsync().then((img) =>
            img.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 })
          );
          thumbnailUri = saved.uri;
        } catch {
          // Thumbnail extraction failed — proceed without it
        } finally {
          player.release();
        }
      }

      setAsset({
        uri: picked.uri,
        type: isVideo ? 'video' : 'image',
        fileSize: picked.fileSize,
        thumbnailUri,
      });
    }
  };

  // ── Upload a file using FileSystem and return the public URL ───────────────
  const uploadFile = async (
    localUri: string,
    storagePath: string,
    mimeType: string,
    token: string,
  ): Promise<string> => {
    const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
    const resp = await FileSystem.uploadAsync(
      `${supabaseUrl}/storage/v1/object/media/${storagePath}`,
      localUri,
      {
        httpMethod: 'POST',
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': mimeType },
      }
    );
    if (resp.status !== 200 && resp.status !== 201) {
      throw new Error(`Upload failed (${resp.status}): ${resp.body}`);
    }
    const { data } = supabase.storage.from('media').getPublicUrl(storagePath);
    return data.publicUrl;
  };

  const handleUpload = async () => {
    if (!asset || !user) return;
    setUploading(true);
    progressAnim.setValue(0);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
      const base = `${user.id}/${Date.now()}`;
      let mediaUrl = '';
      let thumbnailUrl: string | undefined;

      if (asset.type === 'video') {
        // ── Step 1: compress thumbnail ─────────────────────────────────────
        setStepLabel(STEPS.thumbnail.label);
        setProgress(STEPS.thumbnail.progress);
        let thumbUri = asset.thumbnailUri;
        if (thumbUri) {
          setStepLabel(STEPS.compressThumb.label);
          setProgress(STEPS.compressThumb.progress);
          thumbUri = await compressImage(thumbUri);

          // ── Step 2: upload thumbnail ───────────────────────────────────
          setStepLabel(STEPS.uploadThumb.label);
          setProgress(STEPS.uploadThumb.progress);
          thumbnailUrl = await uploadFile(thumbUri, `${base}_thumb.jpg`, 'image/jpeg', token);
        }

        // ── Step 3: upload video ───────────────────────────────────────────
        setStepLabel(STEPS.uploadMedia.label);
        setProgress(STEPS.uploadMedia.progress);
        mediaUrl = await uploadFile(asset.uri, `${base}.mp4`, 'video/mp4', token);

      } else {
        // ── Image path ────────────────────────────────────────────────────
        setStepLabel('Compressing…');
        setProgress(0.3);
        const compressed =
          mediaType === 'story'
            ? await compressStoryImage(asset.uri)
            : await compressImage(asset.uri);
        setStepLabel('Uploading…');
        setProgress(0.7);
        mediaUrl = await uploadFile(compressed, `${base}.jpg`, 'image/jpeg', token);
      }

      // ── Step 4: save to database ───────────────────────────────────────────
      setStepLabel(STEPS.save.label);
      setProgress(STEPS.save.progress);

      if (mediaType === 'story') {
        const expiresAt = new Date(Date.now() + 10 * 60 * 60 * 1000).toISOString();
        const { error } = await supabase.from('stories').insert({
          user_id: user.id, media_url: mediaUrl, expires_at: expiresAt,
        });
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from('posts').insert({
          user_id: user.id,
          type: mediaType,
          media_url: mediaUrl,
          thumbnail_url: thumbnailUrl ?? null,
          caption: caption.trim() || null,
        });
        if (error) throw new Error(error.message);
      }

      setProgress(1);
      await new Promise(r => setTimeout(r, 300)); // let bar fill

      Alert.alert(
        'Posted! 🎉',
        mediaType === 'story' ? 'Your story is live for 10 hours.' : 'Your post is live.',
      );
      setAsset(null);
      setCaption('');
      router.replace('/(tabs)');
    } catch (err: any) {
      Alert.alert('Upload failed', err?.message ?? 'Something went wrong.');
    } finally {
      setUploading(false);
      setStepLabel('');
      progressAnim.setValue(0);
    }
  };

  // Preview image: use extracted thumbnail for videos, the image itself otherwise
  const previewUri = asset?.thumbnailUri ?? (asset?.type === 'image' ? asset?.uri : undefined);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>New Post</Text>
      </View>

      {/* Type Selector */}
      <View style={styles.typeRow}>
        {(['picture', 'reel', 'story'] as MediaType[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.typeBtn, mediaType === t && styles.typeBtnActive]}
            onPress={() => { setMediaType(t); setAsset(null); }}
          >
            <Text style={[styles.typeBtnText, mediaType === t && styles.typeBtnTextActive]}>
              {t === 'picture' ? '📷 Photo' : t === 'reel' ? '🎬 Reel' : '⏱ Story'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Media Picker */}
      <TouchableOpacity style={styles.mediaPicker} onPress={pickMedia} disabled={uploading}>
        {previewUri ? (
          <>
            <Image source={{ uri: previewUri }} style={styles.mediaPreview} resizeMode="cover" />
            {/* Play icon overlay for videos */}
            {asset?.type === 'video' && (
              <View style={styles.playOverlay}>
                <Text style={styles.playIcon}>▶</Text>
              </View>
            )}
            {asset?.fileSize ? (
              <View style={styles.sizeBadge}>
                <Text style={styles.sizeBadgeText}>{formatBytes(asset.fileSize)}</Text>
              </View>
            ) : null}
          </>
        ) : (
          <View style={styles.mediaPlaceholder}>
            <Text style={styles.mediaPlaceholderIcon}>
              {mediaType === 'reel' ? '🎬' : '📷'}
            </Text>
            <Text style={styles.mediaPlaceholderText}>
              {mediaType === 'reel'
                ? 'Tap to select a video (max 30s)'
                : 'Tap to select a photo'}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Caption */}
      {mediaType !== 'story' && (
        <View style={styles.captionWrapper}>
          <TextInput
            style={styles.captionInput}
            placeholder="Write a caption… use @username to mention friends"
            placeholderTextColor={Colors.outlineVariant}
            value={caption}
            onChangeText={setCaption}
            multiline
            maxLength={500}
            selectionColor={Colors.primary}
            editable={!uploading}
          />
          <Text style={styles.charCount}>{caption.length}/500</Text>
        </View>
      )}

      {mediaType === 'story' && (
        <View style={styles.storyHint}>
          <Text style={styles.storyHintText}>⏱ Stories disappear after 10 hours</Text>
        </View>
      )}

      {/* Progress bar (visible during upload) */}
      {uploading && (
        <View style={styles.progressContainer}>
          <View style={styles.progressTrack}>
            <Animated.View
              style={[
                styles.progressFill,
                {
                  width: progressAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          </View>
          <Text style={styles.progressLabel}>{stepLabel}</Text>
        </View>
      )}

      {/* Upload button */}
      <TouchableOpacity onPress={handleUpload} disabled={!asset || uploading} activeOpacity={0.85}>
        <LinearGradient
          colors={!asset || uploading ? ['#333', '#333'] : ['#bd00ff', '#00eefc']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.uploadBtn}
        >
          {uploading ? (
            <View style={styles.uploadingRow}>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={styles.uploadBtnText}>{stepLabel || 'Uploading…'}</Text>
            </View>
          ) : (
            <Text style={styles.uploadBtnText}>
              {mediaType === 'story' ? 'Share Story' : 'Post'}
            </Text>
          )}
        </LinearGradient>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { paddingBottom: 120 },
  header: {
    paddingTop: Platform.OS === 'ios' ? 56 : 40,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  title: { fontFamily: FontFamily.bold, fontSize: FontSize.headlineMd, color: Colors.onSurface },
  typeRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  typeBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    alignItems: 'center',
  },
  typeBtnActive: { borderColor: Colors.primary, backgroundColor: `${Colors.primaryContainer}22` },
  typeBtnText: { fontFamily: FontFamily.semiBold, fontSize: FontSize.labelSm, color: Colors.onSurfaceVariant },
  typeBtnTextActive: { color: Colors.primary },
  mediaPicker: {
    marginHorizontal: Spacing.lg,
    aspectRatio: 4 / 5,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    backgroundColor: Colors.surfaceContainerLow,
    marginBottom: Spacing.lg,
  },
  mediaPreview: { width: '100%', height: '100%' },
  playOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  playIcon: { fontSize: 52, color: Colors.white },
  sizeBadge: {
    position: 'absolute',
    bottom: Spacing.sm,
    right: Spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: BorderRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  sizeBadgeText: { fontFamily: FontFamily.semiBold, fontSize: FontSize.labelSm, color: Colors.secondaryFixedDim },
  mediaPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    padding: Spacing.lg,
  },
  mediaPlaceholderIcon: { fontSize: 48 },
  mediaPlaceholderText: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.bodyMd,
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
  },
  captionWrapper: {
    marginHorizontal: Spacing.lg,
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    backgroundColor: Colors.surfaceContainerLowest,
    marginBottom: Spacing.lg,
    padding: Spacing.md,
  },
  captionInput: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.bodyMd,
    color: Colors.onSurface,
    minHeight: 90,
    textAlignVertical: 'top',
  },
  charCount: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.labelSm,
    color: Colors.outlineVariant,
    textAlign: 'right',
    marginTop: 4,
  },
  storyHint: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    padding: Spacing.md,
    backgroundColor: `${Colors.primaryContainer}18`,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: `${Colors.primaryContainer}44`,
    alignItems: 'center',
  },
  storyHintText: { fontFamily: FontFamily.semiBold, fontSize: FontSize.labelLg, color: Colors.primary },
  progressContainer: {
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
    gap: Spacing.xs,
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.surfaceContainerHighest,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: Colors.primaryContainer,
  },
  progressLabel: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.labelSm,
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
  },
  uploadBtn: {
    marginHorizontal: Spacing.lg,
    borderRadius: BorderRadius.xl,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  uploadBtnText: { fontFamily: FontFamily.bold, fontSize: FontSize.bodyMd, color: Colors.white },
});

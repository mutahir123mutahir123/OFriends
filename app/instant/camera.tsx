import { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  Alert,
  Image,
  Platform,
} from 'react-native';
import { CameraView, CameraType, FlashMode, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Colors, FontFamily, FontSize, Spacing, BorderRadius, Gradients } from '@/lib/theme';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
// Cap the viewfinder so the controls row and audience pill always stay visible
// on shorter Android screens (budget/compact phones).
const VIEWFINDER_SIZE = Math.min(SCREEN_W * 0.86, SCREEN_H * 0.42);
const VIEWFINDER_RADIUS = VIEWFINDER_SIZE * 0.18;

export default function InstantCameraScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  /* ── Capture ─────────────────────────────────────────── */
  const takePicture = useCallback(async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 1.0, skipProcessing: false });
      if (photo?.uri) setCapturedUri(photo.uri);
    } catch {
      Alert.alert('Error', 'Could not take photo. Please try again.');
    }
  }, []);

  /* ── Upload & save ───────────────────────────────────── */
  const shareInstant = useCallback(async () => {
    if (!capturedUri || !user) return;
    setUploading(true);
    try {
      const fileName = `instants/${user.id}/${Date.now()}.jpg`;

      // Android can return a content:// URI — copy it to a file:// URI first
      // so FileSystem.readAsStringAsync can read it.
      let fileUri = capturedUri;
      if (Platform.OS === 'android' && capturedUri.startsWith('content://')) {
        const dest = `${FileSystem.cacheDirectory}instant_${Date.now()}.jpg`;
        await FileSystem.copyAsync({ from: capturedUri, to: dest });
        fileUri = dest;
      }

      // Read as base64 — works reliably on both iOS (file://) and Android (file://)
      const base64 = await FileSystem.readAsStringAsync(fileUri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Decode base64 → Uint8Array bytes for Supabase upload
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const { error: storageError } = await supabase.storage
        .from('media')
        .upload(fileName, bytes, { contentType: 'image/jpeg', upsert: false });

      if (storageError) throw new Error(storageError.message);

      const { data: urlData } = supabase.storage.from('media').getPublicUrl(fileName);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      const { error: dbError } = await supabase.from('instants').insert({
        user_id: user.id,
        media_url: urlData.publicUrl,
        expires_at: expiresAt,
      });
      if (dbError) throw new Error(dbError.message);

      router.back();
    } catch (err: any) {
      Alert.alert('Failed to share', err?.message ?? 'Something went wrong.');
    } finally {
      setUploading(false);
    }
  }, [capturedUri, user, router]);

  /* ── Permission states ───────────────────────────────── */
  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={[styles.container, styles.centered]}>
        <Ionicons name="camera-outline" size={56} color={Colors.primary} />
        <Text style={styles.permTitle}>Camera Access Needed</Text>
        <Text style={styles.permBody}>
          Loop needs camera access so you can share Instants with your friends.
        </Text>
        <TouchableOpacity onPress={requestPermission} activeOpacity={0.85}>
          <LinearGradient
            colors={Gradients.primaryButton}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.permBtn}
          >
            <Text style={styles.permBtnText}>Allow Camera</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    );
  }

  /* ── Main UI ─────────────────────────────────────────── */
  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn} hitSlop={12}>
          <Ionicons name="close" size={26} color={Colors.onSurface} />
        </TouchableOpacity>
        <Text style={styles.title}>New Instant</Text>
        {/* Placeholder so title stays centred */}
        <View style={styles.headerBtn} />
      </View>

      {/* ── Viewfinder / Preview ── */}
      <View style={styles.viewfinderWrapper}>
        {capturedUri ? (
          <Image source={{ uri: capturedUri }} style={styles.viewfinder} resizeMode="cover" />
        ) : (
          <CameraView
            ref={cameraRef}
            style={styles.viewfinder}
            facing={facing}
            flash={flash}
          />
        )}
      </View>

      {/* ── Controls ── */}
      <View style={styles.controls}>
        {capturedUri ? (
          /* Preview mode: retake | share */
          <>
            <TouchableOpacity
              style={styles.ctrlBtn}
              onPress={() => setCapturedUri(null)}
              hitSlop={10}
            >
              <Ionicons name="refresh" size={26} color={Colors.onSurface} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.shareBtn, uploading && styles.shareBtnDisabled]}
              onPress={shareInstant}
              disabled={uploading}
              activeOpacity={0.85}
            >
              {uploading ? (
                <ActivityIndicator color={Colors.white} size="small" />
              ) : (
                <LinearGradient
                  colors={Gradients.primaryButton}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.shareBtnGradient}
                >
                  <Text style={styles.shareBtnText}>Share Instant</Text>
                </LinearGradient>
              )}
            </TouchableOpacity>

            {/* spacer to keep layout symmetric */}
            <View style={styles.ctrlBtn} />
          </>
        ) : (
          /* Live camera mode: flash | capture | flip */
          <>
            <TouchableOpacity
              style={styles.ctrlBtn}
              onPress={() => setFlash(f => (f === 'off' ? 'on' : 'off'))}
              hitSlop={10}
            >
              <Ionicons
                name={flash === 'off' ? 'flash-off' : 'flash'}
                size={26}
                color={flash === 'off' ? Colors.onSurfaceVariant : '#FFD60A'}
              />
            </TouchableOpacity>

            <TouchableOpacity style={styles.captureBtn} onPress={takePicture} activeOpacity={0.9}>
              <View style={styles.captureBtnInner} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.ctrlBtn}
              onPress={() => setFacing(f => (f === 'back' ? 'front' : 'back'))}
              hitSlop={10}
            >
              <Ionicons name="camera-reverse-outline" size={26} color={Colors.onSurface} />
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* ── Audience pill ── */}
      <View style={styles.audiencePill}>
        <Ionicons name="people" size={15} color={Colors.white} />
        <Text style={styles.audienceText}>Friends</Text>
      </View>

    </View>
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
    gap: Spacing.lg,
    paddingHorizontal: Spacing.xxl,
  },

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 58 : 44,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
  },
  headerBtn: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.bodyLg,
    color: Colors.onSurface,
  },

  /* Viewfinder */
  viewfinderWrapper: {
    alignSelf: 'center',
    width: VIEWFINDER_SIZE,
    height: VIEWFINDER_SIZE,
    borderRadius: VIEWFINDER_RADIUS,
    overflow: 'hidden',
    marginTop: 12,
    backgroundColor: '#111',
  },
  viewfinder: {
    width: '100%',
    height: '100%',
  },

  /* Camera controls row */
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.xxl + 4,
    marginTop: 36,
  },
  ctrlBtn: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Capture shutter */
  captureBtn: {
    width: 82,
    height: 82,
    borderRadius: 41,
    borderWidth: 4,
    borderColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureBtnInner: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: Colors.white,
  },

  /* Share button (preview mode) */
  shareBtn: {
    flex: 1,
    marginHorizontal: Spacing.lg,
    // No overflow:hidden here — it makes LinearGradient invisible on Android.
    // The gradient's own borderRadius handles the pill shape.
    height: 52,
  },
  shareBtnDisabled: { opacity: 0.5 },
  shareBtnGradient: {
    height: 52,       // explicit height so gradient fills without flex:1
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: BorderRadius.full,
  },
  shareBtnText: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.bodyMd,
    color: Colors.white,
  },

  /* Audience pill */
  audiencePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'center',
    marginTop: 22,
    backgroundColor: 'rgba(255,255,255,0.13)',
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: BorderRadius.full,
  },
  audienceText: {
    fontFamily: FontFamily.semiBold,
    fontSize: FontSize.labelLg,
    color: Colors.white,
  },

  /* Permission screen */
  permTitle: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.bodyLg,
    color: Colors.onSurface,
    textAlign: 'center',
  },
  permBody: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.bodyMd,
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 24,
  },
  permBtn: {
    paddingHorizontal: Spacing.xxl,
    paddingVertical: 14,
    borderRadius: BorderRadius.full,
  },
  permBtnText: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.bodyMd,
    color: Colors.white,
  },
});

/**
 * Forgot Password — 3-step in-app OTP flow
 *
 * Step 1 │ email  — enter email, validate it exists, send OTP
 * Step 2 │ code   — enter 6-digit code from email to verify identity
 * Step 3 │ reset  — enter new password + confirm, update DB, sign out → login
 *
 * No email link clicking required — everything happens inside the app.
 */

import { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { Link, router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Colors, FontFamily, FontSize, Spacing, BorderRadius } from '@/lib/theme';

type Step = 'email' | 'code' | 'reset';

/* ── OTP digit-box input ─────────────────────────────────── */
function OtpInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<TextInput>(null);
  const digits = value.padEnd(6, ' ').split('');

  return (
    <TouchableOpacity style={styles.otpRow} activeOpacity={1} onPress={() => ref.current?.focus()}>
      {digits.map((d, i) => (
        <View
          key={i}
          style={[
            styles.otpBox,
            value.length === i && styles.otpBoxActive,
            d.trim() !== '' && styles.otpBoxFilled,
          ]}
        >
          <Text style={styles.otpDigit}>{d.trim()}</Text>
        </View>
      ))}
      {/* Hidden real input */}
      <TextInput
        ref={ref}
        style={styles.otpHidden}
        value={value}
        onChangeText={v => onChange(v.replace(/[^0-9]/g, '').slice(0, 6))}
        keyboardType="number-pad"
        maxLength={6}
        caretHidden
        autoFocus
      />
    </TouchableOpacity>
  );
}

/* ══════════════════════════════════════════════════════════ */
export default function ForgotPasswordScreen() {
  const { checkEmailExists } = useAuth();
  const [step, setStep]     = useState<Step>('email');
  const [loading, setLoading] = useState(false);

  /* step 1 */
  const [email, setEmail] = useState('');

  /* step 2 */
  const [otp, setOtp] = useState('');

  /* step 3 */
  const [password, setPassword]   = useState('');
  const [confirm,  setConfirm]    = useState('');
  const [showPass, setShowPass]   = useState(false);
  const [showConf, setShowConf]   = useState(false);

  /* ── Step 1: send OTP ────────────────────────────────── */
  const handleSendCode = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) { Alert.alert('Missing field', 'Please enter your email.'); return; }

    setLoading(true);

    // Check email exists in profiles first for a clear error message
    const exists = await checkEmailExists(trimmed);
    if (!exists) {
      setLoading(false);
      Alert.alert('Email not found', 'No Loop account found with that email address.');
      return;
    }

    // Send a one-time passcode — shouldCreateUser: false means it won't create
    // a new account if somehow the email isn't in auth.users
    const { error } = await supabase.auth.signInWithOtp({
      email: trimmed,
      options: { shouldCreateUser: false },
    });

    setLoading(false);

    if (error) {
      Alert.alert('Could not send code', error.message);
      return;
    }

    setStep('code');
  };

  /* ── Step 2: verify OTP ──────────────────────────────── */
  const handleVerifyCode = async () => {
    if (otp.length < 6) { Alert.alert('Enter code', 'Please enter the 6-digit code from your email.'); return; }

    setLoading(true);

    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: otp,
      type: 'email',
    });

    setLoading(false);

    if (error) {
      Alert.alert('Invalid code', 'The code is incorrect or has expired. Tap "Resend" to get a new one.');
      return;
    }

    // OTP verified — now we have an active session, safe to update password
    setOtp('');
    setStep('reset');
  };

  const handleResend = async () => {
    setOtp('');
    setLoading(true);
    await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: false },
    });
    setLoading(false);
    Alert.alert('Code sent', 'A new code has been sent to your email.');
  };

  /* ── Step 3: update password ─────────────────────────── */
  const handleResetPassword = async () => {
    if (!password.trim()) { Alert.alert('Missing field', 'Please enter a new password.'); return; }
    if (password.length < 6) { Alert.alert('Too short', 'Password must be at least 6 characters.'); return; }
    if (password !== confirm) { Alert.alert('Mismatch', 'Passwords do not match.'); return; }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setLoading(false);
      Alert.alert('Error', error.message);
      return;
    }

    // Sign out so user logs in fresh with new password
    await supabase.auth.signOut();
    setLoading(false);

    Alert.alert(
      'Password updated ✅',
      'Your password has been changed. Please sign in with your new password.',
      [{ text: 'Sign In', onPress: () => router.replace('/(auth)/login') }]
    );
  };

  /* ── Shared wrapper ──────────────────────────────────── */
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

        {/* Logo */}
        <View style={styles.logoContainer}>
          <Image source={require('@/assets/logo.png')} style={styles.logoImage} resizeMode="contain" />
          <Text style={styles.tagline}>
            {step === 'email' ? 'Forgot your password?' :
             step === 'code'  ? 'Check your email.' :
                                'Set a new password.'}
          </Text>
        </View>

        {/* ── Step indicators ── */}
        <View style={styles.stepRow}>
          {(['email', 'code', 'reset'] as Step[]).map((s, i) => (
            <View key={s} style={styles.stepItemRow}>
              <View style={[styles.stepDot, step === s && styles.stepDotActive, ['code','reset'].includes(step) && s === 'email' && styles.stepDotDone, step === 'reset' && s === 'code' && styles.stepDotDone]}>
                {(['code','reset'].includes(step) && s === 'email') || (step === 'reset' && s === 'code') ? (
                  <Ionicons name="checkmark" size={12} color={Colors.white} />
                ) : (
                  <Text style={styles.stepDotText}>{i + 1}</Text>
                )}
              </View>
              {i < 2 && <View style={[styles.stepLine, (['code','reset'].includes(step) && i === 0) || (step === 'reset' && i === 1) ? styles.stepLineDone : {}]} />}
            </View>
          ))}
        </View>

        {/* ── STEP 1: Email ── */}
        {step === 'email' && (
          <View style={styles.form}>
            <Text style={styles.instruction}>
              Enter the email address linked to your Loop account and we’ll send you a verification code.
            </Text>

            <View style={styles.inputWrapper}>
              <Ionicons name="mail-outline" size={20} color={Colors.outlineVariant} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Email address"
                placeholderTextColor={Colors.outlineVariant}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                selectionColor={Colors.primary}
              />
            </View>

            <TouchableOpacity onPress={handleSendCode} disabled={loading} activeOpacity={0.85}>
              <LinearGradient colors={['#bd00ff', '#00eefc']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primaryButton}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Send Code</Text>}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}

        {/* ── STEP 2: OTP code ── */}
        {step === 'code' && (
          <View style={styles.form}>
            <Text style={styles.instruction}>
              We sent a 6-digit code to{' '}
              <Text style={styles.emailHighlight}>{email}</Text>.{'\n'}
              Enter it below.
            </Text>

            <OtpInput value={otp} onChange={setOtp} />

            <TouchableOpacity
              onPress={handleVerifyCode}
              disabled={loading || otp.length < 6}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={otp.length < 6 ? ['#333', '#333'] : ['#bd00ff', '#00eefc']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.primaryButton}
              >
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Verify Code</Text>}
              </LinearGradient>
            </TouchableOpacity>

            <View style={styles.resendRow}>
              <Text style={styles.resendLabel}>Didn’t get it? </Text>
              <TouchableOpacity onPress={handleResend} disabled={loading}>
                <Text style={styles.resendLink}>Resend code</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.backLink} onPress={() => { setStep('email'); setOtp(''); }}>
              <Ionicons name="arrow-back" size={16} color={Colors.onSurfaceVariant} />
              <Text style={styles.backLinkText}>Change email</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── STEP 3: New password ── */}
        {step === 'reset' && (
          <View style={styles.form}>
            <Text style={styles.instruction}>
              Choose a strong new password for your account.
            </Text>

            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={20} color={Colors.outlineVariant} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="New password (min 6 characters)"
                placeholderTextColor={Colors.outlineVariant}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPass}
                selectionColor={Colors.primary}
              />
              <TouchableOpacity onPress={() => setShowPass(v => !v)} style={styles.eyeBtn}>
                <Ionicons name={showPass ? 'eye-off-outline' : 'eye-outline'} size={20} color={Colors.outlineVariant} />
              </TouchableOpacity>
            </View>

            <View style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={20} color={Colors.outlineVariant} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Confirm new password"
                placeholderTextColor={Colors.outlineVariant}
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry={!showConf}
                selectionColor={Colors.primary}
              />
              <TouchableOpacity onPress={() => setShowConf(v => !v)} style={styles.eyeBtn}>
                <Ionicons name={showConf ? 'eye-off-outline' : 'eye-outline'} size={20} color={Colors.outlineVariant} />
              </TouchableOpacity>
            </View>

            {/* Password match indicator */}
            {confirm.length > 0 && (
              <View style={styles.matchRow}>
                <Ionicons
                  name={password === confirm ? 'checkmark-circle' : 'close-circle'}
                  size={16}
                  color={password === confirm ? Colors.secondaryContainer : Colors.error}
                />
                <Text style={[styles.matchText, { color: password === confirm ? Colors.secondaryContainer : Colors.error }]}>
                  {password === confirm ? 'Passwords match' : 'Passwords do not match'}
                </Text>
              </View>
            )}

            <TouchableOpacity
              onPress={handleResetPassword}
              disabled={loading || password !== confirm || password.length < 6}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={loading || password !== confirm || password.length < 6 ? ['#333', '#333'] : ['#bd00ff', '#00eefc']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.primaryButton}
              >
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Reset Password</Text>}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Remember your password? </Text>
          <Link href="/(auth)/login" asChild>
            <TouchableOpacity>
              <Text style={styles.footerLink}>Sign In</Text>
            </TouchableOpacity>
          </Link>
        </View>

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xxxl,
  },

  logoContainer: { alignItems: 'center', marginBottom: Spacing.xl },
  logoImage: { width: 160, height: 160 },
  tagline: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.bodyMd,
    color: Colors.onSurfaceVariant,
    marginTop: 4,
    textAlign: 'center',
  },

  /* Step indicator */
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
  },
  stepItemRow: { flexDirection: 'row', alignItems: 'center' },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.surfaceContainerHigh,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: Colors.outlineVariant,
  },
  stepDotActive: {
    borderColor: Colors.primary,
    backgroundColor: `${Colors.primaryContainer}33`,
  },
  stepDotDone: {
    backgroundColor: Colors.primaryContainer,
    borderColor: Colors.primaryContainer,
  },
  stepDotText: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.labelSm,
    color: Colors.onSurfaceVariant,
  },
  stepLine: {
    width: 48,
    height: 2,
    backgroundColor: Colors.outlineVariant,
    marginHorizontal: 4,
  },
  stepLineDone: { backgroundColor: Colors.primaryContainer },

  /* Form */
  form: { gap: Spacing.md, marginBottom: Spacing.xl },
  instruction: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.bodyMd,
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 24,
  },
  emailHighlight: { fontFamily: FontFamily.bold, color: Colors.primary },

  /* Text inputs */
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: BorderRadius.xl,
    backgroundColor: Colors.surfaceContainerLowest,
    paddingHorizontal: Spacing.md,
    gap: Spacing.xs,
  },
  inputIcon: { flexShrink: 0 },
  input: {
    flex: 1,
    fontFamily: FontFamily.regular,
    fontSize: FontSize.bodyMd,
    color: Colors.onSurface,
    paddingVertical: 14,
  },
  eyeBtn: { padding: 4 },

  /* Password match */
  matchRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  matchText: { fontFamily: FontFamily.semiBold, fontSize: FontSize.labelLg },

  /* OTP digit boxes */
  otpRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    position: 'relative',
  },
  otpBox: {
    width: 46,
    height: 58,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    borderColor: Colors.outlineVariant,
    backgroundColor: Colors.surfaceContainerLowest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpBoxActive: {
    borderColor: Colors.primary,
    backgroundColor: `${Colors.primaryContainer}18`,
  },
  otpBoxFilled: { borderColor: Colors.primary },
  otpDigit: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.headlineMd,
    color: Colors.onSurface,
    lineHeight: 32,
  },
  otpHidden: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },

  /* Buttons */
  primaryButton: {
    borderRadius: BorderRadius.xl,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonText: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.bodyMd,
    color: Colors.white,
  },

  /* Resend / back links */
  resendRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: -4,
  },
  resendLabel: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.bodyMd,
    color: Colors.onSurfaceVariant,
  },
  resendLink: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.bodyMd,
    color: Colors.primary,
  },
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    opacity: 0.7,
  },
  backLinkText: {
    fontFamily: FontFamily.semiBold,
    fontSize: FontSize.labelLg,
    color: Colors.onSurfaceVariant,
  },

  /* Footer */
  footer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  footerText: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.bodyMd,
    color: Colors.onSurfaceVariant,
  },
  footerLink: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.bodyMd,
    color: Colors.secondaryFixedDim,
  },
});

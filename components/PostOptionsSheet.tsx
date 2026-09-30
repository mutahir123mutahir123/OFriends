import { useEffect, useState } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  Platform,
  Animated,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, FontFamily, FontSize, Spacing, BorderRadius } from '@/lib/theme';
import { Duration, Curves, Spring } from '@/lib/motion';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export type PostOptionsSheetProps = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  options: {
    label: string;
    icon: IoniconName;
    destructive?: boolean;
    onPress: () => void;
  }[];
  confirm?: {
    title: string;
    body: string;
    confirmLabel: string;
    onConfirm: () => void | Promise<void>;
  };
};

const SHEET_H = 420;

export function PostOptionsSheet({
  visible,
  onClose,
  title,
  options,
  confirm,
}: PostOptionsSheetProps) {
  const [backdrop] = useState(() => new Animated.Value(0));
  const [slide] = useState(() => new Animated.Value(SHEET_H));
  const [stage] = useState(() => new Animated.Value(0));
  const [rowScale] = useState(() => new Animated.Value(1));

  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!visible) return;
    backdrop.setValue(0);
    slide.setValue(SHEET_H);
    stage.setValue(0);
    rowScale.setValue(1);
    Animated.parallel([
      Animated.timing(backdrop, {
        toValue: 1,
        duration: Duration.fast,
        easing: Curves.standard,
        useNativeDriver: true,
      }),
      Animated.spring(slide, { toValue: 0, ...Spring.sheet, useNativeDriver: true }),
    ]).start();
  }, [visible, backdrop, slide, stage, rowScale]);

  // Reset stage state once the modal is fully dismissed, so a re-open always
  // starts on the options step (callers also mount this conditionally).
  const resetStage = () => {
    setConfirming(false);
    setPending(false);
  };

  const close = () => {
    Animated.parallel([
      Animated.timing(slide, {
        toValue: SHEET_H,
        duration: Duration.fast,
        easing: Curves.exit,
        useNativeDriver: true,
      }),
      Animated.timing(backdrop, {
        toValue: 0,
        duration: Duration.instant,
        easing: Curves.exit,
        useNativeDriver: true,
      }),
    ]).start(() => onClose());
  };

  const pressRow = (to: number) =>
    Animated.spring(rowScale, { toValue: to, ...Spring.gentle, useNativeDriver: true }).start();

  const handleOption = (opt: PostOptionsSheetProps['options'][number]) => {
    if (opt.destructive && confirm) {
      setConfirming(true);
      Animated.timing(stage, {
        toValue: 1,
        duration: Duration.base,
        easing: Curves.standard,
        useNativeDriver: true,
      }).start();
      return;
    }
    opt.onPress();
    close();
  };

  const handleConfirm = async () => {
    if (!confirm || pending) return;
    setPending(true);
    try {
      await confirm.onConfirm();
    } catch {
      /* caller surfaces its own error */
    }
    setPending(false);
    close();
  };

  const optionsStyle = {
    opacity: stage.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
    transform: [
      { translateY: stage.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) },
    ],
  };
  const confirmStyle = {
    opacity: stage,
    transform: [
      { translateY: stage.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
    ],
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={close}
      onDismiss={resetStage}
    >
      <View style={styles.root} accessibilityViewIsModal>
        <Animated.View style={[styles.backdrop, { opacity: backdrop }]}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={close}
            accessibilityLabel="Close"
          />
        </Animated.View>

        <Animated.View style={[styles.sheetWrap, { transform: [{ translateY: slide }] }]}>
          <View style={styles.sheet}>
            <View style={styles.handle} />

            {confirming && confirm ? (
              <Animated.View style={confirmStyle}>
                <Text style={styles.confirmTitle}>{confirm.title}</Text>
                <Text style={styles.confirmBody}>{confirm.body}</Text>
                <View style={styles.confirmActions}>
                  <TouchableOpacity
                    style={[styles.confirmBtn, styles.confirmCancel]}
                    onPress={() => {
                      setConfirming(false);
                      Animated.timing(stage, {
                        toValue: 0,
                        duration: Duration.fast,
                        easing: Curves.standard,
                        useNativeDriver: true,
                      }).start();
                    }}
                    disabled={pending}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.confirmCancelText}>Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.confirmBtn, styles.confirmDelete]}
                    onPress={handleConfirm}
                    disabled={pending}
                    activeOpacity={0.85}
                  >
                    {pending ? (
                      <ActivityIndicator size="small" color={Colors.white} />
                    ) : (
                      <Text style={styles.confirmDeleteText}>{confirm.confirmLabel}</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </Animated.View>
            ) : (
              <Animated.View style={optionsStyle}>
                {title ? <Text style={styles.title}>{title}</Text> : null}

                <Animated.View style={{ transform: [{ scale: rowScale }] }}>
                  {options.map((opt, i) => (
                    <View key={opt.label}>
                      <TouchableOpacity
                        style={styles.row}
                        onPress={() => handleOption(opt)}
                        onPressIn={() => pressRow(0.97)}
                        onPressOut={() => pressRow(1)}
                        activeOpacity={0.85}
                      >
                        <View style={[styles.rowIcon, opt.destructive && styles.rowIconDelete]}>
                          <Ionicons
                            name={opt.icon}
                            size={22}
                            color={opt.destructive ? '#ff3b6f' : Colors.onSurface}
                          />
                        </View>
                        <Text style={[styles.rowText, opt.destructive && styles.rowTextDelete]}>
                          {opt.label}
                        </Text>
                      </TouchableOpacity>
                      {i < options.length - 1 && <View style={styles.divider} />}
                    </View>
                  ))}
                </Animated.View>

                <TouchableOpacity
                  style={styles.cancelBtn}
                  onPress={close}
                  activeOpacity={0.85}
                >
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
              </Animated.View>
            )}
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheetWrap: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  sheet: {
    backgroundColor: Colors.surfaceContainerLow,
    borderTopLeftRadius: BorderRadius.xxl,
    borderTopRightRadius: BorderRadius.xxl,
    paddingHorizontal: Spacing.lg,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.outlineVariant,
    alignSelf: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
  },

  title: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.bodyLg,
    color: Colors.onSurface,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: 15,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surfaceContainerHighest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconDelete: { backgroundColor: 'rgba(255,59,111,0.12)' },
  rowText: {
    fontFamily: FontFamily.semiBold,
    fontSize: FontSize.bodyMd,
    color: Colors.onSurface,
  },
  rowTextDelete: { color: '#ff3b6f' },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    marginVertical: 4,
  },

  cancelBtn: {
    justifyContent: 'center',
    marginTop: Spacing.sm,
    paddingVertical: 14,
    backgroundColor: Colors.surfaceContainerHighest,
    borderRadius: BorderRadius.xl,
  },
  cancelText: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.bodyMd,
    color: Colors.onSurface,
    textAlign: 'center',
  },

  confirmTitle: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.headlineMd,
    color: Colors.onSurface,
    textAlign: 'center',
  },
  confirmBody: {
    fontFamily: FontFamily.regular,
    fontSize: FontSize.bodyMd,
    color: Colors.onSurfaceVariant,
    textAlign: 'center',
    lineHeight: 22,
    marginTop: Spacing.xs,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xl,
  },
  confirmBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: BorderRadius.xl,
  },
  confirmCancel: { backgroundColor: Colors.surfaceContainerHighest },
  confirmCancelText: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.bodyMd,
    color: Colors.onSurface,
  },
  confirmDelete: { backgroundColor: '#ff3b6f' },
  confirmDeleteText: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.bodyMd,
    color: Colors.white,
  },
});

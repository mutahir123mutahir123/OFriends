export const Colors = {
  background: '#131313',
  surface: '#131313',
  surfaceDim: '#131313',
  surfaceContainerLowest: '#0e0e0e',
  surfaceContainerLow: '#1c1b1b',
  surfaceContainer: '#201f1f',
  surfaceContainerHigh: '#2a2a2a',
  surfaceContainerHighest: '#353534',
  surfaceBright: '#3a3939',
  surfaceVariant: '#353534',

  onSurface: '#e5e2e1',
  onSurfaceVariant: '#d4c0d7',
  onBackground: '#e5e2e1',

  primary: '#ecb2ff',
  primaryContainer: '#bd00ff',
  primaryFixed: '#f8d8ff',
  primaryFixedDim: '#ecb2ff',
  onPrimary: '#520071',
  onPrimaryContainer: '#ffffff',
  inversePrimary: '#9900cf',

  secondary: '#d3fbff',
  secondaryContainer: '#00eefc',
  secondaryFixedDim: '#00dbe9',
  onSecondary: '#00363a',
  onSecondaryContainer: '#00686f',

  tertiary: '#ffb1c7',
  tertiaryContainer: '#d92d78',
  onTertiary: '#650031',
  onTertiaryContainer: '#fffeff',

  outline: '#9d8ba0',
  outlineVariant: '#514255',

  error: '#ffb4ab',
  errorContainer: '#93000a',
  onError: '#690005',

  white: '#ffffff',
  transparent: 'transparent',
} as const;

export const Gradients = {
  storyRing: ['#bd00ff', '#00eefc'] as const,
  primaryButton: ['#bd00ff', '#00eefc'] as const,
  appName: ['#bd00ff', '#00eefc'] as const,
} as const;

export const FontFamily = {
  regular: 'PlusJakartaSans_400Regular',
  semiBold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extraBold: 'PlusJakartaSans_800ExtraBold',
} as const;

export const FontSize = {
  labelSm: 12,
  labelLg: 14,
  bodyMd: 16,
  bodyLg: 18,
  headlineMd: 24,
  headlineLgMobile: 28,
  headlineLg: 32,
  displayLg: 48,
} as const;

export const Spacing = {
  unit: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const BorderRadius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  xxl: 24,
  full: 9999,
} as const;

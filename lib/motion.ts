import { Easing } from 'react-native';

export const Duration = {
  instant: 120,
  fast: 180,
  base: 240,
  sheet: 320,
} as const;

export const Curves = {
  standard: Easing.bezier(0.16, 1, 0.3, 1),
  exit: Easing.bezier(0.4, 0, 1, 1),
} as const;

export const Spring = {
  gentle: { bounciness: 6, speed: 14 },
  pop: { bounciness: 12, speed: 16 },
  sheet: { bounciness: 0, speed: 16 },
} as const;

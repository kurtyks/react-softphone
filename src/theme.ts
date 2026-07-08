/**
 * Design tokens — the subset of the Tailwind palette the original UI used, so the
 * ported React Native screens keep the same dark look. Dark theme only (the app was
 * `bg-black text-white`). Refined further in the UI-polish phase.
 */

export const colors = {
  black: '#000000',
  white: '#ffffff',

  gray200: '#e5e7eb',
  gray300: '#d1d5db',
  gray400: '#9ca3af',
  gray500: '#6b7280',
  gray600: '#4b5563',
  gray700: '#374151',
  gray800: '#1f2937',
  gray900: '#111827',

  green400: '#4ade80',
  green500: '#22c55e',
  green600: '#16a34a',
  green700: '#15803d',

  blue500: '#3b82f6',
  blue600: '#2563eb',
  blue700: '#1d4ed8',

  red400: '#f87171',
  red500: '#ef4444',
  red600: '#dc2626',
  red700: '#b91c1c',

  yellow400: '#facc15',
  yellow500: '#eab308',
  yellow700: '#a16207'
} as const;

export const spacing = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  6: 24,
  8: 32
} as const;

export const radius = {
  md: 6,
  lg: 8,
  full: 9999
} as const;

/** Monospace family per platform — used for diagnostics/log values. */
export const mono = 'monospace';

// Banking-style palette: deep navy surfaces, a light blue accent, cool neutrals.
const light = {
  primary: '#0B2E6F',
  primaryDark: '#071E4B',
  primaryDeep: '#04132F',
  primarySoft: '#E7EEFA',
  accent: '#7CC0F5',
  accentDark: '#3E8DD8',
  bg: '#F2F4F8',
  card: '#FFFFFF',
  surfaceMuted: '#E8EDF4',
  text: '#0D1B33',
  textMuted: '#5D6A80',
  textFaint: '#9AA4B5',
  border: '#E2E7EF',
  inverse: '#0D1B33',
  onInverse: '#FFFFFF',
  danger: '#D64545',
  dangerSoft: '#FCEAEA',
  warning: '#D9971A',
  warningSoft: '#FCF3E1',
  success: '#1F9D6B',
  successSoft: '#E3F5EC',
  info: '#2F6FE4',
  infoSoft: '#E7EFFD',
  white: '#FFFFFF',
  overlay: 'rgba(4, 19, 47, 0.55)',
};

const dark: typeof light = {
  primary: '#2A5DBE',
  primaryDark: '#0B2E6F',
  primaryDeep: '#04132F',
  primarySoft: '#1A2B4A',
  accent: '#7CC0F5',
  accentDark: '#4A9BE3',
  bg: '#08101F',
  card: '#111C31',
  surfaceMuted: '#1A263D',
  text: '#EAF0FA',
  textMuted: '#A2AEC4',
  textFaint: '#6B7890',
  border: '#22314F',
  inverse: '#EAF0FA',
  onInverse: '#0D1B33',
  danger: '#F06A6A',
  dangerSoft: '#3A1A1F',
  warning: '#F0B43C',
  warningSoft: '#3A2E14',
  success: '#3CC48E',
  successSoft: '#12322A',
  info: '#6B9CF5',
  infoSoft: '#16274A',
  white: '#FFFFFF',
  overlay: 'rgba(0, 0, 0, 0.6)',
};

/**
 * Current palette. Screens read these values while rendering, and the app re-renders on a theme
 * change, so swapping the values in place is enough to switch between light and dark.
 */
export const colors = { ...light };
export type ThemeName = 'light' | 'dark';
let current: ThemeName = 'light';
export function applyTheme(name: ThemeName) {
  if (name === current) return;
  current = name;
  Object.assign(colors, name === 'dark' ? dark : light);
}
export const currentTheme = () => current;

export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const shadow = {
  shadowColor: '#0B1F44',
  shadowOpacity: 0.07,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 6 },
  elevation: 3,
} as const;

export const fonts = {
  regular: 'IBMPlexSansArabic_400Regular',
  medium: 'IBMPlexSansArabic_500Medium',
  semibold: 'IBMPlexSansArabic_600SemiBold',
  bold: 'IBMPlexSansArabic_700Bold',
  black: 'IBMPlexSansArabic_700Bold',
};

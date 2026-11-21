// Banking-style palette: deep navy surfaces, a light blue accent, cool neutrals.
export const colors = {
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

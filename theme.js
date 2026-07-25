// Central design tokens for the resident life-story feature. Existing
// screens keep their own local color/font constants for now — the
// full-app migration to this file is a separate, larger pass.
export const colors = {
  background: '#F1EDE6',
  surface: '#FAFAF7',
  primary: '#1E5C47',
  primaryDark: '#163D30',
  secondary: '#C17F5A',
  mist: '#B5CEBE',
  mistBackground: '#DDE8E2',
  textPrimary: '#1A2E25',
  textMuted: '#6B7E74',
  border: 'rgba(26,46,37,0.14)',
  destructive: '#A03020',
  white: '#FFFFFF',
};

export const fonts = {
  serifBold: 'Lora_700Bold',
  serifRegular: 'Lora_400Regular',
  sansRegular: 'AtkinsonHyperlegible_400Regular',
  sansBold: 'AtkinsonHyperlegible_700Bold',
};

export const radii = {
  sm: 14,
  lg: 22,
  circular: 999,
};

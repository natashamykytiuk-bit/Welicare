// Central design tokens for the whole app.
export const colors = {
  background: '#F1EDE6',
  surface: '#FAFAF7',
  primary: '#1E5C47',
  primaryDark: '#163D30',
  // Darkened from #C17F5A (same hue) for readability: 5.2:1 on background
  // and 6.1:1 for white text on it — was 2.8:1 and 3.3:1, below the 4.5:1
  // WCAG minimum for normal text. Matters doubly for older users.
  secondary: '#8D5435',
  mist: '#B5CEBE',
  mistBackground: '#DDE8E2',
  textPrimary: '#1A2E25',
  // Darkened from #6B7E74 (same hue) so secondary text reads clearly: now
  // 5.5:1 on background, 6.1:1 on surface, 5.1:1 on mistBackground (was
  // 3.7 / 4.1 / 3.4:1). Still clearly lighter than textPrimary (12.3:1),
  // so the visual hierarchy is unchanged.
  textMuted: '#54625B',
  border: 'rgba(26,46,37,0.14)',
  destructive: '#A03020',
  white: '#FFFFFF',
  activities: {
    music: { icon: '#1E5C47', bg: '#DDE8E2' },
    trivia: { icon: '#C17F5A', bg: '#F0E0D0' },
    meditation: { icon: '#7A6FA5', bg: '#EAE7F2' },
    conversation: { icon: '#2D7D8F', bg: '#DAF0F4' },
    photoAlbum: { icon: '#8A6040', bg: '#F0E8DF' },
    games: { icon: '#5A7A3A', bg: '#E4EDD9' },
    moviesVideos: { icon: '#C17F5A', bg: '#F0E0D0' },
  },
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

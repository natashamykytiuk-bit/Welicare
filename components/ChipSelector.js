import { ScrollView, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { colors, fonts, radii } from '../theme';

// Horizontal chip row, shared by the musicLibrary screens
// (MusicLibraryScreen, CurateResidentMusicScreen, MusicSelectionScreen) for
// artist/genre/decade filtering, and by MusicLibraryScreen's add/edit form
// for picking genres. Distinct from BuildProfileScreen's ChipRow, which is
// lifeStory-intake-specific.
//
// Single-select mode (default): value is a string, onChange(newValue).
// includeAll prepends an "All" chip representing no filter (value === '').
//
// Multi-select mode (multi prop): value is a string[], onChange(newArray) —
// tapping a chip toggles its membership rather than replacing the value.
// There's no "All" chip in this mode since multiple/zero selections are
// both already meaningful (zero == "no filter" for the callers that use it
// that way).
export default function ChipSelector({ options, value, onChange, includeAll, multi }) {
  const chips = includeAll ? ['All', ...options] : options;

  function isSelected(option) {
    if (multi) return value.includes(option);
    const chipValue = option === 'All' ? '' : option;
    return value === chipValue;
  }

  function handlePress(option) {
    if (multi) {
      const next = value.includes(option) ? value.filter((v) => v !== option) : [...value, option];
      onChange(next);
      return;
    }
    onChange(option === 'All' ? '' : option);
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {chips.map((option) => {
        const selected = isSelected(option);
        return (
          <TouchableOpacity
            key={option}
            style={[styles.chip, selected && styles.chipSelected]}
            onPress={() => handlePress(option)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={option}
          >
            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{option}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingRight: 4 },
  chip: {
    backgroundColor: colors.surface,
    borderRadius: radii.circular,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontFamily: fonts.sansBold,
    fontSize: 13,
    color: colors.textPrimary,
  },
  chipTextSelected: {
    color: colors.white,
  },
});

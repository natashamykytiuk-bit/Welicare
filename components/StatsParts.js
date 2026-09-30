import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, fonts, radii } from '../theme';
import { PERIODS, formatDuration } from '../utils/engagementStats';

// Small building blocks shared by the stats screens (Overall Stats, Hour
// Tracker, Family Mode → Activity), so the period picker, headline numbers
// and bars look and read the same everywhere. They match the Engagement
// card on ResidentProfileScreen. Staff- and family-facing, not resident-
// facing, so the sizes follow the rest of the staff screens.

/**
 * The "Last 7 days / Last 30 days / All time" chips.
 * @param {{ value: string, onChange: (key: string) => void }} props
 */
export function PeriodPicker({ value, onChange }) {
  return (
    <View style={styles.periodRow} accessibilityRole="radiogroup">
      {PERIODS.map((p) => {
        const on = p.key === value;
        return (
          <TouchableOpacity
            key={p.key}
            style={[styles.periodChip, on && styles.periodChipOn]}
            onPress={() => onChange(p.key)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={p.label}
          >
            <Text style={[styles.periodText, on && styles.periodTextOn]}>{p.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

/**
 * A row of headline numbers, e.g. total time / visits / residents.
 * @param {{ tiles: { label: string, value: string }[] }} props
 */
export function StatTiles({ tiles }) {
  return (
    <View style={styles.tileRow}>
      {tiles.map((t) => (
        <View
          key={t.label}
          style={styles.tile}
          accessible
          accessibilityLabel={`${t.label}: ${t.value}`}
        >
          <Text style={styles.tileValue}>{t.value}</Text>
          <Text style={styles.tileLabel}>{t.label}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * One labelled bar, sized relative to the biggest value in its list so the
 * split is readable at a glance.
 * @param {{ label: string, seconds: number, max: number, meta?: string }} props
 */
export function TimeBar({ label, seconds, max, meta }) {
  const width = max ? Math.max(seconds > 0 ? 4 : 0, (seconds / max) * 100) : 0;
  return (
    <View
      style={styles.barRow}
      accessible
      accessibilityLabel={`${label}: ${formatDuration(seconds)}${meta ? `, ${meta}` : ''}`}
    >
      <View style={styles.barHeader}>
        <Text style={styles.barName} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.barTime}>{formatDuration(seconds)}</Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${width}%` }]} />
      </View>
      {meta ? <Text style={styles.barMeta}>{meta}</Text> : null}
    </View>
  );
}

/** "1 visit" / "3 visits". */
export function visits(n) {
  return `${n} ${n === 1 ? 'visit' : 'visits'}`;
}

const styles = StyleSheet.create({
  periodRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  periodChip: {
    minHeight: 40,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderRadius: radii.circular,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  periodChipOn: { backgroundColor: colors.mistBackground, borderColor: colors.primary },
  periodText: { fontFamily: fonts.sansRegular, fontSize: 14, color: colors.textPrimary },
  periodTextOn: { fontFamily: fonts.sansBold },
  tileRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
  tile: {
    flexGrow: 1,
    flexBasis: 140,
    backgroundColor: colors.surface,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  tileValue: { fontFamily: fonts.serifBold, fontSize: 26, color: colors.primary },
  tileLabel: { fontFamily: fonts.sansRegular, fontSize: 14, color: colors.textMuted, marginTop: 4 },
  barRow: { marginTop: 16 },
  barHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 6,
  },
  barName: { flex: 1, fontFamily: fonts.sansBold, fontSize: 16, color: colors.textPrimary },
  barTime: { fontFamily: fonts.sansBold, fontSize: 16, color: colors.textPrimary },
  barTrack: {
    height: 10,
    borderRadius: radii.circular,
    backgroundColor: colors.mistBackground,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: radii.circular, backgroundColor: colors.primary },
  barMeta: { fontFamily: fonts.sansRegular, fontSize: 13, color: colors.textMuted, marginTop: 6 },
});

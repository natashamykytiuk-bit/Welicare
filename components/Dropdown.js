import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, fonts, radii } from '../theme';

// Tap-to-open dropdown list, used in place of @react-native-picker/picker —
// that component renders as a native scrolling wheel on iOS, which doesn't
// read as a "select this from a list" control the way a dropdown does.
// `options` is an array of strings; `placeholder` shows when value is ''.
export default function Dropdown({
  label,
  value,
  onValueChange,
  options,
  placeholder,
  accessibilityLabel,
}) {
  const [open, setOpen] = useState(false);

  function handleSelect(option) {
    onValueChange(option);
    setOpen(false);
  }

  return (
    <>
      <TouchableOpacity
        style={styles.field}
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        // The field shows the current value; the hint says tapping opens choices.
        accessibilityValue={value ? { text: value } : undefined}
        accessibilityHint="Opens a list to choose from"
      >
        <Text style={[styles.fieldText, !value && styles.placeholderText]}>
          {value || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={20} color={colors.textMuted} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        {/* The tap-outside-to-close layer is a sibling behind the sheet, not a
            wrapper around it: a Pressable is one accessibility element, so
            wrapping the sheet hid every option from VoiceOver. */}
        <View style={styles.backdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Close list"
          />
          <View style={styles.sheet} accessibilityViewIsModal>
            {label ? <Text style={styles.sheetTitle}>{label}</Text> : null}
            <FlatList
              data={options}
              keyExtractor={(item) => item}
              style={styles.list}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.option}
                  onPress={() => handleSelect(item)}
                  accessibilityRole="button"
                  accessibilityLabel={item}
                >
                  <Text style={[styles.optionText, item === value && styles.optionTextSelected]}>
                    {item}
                  </Text>
                  {item === value ? (
                    <Ionicons name="checkmark" size={20} color={colors.primary} />
                  ) : null}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radii.sm,
    paddingHorizontal: 16,
    marginBottom: 20,
    minHeight: 56,
  },
  fieldText: {
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: colors.textPrimary,
  },
  placeholderText: { color: colors.textMuted },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(26,46,37,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingTop: 12,
    paddingBottom: 24,
    maxHeight: '65%',
  },
  sheetTitle: {
    fontFamily: fonts.sansBold,
    fontSize: 13,
    color: colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  list: { paddingHorizontal: 8 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  optionText: {
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: colors.textPrimary,
  },
  optionTextSelected: {
    fontFamily: fonts.sansBold,
    color: colors.primary,
  },
});

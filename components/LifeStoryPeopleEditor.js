import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors, fonts, radii } from '../theme';
import {
  MAX_PEOPLE,
  PERSON_NAME_MAX_LENGTH,
  PERSON_NOTES_MAX_LENGTH,
  emptyPerson,
} from '../utils/lifeStoryPeople';

// The editable list of people behind one life-story question on
// BuildProfileScreen (children, grandchildren, other important people). Each
// person gets their own card: a name, a details box and an "OK to talk about"
// tick box, instead of one free-text answer — so the AI suggestions can use
// people one by one and leave out anyone who isn't ticked
// (functions/suggestionPrompt.js).
//
// The tick box is worded positively and starts ticked on purpose: this form
// is often filled in with the resident beside the caregiver, so it should
// read as "happy to chat about them", not as a list of upsetting subjects.
// Anything that needs explaining goes in the staff-only Safety notes
// (ResidentSafetyScreen), which the resident never sees.
//
// `people` is the saved list ([] when nothing has been entered); `noun` names
// one entry for labels and buttons ("child", "grandchild", "person").
export default function LifeStoryPeopleEditor({ people, onChange, noun, notesPlaceholder }) {
  // Always show at least one card, so there's somewhere to type straight
  // away. It only becomes part of the answer once something is entered —
  // blank entries are dropped on save (cleanPeople).
  const rows = people.length > 0 ? people : [emptyPerson()];

  function update(index, patch) {
    onChange(rows.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  return (
    <View style={styles.wrap}>
      {rows.map((person, index) => {
        const label = `${noun} ${index + 1}`;
        return (
          // Entries have no id of their own; position is stable enough here
          // because every field is controlled by `people`.
          <View key={index} style={styles.card}>
            <TextInput
              style={styles.input}
              value={person.name}
              onChangeText={(v) => update(index, { name: v })}
              placeholder="Name"
              placeholderTextColor={colors.textMuted}
              maxLength={PERSON_NAME_MAX_LENGTH}
              accessibilityLabel={`Name of ${label}`}
            />
            <TextInput
              style={[styles.input, styles.notes]}
              value={person.notes}
              onChangeText={(v) => update(index, { notes: v })}
              placeholder={notesPlaceholder}
              placeholderTextColor={colors.textMuted}
              maxLength={PERSON_NOTES_MAX_LENGTH}
              multiline
              textAlignVertical="top"
              accessibilityLabel={`Details about ${label}`}
            />
            <View style={styles.footer}>
              <TouchableOpacity
                style={styles.checkRow}
                onPress={() => update(index, { okToTalkAbout: !person.okToTalkAbout })}
                activeOpacity={0.8}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: person.okToTalkAbout }}
                accessibilityLabel={`OK to talk about ${label}`}
              >
                <Ionicons
                  name={person.okToTalkAbout ? 'checkbox' : 'square-outline'}
                  size={28}
                  color={person.okToTalkAbout ? colors.primary : colors.textMuted}
                />
                <Text style={styles.checkText}>OK to talk about</Text>
              </TouchableOpacity>
              {/* Nothing to remove while the only card is the blank one. */}
              {people.length > 0 ? (
                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={() => onChange(rows.filter((_, i) => i !== index))}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${label}`}
                >
                  <Ionicons name="trash-outline" size={22} color={colors.textMuted} />
                </TouchableOpacity>
              ) : null}
            </View>
            {!person.okToTalkAbout ? (
              <Text style={styles.note}>Suggestions won&apos;t mention them.</Text>
            ) : null}
          </View>
        );
      })}
      {rows.length < MAX_PEOPLE ? (
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => onChange([...rows, emptyPerson()])}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={`Add another ${noun}`}
        >
          <Ionicons name="add" size={22} color={colors.primary} />
          <Text style={styles.addText}>Add another {noun}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 16 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    padding: 12,
    marginBottom: 12,
  },
  input: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    fontFamily: fonts.sansRegular,
    fontSize: 18,
    color: colors.textPrimary,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 56,
    marginBottom: 10,
  },
  notes: { minHeight: 80 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    flexShrink: 1,
  },
  checkText: {
    fontFamily: fonts.sansRegular,
    fontSize: 16,
    color: colors.textPrimary,
  },
  removeButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: {
    fontFamily: fonts.sansRegular,
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 2,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 16,
    alignSelf: 'flex-start',
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  addText: {
    fontFamily: fonts.sansBold,
    fontSize: 16,
    color: colors.primary,
  },
});

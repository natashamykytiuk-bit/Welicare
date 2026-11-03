import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors } from '../../theme';
import { styles } from './libraryStyles';
import { ErrorText } from './VideoFinder';

// The add/edit bottom sheet. The screen renders its own fields as children,
// since music and movies collect different metadata.
export function EntryEditorModal({ visible, heading, error, saving, onCancel, onSave, children }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.modalBackdrop} onPress={onCancel} />
        <ScrollView
          contentContainerStyle={styles.modalSheetWrap}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.modalSheet}>
            <Text style={styles.modalHeading}>{heading}</Text>
            {children}
            <ErrorText message={error} />
            <View style={styles.modalActions}>
              <CancelButton onPress={onCancel} />
              <TouchableOpacity
                style={styles.modalSaveButton}
                onPress={onSave}
                disabled={saving}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Save"
              >
                {saving ? (
                  <ActivityIndicator color={colors.white} />
                ) : (
                  <Text style={styles.modalSaveText}>Save</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function LabeledInput({ label, value, onChangeText, placeholder }) {
  return (
    <>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
      />
    </>
  );
}

export function FieldLabel({ children, spaced }) {
  return <Text style={[styles.fieldLabel, spaced && styles.fieldLabelSpaced]}>{children}</Text>;
}

// A custom Modal rather than Alert.alert: Alert.alert is a no-op on web
// (react-native-web ships an empty stub), which would make removing silently
// do nothing in a browser.
export function RemoveEntryModal({ target, libraryName, removing, onCancel, onConfirm }) {
  return (
    <Modal
      visible={!!target}
      transparent
      animationType="fade"
      onRequestClose={() => (removing ? null : onCancel())}
    >
      <View style={styles.confirmOverlay}>
        <View style={styles.confirmSheet}>
          <Text style={styles.confirmTitle}>Remove from library</Text>
          <Text style={styles.confirmBody}>
            Remove "{target?.title}" from the {libraryName}?
          </Text>
          <View style={styles.modalActions}>
            <CancelButton onPress={onCancel} disabled={removing} />
            <TouchableOpacity
              style={styles.confirmRemoveButton}
              onPress={onConfirm}
              disabled={removing}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Remove"
            >
              {removing ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <Text style={styles.modalSaveText}>Remove</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function CancelButton({ onPress, disabled }) {
  return (
    <TouchableOpacity
      style={styles.modalCancelButton}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel="Cancel"
    >
      <Text style={styles.modalCancelText}>Cancel</Text>
    </TouchableOpacity>
  );
}

import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { colors, fonts, radii } from '../theme';

// A password TextInput with a show/hide eye icon and an optional inline
// error message below it. Used on both SignInScreen and SignUpScreen.
export default function PasswordField({
  value,
  onChangeText,
  placeholder,
  autoComplete,
  accessibilityLabel,
  error,
}) {
  const [visible, setVisible] = useState(false);

  return (
    <View>
      <View style={[styles.wrapper, error && styles.wrapperError]}>
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoComplete={autoComplete}
          value={value}
          onChangeText={onChangeText}
          accessibilityLabel={accessibilityLabel}
        />
        <TouchableOpacity
          onPress={() => setVisible((v) => !v)}
          style={styles.eyeButton}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={visible ? 'Hide password' : 'Show password'}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name={visible ? 'eye-off' : 'eye'} size={21} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
      {error ? (
        <Text style={styles.errorText} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.sm,
    marginBottom: 20,
    minHeight: 56,
  },
  wrapperError: {
    borderColor: colors.destructive,
    marginBottom: 6,
  },
  input: {
    flex: 1,
    fontFamily: fonts.sansRegular,
    paddingHorizontal: 16,
    paddingVertical: 15,
    fontSize: 16,
    color: colors.textPrimary,
  },
  eyeButton: {
    paddingHorizontal: 14,
  },
  errorText: {
    fontFamily: fonts.sansRegular,
    color: colors.destructive,
    fontSize: 13,
    marginBottom: 14,
    marginLeft: 2,
  },
});

import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

const PRIMARY_DARK = '#164E63';
const BORDER = '#BAE6FD';
const ERROR = '#DC2626';
const REGULAR = 'AtkinsonHyperlegible_400Regular';

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
          placeholderTextColor="#93C5D9"
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
          <Ionicons name={visible ? 'eye-off' : 'eye'} size={21} color="#6B7280" />
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
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 12,
    marginBottom: 20,
    minHeight: 52,
  },
  wrapperError: {
    borderColor: ERROR,
    marginBottom: 6,
  },
  input: {
    flex: 1,
    fontFamily: REGULAR,
    paddingHorizontal: 16,
    paddingVertical: 15,
    fontSize: 17,
    color: PRIMARY_DARK,
  },
  eyeButton: {
    paddingHorizontal: 14,
  },
  errorText: {
    fontFamily: REGULAR,
    color: ERROR,
    fontSize: 13,
    marginBottom: 14,
    marginLeft: 2,
  },
});

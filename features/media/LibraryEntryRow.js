import { Ionicons } from '@expo/vector-icons';
import { Image, Text, TouchableOpacity, View } from 'react-native';
import { colors } from '../../theme';
import { thumbnailForVideoId } from '../../utils/musicLibrary';
import { styles } from './libraryStyles';

// One entry in a staff library list, with Edit and Remove buttons.
//
// Global entries are the shared admin-curated baseline. firestore.rules
// already reject edits/deletes on them; greying the controls out here is
// friendlier than letting a caregiver tap Delete and get a permission error.
export default function LibraryEntryRow({ entry, subtitle, onEdit, onRemove }) {
  const isGlobal = entry.facilityId === 'global';
  return (
    <View style={styles.resultCard}>
      <Image
        source={{ uri: entry.thumbnailUrl || thumbnailForVideoId(entry.videoId) }}
        style={styles.thumbnail}
      />
      <View style={styles.cardText}>
        <View style={styles.titleRow}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {entry.title}
          </Text>
          {isGlobal ? (
            <View style={styles.sharedBadge}>
              <Text style={styles.sharedBadgeText}>Shared</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.cardSubtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <RowButton
        icon="create-outline"
        color={colors.textPrimary}
        label={`Edit ${entry.title}`}
        disabled={isGlobal}
        onPress={() => onEdit(entry)}
      />
      <RowButton
        icon="trash-outline"
        color={colors.destructive}
        label={`Remove ${entry.title}`}
        disabled={isGlobal}
        onPress={() => onRemove(entry)}
      />
    </View>
  );
}

function RowButton({ icon, color, label, disabled, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.iconButton, disabled && styles.iconButtonDisabled]}
      hitSlop={4}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
    >
      <Ionicons name={icon} size={20} color={disabled ? colors.textMuted : color} />
    </TouchableOpacity>
  );
}

import React from 'react';
import {
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { radius, spacing } from '@/constants/theme';

interface SearchBarProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  onPress?: () => void; // for non-editable tappable version
  editable?: boolean;
}

export function SearchBar({
  value,
  onChangeText,
  placeholder = 'Search pins…',
  onPress,
  editable = true,
}: SearchBarProps) {
  const colors = useColors();

  const inner = (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.homeAqua,
          borderColor: colors.homeLine,
          borderRadius: radius.lg,
        },
      ]}
    >
      <Feather name="search" size={16} color={colors.homeMuted} style={styles.icon} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.homeMuted}
        style={[styles.input, { color: colors.homeInk }]}
        editable={editable}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
        clearButtonMode="while-editing"
      />
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        {inner}
      </TouchableOpacity>
    );
  }

  return inner;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    height: 44,
    borderWidth: 1,
    marginHorizontal: spacing.lg,
  },
  icon: {
    marginRight: spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    padding: 0,
  },
});

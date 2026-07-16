import React from 'react';
import {
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

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
          backgroundColor: colors.secondary,
          borderColor: colors.border,
          borderRadius: colors.radius,
        },
      ]}
    >
      <Feather name="search" size={16} color={colors.mutedForeground} style={styles.icon} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.mutedForeground}
        style={[styles.input, { color: colors.foreground }]}
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
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    marginHorizontal: 16,
  },
  icon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    padding: 0,
  },
});

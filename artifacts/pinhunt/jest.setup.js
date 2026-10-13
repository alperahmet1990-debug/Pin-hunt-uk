// react-native-keyboard-controller is a native module; use its own Jest mock
// everywhere (components/ui/Sheet imports it, and most screens import Sheet).
jest.mock('react-native-keyboard-controller', () => require('react-native-keyboard-controller/jest'));
// useColors reads the saved Appearance choice (#224) from AsyncStorage, and
// nearly every component calls useColors: use the package's in-memory mock.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

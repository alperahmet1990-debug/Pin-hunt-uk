// react-native-keyboard-controller is a native module; use its own Jest mock
// everywhere (components/ui/Sheet imports it, and most screens import Sheet).
jest.mock('react-native-keyboard-controller', () => require('react-native-keyboard-controller/jest'));

// react-native-keyboard-controller is a native module; use its own Jest mock
// everywhere (components/ui/Sheet imports it, and most screens import Sheet).
// KeyboardAvoidingView carries a testID so tests can check a text field sits
// inside the shared keyboard handling (B-P1-21, #47).
jest.mock('react-native-keyboard-controller', () => {
  const mock = require('react-native-keyboard-controller/jest');
  const { createElement } = require('react');
  const { View } = require('react-native');
  return {
    ...mock,
    KeyboardAvoidingView: props => createElement(View, { testID: 'keyboard-avoiding-view', ...props }),
  };
});
// useColors reads the saved Appearance choice (#224) from AsyncStorage, and
// nearly every component calls useColors: use the package's in-memory mock.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
// expo-camera is a native module (the Find tab's live camera, #117). Tests get
// a stand-in CameraView that reports ready and returns a fixed photo, and a
// permission hook a test can steer through global.__cameraPermission.
jest.mock('expo-camera', () => {
  const React = require('react');
  const { View } = require('react-native');
  const CameraView = React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({
      takePictureAsync: () => Promise.resolve({ uri: 'file:///camera.jpg', width: 3024, height: 4032 }),
    }));
    React.useEffect(() => { props.onCameraReady?.(); }, []);
    return React.createElement(View, { testID: props.testID, accessibilityLabel: 'Camera preview' });
  });
  return {
    CameraView,
    useCameraPermissions: () => [
      globalThis.__cameraPermission === undefined ? { granted: true, canAskAgain: true } : globalThis.__cameraPermission,
      jest.fn(),
    ],
  };
});

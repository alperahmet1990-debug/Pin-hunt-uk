/**
 * The Find tab's live camera (UX-009, #117): permission states, and a shot
 * is cropped to the on-screen frame before it's handed on.
 */
import React from 'react';
import { Linking } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ScanCamera } from '../components/scan/ScanCamera';

jest.setTimeout(20_000);
const mockManipulate = jest.fn((_uri: string, _actions: unknown[]) =>
  Promise.resolve({ uri: 'file:///cropped.jpg', width: 2000, height: 2000 }));
jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: (uri: string, actions: unknown[]) => mockManipulate(uri, actions),
  SaveFormat: { JPEG: 'jpeg' },
}));

const g = globalThis as { __cameraPermission?: unknown };
afterEach(() => { delete g.__cameraPermission; jest.clearAllMocks(); });

describe('ScanCamera', () => {
  it('asks for the camera with a reason before the system prompt', async () => {
    g.__cameraPermission = { granted: false, canAskAgain: true };
    await render(<ScanCamera active onCapture={jest.fn()} onError={jest.fn()} />);
    expect(screen.getByRole('header', { name: 'Scan with your camera' })).toBeTruthy();
    expect(screen.getByText('PinHunt uses the camera to identify pins you scan.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Allow camera' })).toBeTruthy();
  });

  it('points to Settings once camera access has been refused for good', async () => {
    g.__cameraPermission = { granted: false, canAskAgain: false };
    const open = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    await render(<ScanCamera active onCapture={jest.fn()} onError={jest.fn()} />);
    expect(screen.getByRole('header', { name: 'Camera is off for PinHunt' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Open Settings' }));
    expect(open).toHaveBeenCalled();
  });

  it('crops the shot to the frame and hands it on', async () => {
    const onCapture = jest.fn();
    await render(<ScanCamera active onCapture={onCapture} onError={jest.fn()} />);
    // Give the preview a size so the frame can be placed: 360×360 pt.
    await act(async () => {
      fireEvent(screen.getByTestId('scan-camera-root'), 'layout', { nativeEvent: { layout: { width: 360, height: 360 } } });
    });
    expect(screen.getByText('One pin, fill the frame')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Take photo' }));
    await waitFor(() => expect(onCapture).toHaveBeenCalledWith({ uri: 'file:///cropped.jpg', width: 2000, height: 2000 }));
    // 3024×4032 shot, 72% frame of 360 pt + 10% margin → a centred square.
    const [, actions] = mockManipulate.mock.calls[0] as [string, { crop: { originX: number; originY: number; width: number; height: number } }[]];
    const { crop } = actions[0];
    expect(crop.width).toBe(crop.height);
    expect(crop.width).toBeLessThan(3024);
    expect(crop.originX + crop.width / 2).toBeCloseTo(3024 / 2, -1);
    expect(crop.originY + crop.height / 2).toBeCloseTo(4032 / 2, -1);
  });

  it('has a torch switch', async () => {
    await render(<ScanCamera active onCapture={jest.fn()} onError={jest.fn()} />);
    const torch = screen.getByRole('switch', { name: 'Torch' });
    expect(torch.props.accessibilityState).toMatchObject({ checked: false });
    await fireEvent.press(torch);
    expect(screen.getByRole('switch', { name: 'Torch' }).props.accessibilityState).toMatchObject({ checked: true });
  });
});

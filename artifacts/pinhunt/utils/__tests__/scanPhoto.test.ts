import * as ImageManipulator from 'expo-image-manipulator';
import { prepareScanPhoto, scanTargetSize, SCAN_JPEG_QUALITY, SCAN_MAX_EDGE } from '../scanPhoto';

// UX-050 (#114): scan photos are shrunk before upload.
jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: jest.fn(() => Promise.resolve({ uri: 'file:///out.jpg', width: 1, height: 1, base64: 'b64' })),
  SaveFormat: { JPEG: 'jpeg' },
}));
const manipulate = ImageManipulator.manipulateAsync as jest.Mock;

beforeEach(() => manipulate.mockClear());

describe('scanTargetSize', () => {
  it('caps the longest edge at 1024 and keeps the aspect ratio', () => {
    expect(SCAN_MAX_EDGE).toBe(1024);
    expect(scanTargetSize(4032, 3024)).toEqual({ width: 1024, height: 768 });
    expect(scanTargetSize(3024, 4032)).toEqual({ width: 768, height: 1024 });
    expect(scanTargetSize(3024, 3024)).toEqual({ width: 1024, height: 1024 });
  });

  it('never enlarges a small photo, and leaves an unknown size alone', () => {
    expect(scanTargetSize(800, 600)).toBeNull();
    expect(scanTargetSize(1024, 1024)).toBeNull();
    expect(scanTargetSize(undefined, 600)).toBeNull();
    expect(scanTargetSize(0, 0)).toBeNull();
  });
});

describe('prepareScanPhoto (native)', () => {
  it('resizes a large landscape photo by width and re-encodes as JPEG 0.8', async () => {
    await expect(prepareScanPhoto('file:///in.heic', 4032, 3024)).resolves.toEqual({ base64: 'b64', mimeType: 'image/jpeg' });
    expect(manipulate).toHaveBeenCalledWith(
      'file:///in.heic',
      [{ resize: { width: 1024 } }],
      { compress: SCAN_JPEG_QUALITY, format: 'jpeg', base64: true },
    );
    expect(SCAN_JPEG_QUALITY).toBe(0.8);
  });

  it('resizes a portrait photo by height', async () => {
    await prepareScanPhoto('file:///in.jpg', 3024, 4032);
    expect(manipulate.mock.calls[0][1]).toEqual([{ resize: { height: 1024 } }]);
  });

  it('only re-encodes a photo that is already small', async () => {
    await prepareScanPhoto('file:///in.jpg', 900, 900);
    expect(manipulate.mock.calls[0][1]).toEqual([]);
  });

  it('fails rather than sending nothing when encoding gives no data', async () => {
    manipulate.mockResolvedValueOnce({ uri: 'file:///out.jpg', width: 1, height: 1 });
    await expect(prepareScanPhoto('file:///in.jpg', 900, 900)).rejects.toThrow('Photo could not be encoded');
  });
});

import { Share } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { buildShareListText, SHARE_LIST_LIMIT, shareListTitle, shareOrCopy } from '../shareList';

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(() => Promise.resolve(true)) }));

// #146: the text a collector shares to WhatsApp or a Facebook group.
describe('buildShareListText', () => {
  it('lists the pins by name and ends with the username', () => {
    expect(buildShareListText('iso', ['Stitch Valentine 2024', 'Dumbo Blue Sky'], 'pinfan')).toBe(
      'My ISO on PinHunt (2):\n• Dumbo Blue Sky\n• Stitch Valentine 2024\n\nFind me on PinHunt: @pinfan',
    );
  });

  it('sorts numbers in names the way people read them', () => {
    const text = buildShareListText('iso', ['Classic 116', 'Classic 16', 'Classic 2'], 'pinfan')!;
    expect(text.split('\n').slice(1, 4)).toEqual(['\u2022 Classic 2', '\u2022 Classic 16', '\u2022 Classic 116']);
  });

  it('keeps ISO and For Trade headings distinct', () => {
    expect(buildShareListText('for_trade', ['Castle'], 'pinfan')).toMatch(/^My For Trade pins on PinHunt \(1\):/);
    expect(shareListTitle('iso')).toBe('My ISO');
    expect(shareListTitle('for_trade')).toBe('My For Trade pins');
  });

  it(`shows up to ${SHARE_LIST_LIMIT} pins, then "and N more"`, () => {
    const titles = Array.from({ length: 42 }, (_, i) => `Pin ${String(i).padStart(2, '0')}`);
    const text = buildShareListText('iso', titles, 'pinfan')!;
    expect(text.split('\n').filter(l => l.startsWith('•'))).toHaveLength(30);
    expect(text).toContain('My ISO on PinHunt (42):');
    expect(text).toContain('…and 12 more');
  });

  it('works without a username, and returns nothing for an empty list', () => {
    expect(buildShareListText('iso', ['Castle'], undefined)).toMatch(/\n\nFind me on PinHunt$/);
    expect(buildShareListText('iso', [], 'pinfan')).toBeNull();
    expect(buildShareListText('iso', ['  '], 'pinfan')).toBeNull();
  });
});

describe('shareOrCopy', () => {
  afterEach(() => jest.restoreAllMocks());

  it('opens the share sheet on a phone', async () => {
    const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
    await expect(shareOrCopy('text', 'My ISO', 'ios')).resolves.toBe('shared');
    expect(share).toHaveBeenCalledWith({ message: 'text', title: 'My ISO' });
  });

  it('copies the text on a browser without a share sheet', async () => {
    const share = jest.spyOn(Share, 'share');
    await expect(shareOrCopy('text', 'My ISO', 'web')).resolves.toBe('copied');
    expect(share).not.toHaveBeenCalled();
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('text');
  });

  it('treats a closed or failed share sheet quietly', async () => {
    jest.spyOn(Share, 'share').mockRejectedValue(new Error('dismissed'));
    await expect(shareOrCopy('text', 'My ISO', 'android')).resolves.toBe('failed');
  });
});

import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { fontScale } from '@/constants/theme';
import { PinTile } from '../PinTile';
import { Chip } from '../Chip';
import { StatusBadge } from '../StatusBadge';
import { SegmentedControl } from '../SegmentedControl';
import { CollectionBadge } from '../../CollectionBadge';

// B-P2-15 (#69): text inside dense tiles and badges is capped so the largest
// system text sizes can't push it out of its tile; see docs/design/dynamic-type.md.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

type Node = { type: string; props: Record<string, unknown>; children: (Node | string)[] | null };

/** Every host Text with words in it (icon glyphs are Text too, at a fixed size, so they're skipped). */
function texts(): { text: string; cap: unknown }[] {
  const out: { text: string; cap: unknown }[] = [];
  const walk = (n: Node | Node[] | string | null) => {
    if (!n || typeof n === 'string') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.type === 'Text') {
      const text = (n.children ?? []).filter(c => typeof c === 'string').join('');
      if (text && !/^[\uE000-\uF8FF]+$/.test(text)) out.push({ text, cap: n.props.maxFontSizeMultiplier });
    }
    (n.children ?? []).forEach(walk);
  };
  walk(screen.toJSON() as Node | Node[] | null);
  return out;
}

describe('Dynamic Type policy (B-P2-15)', () => {
  it('keeps the caps between the system size and double it', () => {
    expect(fontScale.badge).toBeGreaterThan(1);
    expect(fontScale.badge).toBeLessThanOrEqual(fontScale.dense);
    expect(fontScale.dense).toBeLessThan(2);
  });

  it('caps every label on a pin tile: badges tighter than the caption', async () => {
    await render(<PinTile title="Stitch Surfboard" size={95} copies={3} missing onPress={() => {}} />);
    const found = texts();
    const caps = Object.fromEntries(found.map(t => [t.text, t.cap]));
    expect(caps).toEqual({ '×3': fontScale.badge, Missing: fontScale.badge, 'Stitch Surfboard': fontScale.dense });
  }, 20_000);

  it('caps chips, status badges and the legacy collection badge', async () => {
    await render(
      <>
        <Chip label="Paris" />
        <StatusBadge status="for_trade" />
        <CollectionBadge status="wanted" />
      </>,
    );
    const labelled = texts();
    expect(labelled.map(t => t.text)).toEqual(['Paris', 'For Trade', 'ISO']);
    labelled.forEach(t => expect(t.cap).toBe(fontScale.dense));
  });

  it('caps segmented control labels, which sit in a fixed 36 pt pill', async () => {
    await render(
      <SegmentedControl
        options={[{ value: 'a', label: 'All', tone: 'coral' }, { value: 'b', label: 'For Trade', tone: 'forTrade' }]}
        value="a"
        onChange={() => {}}
      />,
    );
    const labelled = texts();
    expect(labelled).toHaveLength(2);
    labelled.forEach(t => expect(t.cap).toBe(fontScale.badge));
  });
});

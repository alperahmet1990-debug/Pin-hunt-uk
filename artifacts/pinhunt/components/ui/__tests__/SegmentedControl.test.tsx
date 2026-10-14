import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { SegmentedControl, SEGMENT_HEIGHT, SEGMENT_HIT_SLOP } from '../SegmentedControl';

// B-P2-08 (#63): every segment is a 44 pt tap target (36 pt pill + the row's padding).
describe('SegmentedControl touch targets', () => {
  it('gives each segment a 36 pt pill and a 44 pt tap target', async () => {
    await render(
      <SegmentedControl
        options={[
          { value: 'all', label: 'All', tone: 'coral' },
          { value: 'owned', label: 'Owned', tone: 'owned' },
        ]}
        value="all"
        onChange={() => {}}
      />,
    );
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(2);
    for (const tab of tabs) {
      const style = StyleSheet.flatten(tab.props.style);
      expect(style.minHeight).toBe(SEGMENT_HEIGHT);
      expect(tab.props.hitSlop).toEqual(SEGMENT_HIT_SLOP);
      expect(style.minHeight + SEGMENT_HIT_SLOP.top + SEGMENT_HIT_SLOP.bottom).toBeGreaterThanOrEqual(44);
    }
  });
});

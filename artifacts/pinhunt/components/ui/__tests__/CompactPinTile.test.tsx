import React from 'react';
import { render } from '@testing-library/react-native';
import { CompactPinTile } from '../CompactPinTile';

const pin = { id: 'p1', title: 'Test Pin' } as never;

describe('CompactPinTile quick add', () => {
  it('gives the small "+" a hitSlop that reaches a 44pt target and a label', async () => {
    const { getByLabelText } = await render(
      <CompactPinTile pin={pin} owned={false} size={100} onPress={() => {}} onQuickAdd={() => {}} />,
    );
    const btn = getByLabelText('Quick add Test Pin');
    // 18pt visual + 2 * 13pt slop = 44pt
    expect(btn.props.hitSlop).toBe(13);
    expect(18 + 2 * btn.props.hitSlop).toBeGreaterThanOrEqual(44);
  });
});

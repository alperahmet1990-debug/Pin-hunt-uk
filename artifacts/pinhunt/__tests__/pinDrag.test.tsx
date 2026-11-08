import React from 'react';
import { Text } from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { DraggablePin, zoneAt } from '../components/PinDrag';

describe('zoneAt (dropping dragged pins on the Organise panel)', () => {
  const zones = [
    { id: 'for_trade', rect: { x: 900, y: 200, width: 280, height: 56 } },
    { id: 'owned', rect: { x: 900, y: 264, width: 280, height: 56 } },
    { id: 'unmeasured', rect: undefined },
  ];

  it('finds the target under the finger', () => {
    expect(zoneAt(zones, 1000, 230)).toBe('for_trade');
    expect(zoneAt(zones, 901, 300)).toBe('owned');
  });

  it('finds nothing between or outside targets', () => {
    expect(zoneAt(zones, 1000, 260)).toBeNull();
    expect(zoneAt(zones, 400, 230)).toBeNull();
    expect(zoneAt([], 0, 0)).toBeNull();
  });
});

describe('DraggablePin', () => {
  it('renders the tile unchanged outside a drag area (phones)', async () => {
    await render(
      <DraggablePin getIds={() => ['a']}>
        <Text>Stitch</Text>
      </DraggablePin>,
    );
    expect(screen.getByText('Stitch')).toBeTruthy();
  });
});

import React from 'react';
import { StyleSheet, type ViewStyle } from 'react-native';
import { render } from '@testing-library/react-native';
import { SetProgressBar } from '../SetProgressBar';

async function fillWidth(progress: number) {
  const { toJSON } = await render(
    <SetProgressBar progress={progress} trackColor="#eee" fillColor="#0a0" />,
  );
  const track = toJSON() as unknown as { children: Array<{ props: { style: ViewStyle } }> };
  return StyleSheet.flatten(track.children[0].props.style).width;
}

describe('SetProgressBar', () => {
  it('renders the fill as a rounded percentage', async () => {
    expect(await fillWidth(0.333)).toBe('33%');
  });

  it('clamps progress to 0–100%', async () => {
    expect(await fillWidth(-1)).toBe('0%');
    expect(await fillWidth(2)).toBe('100%');
  });
});

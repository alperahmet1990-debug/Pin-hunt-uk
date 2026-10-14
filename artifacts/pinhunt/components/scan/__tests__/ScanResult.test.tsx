import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { ScanResult, type ScanCandidate } from '../ScanResult';

// UX-005 (#112): single-answer scan result.
const pin = (id: string, title: string, imageUrl?: string) =>
  ({ id, title, collection: 'Park Icons', imageUrl } as unknown as ScanCandidate['pin']);
const three: ScanCandidate[] = [
  { pin: pin('p1', 'Castle Fireworks', 'https://example.test/p1.jpg'), confidence: 88, reasoning: 'Castle outline and fireworks' },
  { pin: pin('p2', 'Dumbo Blue Sky'), confidence: 62, reasoning: 'Blue sky' },
  { pin: pin('p3', 'Mickey Classic'), confidence: 41, reasoning: 'Ears' },
];
const insights = { textOnPin: 'DLP 2024', characters: ['Dumbo'], logos: [], keywords: ['castle'], webGuesses: [] };

function setup(over: Partial<React.ComponentProps<typeof ScanResult>> = {}) {
  const props = {
    photoUri: 'file:///photo.jpg',
    candidates: three,
    insights,
    showDetails: false,
    onConfirm: jest.fn(),
    onOpenPin: jest.fn(),
    onNoneOfThese: jest.fn(),
    ...over,
  };
  return { props, view: render(<ScanResult {...props} />) };
}

describe('ScanResult', () => {
  it('shows the photo beside the best match, with no scan internals for collectors', async () => {
    await setup().view;
    expect(screen.getByRole('header', { name: 'Best match' })).toBeTruthy();
    expect(screen.getByLabelText('Your photo')).toBeTruthy();
    expect(screen.getByText('Castle Fireworks')).toBeTruthy();
    expect(screen.queryByText(/%/)).toBeNull();
    expect(screen.queryByText(/Castle outline/)).toBeNull();
    expect(screen.queryByText(/What the scan saw/)).toBeNull();
    expect(screen.queryByText(/Scan details/)).toBeNull();
  });

  it('"That\'s it" confirms the pin shown', async () => {
    const { props, view } = setup();
    await view;
    await fireEvent.press(screen.getByRole('button', { name: "That's it" }));
    expect(props.onConfirm).toHaveBeenCalledWith(three[0].pin);
  });

  it('"Not it" reveals the others; tapping one promotes it; "None of these" opens recovery', async () => {
    const { props, view } = setup();
    await view;
    expect(screen.queryByText('Dumbo Blue Sky')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Not it' }));
    expect(screen.getByText('Or is it one of these?')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Not it' })).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Compare Dumbo Blue Sky' }));
    // Dumbo is now beside the photo; Castle moved into the strip.
    expect(screen.getByRole('button', { name: 'Dumbo Blue Sky. Open pin details' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Compare Castle Fireworks' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: "That's it" }));
    expect(props.onConfirm).toHaveBeenCalledWith(three[1].pin);
    await fireEvent.press(screen.getByRole('button', { name: 'None of these' }));
    expect(props.onNoneOfThese).toHaveBeenCalled();
  });

  it('one candidate: "Not it" goes straight to "None of these"', async () => {
    await setup({ candidates: [three[0]] }).view;
    expect(screen.getByRole('header', { name: 'Is this your pin?' })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Not it' }));
    expect(screen.queryByText(/Or is it/)).toBeNull();
    expect(screen.getByRole('button', { name: 'None of these' })).toBeTruthy();
  });

  it('all low confidence: asks, with the alternatives already showing', async () => {
    await setup({ candidates: three.map(c => ({ ...c, confidence: 30 })) }).view;
    expect(screen.getByRole('header', { name: 'Not sure. Is it one of these?' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Compare Dumbo Blue Sky' })).toBeTruthy();
  });

  it('tapping the match opens the pin, even one with no catalogue photo', async () => {
    const { props, view } = setup({ candidates: [three[1]] });
    await view;
    await fireEvent.press(screen.getByRole('button', { name: 'Dumbo Blue Sky. Open pin details' }));
    expect(props.onOpenPin).toHaveBeenCalledWith(three[1].pin);
  });

  it('admins can expand scan details: confidence, reasoning and what the scan saw', async () => {
    await setup({ showDetails: true }).view;
    expect(screen.queryByText(/88%/)).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: /Scan details/ }));
    expect(screen.getByText(/Castle Fireworks · 88%/)).toBeTruthy();
    expect(screen.getByText('Castle outline and fireworks')).toBeTruthy();
    expect(screen.getByText('What the scan saw')).toBeTruthy();
    expect(screen.getByText('“DLP 2024”')).toBeTruthy();
  });
});

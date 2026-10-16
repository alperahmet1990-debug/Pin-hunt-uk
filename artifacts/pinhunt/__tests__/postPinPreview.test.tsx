import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { POST_PIN_IMAGE_SIZE, PostPinPreview, showsPinPreview } from '../components/PostPinPreview';

const pin = { id: 'PHUK-00000001', title: 'Castle Fireworks', brand: 'Disneyland Paris', imageUrl: 'https://example.com/p.png' };

describe('PostPinPreview (B-P2-17)', () => {
  it('only For Trade and ISO posts get the large preview', () => {
    expect(showsPinPreview('for_trade')).toBe(true);
    expect(showsPinPreview('in_search_of')).toBe(true);
    expect(showsPinPreview('discussion')).toBe(false);
    expect(showsPinPreview('new_pickup')).toBe(false);
  });

  it('shows a 72 pt photo, what the post is about and the pin name', async () => {
    await render(<PostPinPreview pin={pin} postType="for_trade" />);
    expect(screen.getByText('FOR TRADE')).toBeTruthy();
    expect(screen.getByText('Castle Fireworks')).toBeTruthy();
    expect(screen.getByText('Disneyland Paris')).toBeTruthy();
    const box = StyleSheet.flatten(screen.getByTestId('post-pin-photo').props.style);
    expect(POST_PIN_IMAGE_SIZE).toBe(72);
    expect(box).toMatchObject({ width: 72, height: 72 });
  });

  it('labels ISO posts "Looking for", and still shows a frame with no photo', async () => {
    await render(<PostPinPreview pin={{ ...pin, imageUrl: undefined }} postType="in_search_of" />);
    expect(screen.getByText('LOOKING FOR')).toBeTruthy();
    expect(screen.getByTestId('post-pin-preview')).toBeTruthy();
  });
});

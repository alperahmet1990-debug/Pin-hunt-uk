/**
 * About shows which version and over-the-air update is running (#286), so
 * a tester can tell whether the latest preview `ota-update` has arrived.
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { buildInfoLines, type BuildInfoInput } from '../utils/buildInfo';

// The screen test pays this file's cold start, which can pass 5 s on CI.
jest.setTimeout(20_000);

const mockUpdates = {
  isEnabled: true, isEmbeddedLaunch: false, updateId: '0a1b2c3d-4e5f-6789-abcd-ef0123456789',
  channel: 'preview', runtimeVersion: '9f8e7d6c5b4a', createdAt: new Date('2026-10-15T11:40:00Z'),
};
jest.mock('expo-updates', () => mockUpdates);
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { name: 'PinHunt', version: '1.0.0' } } }));

const base: BuildInfoInput = {
  version: '1.0.0', updatesEnabled: true, isEmbeddedLaunch: false, updateId: mockUpdates.updateId,
  channel: 'preview', runtimeVersion: '9f8e7d6c5b4a', createdAt: mockUpdates.createdAt,
};

describe('buildInfoLines', () => {
  it('names the running update by short id and publish time (UK time), with channel and runtime', () => {
    expect(buildInfoLines(base)).toEqual([
      'Version 1.0.0',
      'Update 0a1b2c3 · published 15 Oct 2026, 12:40',
      'Channel preview · runtime 9f8e7d6',
    ]);
  });

  it('says when the installed build is running, before any update has arrived', () => {
    expect(buildInfoLines({ ...base, isEmbeddedLaunch: true })[1]).toBe('Update: none yet (running the installed build)');
  });

  it('says so in development, where there are no updates', () => {
    expect(buildInfoLines({ ...base, updatesEnabled: false })).toEqual([
      'Version 1.0.0', 'Development build (no over-the-air updates)',
    ]);
  });
});

describe('About screen', () => {
  it('shows the version and the running update', async () => {
    const About = require('../app/about').default;
    await render(<About />);
    expect(screen.getByText('Version 1.0.0')).toBeTruthy();
    expect(screen.getByText('Update 0a1b2c3 · published 15 Oct 2026, 12:40')).toBeTruthy();
    expect(screen.getByText('Channel preview · runtime 9f8e7d6')).toBeTruthy();
  });
});

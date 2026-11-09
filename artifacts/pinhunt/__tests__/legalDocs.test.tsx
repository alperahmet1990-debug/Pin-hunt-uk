import React from 'react';
import { render, screen } from '@testing-library/react-native';
import LegalDocScreen from '../app/legal/[doc]';
import { AI_PHOTO_CONSENT_COPY } from '../utils/aiPhotoConsent';
import { COMPANY, LEGAL_DOCS, PRIVACY_POLICY, TERMS_OF_USE, companyLine, legalDraft, toMarkdown, type LegalDoc } from '../utils/legal';

declare const __dirname: string;

// Node built-ins, loaded at run time so the app's tsconfig needs no Node types.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('fs') as { readFileSync(p: string, e: string): string; writeFileSync(p: string, d: string): void; existsSync(p: string): boolean };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const path = require('path') as { join(...p: string[]): string };

let mockDoc = 'privacy';
jest.mock('expo-router', () => ({ Stack: { Screen: () => null }, useLocalSearchParams: () => ({ doc: mockDoc }) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const text = (doc: LegalDoc) => [doc.intro, ...doc.sections.flatMap(s => [s.title, ...s.body.flat()])].join(' ');

describe('Privacy Policy and Terms of Use', () => {
  it.each([['privacy', PRIVACY_POLICY], ['terms', TERMS_OF_USE]] as const)('/legal/%s shows every section and the company', async (slug, doc) => {
    mockDoc = slug;
    await render(<LegalDocScreen />);
    expect(screen.getByText(doc.intro)).toBeTruthy();
    for (const s of doc.sections) expect(screen.getByRole('header', { name: s.title })).toBeTruthy();
    expect(screen.getAllByText(new RegExp(COMPANY.number)).length).toBeGreaterThan(0);
  });

  it('says it is a draft while company details are missing', async () => {
    mockDoc = 'privacy';
    await render(<LegalDocScreen />);
    expect(!!screen.queryByText(/^Draft\./)).toBe(legalDraft());
    expect(legalDraft({ registeredOffice: '1 High St', contactEmail: 'privacy@example.org', icoRegistration: 'ZA000000' })).toBe(false);
    expect(legalDraft({ registeredOffice: '1 High St', contactEmail: '', icoRegistration: 'ZA000000' })).toBe(true);
  });

  it('names PinHunt Ltd and its company number', () => {
    expect(companyLine()).toBe('PinHunt Ltd · Registered in England and Wales · Company no. 17570164');
    for (const doc of Object.values(LEGAL_DOCS)) expect(text(doc)).toContain('17570164');
  });

  it('lists every service the AI photo notice says photos go to', () => {
    const policy = text(PRIVACY_POLICY);
    for (const provider of ['OpenAI', 'Google Cloud Vision', 'Pixian']) {
      expect(AI_PHOTO_CONSENT_COPY.body).toContain(provider);
      expect(policy).toContain(provider);
    }
  });

  it('keeps PinHunt out of payments and escrow, with each collector paying their own shipping', () => {
    const terms = text(TERMS_OF_USE).toLowerCase();
    expect(terms).toMatch(/does not take payments/);
    expect(terms).toMatch(/escrow/);
    expect(terms).toMatch(/each collector arranges and pays for their own shipping/);
  });

  it('says PinHunt is for adults (18+) in both documents', () => {
    expect(text(PRIVACY_POLICY)).toMatch(/18 or over/);
    expect(text(TERMS_OF_USE)).toMatch(/You must be 18 or over/);
    expect(text(TERMS_OF_USE)).not.toMatch(/at least 13|parent or guardian/);
  });

  it('names Render as the API host', () => {
    expect(text(PRIVACY_POLICY)).toContain('Render: runs the PinHunt API server.');
  });

  it('docs/legal Markdown matches the app copy (UPDATE_LEGAL_DOCS=1 rewrites it)', () => {
    for (const doc of Object.values(LEGAL_DOCS)) {
      const file = path.join(__dirname, '../../../docs/legal', `${doc.slug}.md`);
      const md = toMarkdown(doc);
      if (process.env.UPDATE_LEGAL_DOCS) fs.writeFileSync(file, md);
      expect(fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '(missing)').toBe(md);
    }
  });
});

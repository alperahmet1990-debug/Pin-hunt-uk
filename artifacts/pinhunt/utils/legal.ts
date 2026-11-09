/**
 * PinHunt Ltd's legal details, Privacy Policy and Terms of Use.
 *
 * One source for the in-app screens (app/legal/[doc].tsx), the company
 * line on About, and the Markdown copies in docs/legal for the website
 * (regenerate with `UPDATE_LEGAL_DOCS=1 pnpm exec jest legalDocs`; the test
 * fails if they drift).
 *
 * DRAFT: written from what the code actually does (see docs/legal/README.md
 * for the evidence), but not yet reviewed by a solicitor. Empty values below
 * are things only the company can supply; while any is empty the screens say
 * the document is a draft.
 */

export const COMPANY = {
  name: 'PinHunt Ltd',
  number: '17570164',
  registeredIn: 'England and Wales',
  /** Registered office, exactly as on Companies House. */
  registeredOffice: '',
  /** Mailbox for privacy requests, complaints and legal notices. */
  contactEmail: '',
  /** ICO data protection fee registration number (ZA…), once paid. */
  icoRegistration: '',
} as const;

/** Shown wherever a company detail hasn't been supplied yet. */
export const TO_BE_CONFIRMED = '[to be confirmed]';

export const or = (value: string) => (value.trim() ? value : TO_BE_CONFIRMED);

/** True while any company detail the documents rely on is still missing. */
export function legalDraft(company: { registeredOffice: string; contactEmail: string; icoRegistration: string } = COMPANY): boolean {
  return !company.registeredOffice.trim() || !company.contactEmail.trim() || !company.icoRegistration.trim();
}

/** "PinHunt Ltd · Registered in England and Wales · Company no. 17570164" */
export function companyLine(): string {
  return `${COMPANY.name} · Registered in ${COMPANY.registeredIn} · Company no. ${COMPANY.number}`;
}

export const LAST_UPDATED = '9 November 2026';

/** A paragraph, or a bulleted list. */
export type LegalBlock = string | string[];
export interface LegalSection { title: string; body: LegalBlock[] }
export interface LegalDoc { slug: 'privacy' | 'terms'; title: string; intro: string; sections: LegalSection[] }

const contact = () => `email ${or(COMPANY.contactEmail)} or write to ${COMPANY.name}, ${or(COMPANY.registeredOffice)}`;

export const PRIVACY_POLICY: LegalDoc = {
  slug: 'privacy',
  title: 'Privacy Policy',
  intro:
    'This explains what information PinHunt collects, why, who it goes to and the choices you have. We have tried to keep it short and plain. PinHunt does not sell your information, show adverts or track you across other apps.',
  sections: [
    {
      title: 'Who we are',
      body: [
        `PinHunt is run by ${COMPANY.name}, a company registered in ${COMPANY.registeredIn} (company number ${COMPANY.number}). Registered office: ${or(COMPANY.registeredOffice)}.`,
        `${COMPANY.name} is the "controller" of your personal information under UK data protection law. ICO registration number: ${or(COMPANY.icoRegistration)}.`,
        `To contact us about privacy, ${contact()}.`,
      ],
    },
    {
      title: 'What we collect',
      body: [
        [
          'Account: your email address and password. Passwords are handled by our sign-in provider and stored only in hashed form; we never see them.',
          'Profile: your username, display name, profile photo and bio if you add them, your home market and trading region, and your trading and contact preferences (for example whether you accept trade requests or messages).',
          'Collection: the pins you mark as owned, for trade or wanted (ISO), with any quantities, notes, condition, prices or values you enter, your boards, the sets you track and where you keep your pins.',
          'Trading and community: trade offers, trade messages and ratings, problem reports, marketplace listings, community posts, comments and photos, direct messages, and the people you block or report.',
          'Catalogue contributions: pins and photos you submit to the catalogue.',
          'Collectors Nearby, only if you turn it on: the UK postcode you enter, your town and county, and approximate coordinates worked out from the postcode. PinHunt does not use your device\'s GPS.',
          'Usage limits and security: counts of how often you use AI features (so we can apply fair-use limits), and technical records such as IP addresses and request details that our servers and providers log to keep the service secure and working.',
        ],
        'Photos you scan to identify a pin are sent for identification and are not saved by PinHunt.',
      ],
    },
    {
      title: 'Why we use it, and our lawful basis',
      body: [
        [
          'To provide PinHunt to you: your account, collection, boards, trading, messaging and community features (performance of our contract with you).',
          'To identify pins from your photos and tidy up catalogue photos with AI services, and to show you to Collectors Nearby: only with your permission (consent). You can withdraw it at any time; see "Your choices" below.',
          'To keep PinHunt safe and fair: moderating content, handling reports, preventing abuse and spam, applying usage limits and protecting our systems (our legitimate interests in running a safe service).',
          'To build and correct the shared pin catalogue from contributions (our legitimate interests, and the licence you give when you submit).',
          'To meet legal obligations, for example responding to lawful requests or keeping records we are required to keep.',
        ],
      ],
    },
    {
      title: 'Who can see your information',
      body: [
        [
          'Other collectors can see your public profile (username, display name, photo, bio, region and trading preferences), your public posts and comments, your marketplace listings and the collection details the app shows on your profile, unless you make your profile private.',
          'With Collectors Nearby on, others see only an approximate distance such as "Around 25 miles away". Your postcode and coordinates are never shown to anyone.',
          'Direct messages and trade conversations are visible to the people in them. PinHunt admins can see reported content to moderate it.',
        ],
      ],
    },
    {
      title: 'Companies that process information for us',
      body: [
        'We use these providers to run PinHunt. They may only use your information to provide their service to us:',
        [
          'Supabase: our database, sign-in and file storage.',
          `Our server host: runs the PinHunt API ${TO_BE_CONFIRMED}.`,
          'OpenAI: identifies pins from photos you scan.',
          'Google Cloud Vision: reads text and finds similar images in photos you scan, to improve identification.',
          'Pixian.ai: removes the background from photos you submit to the catalogue.',
          'postcodes.io: turns the postcode you enter for Collectors Nearby into an approximate location. Only the postcode is sent.',
          'Expo: delivers app updates.',
          'eBay and SoldGraph: provide market price data. We send them pin search terms only, never your personal information.',
          'Apple and Google: distribute the app through their stores, under their own privacy policies.',
        ],
        'Some of these providers are based outside the UK, including in the United States. Where your information goes abroad, we rely on UK adequacy regulations or the UK\'s approved contract terms (the International Data Transfer Agreement or Addendum) to protect it.',
      ],
    },
    {
      title: 'How long we keep it',
      body: [
        [
          'We keep your account information for as long as you have an account.',
          'When you delete your account (Profile › Delete Account), we delete your profile, collection, boards, tracked sets, submissions, listings and your stored photos.',
          'Community posts, comments and messages you sent stay visible to the other people in them, but your name and profile are removed from them.',
          'If you have a trade in progress or an open problem report, deletion waits until it is resolved, so the other collector isn\'t left without a way to sort it out.',
          'We keep a minimal record that a deletion happened (counts only, no name or email) to show we carried it out.',
          'Scan photos are not stored. Server logs and backups are kept for a limited period by our providers and then deleted.',
        ],
      ],
    },
    {
      title: 'Your rights and choices',
      body: [
        'Under UK data protection law you can ask us for a copy of your information, ask us to correct or delete it, ask us to restrict or stop using it, object to how we use it, and ask for a copy in a portable format.',
        [
          'Delete your account at any time in Profile › Delete Account.',
          'Export your collection from Profile › Export Collection.',
          'Turn Collectors Nearby off, or make your profile private, in Profile › Edit Profile.',
          'Withdraw permission to send photos to AI services by not scanning or submitting photos; the app asks again before a photo is sent.',
        ],
        `To use any other right, ${contact()}. We will reply within one month.`,
        'If you are unhappy with how we handle your information, please tell us first. You can also complain to the Information Commissioner\'s Office (ico.org.uk, 0303 123 1113).',
      ],
    },
    {
      title: 'Children',
      body: [
        'You must be at least 13 to use PinHunt. If you are under 18, please make sure a parent or guardian is happy for you to use it, and never share your address or personal details in messages. If you think a child under 13 has an account, contact us and we will delete it.',
      ],
    },
    {
      title: 'Information stored on your device',
      body: [
        'PinHunt saves some things on your device so the app works smoothly, such as your sign-in session, appearance setting, a copy of your collection for offline use and whether you have agreed to the AI photo notice. We do not use advertising or tracking cookies.',
      ],
    },
    {
      title: 'Keeping it secure',
      body: [
        'Your information is sent over encrypted connections, and access to it is restricted by our database\'s security rules so that collectors can only see what they are meant to. No system is perfectly secure, so please use a strong password and keep it to yourself.',
      ],
    },
    {
      title: 'Changes to this policy',
      body: [
        `We will update this policy when PinHunt changes. If a change is significant we will tell you in the app. Last updated: ${LAST_UPDATED}.`,
      ],
    },
  ],
};

export const TERMS_OF_USE: LegalDoc = {
  slug: 'terms',
  title: 'Terms of Use',
  intro:
    'These terms are the agreement between you and PinHunt Ltd when you use PinHunt. Please read them: by creating an account or using the app you agree to them.',
  sections: [
    {
      title: 'About us',
      body: [
        `PinHunt is provided by ${COMPANY.name}, a company registered in ${COMPANY.registeredIn} (company number ${COMPANY.number}), registered office ${or(COMPANY.registeredOffice)}. To contact us, ${contact()}.`,
      ],
    },
    {
      title: 'Who can use PinHunt',
      body: [
        'You must be at least 13. If you are under 18 you need permission from a parent or guardian. You must give accurate details, keep your password safe and have only one account. You are responsible for what happens on your account.',
      ],
    },
    {
      title: 'Trading with other collectors',
      body: [
        [
          'PinHunt helps collectors find each other and agree trades. The trade itself is between you and the other collector: PinHunt is not a party to it.',
          'PinHunt does not take payments, hold pins, offer escrow or buy postage. Each collector arranges and pays for their own shipping.',
          'Check pins, photos and the other collector\'s ratings before you agree, and follow our "Trading safely" guide. Report problems through the trade.',
          'We are not responsible for pins that are lost, damaged, not as described, or not sent, but we will act on reports and may restrict accounts that break these terms.',
        ],
      ],
    },
    {
      title: 'Catalogue, scans and prices',
      body: [
        'The pin catalogue, scan results and market prices are there to help you, but they can be wrong or out of date. Scan identifications come from AI and should be checked. Prices are estimates based on third-party sales data, not valuations or offers to buy.',
        'PinHunt is an independent fan app. It is not affiliated with, endorsed or sponsored by Disney or any pin maker. Names and images of pins belong to their owners.',
      ],
    },
    {
      title: 'Your content',
      body: [
        'You own what you post: photos, posts, comments, messages, listings and submissions. You give PinHunt Ltd a worldwide, non-exclusive, royalty-free licence to store, display and share it within PinHunt so the app can work.',
        'When you submit a pin or photo to the catalogue, you also allow us to edit it (for example removing the background or adding a watermark) and to keep it in the catalogue after you leave, because other collectors rely on it.',
        'Only post things you have the right to share, and don\'t include other people\'s personal details.',
      ],
    },
    {
      title: 'Rules',
      body: [
        'Don\'t:',
        [
          'trade or list counterfeit or "scrapper" pins as genuine, or anything illegal;',
          'harass, threaten or bully anyone, or post hateful, sexual or violent content;',
          'spam, scam, impersonate others or use PinHunt for unrelated selling;',
          'copy or scrape the catalogue, or try to get around our security or usage limits.',
        ],
        'We may remove content and suspend or close accounts that break these rules.',
      ],
    },
    {
      title: 'The service',
      body: [
        'PinHunt is provided free of charge. We are always improving it, so features may change, be paused or be removed. We will try to keep it available but can\'t promise it will always be uninterrupted or error-free.',
      ],
    },
    {
      title: 'Our responsibility to you',
      body: [
        'Nothing in these terms limits our liability where the law does not allow it, including for death or personal injury caused by our negligence, or for fraud. Your legal rights as a consumer are not affected.',
        'Otherwise, because PinHunt is free and trades happen between collectors, we are not liable for losses arising from trades, from relying on catalogue, scan or price information, or that were not reasonably foreseeable.',
      ],
    },
    {
      title: 'Ending your use',
      body: [
        'You can stop using PinHunt and delete your account at any time in Profile › Delete Account. We may suspend or close your account if you break these terms, to protect other collectors, or if we have to by law.',
      ],
    },
    {
      title: 'Changes and law',
      body: [
        `We may update these terms. If a change is significant we will tell you in the app before it applies. These terms are governed by the law of England and Wales. You can bring a claim in the courts of England and Wales, or of Scotland or Northern Ireland if you live there. Last updated: ${LAST_UPDATED}.`,
      ],
    },
  ],
};

export const LEGAL_DOCS = { privacy: PRIVACY_POLICY, terms: TERMS_OF_USE } as const;

/** Markdown for publishing a document on the web (docs/legal/*.md). */
export function toMarkdown(doc: LegalDoc): string {
  const lines = [`# ${doc.title}`, '', `_${companyLine()}_`, '', doc.intro, ''];
  for (const s of doc.sections) {
    lines.push(`## ${s.title}`, '');
    for (const b of s.body) {
      if (Array.isArray(b)) lines.push(...b.map(item => `- ${item}`), '');
      else lines.push(b, '');
    }
  }
  return lines.join('\n');
}

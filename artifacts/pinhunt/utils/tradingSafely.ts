/**
 * "Trading safely" guide copy (UX-032, #144). Kept apart from the screen so
 * the wording can be reviewed and changed in one place. Drafted in a
 * supervised session; the maintainer approves it before merge (D-13).
 *
 * Trade-only shipping: each collector posts their own pins and buys their
 * own postage. PinHunt never handles payments, escrow or payment exchange
 * between collectors. Label purchase and in-trade tracking are planned
 * (B-P3-03, #75) and must stay under "Coming later" until they exist.
 */
export interface GuideSection {
  title: string;
  icon: 'message-circle' | 'package' | 'slash' | 'life-buoy' | 'clock';
  points: string[];
  /** Planned, not available yet. */
  comingLater?: boolean;
}

export const TRADING_SAFELY_INTRO =
  'PinHunt helps you find trades. You and the other collector agree the swap in chat, then each of you posts your own pins.';

export const TRADING_SAFELY_SECTIONS: GuideSection[] = [
  {
    title: 'Before you post',
    icon: 'message-circle',
    points: [
      'Agree the trade in chat, naming every pin, so you both have a record of the swap.',
      "Ask for clear photos of the actual pins, front and back, if you're unsure.",
      'Take your time. You can always say no to a trade.',
    ],
  },
  {
    title: 'Posting your pins',
    icon: 'package',
    points: [
      'Each of you posts your own pins and pays for your own postage.',
      'Use a tracked service and keep your receipt.',
      'Protect the pins with backing card and padding, in a padded envelope or small box.',
      'Photograph the pins and the packed parcel before you send it.',
      'Share your tracking number in the chat.',
    ],
  },
  {
    title: 'No payments through PinHunt',
    icon: 'slash',
    points: [
      'PinHunt never handles money between collectors. There are no payments, deposits or escrow in the app.',
      'Be careful if anyone asks you to pay to complete a trade.',
    ],
  },
  {
    title: 'If something goes wrong',
    icon: 'life-buoy',
    points: [
      'Talk to the other collector in the chat first.',
      'Keep your photos, receipts and tracking. They help if you need to contact the carrier.',
    ],
  },
  {
    title: 'Coming later',
    icon: 'clock',
    comingLater: true,
    points: [
      'Buy your own Royal Mail or InPost label from inside the trade.',
      'See tracking for both parcels in the trade.',
      "These are planned, depend on the carriers' services, and aren't available yet.",
    ],
  },
];

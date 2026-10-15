/**
 * The "which version am I running?" lines on About (#286): app version, and
 * for builds with EAS Update, which over-the-air update is running, on which
 * channel and native runtime. Pure, so it is easy to test; About passes in
 * the live values from expo-constants and expo-updates.
 */
export interface BuildInfoInput {
  version: string;
  /** expo-updates is active (false in Expo Go, dev and web). */
  updatesEnabled: boolean;
  /** Running the JS bundled into the build rather than a downloaded update. */
  isEmbeddedLaunch: boolean;
  updateId: string | null;
  channel: string | null;
  runtimeVersion: string | null;
  createdAt: Date | null;
}

const short = (id: string) => id.replace(/-/g, '').slice(0, 7);

function when(d: Date): string {
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
  return `${date}, ${time}`;
}

export function buildInfoLines(info: BuildInfoInput): string[] {
  const lines = [`Version ${info.version}`];
  if (!info.updatesEnabled) {
    lines.push('Development build (no over-the-air updates)');
    return lines;
  }
  if (info.isEmbeddedLaunch || !info.updateId) {
    lines.push('Update: none yet (running the installed build)');
  } else {
    lines.push(`Update ${short(info.updateId)}${info.createdAt ? ` · published ${when(info.createdAt)}` : ''}`);
  }
  const channel = info.channel ? `Channel ${info.channel}` : null;
  const runtime = info.runtimeVersion ? `runtime ${info.runtimeVersion.slice(0, 7)}` : null;
  if (channel || runtime) lines.push([channel, runtime].filter(Boolean).join(' · '));
  return lines;
}

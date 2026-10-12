// Demo mode must never activate in a build that has Supabase configured.

const ENV_KEYS = ['EXPO_PUBLIC_DEMO_MODE', 'EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY'] as const;
const saved = Object.fromEntries(ENV_KEYS.map(k => [k, process.env[k]]));

function loadWith(env: Partial<Record<(typeof ENV_KEYS)[number], string>>): boolean {
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, env);
  let value = false;
  jest.isolateModules(() => {
    // Only the configuration check matters here; never build a real client.
    jest.doMock('@supabase/supabase-js', () => ({ createClient: () => ({}) }));
    jest.doMock('@react-native-async-storage/async-storage', () => ({}));
    value = require('../demoMode').isDemoMode;
  });
  return value;
}

afterAll(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('isDemoMode', () => {
  it('is on with the flag and no Supabase configuration', () => {
    expect(loadWith({ EXPO_PUBLIC_DEMO_MODE: '1' })).toBe(true);
  });

  it('is off without the flag', () => {
    expect(loadWith({})).toBe(false);
  });

  it('is off whenever Supabase is configured, even with the flag set', () => {
    expect(loadWith({
      EXPO_PUBLIC_DEMO_MODE: '1',
      EXPO_PUBLIC_SUPABASE_URL: 'https://example-project-ref.supabase.co',
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'x'.repeat(40),
    })).toBe(false);
  });
});

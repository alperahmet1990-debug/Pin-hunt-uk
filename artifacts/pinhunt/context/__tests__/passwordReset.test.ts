import { sendPasswordReset, PASSWORD_RESET_REDIRECT } from '../AuthContext';
import { validateResetEmail } from '@/utils/validateEmail';

const mockReset = jest.fn();

jest.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: { resetPasswordForEmail: (...a: unknown[]) => mockReset(...a) },
  },
}));

beforeEach(() => mockReset.mockReset());

describe('validateResetEmail', () => {
  it('rejects empty and whitespace-only input', () => {
    expect(validateResetEmail('')).not.toBeNull();
    expect(validateResetEmail('   ')).not.toBeNull();
  });
  it('accepts an entered email', () => {
    expect(validateResetEmail(' a@b.co ')).toBeNull();
  });
});

describe('sendPasswordReset', () => {
  it('calls Supabase with the recovery redirect', async () => {
    mockReset.mockResolvedValue({ error: null });
    const res = await sendPasswordReset('a@b.co');
    expect(mockReset).toHaveBeenCalledWith('a@b.co', { redirectTo: PASSWORD_RESET_REDIRECT });
    expect(PASSWORD_RESET_REDIRECT).toBe('pinhunt://reset');
    expect(res).toEqual({ error: null });
  });

  it('returns the same neutral success when the email is not found', async () => {
    mockReset.mockResolvedValue({ error: { message: 'User not found' } });
    expect(await sendPasswordReset('nobody@b.co')).toEqual({ error: null });
  });

  it('maps other errors to a retry message, never the raw error', async () => {
    mockReset.mockResolvedValue({ error: { message: 'SMTP exploded: 500 {"internal":"x"}' } });
    const res = await sendPasswordReset('a@b.co');
    expect(res.error).toMatch(/try again/i);
    expect(res.error).not.toMatch(/SMTP|500|internal/);
  });

  it('handles thrown network errors', async () => {
    mockReset.mockRejectedValue(new Error('Network request failed'));
    const res = await sendPasswordReset('a@b.co');
    expect(res.error).toMatch(/try again/i);
  });
});

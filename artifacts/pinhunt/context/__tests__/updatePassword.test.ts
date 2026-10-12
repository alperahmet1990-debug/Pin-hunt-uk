import { updatePassword } from '../AuthContext';
import { validateNewPassword } from '@/utils/validatePassword';

const mockUpdate = jest.fn();

jest.mock('@/lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: {
    auth: { updateUser: (...a: unknown[]) => mockUpdate(...a) },
  },
}));

beforeEach(() => mockUpdate.mockReset());

describe('validateNewPassword', () => {
  it('rejects passwords shorter than 8 characters', () => {
    expect(validateNewPassword('short')).toBe('Password must be at least 8 characters.');
  });
  it('rejects a mismatched confirmation', () => {
    expect(validateNewPassword('longenough', 'different')).toBe('Passwords do not match.');
  });
  it('accepts a valid matching password', () => {
    expect(validateNewPassword('longenough', 'longenough')).toBeNull();
    expect(validateNewPassword('longenough')).toBeNull();
  });
});

describe('updatePassword', () => {
  it('calls Supabase updateUser and returns no error on success', async () => {
    mockUpdate.mockResolvedValue({ error: null });
    expect(await updatePassword('longenough')).toEqual({ error: null });
    expect(mockUpdate).toHaveBeenCalledWith({ password: 'longenough' });
  });

  it('maps failures to a fixed message, never the raw error or password', async () => {
    mockUpdate.mockResolvedValue({ error: { message: 'boom 500 {"internal":"x"} longenough' } });
    const res = await updatePassword('longenough');
    expect(res.error).toMatch(/try again/i);
    expect(res.error).not.toMatch(/boom|500|internal|longenough/);
  });

  it('reports an expired session without leaking details', async () => {
    mockUpdate.mockResolvedValue({ error: { message: 'Auth session missing!' } });
    const res = await updatePassword('longenough');
    expect(res.error).toMatch(/try again/i);
  });

  it('handles thrown network errors', async () => {
    mockUpdate.mockRejectedValue(new Error('Network request failed'));
    expect((await updatePassword('longenough')).error).toMatch(/try again/i);
  });
});

import { act, renderHook } from '@testing-library/react-native';
import { usePinSelection } from '../usePinSelection';

describe('usePinSelection (UX-022)', () => {
  it('starts off, toggles pins, and clears when stopped', async () => {
    const { result } = await renderHook(() => usePinSelection());
    expect(result.current.active).toBe(false);
    await act(async () => { result.current.start(); });
    await act(async () => { result.current.toggle('a'); });
    await act(async () => { result.current.toggle('b'); });
    await act(async () => { result.current.toggle('a'); });
    expect(result.current.active).toBe(true);
    expect([...result.current.selected]).toEqual(['b']);
    expect(result.current.count).toBe(1);
    await act(async () => { result.current.stop(); });
    expect(result.current.active).toBe(false);
    expect(result.current.count).toBe(0);
  });

  it('toggleAll selects everything given, or clears it when all are selected', async () => {
    const { result } = await renderHook(() => usePinSelection());
    await act(async () => { result.current.toggle('x'); });
    await act(async () => { result.current.toggleAll(['a', 'b']); });
    expect(result.current.allSelected(['a', 'b'])).toBe(true);
    expect(result.current.has('x')).toBe(true);
    await act(async () => { result.current.toggleAll(['a', 'b']); });
    expect([...result.current.selected]).toEqual(['x']);
    expect(result.current.allSelected([])).toBe(false);
  });
});

import { renderHook } from '@testing-library/react-native';
import { useColorScheme } from 'react-native';
import colors from '../../constants/colors';
import { useColors } from '../useColors';

jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({ __esModule: true, default: jest.fn() }));

describe('useColors (UX-038a)', () => {
  it.each(['light', 'dark'] as const)('%s: keeps every existing token and adds semantic `tokens`', async scheme => {
    (useColorScheme as jest.Mock).mockReturnValue(scheme);
    const { result } = await renderHook(() => useColors());
    expect(result.current.homeCoral).toBe(colors[scheme].homeCoral);
    expect(result.current.radius).toBe(colors.radius);
    expect(result.current.tokens.action.primary).toBe(colors[scheme].homeCoral);
    expect(result.current.tokens.bg.canvas).toBe(colors[scheme].homeBackground);
  });
});

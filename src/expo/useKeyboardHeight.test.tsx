import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emitKeyboard, keyboardListenerCount, resetNativeMock } from './testing/reactNativeMock';
import { useKeyboardHeight } from './useKeyboardHeight';

vi.mock('react-native', async () => (await import('./testing/reactNativeMock')).reactNativeModule);

beforeEach(resetNativeMock);

describe('useKeyboardHeight', () => {
    it('is 0 while the keyboard is hidden', () => {
        const { result } = renderHook(useKeyboardHeight);

        expect(result.current).toBe(0);
    });

    it.each([
        ['iOS', 'keyboardWillShow', 'keyboardWillHide'],
        ['Android', 'keyboardDidShow', 'keyboardDidHide'],
    ] as const)('follows the %s events', (_platform, show, hide) => {
        const { result } = renderHook(useKeyboardHeight);

        act(() => emitKeyboard(show, 336));
        expect(result.current).toBe(336);

        act(() => emitKeyboard(hide));
        expect(result.current).toBe(0);
    });

    it('takes the latest height when the keyboard resizes', () => {
        const { result } = renderHook(useKeyboardHeight);

        act(() => emitKeyboard('keyboardDidShow', 300));
        act(() => emitKeyboard('keyboardDidShow', 420));

        expect(result.current).toBe(420);
    });

    it('stops listening on unmount', () => {
        const { unmount } = renderHook(useKeyboardHeight);
        expect(keyboardListenerCount()).toBe(4);

        unmount();

        expect(keyboardListenerCount()).toBe(0);
    });
});

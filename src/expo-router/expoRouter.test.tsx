import { render, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeSource } from '../core/fixtures';
import { resetNativeMock, setWindow } from '../expo/testing/reactNativeMock';
import { ExpoSaparProvider } from './ExpoSaparProvider';
import { useExpoRouterAdapter } from './useExpoRouterAdapter';

vi.mock('react-native', async () => (await import('../expo/testing/reactNativeMock')).reactNativeModule);
vi.mock('react-native-svg', async () => (await import('../expo/testing/reactNativeMock')).svgModule);

const navigation = vi.hoisted(() => ({ pathname: '/billing', push: vi.fn() }));

vi.mock('expo-router', () => ({
    usePathname: () => navigation.pathname,
    useRouter: () => ({ push: navigation.push }),
}));

beforeEach(() => {
    resetNativeMock();
    navigation.pathname = '/billing';
    navigation.push = vi.fn();
});

afterEach(() => vi.restoreAllMocks());

describe('useExpoRouterAdapter', () => {
    it('keeps its identity while reading the latest pathname and router', async () => {
        const { result, rerender } = renderHook(() => useExpoRouterAdapter());
        const adapter = result.current;
        expect(adapter.currentRoute()).toBe('/billing');

        navigation.pathname = '/settings';
        const push = vi.fn();
        navigation.push = push;
        rerender();

        expect(result.current).toBe(adapter);
        expect(adapter.currentRoute()).toBe('/settings');
        await adapter.navigate('/team');
        expect(push).toHaveBeenCalledWith('/team');
    });

    it('is a native adapter that takes its options on first render', () => {
        setWindow(600, 900);
        const { result } = renderHook(() => useExpoRouterAdapter({ compactBreakpointPx: 500 }));

        expect(result.current.platform).toBe('native');
        expect(result.current.isCompact()).toBe(false);
    });
});

describe('ExpoSaparProvider', () => {
    const renderProvider = (props: { disableRouteTriggers?: boolean }) => {
        const source = makeSource();
        const Wrapper = ({ children }: { children: ReactNode }) => (
            <ExpoSaparProvider source={source} {...props}>
                {children}
            </ExpoSaparProvider>
        );
        render(<Wrapper>content</Wrapper>);
        return source;
    };

    it('reports the pathname as the route, on the native platform', async () => {
        const source = renderProvider({});

        await waitFor(() => expect(source.getInbox).toHaveBeenCalledWith({ route: '/billing', platform: 'native' }));
    });

    it('reports no route when route triggers are disabled', async () => {
        const source = renderProvider({ disableRouteTriggers: true });

        await waitFor(() => expect(source.getInbox).toHaveBeenCalledWith({ route: undefined, platform: 'native' }));
    });
});

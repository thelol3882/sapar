import { render, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeSource } from '../core/fixtures';
import { NextSaparProvider } from './NextSaparProvider';
import { useNextSaparAdapter } from './useNextSaparAdapter';

const navigation = vi.hoisted(() => ({ pathname: '/billing', push: vi.fn() }));

vi.mock('next/navigation', () => ({
    usePathname: () => navigation.pathname,
    useRouter: () => ({ push: navigation.push }),
}));

beforeEach(() => {
    navigation.pathname = '/billing';
    navigation.push = vi.fn();
});

afterEach(() => vi.restoreAllMocks());

describe('useNextSaparAdapter', () => {
    it('keeps its identity while reading the latest pathname and router', async () => {
        const { result, rerender } = renderHook(() => useNextSaparAdapter());
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
});

describe('NextSaparProvider', () => {
    const renderProvider = (props: { disableRouteTriggers?: boolean }) => {
        const source = makeSource();
        const Wrapper = ({ children }: { children: ReactNode }) => (
            <NextSaparProvider source={source} {...props}>
                {children}
            </NextSaparProvider>
        );
        render(<Wrapper>content</Wrapper>);
        return source;
    };

    it('reports the pathname as the route', async () => {
        const source = renderProvider({});
        await waitFor(() => expect(source.getInbox).toHaveBeenCalledWith({ route: '/billing', platform: 'web' }));
    });

    it('reports no route when route triggers are disabled', async () => {
        const source = renderProvider({ disableRouteTriggers: true });
        await waitFor(() => expect(source.getInbox).toHaveBeenCalledWith({ route: undefined, platform: 'web' }));
    });
});

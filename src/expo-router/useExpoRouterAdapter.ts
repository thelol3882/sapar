import { usePathname, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import type { PlatformAdapter } from '../core';
import { createExpoAdapter, type ExpoAdapterOptions } from '../expo';

export type ExpoRouterAdapterOptions = Pick<ExpoAdapterOptions, 'compactBreakpointPx' | 'session'>;

/** Identity never changes; `options` are read on first render only. */
export function useExpoRouterAdapter(options: ExpoRouterAdapterOptions = {}): PlatformAdapter {
    const router = useRouter();
    const pathname = usePathname();
    const latest = useRef({ router, pathname });
    useEffect(() => {
        latest.current = { router, pathname };
    });

    const [adapter] = useState(() =>
        createExpoAdapter({
            ...options,
            navigate: (route) => latest.current.router.push(route),
            currentRoute: () => latest.current.pathname,
        }),
    );
    return adapter;
}

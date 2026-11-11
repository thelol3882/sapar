'use client';

import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { createSaparController } from '../core';
import type { PlatformAdapter, SaparController, SaparControllerOptions } from '../core';
import { SaparContext } from './context';

interface CommonProps {
    children: ReactNode;
    /** Forwarded to the controller on change. Leave undefined to opt out of route triggers. */
    route?: string;
}

export type SaparProviderProps = CommonProps &
    (
        | { controller: SaparController; adapter?: PlatformAdapter }
        | ({ controller?: undefined } & SaparControllerOptions)
    );

function ControllerBoundary({
    controller,
    adapter,
    route,
    children,
}: CommonProps & { controller: SaparController; adapter: PlatformAdapter | undefined }) {
    useEffect(() => controller.setRoute(route), [controller, route]);
    const value = useMemo(() => ({ controller, adapter }), [controller, adapter]);
    return <SaparContext.Provider value={value}>{children}</SaparContext.Provider>;
}

// Destroys are deferred a microtask so StrictMode's simulated unmount/remount keeps the controller alive.
function useDestroyOnUnmount(controller: SaparController): void {
    const live = useRef<SaparController | null>(null);
    useEffect(() => {
        live.current = controller;
        return () => {
            live.current = null;
            queueMicrotask(() => {
                if (live.current !== controller) controller.destroy();
            });
        };
    }, [controller]);
}

function OwnedControllerProvider({ options, route, children }: CommonProps & { options: SaparControllerOptions }) {
    const { source, adapter } = options;
    // Only source and adapter identity recreate the controller; the other options are read at creation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const controller = useMemo(() => createSaparController(options), [source, adapter]);
    useDestroyOnUnmount(controller);
    return (
        <ControllerBoundary controller={controller} adapter={adapter} route={route}>
            {children}
        </ControllerBoundary>
    );
}

export function SaparProvider(props: SaparProviderProps) {
    if (props.controller) {
        const { controller, adapter, route, children } = props;
        return (
            <ControllerBoundary controller={controller} adapter={adapter} route={route}>
                {children}
            </ControllerBoundary>
        );
    }
    const { children, route, ...options } = props;
    return (
        <OwnedControllerProvider options={options} route={route}>
            {children}
        </OwnedControllerProvider>
    );
}

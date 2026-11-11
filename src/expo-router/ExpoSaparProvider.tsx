import { usePathname } from 'expo-router';
import type { ReactNode } from 'react';
import type { SaparControllerOptions } from '../core';
import { SaparProvider } from '../react';
import { useExpoRouterAdapter, type ExpoRouterAdapterOptions } from './useExpoRouterAdapter';

export interface ExpoSaparProviderProps extends Omit<SaparControllerOptions, 'adapter'> {
    children: ReactNode;
    /** Stop reporting route changes, so tours and announcements are never offered automatically. */
    disableRouteTriggers?: boolean;
    adapterOptions?: ExpoRouterAdapterOptions;
}

export function ExpoSaparProvider({
    children,
    disableRouteTriggers = false,
    adapterOptions,
    ...controllerOptions
}: ExpoSaparProviderProps) {
    const adapter = useExpoRouterAdapter(adapterOptions);
    const pathname = usePathname();

    return (
        <SaparProvider {...controllerOptions} adapter={adapter} route={disableRouteTriggers ? undefined : pathname}>
            {children}
        </SaparProvider>
    );
}

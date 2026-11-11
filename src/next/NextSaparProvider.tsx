'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import type { SaparControllerOptions } from '../core';
import { SaparProvider } from '../react';
import { useNextSaparAdapter, type NextSaparAdapterOptions } from './useNextSaparAdapter';

export interface NextSaparProviderProps extends Omit<SaparControllerOptions, 'adapter'> {
    children: ReactNode;
    /** Stop reporting route changes, so tours and announcements are never offered automatically. */
    disableRouteTriggers?: boolean;
    adapterOptions?: NextSaparAdapterOptions;
}

export function NextSaparProvider({
    children,
    disableRouteTriggers = false,
    adapterOptions,
    ...controllerOptions
}: NextSaparProviderProps) {
    const adapter = useNextSaparAdapter(adapterOptions);
    const pathname = usePathname();

    return (
        <SaparProvider {...controllerOptions} adapter={adapter} route={disableRouteTriggers ? undefined : pathname}>
            {children}
        </SaparProvider>
    );
}

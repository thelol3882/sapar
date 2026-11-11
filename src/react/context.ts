'use client';

import { createContext, useContext } from 'react';
import type { PlatformAdapter, SaparController } from '../core';

export interface SaparContextValue {
    controller: SaparController;
    /** Absent when the host passed a ready-made controller without telling us its adapter. */
    adapter: PlatformAdapter | undefined;
}

export const SaparContext = createContext<SaparContextValue | null>(null);

function useSaparContext(): SaparContextValue {
    const value = useContext(SaparContext);
    if (!value) throw new Error('Sapar hooks must be used inside <SaparProvider> (or <NextSaparProvider>).');
    return value;
}

export function useSaparController(): SaparController {
    return useSaparContext().controller;
}

export function useSaparAdapter(): PlatformAdapter | undefined {
    return useSaparContext().adapter;
}

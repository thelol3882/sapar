'use client';

import { useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const subscribeNever = (): (() => void) => () => {};

/** Renders nothing on the server and during hydration, then portals into `document.body`. */
export function BodyPortal({ children }: { children: ReactNode }) {
    const isClient = useSyncExternalStore(subscribeNever, () => true, () => false);
    return isClient ? createPortal(children, document.body) : null;
}

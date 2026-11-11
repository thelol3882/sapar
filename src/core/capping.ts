import type { PlatformAdapter } from './types';

export const SESSION_CAP_KEY = 'sapar.session-interruption-spent';

export function hasSpentSessionInterruption(adapter: PlatformAdapter): boolean {
    return adapter.session.get(SESSION_CAP_KEY) !== null;
}

export function spendSessionInterruption(adapter: PlatformAdapter): void {
    adapter.session.set(SESSION_CAP_KEY, String(adapter.now()));
}

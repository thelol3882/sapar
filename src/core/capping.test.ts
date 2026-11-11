import { describe, expect, it } from 'vitest';
import { SESSION_CAP_KEY, hasSpentSessionInterruption, spendSessionInterruption } from './capping';
import { createTestAdapter } from './testing';

describe('session cap', () => {
    it('is unspent until spent, then stays spent', () => {
        const adapter = createTestAdapter({ now: 1234 });

        expect(hasSpentSessionInterruption(adapter)).toBe(false);
        spendSessionInterruption(adapter);

        expect(hasSpentSessionInterruption(adapter)).toBe(true);
        expect(adapter.sessionValues.get(SESSION_CAP_KEY)).toBe('1234');
    });

    it('is per session store', () => {
        const spent = createTestAdapter();
        spendSessionInterruption(spent);

        expect(hasSpentSessionInterruption(createTestAdapter())).toBe(false);
    });
});

import { describe, expect, it, vi } from 'vitest';
import { createSaparController } from './controller';
import { hasSpentSessionInterruption } from './capping';
import { defineTour } from './define';
import { flush } from './fixtures';
import { memorySource } from './sources/memory';
import { memoryStore } from './stores';
import { createTestAdapter } from './testing';
import type { KeyValueStore } from './types';

const HOUR_MS = 60 * 60 * 1000;
const FIRST_START_MS = Date.parse('2026-06-01T09:00:00Z');

const tours = ['intro', 'tips'].map((key) =>
    defineTour({ key, title: key, trigger: { route: '/home' }, steps: [{ key: 'only', title: 'Only', body: 'Body' }] }),
);

// One call is one app launch: a new adapter (so a new session) and a new source over the same persistent store.
function launchApp(storage: KeyValueStore, now: number) {
    const adapter = createTestAdapter({ now });
    const source = memorySource({ tours, storage, registeredAt: '2025-01-01T00:00:00Z', now: () => adapter.now() });
    const controller = createSaparController({ source, adapter, onError: vi.fn() });
    return { adapter, controller };
}

async function openHome(controller: ReturnType<typeof launchApp>['controller']): Promise<void> {
    controller.setRoute('/home');
    await flush();
}

const offeredTourKey = (controller: ReturnType<typeof launchApp>['controller']) => {
    const interruption = controller.getSnapshot().inbox?.interruption;
    return interruption?.kind === 'tour' ? interruption.tour.key : null;
};

async function completeAutoStartedIntro(storage: KeyValueStore) {
    const app = launchApp(storage, FIRST_START_MS);
    await openHome(app.controller);
    await vi.waitFor(() => expect(app.controller.getSnapshot().runner).toMatchObject({ phase: 'running', autoStarted: true }));
    await app.controller.next();
    await flush();
    return app;
}

describe('a second app start', () => {
    it('spends the session cap in the first launch only', async () => {
        const storage = memoryStore();
        const first = await completeAutoStartedIntro(storage);
        const second = launchApp(storage, FIRST_START_MS + 25 * HOUR_MS);

        expect(hasSpentSessionInterruption(first.adapter)).toBe(true);
        expect(hasSpentSessionInterruption(second.adapter)).toBe(false);
        await openHome(second.controller);
        expect(offeredTourKey(second.controller)).toBe('tips');
    });

    it('keeps the cooldown that an automatic start began', async () => {
        const storage = memoryStore();
        await completeAutoStartedIntro(storage);

        const soon = launchApp(storage, FIRST_START_MS + HOUR_MS);
        await openHome(soon.controller);
        expect(offeredTourKey(soon.controller)).toBeNull();

        const later = launchApp(storage, FIRST_START_MS + 25 * HOUR_MS);
        await openHome(later.controller);
        expect(offeredTourKey(later.controller)).toBe('tips');
    });

    it('never offers a completed tour again', async () => {
        const storage = memoryStore();
        await completeAutoStartedIntro(storage);

        const later = launchApp(storage, FIRST_START_MS + 90 * 24 * HOUR_MS);
        await openHome(later.controller);

        expect(offeredTourKey(later.controller)).toBe('tips');
        await vi.waitFor(() => expect(later.controller.getSnapshot().runner.tour?.key).toBe('tips'));
        await later.controller.next();
        await flush();

        const afterBoth = launchApp(storage, FIRST_START_MS + 180 * 24 * HOUR_MS);
        await openHome(afterBoth.controller);
        expect(offeredTourKey(afterBoth.controller)).toBeNull();
    });
});

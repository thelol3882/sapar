import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWebAdapter } from './adapter';
import { registerAnchor } from './registry';

const cleanups: Array<() => void> = [];

function mountAnchor(key: string, rect: Partial<DOMRect> = {}): HTMLElement {
    const element = document.createElement('button');
    element.getBoundingClientRect = () => ({ left: 0, top: 0, width: 0, height: 0, ...rect }) as DOMRect;
    document.body.append(element);
    cleanups.push(registerAnchor(key, element), () => element.remove());
    return element;
}

const adapter = (overrides: Partial<Parameters<typeof createWebAdapter>[0]> = {}) =>
    createWebAdapter({ navigate: vi.fn(), currentRoute: () => '/home', ...overrides });

afterEach(() => {
    cleanups.splice(0).forEach((cleanup) => cleanup());
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe('resolveAnchor', () => {
    it('resolves a handle for a mounted anchor', async () => {
        mountAnchor('a.here');
        const handle = await adapter().resolveAnchor('a.here', { timeoutMs: 100 });
        expect(handle?.key).toBe('a.here');
    });

    it('waits for an anchor that mounts later', async () => {
        const pending = adapter().resolveAnchor('a.soon', { timeoutMs: 1000 });
        mountAnchor('a.soon');
        await expect(pending).resolves.toMatchObject({ key: 'a.soon' });
    });

    it('resolves null after the timeout instead of rejecting', async () => {
        vi.useFakeTimers();
        const pending = adapter().resolveAnchor('a.never', { timeoutMs: 200 });
        await vi.advanceTimersByTimeAsync(200);
        await expect(pending).resolves.toBeNull();
    });
});

describe('anchor handle', () => {
    it('measures the element currently registered, even after a remount', async () => {
        const first = mountAnchor('a.move', { left: 1, top: 2, width: 3, height: 4 });
        const handle = await adapter().resolveAnchor('a.move', { timeoutMs: 100 });
        expect(await handle?.measure()).toEqual({ x: 1, y: 2, width: 3, height: 4 });

        first.remove();
        mountAnchor('a.move', { left: 10, top: 20, width: 30, height: 40 });

        expect(await handle?.measure()).toEqual({ x: 10, y: 20, width: 30, height: 40 });
    });

    it('measures null once the element is detached', async () => {
        const element = mountAnchor('a.gone');
        const handle = await adapter().resolveAnchor('a.gone', { timeoutMs: 100 });
        element.remove();
        expect(await handle?.measure()).toBeNull();
    });

    it('reports presses on the current element until unsubscribed', async () => {
        const element = mountAnchor('a.press');
        const handle = await adapter().resolveAnchor('a.press', { timeoutMs: 100 });
        const listener = vi.fn();

        const unsubscribe = handle?.onPress(listener);
        element.click();
        unsubscribe?.();
        element.click();

        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('keeps reporting presses after the element is remounted', async () => {
        const first = mountAnchor('a.remount');
        const handle = await adapter().resolveAnchor('a.remount', { timeoutMs: 100 });
        const listener = vi.fn();
        const unsubscribe = handle?.onPress(listener);

        first.remove();
        mountAnchor('a.remount').click();
        unsubscribe?.();

        expect(listener).toHaveBeenCalledTimes(1);
    });
});

describe('scrollIntoView', () => {
    it.each([
        [true, 'instant'],
        [false, 'smooth'],
    ])('with reducedMotion=%s scrolls %s', async (reducedMotion, behavior) => {
        const element = mountAnchor('a.scroll');
        const scroll = vi.fn();
        element.scrollIntoView = scroll;
        const web = adapter();
        const handle = await web.resolveAnchor('a.scroll', { timeoutMs: 100 });

        await web.scrollIntoView(handle!, { reducedMotion });

        expect(scroll).toHaveBeenCalledWith(expect.objectContaining({ behavior }));
    });

    it('gives up waiting for an element that never stops moving', async () => {
        vi.useFakeTimers();
        const element = mountAnchor('a.drift');
        let top = 0;
        element.getBoundingClientRect = () => ({ left: 0, top: top++ }) as DOMRect;
        element.scrollIntoView = vi.fn();
        const web = adapter();
        const handle = await web.resolveAnchor('a.drift', { timeoutMs: 100 });

        const settled = vi.fn();
        void web.scrollIntoView(handle!, { reducedMotion: false }).then(settled);
        await vi.advanceTimersByTimeAsync(500);
        expect(settled).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(600);

        expect(settled).toHaveBeenCalled();
    });
});

describe('navigate', () => {
    it('awaits the host navigation and then one animation frame', async () => {
        const frames: FrameRequestCallback[] = [];
        vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => frames.push(callback));
        const navigate = vi.fn(async () => {});
        const done = vi.fn();

        void adapter({ navigate }).navigate('/billing').then(done);
        await Promise.resolve();
        await Promise.resolve();

        expect(navigate).toHaveBeenCalledWith('/billing');
        expect(frames).toHaveLength(1);
        expect(done).not.toHaveBeenCalled();

        frames[0]?.(0);
        await vi.waitFor(() => expect(done).toHaveBeenCalled());
    });
});

describe('environment', () => {
    it('is a web adapter reading the host route', () => {
        const web = adapter({ currentRoute: () => '/ru/billing' });
        expect(web.platform).toBe('web');
        expect(web.currentRoute()).toBe('/ru/billing');
    });

    it('is compact below the breakpoint', () => {
        vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(500);
        expect(adapter().isCompact()).toBe(true);
        expect(adapter({ compactBreakpointPx: 400 }).isCompact()).toBe(false);
    });

    it('reads reduced motion from matchMedia', () => {
        vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList);
        expect(adapter().prefersReducedMotion()).toBe(true);
    });

    it('stores session values, falling back to memory when sessionStorage is blocked', () => {
        vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
            throw new DOMException('blocked', 'SecurityError');
        });
        const { session } = adapter();

        session.set('cap', '1');

        expect(session.get('cap')).toBe('1');
    });
});

import type { ContainerMeasurement } from './scrollContainer';
import type { RegisteredAnchor } from './registry';

const SCROLL_SETTLE_MS = 350;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export function centeredOffset({ offsetY, height, viewportHeight }: ContainerMeasurement): number {
    return Math.max(0, offsetY - (viewportHeight - height) / 2);
}

/** Centres the anchor in its scroll container. A native animated scroll reports no end, so wait a fixed moment. */
export async function scrollAnchorIntoView({ instance, container }: RegisteredAnchor, reducedMotion: boolean): Promise<void> {
    const measurement = await container?.measure(instance);
    if (!container || !measurement) return;

    const animated = !reducedMotion;
    container.scrollToOffset(centeredOffset(measurement), animated);
    if (animated) await delay(SCROLL_SETTLE_MS);
}

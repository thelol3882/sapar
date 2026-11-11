import type { AnchorRect } from './types';

export interface SpotlightPathInput {
    /** Null dims the whole window. */
    rect: AnchorRect | null;
    padding: number;
    radius: number;
    bounds: { width: number; height: number };
}

function roundedRectPath(x: number, y: number, width: number, height: number, requestedRadius: number): string {
    const r = Math.max(0, Math.min(requestedRadius, width / 2, height / 2));
    return [
        `M${x + r},${y}`,
        `H${x + width - r}`,
        `A${r},${r} 0 0 1 ${x + width},${y + r}`,
        `V${y + height - r}`,
        `A${r},${r} 0 0 1 ${x + width - r},${y + height}`,
        `H${x + r}`,
        `A${r},${r} 0 0 1 ${x},${y + height - r}`,
        `V${y + r}`,
        `A${r},${r} 0 0 1 ${x + r},${y}`,
        'Z',
    ].join(' ');
}

/** The bounds with a rounded hole around `rect`; fill it with the even-odd rule so the hole stays click-through. */
export function spotlightPath({ rect, padding, radius, bounds }: SpotlightPathInput): string {
    const outer = `M0,0 H${bounds.width} V${bounds.height} H0 Z`;
    if (!rect) return outer;

    const cutout = roundedRectPath(rect.x - padding, rect.y - padding, rect.width + padding * 2, rect.height + padding * 2, radius);
    return `${outer} ${cutout}`;
}

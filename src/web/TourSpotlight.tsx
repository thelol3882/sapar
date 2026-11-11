'use client';

import type { CSSProperties } from 'react';
import { spotlightPath } from '../core';
import { useTourStep } from '../react';
import { flag } from './dataAttributes';
import { useReducedMotion } from './environment';
import { BodyPortal } from './BodyPortal';
import { useAnchorElement } from './useAnchorElement';
import { useElementRect } from './useElementRect';

// Larger than any viewport, so the dim layer never needs the window size.
const PAGE_BOUNDS = { width: 100_000, height: 100_000 };
const DEFAULT_RADIUS = 8;
const TRANSITION_MS = 150;

export interface TourSpotlightProps {
    /** Colours the dim layer through `currentColor`, e.g. `text-black/50` (or `style.color`). */
    className?: string;
    style?: CSSProperties;
    /** Corner radius of the cutout in px. */
    radius?: number;
    /** Called when the dim layer is clicked. Defaults to skipping the tour. */
    onClickOutside?: () => void;
}

function Spotlight({
    anchor,
    padding,
    onClickOutside,
    className,
    style,
    radius = DEFAULT_RADIUS,
}: TourSpotlightProps & { anchor: string | undefined; padding: number; onClickOutside: () => void }) {
    const element = useAnchorElement(anchor);
    const rect = useElementRect(element);
    const reducedMotion = useReducedMotion();

    return (
        <svg
            aria-hidden="true"
            className={className}
            color="rgb(0 0 0 / 0.5)"
            data-centered={flag(rect === null)}
            style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', ...style }}
        >
            {/* The hole is unpainted, so clicks inside it reach the real element underneath. */}
            <path
                d={spotlightPath({ rect, padding, radius, bounds: PAGE_BOUNDS })}
                fill="currentColor"
                fillRule="evenodd"
                onClick={onClickOutside}
                style={{
                    pointerEvents: 'auto',
                    transitionProperty: reducedMotion ? 'none' : 'd',
                    transitionDuration: `${TRANSITION_MS}ms`,
                }}
            />
        </svg>
    );
}

export function TourSpotlight({ onClickOutside, ...rest }: TourSpotlightProps) {
    const tourStep = useTourStep();
    if (!tourStep) return null;

    return (
        <BodyPortal>
            <Spotlight
                {...rest}
                anchor={tourStep.step.anchor}
                padding={tourStep.step.padding}
                onClickOutside={onClickOutside ?? tourStep.skip}
            />
        </BodyPortal>
    );
}

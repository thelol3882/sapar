'use client';

import type { CSSProperties, ReactNode } from 'react';
import { useTourStep, type TourStepState } from '../react';
import { TourPopover, type TourPopoverProps } from './TourPopover';
import { TourSpotlight } from './TourSpotlight';

export interface TourOverlayProps extends Pick<TourPopoverProps, 'presentation'> {
    spotlightClassName?: string;
    spotlightStyle?: CSSProperties;
    popoverClassName?: string;
    popoverStyle?: CSSProperties;
    onClickOutside?: () => void;
    /** The step card, either directly or built from the running step. */
    children: ReactNode | ((tourStep: TourStepState) => ReactNode);
}

export function TourOverlay({
    spotlightClassName,
    spotlightStyle,
    popoverClassName,
    popoverStyle,
    onClickOutside,
    presentation,
    children,
}: TourOverlayProps) {
    const tourStep = useTourStep();
    if (!tourStep) return null;

    return (
        <>
            <TourSpotlight className={spotlightClassName} style={spotlightStyle} onClickOutside={onClickOutside} />
            <TourPopover className={popoverClassName} style={popoverStyle} presentation={presentation}>
                {typeof children === 'function' ? children(tourStep) : children}
            </TourPopover>
        </>
    );
}

'use client';

import { autoUpdate, flip, offset as offsetBy, shift, useFloating } from '@floating-ui/react-dom';
import type { CSSProperties, ReactNode } from 'react';
import { resolvePresentation, type Presentation, type Placement } from '../core';
import { useTourStep } from '../react';
import { BodyPortal } from './BodyPortal';
import { flag } from './dataAttributes';
import { useIsCompact } from './environment';
import { useAnchorElement } from './useAnchorElement';

const DEFAULT_OFFSET_PX = 12;
const VIEWPORT_PADDING_PX = 8;

const SHEET_STYLE: CSSProperties = { position: 'fixed', left: 0, right: 0, bottom: 0 };
const CENTERED_STYLE: CSSProperties = { position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };

export interface TourPopoverProps {
    className?: string;
    style?: CSSProperties;
    /** Gap in px between the anchor and the popover. */
    offset?: number;
    /**
     * `'anchored'` puts the popover next to the anchor (centred without one), `'sheet'` is a bottom sheet, and
     * `'auto'` is a sheet on viewports narrower than the adapter's `compactBreakpointPx` (default 768). Default `'auto'`.
     */
    presentation?: Presentation;
    children?: ReactNode;
}

function Popover({
    anchor,
    placement,
    offset = DEFAULT_OFFSET_PX,
    presentation = 'auto',
    className,
    style,
    children,
}: TourPopoverProps & { anchor: string | undefined; placement: Placement }) {
    const element = useAnchorElement(anchor);
    const compact = useIsCompact();
    const sheet = resolvePresentation({ presentation, compact, fits: undefined }) === 'sheet';
    const centered = element === null;
    const anchored = !sheet && !centered;

    const floating = useFloating({
        placement: placement === 'auto' ? 'bottom' : placement,
        strategy: 'fixed',
        elements: { reference: anchored ? element : null },
        middleware: [offsetBy(offset), flip(), shift({ padding: VIEWPORT_PADDING_PX })],
        whileElementsMounted: autoUpdate,
    });

    const layout = sheet ? SHEET_STYLE : centered ? CENTERED_STYLE : floating.floatingStyles;

    return (
        <div
            ref={floating.refs.setFloating}
            className={className}
            style={{ ...layout, ...style }}
            data-placement={anchored ? floating.placement : undefined}
            data-presentation={sheet ? 'sheet' : 'anchored'}
            data-compact={flag(sheet)}
            data-centered={flag(centered)}
        >
            {children}
        </div>
    );
}

export function TourPopover(props: TourPopoverProps) {
    const tourStep = useTourStep();
    if (!tourStep) return null;

    return (
        <BodyPortal>
            <Popover {...props} anchor={tourStep.step.anchor} placement={tourStep.step.placement} />
        </BodyPortal>
    );
}

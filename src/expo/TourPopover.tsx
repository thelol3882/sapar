import { useCallback, useState, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import { resolvePresentation, type Presentation, type AnchorRect, type Placement } from '../core';
import { useTourStep } from '../react';
import { computeCardPosition, type CardPosition, type Insets, type Size } from './cardPosition';
import { useAnchorRect } from './useAnchorRect';
import { useIsCompact } from './useIsCompact';
import { useKeyboardHeight } from './useKeyboardHeight';

const DEFAULT_OFFSET_PX = 12;
const KEYBOARD_GAP_PX = 8;
const DEFAULT_INSETS: Insets = { top: 8, right: 8, bottom: 8, left: 8 };

const styles = StyleSheet.create({
    centered: { ...StyleSheet.absoluteFill, justifyContent: 'center', alignItems: 'center' },
    sheet: { position: 'absolute', left: 0, right: 0, bottom: 0 },
    // Positioned by transform so the card is measured at its natural width wherever it ends up.
    anchored: { position: 'absolute', top: 0, left: 0 },
    hidden: { opacity: 0 },
});

export interface TourPopoverProps {
    style?: StyleProp<ViewStyle>;
    /** Gap between the anchor and the card. */
    offset?: number;
    /** Space kept clear at the window edges; pass the safe-area insets and any tab bar height. Default 8 each. */
    insets?: Partial<Insets>;
    /**
     * `'anchored'` puts the card next to the anchor (centred without one), `'sheet'` is a bottom sheet, and
     * `'auto'` is anchored unless the card does not fit beside the anchor or the window is narrower than the
     * adapter's `compactBreakpointPx`. Default `'auto'`.
     */
    presentation?: Presentation;
    children?: ReactNode;
}

type SurfaceProps = Pick<TourPopoverProps, 'style' | 'children'> & { insets: Insets };

const paddingFor = ({ top, right, bottom, left }: Insets): ViewStyle => ({
    paddingTop: top,
    paddingRight: right,
    paddingBottom: bottom,
    paddingLeft: left,
});

function Sheet({ insets, style, children }: SurfaceProps) {
    return (
        <View pointerEvents="box-none" style={[styles.sheet, paddingFor({ ...insets, top: 0 }), style]}>
            {children}
        </View>
    );
}

function CenteredCard({ insets, style, children }: SurfaceProps) {
    return (
        <View pointerEvents="box-none" style={[styles.centered, paddingFor(insets), style]}>
            {children}
        </View>
    );
}

interface AnchoredCardProps extends Pick<SurfaceProps, 'style' | 'children'> {
    position: CardPosition | null;
    onLayout: (event: LayoutChangeEvent) => void;
}

function AnchoredCard({ position, onLayout, style, children }: AnchoredCardProps) {
    const transform = position ? [{ translateX: position.x }, { translateY: position.y }] : undefined;

    return (
        <View onLayout={onLayout} style={[styles.anchored, { transform }, !position && styles.hidden, style]}>
            {children}
        </View>
    );
}

interface PopoverProps extends Required<Pick<TourPopoverProps, 'offset' | 'presentation'>>, Pick<SurfaceProps, 'style' | 'children'> {
    rect: AnchorRect | null;
    placement: Placement;
    insets: Insets;
}

// The card is measured only while anchored, so a sheet keeps the size it had there and can return once it fits again.
function Popover({ rect, placement, offset, presentation, insets, ...appearance }: PopoverProps) {
    const compact = useIsCompact();
    const window = useWindowDimensions();
    const keyboardHeight = useKeyboardHeight();
    const [card, setCard] = useState<Size | null>(null);
    const handleLayout = useCallback(({ nativeEvent: { layout } }: LayoutChangeEvent) => {
        setCard((previous) =>
            previous?.width === layout.width && previous.height === layout.height
                ? previous
                : { width: layout.width, height: layout.height },
        );
    }, []);

    // The keyboard covers the tab bar and home indicator, so clear whichever reaches higher.
    const bottom = keyboardHeight > 0 ? Math.max(insets.bottom, keyboardHeight + KEYBOARD_GAP_PX) : insets.bottom;
    const clearedInsets = { ...insets, bottom };
    const position = card && computeCardPosition({ anchor: rect, card, window, placement, offset, insets: clearedInsets });

    switch (resolvePresentation({ presentation, compact, fits: position?.fits })) {
        case 'sheet':
            return <Sheet {...appearance} insets={clearedInsets} />;
        case 'anchored':
            return rect ? (
                <AnchoredCard {...appearance} position={position} onLayout={handleLayout} />
            ) : (
                <CenteredCard {...appearance} insets={clearedInsets} />
            );
    }
}

/** Render at the root after `TourSpotlight`. Sits next to the anchor, centred without one, and is a bottom sheet when it does not fit. */
export function TourPopover({ offset = DEFAULT_OFFSET_PX, insets, presentation = 'auto', ...rest }: TourPopoverProps) {
    const tourStep = useTourStep();
    const rect = useAnchorRect(tourStep?.handle ?? null);
    if (!tourStep) return null;

    return (
        <Popover
            {...rest}
            key={`${tourStep.tour.key}:${tourStep.step.key}`}
            placement={tourStep.step.placement}
            offset={offset}
            presentation={presentation}
            insets={{ ...DEFAULT_INSETS, ...insets }}
            rect={rect}
        />
    );
}

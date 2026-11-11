import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { useTourStep, type TourStepState } from '../react';
import { TourPopover, type TourPopoverProps } from './TourPopover';
import { TourSpotlight } from './TourSpotlight';
import { useHardwareBackSkip } from './useHardwareBackSkip';

export interface TourOverlayProps extends Pick<TourPopoverProps, 'insets' | 'presentation'> {
    spotlightColor?: string;
    spotlightStyle?: StyleProp<ViewStyle>;
    popoverStyle?: StyleProp<ViewStyle>;
    onClickOutside?: () => void;
    /** The step card, either directly or built from the running step. */
    children: ReactNode | ((tourStep: TourStepState) => ReactNode);
}

/** Render at the root, inside the provider and after the app content. The Android back button skips the tour. */
export function TourOverlay({ spotlightColor, spotlightStyle, popoverStyle, onClickOutside, insets, presentation, children }: TourOverlayProps) {
    const tourStep = useTourStep();
    useHardwareBackSkip(tourStep?.skip);
    if (!tourStep) return null;

    return (
        <>
            <TourSpotlight color={spotlightColor} style={spotlightStyle} onClickOutside={onClickOutside} />
            <TourPopover style={popoverStyle} insets={insets} presentation={presentation}>
                {typeof children === 'function' ? children(tourStep) : children}
            </TourPopover>
        </>
    );
}

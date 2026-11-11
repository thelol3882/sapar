import { StyleSheet, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { spotlightPath, type AnchorHandle } from '../core';
import { useTourStep } from '../react';
import { useAnchorRect } from './useAnchorRect';

const DEFAULT_COLOR = 'rgba(0, 0, 0, 0.5)';
const DEFAULT_RADIUS = 8;

export interface TourSpotlightProps {
    /** Colour of the dim layer. */
    color?: string;
    style?: StyleProp<ViewStyle>;
    /** Corner radius of the cutout. */
    radius?: number;
    /** Called when the dim layer is pressed. Defaults to skipping the tour. */
    onClickOutside?: () => void;
}

interface SpotlightProps extends TourSpotlightProps {
    handle: AnchorHandle | null;
    padding: number;
    onClickOutside: () => void;
}

function Spotlight({ handle, padding, onClickOutside, color = DEFAULT_COLOR, radius = DEFAULT_RADIUS, style }: SpotlightProps) {
    const rect = useAnchorRect(handle);
    const window = useWindowDimensions();

    return (
        <Svg
            width={window.width}
            height={window.height}
            style={[StyleSheet.absoluteFill, style]}
            pointerEvents="box-none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
        >
            {/* The hole is unpainted, so presses inside it reach the real element underneath. */}
            <Path d={spotlightPath({ rect, padding, radius, bounds: window })} fill={color} fillRule="evenodd" onPress={onClickOutside} />
        </Svg>
    );
}

/** Render at the root, inside the provider and after the app content, so it covers the screen. */
export function TourSpotlight({ onClickOutside, ...rest }: TourSpotlightProps) {
    const tourStep = useTourStep();
    if (!tourStep) return null;

    return (
        <Spotlight
            {...rest}
            handle={tourStep.handle}
            padding={tourStep.step.padding}
            onClickOutside={onClickOutside ?? tourStep.skip}
        />
    );
}

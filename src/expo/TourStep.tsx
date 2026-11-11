import { createContext, useContext, useEffect, type ReactNode } from 'react';
import {
    AccessibilityInfo,
    Pressable,
    Text,
    View,
    type GestureResponderEvent,
    type PressableProps,
    type StyleProp,
    type TextProps,
    type TextStyle,
    type ViewProps,
} from 'react-native';
import {
    defaultAnnounceStep,
    defaultProgress,
    useTourStep,
    type StepAnnouncement,
    type StepCount,
    type TourStepState,
} from '../react';

const TourStepContext = createContext<TourStepState | null>(null);

function useStepState(): TourStepState {
    const tourStep = useContext(TourStepContext);
    if (!tourStep) throw new Error('TourStep parts must be rendered inside <TourStep.Root>.');
    return tourStep;
}

export interface TourStepRootProps extends ViewProps {
    /** Text read by screen readers on each step change. */
    announceStep?: (step: StepAnnouncement) => string;
}

function Dialog({ tourStep, announceStep = defaultAnnounceStep, children, ...rest }: TourStepRootProps & { tourStep: TourStepState }) {
    const { step, position, total } = tourStep;

    // Keyed on the step alone: an inline `announceStep` has a new identity every render and would repeat itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => AccessibilityInfo.announceForAccessibility(announceStep({ position, total, title: step.title })), [step.key]);

    return (
        <TourStepContext.Provider value={tourStep}>
            <View {...rest} role="dialog" accessibilityViewIsModal={false}>
                {children}
            </View>
        </TourStepContext.Provider>
    );
}

function Root(props: TourStepRootProps) {
    const tourStep = useTourStep();
    return tourStep ? <Dialog {...props} tourStep={tourStep} /> : null;
}

function Title({ children, ...rest }: TextProps) {
    const { step } = useStepState();
    return (
        <Text role="heading" {...rest}>
            {children ?? step.title}
        </Text>
    );
}

function Body({ children, ...rest }: TextProps) {
    const { step } = useStepState();
    return <Text {...rest}>{children ?? step.body}</Text>;
}

export interface TourStepProgressProps extends Omit<TextProps, 'children'> {
    /** Defaults to `"{position} / {total}"`. */
    children?: ReactNode | ((count: StepCount) => ReactNode);
}

function Progress({ children, ...rest }: TourStepProgressProps) {
    const { position, total } = useStepState();
    const count = { position, total };
    const content = typeof children === 'function' ? children(count) : (children ?? defaultProgress(count));
    return <Text {...rest}>{content}</Text>;
}

export interface TourStepButtonProps extends Omit<PressableProps, 'children'> {
    children?: ReactNode;
    /** Styles the label; the button itself takes `style`, which may be a function of the pressed state. */
    textStyle?: StyleProp<TextStyle>;
}

function Button({ children, textStyle, ...rest }: TourStepButtonProps) {
    return (
        <Pressable role="button" {...rest}>
            <Text style={textStyle}>{children}</Text>
        </Pressable>
    );
}

function runThen(handler: PressableProps['onPress'], action: () => unknown) {
    return (event: GestureResponderEvent): void => {
        handler?.(event);
        void action();
    };
}

export interface TourStepNextProps extends TourStepButtonProps {
    /** Labels for the last step and the others. Ignored when `children` is given. */
    doneLabel?: ReactNode;
    nextLabel?: ReactNode;
    /** Steps that advance when the anchor is pressed hide this button unless set. */
    showOnPress?: boolean;
}

function Next({ doneLabel = 'Done', nextLabel = 'Next', showOnPress = false, children, onPress, ...rest }: TourStepNextProps) {
    const tourStep = useStepState();
    if (tourStep.step.advanceOn === 'press' && !showOnPress) return null;

    return (
        <Button {...rest} onPress={runThen(onPress, tourStep.next)}>
            {children ?? (tourStep.isLast ? doneLabel : nextLabel)}
        </Button>
    );
}

function Back({ children = 'Back', onPress, ...rest }: TourStepButtonProps) {
    const tourStep = useStepState();
    if (tourStep.isFirst) return null;

    return (
        <Button {...rest} onPress={runThen(onPress, tourStep.previous)}>
            {children}
        </Button>
    );
}

function Skip({ children = 'Skip', onPress, ...rest }: TourStepButtonProps) {
    const { skip } = useStepState();
    return (
        <Button {...rest} onPress={runThen(onPress, skip)}>
            {children}
        </Button>
    );
}

function Close({ children = '×', ...rest }: TourStepButtonProps) {
    return (
        <Skip accessibilityLabel="Close tour" {...rest}>
            {children}
        </Skip>
    );
}

export const TourStep = { Root, Title, Body, Progress, Next, Back, Skip, Close };

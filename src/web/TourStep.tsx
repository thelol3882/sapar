'use client';

import {
    createContext,
    useContext,
    useEffect,
    useId,
    useMemo,
    useRef,
    type ComponentPropsWithoutRef,
    type CSSProperties,
    type KeyboardEvent,
    type MouseEvent,
    type ReactElement,
    type ReactNode,
} from 'react';
import {
    defaultAnnounceStep,
    defaultProgress,
    useTourStep,
    type StepAnnouncement,
    type StepCount,
    type TourStepState,
} from '../react';
import { flag } from './dataAttributes';

interface StepParts {
    tourStep: TourStepState;
    titleId: string;
    bodyId: string;
}

const StepPartsContext = createContext<StepParts | null>(null);

function useStepParts(): StepParts {
    const parts = useContext(StepPartsContext);
    if (!parts) throw new Error('TourStep parts must be rendered inside <TourStep.Root>.');
    return parts;
}

const VISUALLY_HIDDEN: CSSProperties = {
    position: 'absolute',
    width: 1,
    height: 1,
    margin: -1,
    padding: 0,
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: 0,
};

export interface TourStepRootProps extends ComponentPropsWithoutRef<'div'> {
    /** Text read by screen readers on each step change. */
    announceStep?: (step: StepAnnouncement) => string;
}

function Dialog({
    tourStep,
    announceStep = defaultAnnounceStep,
    onKeyDown,
    children,
    ...rest
}: TourStepRootProps & { tourStep: TourStepState }) {
    const ref = useRef<HTMLDivElement>(null);
    const baseId = useId();
    const parts = useMemo(
        () => ({ tourStep, titleId: `${baseId}-title`, bodyId: `${baseId}-body` }),
        [tourStep, baseId],
    );
    const { step, position, total } = tourStep;

    useEffect(() => ref.current?.focus({ preventScroll: true }), [step.key]);

    function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
        onKeyDown?.(event);
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        tourStep.skip();
    }

    return (
        <StepPartsContext.Provider value={parts}>
            <div
                {...rest}
                ref={ref}
                role="dialog"
                aria-modal={false}
                aria-labelledby={parts.titleId}
                aria-describedby={parts.bodyId}
                tabIndex={-1}
                data-first={flag(tourStep.isFirst)}
                data-last={flag(tourStep.isLast)}
                onKeyDown={handleKeyDown}
            >
                <div aria-live="polite" style={VISUALLY_HIDDEN}>
                    {announceStep({ position, total, title: step.title })}
                </div>
                {children}
            </div>
        </StepPartsContext.Provider>
    );
}

function Root(props: TourStepRootProps) {
    const tourStep = useTourStep();
    return tourStep ? <Dialog {...props} tourStep={tourStep} /> : null;
}

function Title({ children, ...rest }: ComponentPropsWithoutRef<'h2'>) {
    const { tourStep, titleId } = useStepParts();
    return (
        <h2 {...rest} id={titleId}>
            {children ?? tourStep.step.title}
        </h2>
    );
}

function Body({ children, ...rest }: ComponentPropsWithoutRef<'p'>) {
    const { tourStep, bodyId } = useStepParts();
    return (
        <p {...rest} id={bodyId}>
            {children ?? tourStep.step.body}
        </p>
    );
}

export interface TourStepProgressProps extends Omit<ComponentPropsWithoutRef<'span'>, 'children'> {
    /** Defaults to `"{position} / {total}"`. */
    children?: ReactNode | ((count: StepCount) => ReactNode);
}

function Progress({ children, ...rest }: TourStepProgressProps) {
    const { position, total } = useStepParts().tourStep;
    const count = { position, total };
    const content = typeof children === 'function' ? children(count) : (children ?? defaultProgress(count));
    return <span {...rest}>{content}</span>;
}

type ButtonProps = ComponentPropsWithoutRef<'button'>;

export interface TourStepButtonProps extends ButtonProps {
    /** Renders your own button (a design-system component) with the wired-up props. */
    render?: (props: ButtonProps) => ReactElement;
}

function StepButton({ render, ...props }: TourStepButtonProps) {
    const buttonProps: ButtonProps = { type: 'button', ...props };
    return render ? render(buttonProps) : <button {...buttonProps} />;
}

function runThen(handler: ButtonProps['onClick'], action: () => unknown) {
    return (event: MouseEvent<HTMLButtonElement>): void => {
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

function Next({
    doneLabel = 'Done',
    nextLabel = 'Next',
    showOnPress = false,
    children,
    onClick,
    ...rest
}: TourStepNextProps) {
    const { tourStep } = useStepParts();
    if (tourStep.step.advanceOn === 'press' && !showOnPress) return null;

    return (
        <StepButton {...rest} onClick={runThen(onClick, tourStep.next)}>
            {children ?? (tourStep.isLast ? doneLabel : nextLabel)}
        </StepButton>
    );
}

function Back({ children = 'Back', onClick, ...rest }: TourStepButtonProps) {
    const { tourStep } = useStepParts();
    if (tourStep.isFirst) return null;

    return (
        <StepButton {...rest} onClick={runThen(onClick, tourStep.previous)}>
            {children}
        </StepButton>
    );
}

function Skip({ children = 'Skip', onClick, ...rest }: TourStepButtonProps) {
    const { tourStep } = useStepParts();
    return (
        <StepButton {...rest} onClick={runThen(onClick, tourStep.skip)}>
            {children}
        </StepButton>
    );
}

function Close({ children = '×', ...rest }: TourStepButtonProps) {
    return (
        <Skip aria-label="Close tour" {...rest}>
            {children}
        </Skip>
    );
}

export const TourStep = { Root, Title, Body, Progress, Next, Back, Skip, Close };

import { createContext, forwardRef, useCallback, useContext, useMemo, useRef, type ComponentRef } from 'react';
import { ScrollView, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewProps } from 'react-native';
import { assignRef } from './assignRef';
import { measureInWindow, measureLayout } from './measure';
import type { AnchorInstance } from './registry';

export interface ContainerMeasurement {
    /** Top edge of the anchor within the scrollable content. */
    offsetY: number;
    height: number;
    viewportHeight: number;
}

/** A vertically scrolling parent that tour anchors can be scrolled into view within. */
export interface ScrollContainer {
    measure(instance: AnchorInstance): Promise<ContainerMeasurement | null>;
    scrollToOffset(offsetY: number, animated: boolean): void;
    /** Calls `listener` at most once per frame while the user or the tour scrolls. */
    subscribeToScroll(listener: () => void): () => void;
}

interface ScrollEmitter {
    subscribe: ScrollContainer['subscribeToScroll'];
    emit(): void;
}

const SCROLL_EVENT_THROTTLE_MS = 16;

type ScrollViewInstance = ComponentRef<typeof ScrollView>;

const ScrollContainerContext = createContext<ScrollContainer | null>(null);

/** The nearest `TourScrollView` above the caller, if any. */
export function useTourScrollContainer(): ScrollContainer | null {
    return useContext(ScrollContainerContext);
}

function createScrollEmitter(): ScrollEmitter {
    const listeners = new Set<() => void>();
    let pendingFrame: number | null = null;

    return {
        subscribe(listener) {
            listeners.add(listener);
            return () => void listeners.delete(listener);
        },
        emit() {
            if (pendingFrame !== null) return;
            pendingFrame = requestAnimationFrame(() => {
                pendingFrame = null;
                [...listeners].forEach((listener) => listener());
            });
        },
    };
}

function createScrollContainer(getScrollView: () => ScrollViewInstance | null, emitter: ScrollEmitter): ScrollContainer {
    return {
        async measure(instance) {
            const scrollView = getScrollView();
            const content = scrollView?.getInnerViewRef();
            if (!scrollView || !content) return null;

            const [layout, viewport] = await Promise.all([measureLayout(instance, content), measureInWindow(scrollView)]);
            return layout && viewport ? { offsetY: layout.y, height: layout.height, viewportHeight: viewport.height } : null;
        },
        scrollToOffset: (offsetY, animated) => getScrollView()?.scrollTo({ y: offsetY, animated }),
        subscribeToScroll: emitter.subscribe,
    };
}

/** A drop-in `ScrollView` whose children's anchors can be scrolled into view by the tour. Vertical only. */
export const TourScrollView = forwardRef<ScrollViewInstance, ScrollViewProps>(function TourScrollView(props, forwardedRef) {
    const { onScroll } = props;
    const scrollViewRef = useRef<ScrollViewInstance | null>(null);
    const emitter = useMemo(createScrollEmitter, []);
    const container = useMemo(() => createScrollContainer(() => scrollViewRef.current, emitter), [emitter]);
    const handleScroll = useCallback(
        (event: NativeSyntheticEvent<NativeScrollEvent>) => {
            emitter.emit();
            onScroll?.(event);
        },
        [emitter, onScroll],
    );
    const setScrollView = useCallback(
        (node: ScrollViewInstance | null) => {
            scrollViewRef.current = node;
            assignRef(forwardedRef, node);
        },
        [forwardedRef],
    );

    return (
        <ScrollContainerContext.Provider value={container}>
            <ScrollView scrollEventThrottle={SCROLL_EVENT_THROTTLE_MS} {...props} onScroll={handleScroll} ref={setScrollView} />
        </ScrollContainerContext.Provider>
    );
});

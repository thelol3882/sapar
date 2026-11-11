// jsdom cannot load the real `react-native` (Flow syntax), so tests mock it with these DOM-backed stand-ins:
//   vi.mock('react-native', async () => (await import('./testing/reactNativeMock')).reactNativeModule);
//   vi.mock('react-native-svg', async () => (await import('./testing/reactNativeMock')).svgModule);
import { useCallback, useSyncExternalStore, type ReactNode, type Ref } from 'react';
import { vi } from 'vitest';
import type { AnchorRect } from '../../core';
import type { AnchorInstance } from '../registry';

type Style = unknown;
type Listener<Args extends unknown[]> = (...args: Args) => unknown;
type KeyboardEventName = 'keyboardWillShow' | 'keyboardDidShow' | 'keyboardWillHide' | 'keyboardDidHide';
interface KeyboardEventPayload {
    endCoordinates: { height: number };
}

export const nativeState = {
    window: { width: 400, height: 800 },
    reduceMotion: false,
    colorScheme: 'light' as 'light' | 'dark',
};

const windowListeners = new Set<Listener<[]>>();
const reduceMotionListeners = new Set<Listener<[boolean]>>();
const backHandlers: Array<Listener<[]>> = [];
const keyboardListeners = new Map<KeyboardEventName, Set<Listener<[KeyboardEventPayload]>>>();

export const announceForAccessibility = vi.fn();
export const openURL = vi.fn();

export function resetNativeMock(): void {
    nativeState.window = { width: 400, height: 800 };
    nativeState.reduceMotion = false;
    nativeState.colorScheme = 'light';
    windowListeners.clear();
    reduceMotionListeners.clear();
    backHandlers.length = 0;
    keyboardListeners.clear();
    announceForAccessibility.mockClear();
    openURL.mockClear();
}

export function setWindow(width: number, height: number): void {
    nativeState.window = { width, height };
    windowListeners.forEach((listener) => listener());
}

export function setReduceMotion(enabled: boolean): void {
    nativeState.reduceMotion = enabled;
    reduceMotionListeners.forEach((listener) => listener(enabled));
}

/** Fires one keyboard event the way a device does: iOS sends the `Will` pair, Android only the `Did` pair. */
export function emitKeyboard(event: KeyboardEventName, height = 0): void {
    [...(keyboardListeners.get(event) ?? [])].forEach((listener) => listener({ endCoordinates: { height } }));
}

/** Presses the hardware back button; true when a listener consumed it. */
export function pressHardwareBack(): boolean {
    return [...backHandlers].reverse().some((handler) => handler());
}

export function keyboardListenerCount(): number {
    return [...keyboardListeners.values()].reduce((total, listeners) => total + listeners.size, 0);
}

export function hardwareBackListenerCount(): number {
    return backHandlers.length;
}

function subscribe<Args extends unknown[]>(listeners: Set<Listener<Args>>, listener: Listener<Args>) {
    listeners.add(listener);
    return { remove: () => void listeners.delete(listener) };
}

interface FakeNative {
    measureInWindow?: (callback: (x: number, y: number, width: number, height: number) => void) => void;
    measureLayout?: (
        relativeTo: unknown,
        onSuccess: (x: number, y: number, width: number, height: number) => void,
        onFail?: () => void,
    ) => void;
    scrollTo?: ReturnType<typeof vi.fn>;
    getInnerViewRef?: () => unknown;
    onLayout?: (event: { nativeEvent: { layout: { x: number; y: number; width: number; height: number } } }) => void;
}

const asNative = (element: Element): FakeNative => element as unknown as FakeNative;

const NO_SIZE: AnchorRect = { x: 0, y: 0, width: 0, height: 0 };

/** A stand-alone native instance for tests that register anchors without rendering; it measures `read()` each time. */
export function liveInstance(read: () => AnchorRect): AnchorInstance {
    return {
        measureInWindow: (callback: (...measurement: number[]) => void) => {
            const { x, y, width, height } = read();
            callback(x, y, width, height);
        },
    } as unknown as AnchorInstance;
}

/** Like `liveInstance` for a fixed rect; `null` reports no size. */
export const fakeInstance = (rect: AnchorRect | null): AnchorInstance => liveInstance(() => rect ?? NO_SIZE);

/** Makes a rendered host element answer `measureInWindow` with `rect`, or with whatever `rect()` returns at the time. */
export function mockWindowRect(element: Element, rect: AnchorRect | (() => AnchorRect)): void {
    const read = typeof rect === 'function' ? rect : () => rect;
    asNative(element).measureInWindow = (callback) => {
        const { x, y, width, height } = read();
        callback(x, y, width, height);
    };
}

/** Makes a rendered scroll view report where `scrollTo` sent it. */
export function mockScrollTo(element: Element, onScrollTo: (offsetY: number) => void): void {
    asNative(element).scrollTo = vi.fn(({ y }: { y: number }) => onScrollTo(y));
}

/** Makes a rendered host element answer `measureLayout` with `rect`, whatever the ancestor. */
export function mockLayoutRect(element: Element, rect: AnchorRect): void {
    asNative(element).measureLayout = (_relativeTo, onSuccess) => onSuccess(rect.x, rect.y, rect.width, rect.height);
}

export function fireLayout(element: Element, { width, height }: { width: number; height: number }): void {
    asNative(element).onLayout?.({ nativeEvent: { layout: { x: 0, y: 0, width, height } } });
}

export function scrollToCalls(element: Element): unknown[][] {
    return asNative(element).scrollTo?.mock.calls ?? [];
}

/** The flattened `style` the component under test passed to a host element. */
export function styleOf(element: Element): Record<string, unknown> {
    return JSON.parse(element.getAttribute('data-style') ?? '{}') as Record<string, unknown>;
}

function flattenStyle(style: Style): Record<string, unknown> {
    if (Array.isArray(style)) return Object.assign({}, ...style.map(flattenStyle));
    return style && typeof style === 'object' ? { ...style } : {};
}

// Like React, hand a callback ref's cleanup back to the caller.
function attachRef<T>(ref: Ref<T> | undefined, node: T | null): void | (() => void) {
    if (typeof ref === 'function') return ref(node);
    if (!ref) return;
    ref.current = node;
    return () => {
        ref.current = null;
    };
}

interface HostProps {
    ref?: Ref<HTMLDivElement>;
    testID?: string;
    role?: string;
    accessibilityLabel?: string;
    accessibilityViewIsModal?: boolean;
    pointerEvents?: string;
    style?: Style;
    onLayout?: FakeNative['onLayout'];
    onTouchEnd?: () => void;
    onScroll?: () => void;
    onPress?: () => void;
    disabled?: boolean;
    children?: ReactNode;
}

function HostView({ ref, onLayout, ...props }: HostProps) {
    const attach = useCallback(
        (node: HTMLDivElement | null) => {
            if (node) Object.assign(node, { onLayout });
            return attachRef(ref, node);
        },
        [ref, onLayout],
    );

    return (
        <div
            ref={attach}
            data-testid={props.testID}
            role={props.role}
            aria-label={props.accessibilityLabel}
            data-modal={props.accessibilityViewIsModal}
            data-pointer-events={props.pointerEvents}
            data-style={JSON.stringify(flattenStyle(props.style))}
            onTouchEnd={props.onTouchEnd}
        >
            {props.children}
        </div>
    );
}

function Text({ children, ...props }: HostProps) {
    return (
        <span data-testid={props.testID} role={props.role} data-style={JSON.stringify(flattenStyle(props.style))}>
            {children}
        </span>
    );
}

function Pressable({ ref, style, children, onPress, disabled, ...props }: Omit<HostProps, 'style'> & { style?: Style | ((state: { pressed: boolean }) => Style) }) {
    const resolved = typeof style === 'function' ? style({ pressed: false }) : style;
    return (
        <div
            ref={ref}
            onTouchEnd={props.onTouchEnd}
            data-testid={props.testID}
            role={props.role}
            aria-label={props.accessibilityLabel}
            aria-disabled={disabled}
            data-style={JSON.stringify(flattenStyle(resolved))}
            onClick={disabled ? undefined : onPress}
        >
            {children}
        </div>
    );
}

function ScrollView({ ref, children, ...props }: HostProps) {
    const attach = useCallback(
        (node: HTMLDivElement | null) => {
            if (node) Object.assign(node, { scrollTo: vi.fn(), getInnerViewRef: () => node });
            return attachRef(ref, node);
        },
        [ref],
    );
    return (
        <div ref={attach} data-testid={props.testID} onScroll={props.onScroll}>
            {children}
        </div>
    );
}

function Modal({ visible, children }: { visible: boolean; children?: ReactNode }) {
    return visible ? <div data-testid="modal">{children}</div> : null;
}

function FlatList<Item>({
    data,
    renderItem,
    keyExtractor,
    ListEmptyComponent,
}: {
    data: readonly Item[];
    renderItem: (info: { item: Item; index: number }) => ReactNode;
    keyExtractor: (item: Item) => string;
    ListEmptyComponent?: ReactNode;
}) {
    if (data.length === 0) return <>{ListEmptyComponent}</>;
    return (
        <div>
            {data.map((item, index) => (
                <div key={keyExtractor(item)}>{renderItem({ item, index })}</div>
            ))}
        </div>
    );
}

function Image({ source }: { source: { uri: string } }) {
    return <img src={source.uri} alt="" />;
}

export const reactNativeModule = {
    View: HostView,
    Text,
    Pressable,
    ScrollView,
    Modal,
    FlatList,
    Image,
    StyleSheet: { create: <T,>(styles: T): T => styles, absoluteFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 } },
    useWindowDimensions: () =>
        useSyncExternalStore(
            (listener) => subscribe(windowListeners, listener).remove,
            () => nativeState.window,
        ),
    useColorScheme: () => nativeState.colorScheme,
    Dimensions: {
        get: () => nativeState.window,
        addEventListener: (_event: 'change', listener: Listener<[]>) => subscribe(windowListeners, listener),
    },
    AccessibilityInfo: {
        isReduceMotionEnabled: () => Promise.resolve(nativeState.reduceMotion),
        addEventListener: (_event: 'reduceMotionChanged', listener: Listener<[boolean]>) =>
            subscribe(reduceMotionListeners, listener),
        announceForAccessibility,
    },
    BackHandler: {
        addEventListener: (_event: 'hardwareBackPress', handler: Listener<[]>) => {
            backHandlers.push(handler);
            return { remove: () => void backHandlers.splice(backHandlers.indexOf(handler), 1) };
        },
    },
    Linking: { openURL },
    Keyboard: {
        addListener: (event: KeyboardEventName, listener: Listener<[KeyboardEventPayload]>) => {
            const listeners = keyboardListeners.get(event) ?? new Set<Listener<[KeyboardEventPayload]>>();
            keyboardListeners.set(event, listeners);
            return subscribe(listeners, listener);
        },
    },
};

function Svg({ children, ...props }: HostProps & { width?: number; height?: number }) {
    return (
        <svg data-testid={props.testID ?? 'svg'} data-pointer-events={props.pointerEvents} width={props.width} height={props.height}>
            {children}
        </svg>
    );
}

function Path({ onPress, ...props }: { d: string; fill: string; fillRule: string; onPress?: () => void; testID?: string }) {
    return <path data-testid={props.testID ?? 'dim'} d={props.d} fill={props.fill} fillRule={props.fillRule as 'evenodd'} onClick={onPress} />;
}

export const svgModule = { default: Svg, Svg, Path };

import { useCallback, type Ref, type RefCallback } from 'react';
import type { GestureResponderEvent } from 'react-native';
import { assignRef } from './assignRef';
import { notifyPress, registerAnchor, type AnchorInstance } from './registry';
import { useTourScrollContainer } from './scrollContainer';

export interface TourAnchorProps {
    ref: RefCallback<AnchorInstance>;
    /** Keeps the native node alive on Android so it stays measurable. */
    collapsable: false;
    /** Reports presses without taking the responder from the host's own `Pressable`. */
    onTouchEnd: (event: GestureResponderEvent) => void;
}

/** What the anchored view already has: spreading the result would overwrite it, so it is passed in and composed. */
export interface TourAnchorHost {
    ref?: Ref<AnchorInstance>;
    onTouchEnd?: (event: GestureResponderEvent) => void;
}

/**
 * Spread the result onto the view a tour step points at: `<Pressable {...useTourAnchor('billing.upgrade')} />`.
 * A view that has its own `ref` or `onTouchEnd` passes them as `host`; its `onPress` needs no help.
 */
export function useTourAnchor<K extends string = string>(
    key: K,
    { ref: hostRef, onTouchEnd: hostOnTouchEnd }: TourAnchorHost = {},
): TourAnchorProps {
    const container = useTourScrollContainer();
    const ref = useCallback<RefCallback<AnchorInstance>>(
        (instance) => {
            assignRef(hostRef, instance);
            if (!instance) return undefined;

            const unregister = registerAnchor(key, { instance, container });
            return () => {
                unregister();
                assignRef(hostRef, null);
            };
        },
        [key, container, hostRef],
    );
    const onTouchEnd = useCallback(
        (event: GestureResponderEvent) => {
            hostOnTouchEnd?.(event);
            notifyPress(key);
        },
        [key, hostOnTouchEnd],
    );
    return { ref, collapsable: false, onTouchEnd };
}

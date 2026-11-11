import { useEffect, useState } from 'react';
import { Keyboard, type KeyboardEvent } from 'react-native';

/** Height of the on-screen keyboard, 0 while hidden. iOS fires the `Will` events, Android only the `Did` ones. */
export function useKeyboardHeight(): number {
    const [height, setHeight] = useState(0);

    useEffect(() => {
        const show = ({ endCoordinates }: KeyboardEvent) => setHeight(endCoordinates.height);
        const hide = () => setHeight(0);
        const subscriptions = [
            Keyboard.addListener('keyboardWillShow', show),
            Keyboard.addListener('keyboardDidShow', show),
            Keyboard.addListener('keyboardWillHide', hide),
            Keyboard.addListener('keyboardDidHide', hide),
        ];
        return () => subscriptions.forEach((subscription) => subscription.remove());
    }, []);

    return height;
}

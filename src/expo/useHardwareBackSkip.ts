import { useEffect } from 'react';
import { BackHandler } from 'react-native';

/** While `skip` is given, the Android back button calls it instead of leaving the screen. */
export function useHardwareBackSkip(skip: (() => void) | undefined): void {
    useEffect(() => {
        if (!skip) return;
        const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
            skip();
            return true;
        });
        return () => subscription.remove();
    }, [skip]);
}

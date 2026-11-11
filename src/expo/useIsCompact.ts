import { useWindowDimensions } from 'react-native';
import { useSaparAdapter } from '../react';

export function useIsCompact(): boolean {
    // Subscribing to the window size re-renders on rotation, when the adapter's answer can change.
    useWindowDimensions();
    return useSaparAdapter()?.isCompact() ?? false;
}

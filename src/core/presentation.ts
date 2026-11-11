export type Presentation = 'auto' | 'anchored' | 'sheet';

export interface PresentationInput {
    presentation: Presentation;
    /** The adapter reports a window narrower than its compact breakpoint. */
    compact: boolean;
    /** Whether the measured card fits beside the anchor; `undefined` until the card has been measured. */
    fits: boolean | undefined;
}

/** `'auto'` is anchored unless the window is compact or the card is known not to fit beside the anchor. */
export function resolvePresentation({ presentation, compact, fits }: PresentationInput): Exclude<Presentation, 'auto'> {
    if (presentation !== 'auto') return presentation;
    return compact || fits === false ? 'sheet' : 'anchored';
}

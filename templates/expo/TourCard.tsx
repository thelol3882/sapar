// After copying, change these imports to '@thelol3882/sapar/...'
import { StyleSheet, useColorScheme, useWindowDimensions, View } from 'react-native';
import { TourOverlay, TourStep, type TourPopoverProps } from '../../src/expo';
import type { StepAnnouncement, StepCount } from '../../src/react';

export interface TourCardLabels {
    next: string;
    back: string;
    skip: string;
    done: string;
    close: string;
    progress: ({ position, total }: StepCount) => string;
    announceStep: ({ position, total, title }: StepAnnouncement) => string;
}

const DEFAULT_LABELS: TourCardLabels = {
    next: 'Next',
    back: 'Back',
    skip: 'Skip tour',
    done: 'Done',
    close: 'Close tour',
    progress: ({ position, total }) => `${position} / ${total}`,
    announceStep: ({ position, total, title }) => `Step ${position} of ${total}: ${title}`,
};

// Replace these with your design tokens.
const palette = {
    light: { surface: '#ffffff', border: '#e5e5e5', text: '#171717', muted: '#525252', accent: '#4f46e5', onAccent: '#ffffff', pressed: '#f5f5f5' },
    dark: { surface: '#171717', border: '#404040', text: '#f5f5f5', muted: '#d4d4d4', accent: '#6366f1', onAccent: '#ffffff', pressed: '#262626' },
};

export type TourColors = Record<keyof (typeof palette)['light'], string>;

function useColors(overrides: Partial<TourColors> | undefined): TourColors {
    return { ...palette[useColorScheme() === 'dark' ? 'dark' : 'light'], ...overrides };
}

const CARD_WIDTH = 320;
const CARD_MARGIN = 16;

const styles = StyleSheet.create({
    card: { alignSelf: 'center', padding: 16, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    progress: { fontSize: 12, fontWeight: '500' },
    closeLabel: { fontSize: 20, lineHeight: 24 },
    title: { marginTop: 8, fontSize: 16, fontWeight: '600' },
    body: { marginTop: 4, fontSize: 14, lineHeight: 20 },
    footer: { marginTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    button: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
    buttonLabel: { fontSize: 14, fontWeight: '500' },
});

export interface TourCardProps extends Pick<TourPopoverProps, 'insets' | 'presentation'> {
    labels?: Partial<TourCardLabels>;
    /** Overrides the palette of the current colour scheme. */
    colors?: Partial<TourColors>;
}

export function TourCard({ labels, colors: colorOverrides, insets, presentation }: TourCardProps) {
    const text = { ...DEFAULT_LABELS, ...labels };
    const colors = useColors(colorOverrides);
    const { width } = useWindowDimensions();

    const secondary = ({ pressed }: { pressed: boolean }) => [styles.button, pressed && { backgroundColor: colors.pressed }];
    const secondaryLabel = [styles.buttonLabel, { color: colors.muted }];

    return (
        <TourOverlay insets={insets} presentation={presentation}>
            <TourStep.Root
                announceStep={text.announceStep}
                style={[
                    styles.card,
                    {
                        width: Math.min(CARD_WIDTH, width - CARD_MARGIN * 2),
                        backgroundColor: colors.surface,
                        borderColor: colors.border,
                    },
                ]}
            >
                <View style={styles.header}>
                    <TourStep.Progress style={[styles.progress, { color: colors.muted }]}>
                        {text.progress}
                    </TourStep.Progress>
                    <TourStep.Close
                        accessibilityLabel={text.close}
                        style={secondary}
                        textStyle={[styles.closeLabel, { color: colors.muted }]}
                    />
                </View>
                <TourStep.Title style={[styles.title, { color: colors.text }]} />
                <TourStep.Body style={[styles.body, { color: colors.muted }]} />
                <View style={styles.footer}>
                    <TourStep.Skip style={secondary} textStyle={secondaryLabel}>
                        {text.skip}
                    </TourStep.Skip>
                    <View style={styles.actions}>
                        <TourStep.Back style={secondary} textStyle={secondaryLabel}>
                            {text.back}
                        </TourStep.Back>
                        <TourStep.Next
                            nextLabel={text.next}
                            doneLabel={text.done}
                            style={[styles.button, { backgroundColor: colors.accent }]}
                            textStyle={[styles.buttonLabel, { color: colors.onAccent }]}
                        />
                    </View>
                </View>
            </TourStep.Root>
        </TourOverlay>
    );
}

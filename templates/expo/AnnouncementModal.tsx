// After copying, change these imports to '@thelol3882/sapar/...'
import { Image, Linking, Modal, Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { useAnnouncementInterruption, useWhatsNew } from '../../src/react';

export interface AnnouncementModalLabels {
    acknowledge: string;
    takeTour: string;
}

const DEFAULT_LABELS: AnnouncementModalLabels = {
    acknowledge: 'Got it',
    takeTour: 'Take the tour',
};

// Replace these with your design tokens.
const palette = {
    light: { surface: '#ffffff', text: '#171717', muted: '#525252', accent: '#4f46e5', onAccent: '#ffffff', pressed: '#f5f5f5', backdrop: 'rgba(0, 0, 0, 0.5)' },
    dark: { surface: '#171717', text: '#f5f5f5', muted: '#d4d4d4', accent: '#818cf8', onAccent: '#ffffff', pressed: '#262626', backdrop: 'rgba(0, 0, 0, 0.5)' },
};

export type TourColors = Record<keyof (typeof palette)['light'], string>;

function useColors(overrides: Partial<TourColors> | undefined): TourColors {
    return { ...palette[useColorScheme() === 'dark' ? 'dark' : 'light'], ...overrides };
}

const styles = StyleSheet.create({
    root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16 },
    backdrop: StyleSheet.absoluteFill,
    card: { width: '100%', maxWidth: 448, gap: 12, padding: 24, borderRadius: 12 },
    image: { width: '100%', height: 160, borderRadius: 8 },
    title: { fontSize: 18, fontWeight: '600' },
    body: { fontSize: 14, lineHeight: 20 },
    link: { fontSize: 14, fontWeight: '500' },
    actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, paddingTop: 8 },
    button: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
    buttonLabel: { fontSize: 14, fontWeight: '500' },
});

export interface AnnouncementModalProps {
    labels?: Partial<AnnouncementModalLabels>;
    /** Overrides the palette of the current colour scheme. */
    colors?: Partial<TourColors>;
}

export function AnnouncementModal({ labels, colors: colorOverrides }: AnnouncementModalProps) {
    const text = { ...DEFAULT_LABELS, ...labels };
    const colors = useColors(colorOverrides);
    const { announcement, dismiss, acknowledge } = useAnnouncementInterruption();
    const { recordClick, startTour } = useWhatsNew();

    if (!announcement) return null;
    const { key, tourKey, cta } = announcement;

    async function takeTour(key: string): Promise<void> {
        await acknowledge();
        await startTour(key);
    }

    function openCta(url: string): void {
        recordClick(key);
        void Linking.openURL(url);
    }

    return (
        <Modal visible transparent animationType="fade" onRequestClose={() => void dismiss()}>
            <View style={styles.root} accessibilityViewIsModal>
                <Pressable accessible={false} style={[styles.backdrop, { backgroundColor: colors.backdrop }]} onPress={() => void dismiss()} />
                <View role="dialog" style={[styles.card, { backgroundColor: colors.surface }]}>
                    {announcement.imageUrl && <Image source={{ uri: announcement.imageUrl }} style={styles.image} />}
                    <Text role="heading" style={[styles.title, { color: colors.text }]}>
                        {announcement.title}
                    </Text>
                    <Text style={[styles.body, { color: colors.muted }]}>{announcement.body}</Text>
                    {cta && (
                        <Pressable role="link" onPress={() => openCta(cta.url)}>
                            <Text style={[styles.link, { color: colors.accent }]}>{cta.label}</Text>
                        </Pressable>
                    )}
                    <View style={styles.actions}>
                        {tourKey && (
                            <Pressable
                                role="button"
                                onPress={() => void takeTour(tourKey)}
                                style={({ pressed }) => [styles.button, pressed && { backgroundColor: colors.pressed }]}
                            >
                                <Text style={[styles.buttonLabel, { color: colors.text }]}>{text.takeTour}</Text>
                            </Pressable>
                        )}
                        <Pressable
                            role="button"
                            onPress={() => void acknowledge()}
                            style={[styles.button, { backgroundColor: colors.accent }]}
                        >
                            <Text style={[styles.buttonLabel, { color: colors.onAccent }]}>{text.acknowledge}</Text>
                        </Pressable>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

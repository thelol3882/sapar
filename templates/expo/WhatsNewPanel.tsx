// After copying, change these imports to '@thelol3882/sapar/...'
import { FlatList, Image, Linking, Modal, Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { useWhatsNewPanel, type WhatsNewPanelItem } from '../../src/react';

export interface WhatsNewPanelLabels {
    title: string;
    empty: string;
    close: string;
    takeTour: string;
    new: string;
}

const DEFAULT_LABELS: WhatsNewPanelLabels = {
    title: "What's new",
    empty: 'Nothing new yet.',
    close: 'Close',
    takeTour: 'Take the tour',
    new: 'New',
};

export interface WhatsNewPanelProps {
    open: boolean;
    onClose: () => void;
    labels?: Partial<WhatsNewPanelLabels>;
    /** BCP 47 tag for the default date format. Defaults to the device locale. */
    locale?: string;
    /** Replaces the default date format; the template then never uses `Intl`. */
    formatDate?: (isoDate: string) => string;
    /** Overrides the palette of the current colour scheme. */
    colors?: Partial<TourColors>;
}

// Replace these with your design tokens.
const palette = {
    light: { surface: '#ffffff', border: '#e5e5e5', text: '#171717', muted: '#525252', accent: '#4f46e5', onAccent: '#ffffff' },
    dark: { surface: '#171717', border: '#404040', text: '#f5f5f5', muted: '#d4d4d4', accent: '#818cf8', onAccent: '#ffffff' },
};

export type TourColors = Record<keyof (typeof palette)['light'], string>;

function useColors(overrides: Partial<TourColors> | undefined): TourColors {
    return { ...palette[useColorScheme() === 'dark' ? 'dark' : 'light'], ...overrides };
}

const styles = StyleSheet.create({
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: StyleSheet.hairlineWidth },
    heading: { fontSize: 16, fontWeight: '600' },
    closeLabel: { paddingHorizontal: 8, fontSize: 24, lineHeight: 28 },
    list: { padding: 20, gap: 24 },
    entry: { gap: 8, paddingBottom: 24, borderBottomWidth: StyleSheet.hairlineWidth },
    entryHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    entryTitle: { fontSize: 14, fontWeight: '600' },
    newBadge: { paddingHorizontal: 8, borderRadius: 999 },
    newBadgeLabel: { fontSize: 10, fontWeight: '600', lineHeight: 16, textTransform: 'uppercase' },
    date: { fontSize: 12 },
    image: { width: '100%', height: 160, borderRadius: 8 },
    body: { fontSize: 14, lineHeight: 20 },
    actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
    tourButton: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
    tourButtonLabel: { fontSize: 14, fontWeight: '500' },
    link: { fontSize: 14, fontWeight: '500' },
    empty: { fontSize: 14 },
});

function formatDateWithIntl(isoDate: string, locale: string | undefined): string {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(isoDate));
}

function Entry({
    item,
    labels,
    colors,
    formatDate,
    onCtaClick,
    onTakeTour,
}: {
    item: WhatsNewPanelItem;
    labels: WhatsNewPanelLabels;
    colors: TourColors;
    formatDate: (isoDate: string) => string;
    onCtaClick: (key: string) => void;
    onTakeTour: (tourKey: string) => void;
}) {
    const { tourKey, cta } = item;

    function openCta(url: string): void {
        onCtaClick(item.key);
        void Linking.openURL(url);
    }

    return (
        <View style={[styles.entry, { borderColor: colors.border }]}>
            <View style={styles.entryHeader}>
                <Text role="heading" style={[styles.entryTitle, { color: colors.text }]}>
                    {item.title}
                </Text>
                {item.isNew && (
                    <View style={[styles.newBadge, { backgroundColor: colors.accent }]}>
                        <Text style={[styles.newBadgeLabel, { color: colors.onAccent }]}>{labels.new}</Text>
                    </View>
                )}
            </View>
            {item.publishedAt && <Text style={[styles.date, { color: colors.muted }]}>{formatDate(item.publishedAt)}</Text>}
            {item.imageUrl && <Image source={{ uri: item.imageUrl }} style={styles.image} />}
            <Text style={[styles.body, { color: colors.muted }]}>{item.body}</Text>
            <View style={styles.actions}>
                {tourKey && (
                    <Pressable
                        role="button"
                        onPress={() => onTakeTour(tourKey)}
                        style={[styles.tourButton, { backgroundColor: colors.accent }]}
                    >
                        <Text style={[styles.tourButtonLabel, { color: colors.onAccent }]}>{labels.takeTour}</Text>
                    </Pressable>
                )}
                {cta && (
                    <Pressable role="link" onPress={() => openCta(cta.url)}>
                        <Text style={[styles.link, { color: colors.accent }]}>{cta.label}</Text>
                    </Pressable>
                )}
            </View>
        </View>
    );
}

export function WhatsNewPanel({ open, onClose, labels, locale, formatDate, colors: colorOverrides }: WhatsNewPanelProps) {
    const text = { ...DEFAULT_LABELS, ...labels };
    const colors = useColors(colorOverrides);
    const { items, recordClick, startTour } = useWhatsNewPanel(open);
    const format = formatDate ?? ((isoDate: string) => formatDateWithIntl(isoDate, locale));

    function takeTour(tourKey: string): void {
        onClose();
        void startTour(tourKey);
    }

    return (
        <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
            <View style={{ flex: 1, backgroundColor: colors.surface }}>
                <View style={[styles.header, { borderColor: colors.border }]}>
                    <Text role="heading" style={[styles.heading, { color: colors.text }]}>
                        {text.title}
                    </Text>
                    <Pressable role="button" accessibilityLabel={text.close} onPress={onClose}>
                        <Text style={[styles.closeLabel, { color: colors.muted }]}>×</Text>
                    </Pressable>
                </View>
                <FlatList
                    data={items}
                    keyExtractor={(item) => item.key}
                    contentContainerStyle={styles.list}
                    ListEmptyComponent={<Text style={[styles.empty, { color: colors.muted }]}>{text.empty}</Text>}
                    renderItem={({ item }) => (
                        <Entry
                            item={item}
                            labels={text}
                            colors={colors}
                            formatDate={format}
                            onCtaClick={recordClick}
                            onTakeTour={takeTour}
                        />
                    )}
                />
            </View>
        </Modal>
    );
}

// After copying, change these imports to '@thelol3882/sapar/...'
import { useState } from 'react';
import { Pressable, StyleSheet, Text, useColorScheme, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useWhatsNew } from '../../src/react';
import { WhatsNewPanel, type WhatsNewPanelProps } from './WhatsNewPanel';

export interface WhatsNewButtonProps extends Pick<WhatsNewPanelProps, 'labels' | 'locale' | 'formatDate'> {
    style?: StyleProp<ViewStyle>;
    /** Accessible name; the unread count is appended. */
    label?: string;
    /** Overrides the palette of the current colour scheme. */
    colors?: Partial<TourColors>;
    /** Overrides the palette of the panel the button opens. */
    panelColors?: WhatsNewPanelProps['colors'];
}

// Replace these with your design tokens.
const palette = {
    light: { icon: '#525252', pressed: '#f5f5f5', badge: '#ef4444', onBadge: '#ffffff' },
    dark: { icon: '#d4d4d4', pressed: '#262626', badge: '#ef4444', onBadge: '#ffffff' },
};

export type TourColors = Record<keyof (typeof palette)['light'], string>;

function useColors(overrides: Partial<TourColors> | undefined): TourColors {
    return { ...palette[useColorScheme() === 'dark' ? 'dark' : 'light'], ...overrides };
}

const SPARKLE_PATH =
    'M9.9 15.5a2 2 0 0 0-1.4-1.4l-6.1-1.6a.5.5 0 0 1 0-1l6.1-1.6a2 2 0 0 0 1.4-1.4l1.6-6.1a.5.5 0 0 1 1 0l1.6 6.1a2 2 0 0 0 1.4 1.4l6.1 1.6a.5.5 0 0 1 0 1l-6.1 1.6a2 2 0 0 0-1.4 1.4l-1.6 6.1a.5.5 0 0 1-1 0zM20 3v4M22 5h-4M4 17v2M5 18H3';

const styles = StyleSheet.create({
    button: { padding: 8, borderRadius: 999 },
    badge: {
        position: 'absolute',
        top: 0,
        right: 0,
        minWidth: 16,
        paddingHorizontal: 4,
        borderRadius: 999,
        alignItems: 'center',
    },
    badgeLabel: { fontSize: 10, fontWeight: '600', lineHeight: 16 },
});

export function WhatsNewButton({
    style,
    label = "What's new",
    labels,
    locale,
    formatDate,
    colors: colorOverrides,
    panelColors,
}: WhatsNewButtonProps) {
    const [open, setOpen] = useState(false);
    const { unreadCount } = useWhatsNew();
    const colors = useColors(colorOverrides);

    return (
        <>
            <Pressable
                role="button"
                accessibilityLabel={unreadCount > 0 ? `${label} (${unreadCount})` : label}
                onPress={() => setOpen(true)}
                style={({ pressed }) => [styles.button, pressed && { backgroundColor: colors.pressed }, style]}
            >
                <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" accessibilityElementsHidden>
                    <Path d={SPARKLE_PATH} stroke={colors.icon} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
                {unreadCount > 0 && (
                    <View style={[styles.badge, { backgroundColor: colors.badge }]}>
                        <Text style={[styles.badgeLabel, { color: colors.onBadge }]}>{unreadCount}</Text>
                    </View>
                )}
            </Pressable>
            <WhatsNewPanel
                open={open}
                onClose={() => setOpen(false)}
                labels={labels}
                locale={locale}
                formatDate={formatDate}
                colors={panelColors}
            />
        </>
    );
}

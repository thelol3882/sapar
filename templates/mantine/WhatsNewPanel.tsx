'use client';

// After copying, change these imports to '@thelol3882/sapar/...'
import { Anchor, Badge, Button, Drawer, Group, Image, ScrollArea, Stack, Text, Title } from '@mantine/core';
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
    /** BCP 47 tag for the default date format. Defaults to the browser locale. */
    locale?: string;
    /** Replaces the default date format; the template then never uses `Intl`. */
    formatDate?: (isoDate: string) => string;
}

function formatDateWithIntl(isoDate: string, locale: string | undefined): string {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(isoDate));
}

function Entry({
    item,
    labels,
    formatDate,
    onCtaClick,
    onTakeTour,
}: {
    item: WhatsNewPanelItem;
    labels: WhatsNewPanelLabels;
    formatDate: (isoDate: string) => string;
    onCtaClick: (key: string) => void;
    onTakeTour: (tourKey: string) => void;
}) {
    const { tourKey } = item;

    return (
        <Stack component="li" gap="xs">
            <Group gap="xs">
                <Title order={4}>{item.title}</Title>
                {item.isNew && <Badge size="sm">{labels.new}</Badge>}
            </Group>
            {item.publishedAt && (
                <Text component="time" dateTime={item.publishedAt} size="xs" c="dimmed">
                    {formatDate(item.publishedAt)}
                </Text>
            )}
            {item.imageUrl && <Image src={item.imageUrl} alt="" loading="lazy" radius="md" />}
            <Text size="sm" c="dimmed">
                {item.body}
            </Text>
            <Group gap="md">
                {tourKey && (
                    <Button size="xs" onClick={() => onTakeTour(tourKey)}>
                        {labels.takeTour}
                    </Button>
                )}
                {item.cta && (
                    <Anchor
                        href={item.cta.url}
                        target="_blank"
                        rel="noreferrer"
                        size="sm"
                        fw={500}
                        onClick={() => onCtaClick(item.key)}
                    >
                        {item.cta.label}
                    </Anchor>
                )}
            </Group>
        </Stack>
    );
}

export function WhatsNewPanel({ open, onClose, labels, locale, formatDate }: WhatsNewPanelProps) {
    const text = { ...DEFAULT_LABELS, ...labels };
    const { items, recordClick, startTour } = useWhatsNewPanel(open);
    const format = formatDate ?? ((isoDate: string) => formatDateWithIntl(isoDate, locale));

    function takeTour(tourKey: string): void {
        onClose();
        void startTour(tourKey);
    }

    return (
        <Drawer
            opened={open}
            onClose={onClose}
            position="right"
            title={text.title}
            closeButtonProps={{ 'aria-label': text.close }}
            scrollAreaComponent={ScrollArea.Autosize}
        >
            {items.length === 0 ? (
                <Text size="sm" c="dimmed">
                    {text.empty}
                </Text>
            ) : (
                <Stack component="ul" gap="xl" p={0} m={0} style={{ listStyle: 'none' }}>
                    {items.map((item) => (
                        <Entry
                            key={item.key}
                            item={item}
                            labels={text}
                            formatDate={format}
                            onCtaClick={recordClick}
                            onTakeTour={takeTour}
                        />
                    ))}
                </Stack>
            )}
        </Drawer>
    );
}

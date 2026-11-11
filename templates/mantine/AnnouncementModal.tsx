'use client';

// After copying, change these imports to '@thelol3882/sapar/...'
import { Anchor, Button, Group, Image, Modal, Stack, Text } from '@mantine/core';
import { useAnnouncementInterruption, useWhatsNew } from '../../src/react';

export interface AnnouncementModalLabels {
    acknowledge: string;
    takeTour: string;
}

const DEFAULT_LABELS: AnnouncementModalLabels = {
    acknowledge: 'Got it',
    takeTour: 'Take the tour',
};

export function AnnouncementModal({ labels }: { labels?: Partial<AnnouncementModalLabels> }) {
    const text = { ...DEFAULT_LABELS, ...labels };
    const { announcement, dismiss, acknowledge } = useAnnouncementInterruption();
    const { recordClick, startTour } = useWhatsNew();

    if (!announcement) return null;
    const { tourKey } = announcement;

    async function takeTour(tourKey: string): Promise<void> {
        await acknowledge();
        await startTour(tourKey);
    }

    return (
        <Modal
            opened
            centered
            withCloseButton={false}
            title={announcement.title}
            onClose={() => void dismiss()}
        >
            <Stack gap="sm">
                {announcement.imageUrl && <Image src={announcement.imageUrl} alt="" radius="md" />}
                <Text size="sm" c="dimmed">
                    {announcement.body}
                </Text>
                {announcement.cta && (
                    <Anchor
                        href={announcement.cta.url}
                        target="_blank"
                        rel="noreferrer"
                        size="sm"
                        fw={500}
                        onClick={() => recordClick(announcement.key)}
                    >
                        {announcement.cta.label}
                    </Anchor>
                )}
                <Group justify="flex-end" mt="xs">
                    {tourKey && (
                        <Button variant="subtle" color="gray" onClick={() => void takeTour(tourKey)}>
                            {text.takeTour}
                        </Button>
                    )}
                    <Button onClick={() => void acknowledge()}>{text.acknowledge}</Button>
                </Group>
            </Stack>
        </Modal>
    );
}

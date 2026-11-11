'use client';

// After copying, change these imports to '@thelol3882/sapar/...'
import { Button, CloseButton, Group, Paper, Text, Title } from '@mantine/core';
import type { CSSProperties } from 'react';
import { TourOverlay, TourStep, type TourOverlayProps } from '../../src/web';
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

const SPOTLIGHT_STYLE: CSSProperties = {
    zIndex: 'var(--mantine-z-index-overlay)',
    color: 'color-mix(in srgb, var(--mantine-color-black) 50%, transparent)',
};

const POPOVER_STYLE: CSSProperties = { zIndex: 'calc(var(--mantine-z-index-overlay) + 1)' };

export interface TourCardProps extends Pick<TourOverlayProps, 'presentation'> {
    labels?: Partial<TourCardLabels>;
}

export function TourCard({ labels, presentation }: TourCardProps) {
    const text = { ...DEFAULT_LABELS, ...labels };

    return (
        <TourOverlay spotlightStyle={SPOTLIGHT_STYLE} popoverStyle={POPOVER_STYLE} presentation={presentation}>
            <Paper
                withBorder
                shadow="md"
                radius="md"
                p="md"
                w={320}
                maw="calc(100vw - 2rem)"
                className="mantine-focus-auto"
                renderRoot={(props) => <TourStep.Root {...props} announceStep={text.announceStep} />}
            >
                <Group justify="space-between" mb="xs">
                    <Text
                        size="xs"
                        fw={500}
                        c="dimmed"
                        renderRoot={(props) => <TourStep.Progress {...props}>{text.progress}</TourStep.Progress>}
                    />
                    <TourStep.Close aria-label={text.close} render={({ children: _icon, ...props }) => <CloseButton {...props} />} />
                </Group>
                <Title order={5} renderRoot={(props) => <TourStep.Title {...props} />} />
                <Text size="sm" c="dimmed" mt={4} renderRoot={(props) => <TourStep.Body {...props} />} />
                <Group justify="space-between" mt="md">
                    <TourStep.Skip render={(props) => <Button variant="subtle" color="gray" size="xs" {...props} />}>
                        {text.skip}
                    </TourStep.Skip>
                    <Group gap="xs">
                        <TourStep.Back render={(props) => <Button variant="subtle" color="gray" size="xs" {...props} />}>
                            {text.back}
                        </TourStep.Back>
                        <TourStep.Next
                            nextLabel={text.next}
                            doneLabel={text.done}
                            render={(props) => <Button size="xs" {...props} />}
                        />
                    </Group>
                </Group>
            </Paper>
        </TourOverlay>
    );
}

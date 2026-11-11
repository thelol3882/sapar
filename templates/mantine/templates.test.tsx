import { MantineProvider } from '@mantine/core';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps, ComponentType, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSaparController, defineAnnouncement, defineTour, memorySource, memoryStore } from '../../src/core';
import { createHarness } from '../../src/react/testHarness';
import { SaparProvider } from '../../src/react';
import { createWebAdapter, useTourAnchor } from '../../src/web';
import { AnnouncementModal } from './AnnouncementModal';
import { TourCard } from './TourCard';
import { WhatsNewButton } from './WhatsNewButton';

const tour = defineTour({
    key: 'onboarding',
    title: 'Onboarding',
    steps: [
        { key: 'welcome', title: 'Welcome', body: 'Let us show you around' },
        { key: 'upgrade', title: 'Upgrade here', body: 'Plans live here', anchor: 'billing.upgrade' },
        { key: 'finish', title: 'All set', body: 'Enjoy' },
    ],
});

// `env="test"` renders portals inline, so the portal assertions run with the default env.
function withMantine(Wrapper: ComponentType<{ children: ReactNode }>, env: 'default' | 'test' = 'test') {
    return function MantineWrapper({ children }: { children: ReactNode }) {
        return (
            <MantineProvider env={env}>
                <Wrapper>{children}</Wrapper>
            </MantineProvider>
        );
    };
}

function UpgradeButton() {
    return <button {...useTourAnchor('billing.upgrade')}>Upgrade</button>;
}

describe('TourCard', () => {
    function renderTour(props: ComponentProps<typeof TourCard> = {}) {
        const adapter = createWebAdapter({ navigate: vi.fn(), currentRoute: () => '/billing' });
        const source = memorySource({ tours: [tour], storage: memoryStore() });
        const controller = createSaparController({ source, adapter, anchorTimeoutMs: 50 });
        render(
            <MantineProvider env="test">
                <SaparProvider controller={controller} adapter={adapter}>
                    <UpgradeButton />
                    <TourCard {...props} />
                </SaparProvider>
            </MantineProvider>,
        );
        return controller;
    }

    it('walks a full tour through the web adapter', async () => {
        const controller = renderTour();
        await act(() => controller.startTour('onboarding'));

        expect(screen.getByRole('dialog', { name: 'Welcome' })).toBeInTheDocument();
        expect(screen.getByText('1 / 3')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();

        await userEvent.click(screen.getByRole('button', { name: 'Next' }));
        await screen.findByRole('dialog', { name: 'Upgrade here' });
        expect(screen.getByText('2 / 3')).toBeInTheDocument();
        expect(document.querySelector('[data-placement]')).not.toBeNull();

        await userEvent.click(screen.getByRole('button', { name: 'Next' }));
        await screen.findByRole('dialog', { name: 'All set' });
        await userEvent.click(screen.getByRole('button', { name: 'Done' }));

        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(controller.getSnapshot().runner.phase).toBe('idle');
    });

    it('takes its labels from props', async () => {
        const controller = renderTour({ labels: { next: 'Далее', skip: 'Пропустить', progress: ({ position, total }) => `${position} из ${total}` } });
        await act(() => controller.startTour('onboarding'));

        expect(screen.getByRole('button', { name: 'Далее' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Пропустить' })).toBeInTheDocument();
        expect(screen.getByText('1 из 3')).toBeInTheDocument();
    });

    it.each([
        ['sheet', 'sheet'],
        ['anchored', 'anchored'],
    ] as const)('passes presentation %s on to the popover', async (presentation, expected) => {
        const controller = renderTour({ presentation });
        await act(() => controller.startTour('onboarding'));

        expect(document.querySelector('[data-presentation]')).toHaveAttribute('data-presentation', expected);
    });
});

describe('WhatsNewButton', () => {
    // Dates are formatted in the machine's time zone, so pin it as well as the locale.
    beforeEach(() => vi.stubEnv('TZ', 'UTC'));
    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
    });

    const feed = [
        defineAnnouncement({
            key: 'news_one',
            title: 'Dark mode',
            body: 'Try it',
            publishedAt: '2026-03-01T00:00:00Z',
            tourKey: 'onboarding',
            cta: { label: 'Read more', url: 'https://example.com/dark' },
        }),
        defineAnnouncement({ key: 'news_two', title: 'Faster search', body: 'Zoom', publishedAt: '2026-02-01T00:00:00Z' }),
    ];

    async function setup(props: ComponentProps<typeof WhatsNewButton> = {}, env: 'default' | 'test' = 'test') {
        const harness = createHarness({ tours: [tour], announcements: feed });
        const view = render(<WhatsNewButton {...props} />, { wrapper: withMantine(harness.wrapper, env) });
        await act(() => harness.controller.refresh());
        return { ...harness, ...view };
    }

    it('shows a sparkle icon in a button named by its label', async () => {
        await setup({ label: 'Latest' });

        const button = screen.getByRole('button', { name: 'Latest (2)' });
        expect(button.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    });

    it('shows the unread badge, then clears it once the panel is opened', async () => {
        await setup();
        const button = screen.getByRole('button', { name: "What's new (2)" });
        expect(screen.getByText('2')).toBeInTheDocument();

        await userEvent.click(button);

        expect(screen.getByRole('dialog', { name: "What's new" })).toBeInTheDocument();
        expect(screen.getByText('Dark mode')).toBeInTheDocument();
        expect(screen.getByText('Faster search')).toBeInTheDocument();
        await waitFor(() => expect(screen.getByRole('button', { name: "What's new" })).toBeInTheDocument());
    });

    it('keeps the new markers while the panel is open and marks the unread items seen once', async () => {
        const { source, controller } = await setup();
        const markSeen = vi.spyOn(source, 'markSeen');

        await userEvent.click(screen.getByRole('button', { name: /What's new/ }));

        await waitFor(() => expect(controller.getSnapshot().inbox?.unreadCount).toBe(0));
        expect(screen.getAllByText('New')).toHaveLength(2);
        expect(markSeen).toHaveBeenCalledTimes(1);
        expect(markSeen).toHaveBeenCalledWith(['news_one', 'news_two']);
    });

    it('renders the panel outside the button container', async () => {
        const { container } = await setup({}, 'default');

        await userEvent.click(screen.getByRole('button', { name: /What's new/ }));

        const dialog = await screen.findByRole('dialog', { name: "What's new" });
        expect(container).not.toContainElement(dialog);
        expect(document.body).toContainElement(dialog);
    });

    it('formats dates with the default format', async () => {
        await setup({ locale: 'en-US' });
        await userEvent.click(screen.getByRole('button', { name: /What's new/ }));

        expect(within(screen.getByRole('dialog')).getByText('Mar 1, 2026')).toBeInTheDocument();
    });

    it('formats dates with formatDate and never touches Intl', async () => {
        const intl = vi.spyOn(Intl, 'DateTimeFormat');
        await setup({ formatDate: (isoDate) => `on ${isoDate.slice(0, 10)}` });
        await userEvent.click(screen.getByRole('button', { name: /What's new/ }));

        expect(screen.getByText('on 2026-03-01')).toBeInTheDocument();
        expect(intl).not.toHaveBeenCalled();
    });

    it('closes on Escape and returns focus to the button', async () => {
        await setup();
        const button = screen.getByRole('button', { name: /What's new/ });
        button.focus();
        await userEvent.click(button);
        const dialog = await screen.findByRole('dialog');
        await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement));

        await userEvent.keyboard('{Escape}');

        expect(screen.queryByRole('dialog')).toBeNull();
        await waitFor(() => expect(button).toHaveFocus());
    });

    it('records CTA clicks and starts the linked tour', async () => {
        const { source, controller } = await setup();
        const recordClick = vi.spyOn(source, 'recordClick');
        await userEvent.click(screen.getByRole('button', { name: /What's new/ }));

        await userEvent.click(screen.getByRole('link', { name: 'Read more' }));
        expect(recordClick).toHaveBeenCalledWith('news_one');

        await userEvent.click(screen.getByRole('button', { name: 'Take the tour' }));
        expect(screen.queryByRole('dialog', { name: "What's new" })).toBeNull();
        await waitFor(() => expect(controller.getSnapshot().runner.tour?.key).toBe('onboarding'));
    });
});

describe('AnnouncementModal', () => {
    const modal = defineAnnouncement({
        key: 'big_news',
        tier: 'modal',
        title: 'Big news',
        body: 'Something changed',
        publishedAt: '2026-01-01T00:00:00Z',
    });

    it('shows the modal-tier announcement and closes on acknowledge', async () => {
        const { wrapper } = createHarness({ announcements: [modal], route: '/home' });
        render(<AnnouncementModal />, { wrapper: withMantine(wrapper) });

        const dialog = await screen.findByRole('dialog', { name: 'Big news' });
        expect(dialog).toHaveAccessibleDescription(/Something changed/);
        await waitFor(() => expect(dialog).toContainElement(document.activeElement as HTMLElement));

        await userEvent.click(screen.getByRole('button', { name: 'Got it' }));

        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });

    it('dismisses on Escape', async () => {
        const { wrapper, source } = createHarness({ announcements: [modal], route: '/home' });
        const dismiss = vi.spyOn(source, 'dismiss');
        render(<AnnouncementModal />, { wrapper: withMantine(wrapper) });
        await screen.findByRole('dialog');

        await userEvent.keyboard('{Escape}');

        expect(dismiss).toHaveBeenCalledWith('big_news');
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    });
});

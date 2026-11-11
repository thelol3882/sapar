import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineAnnouncement, defineTour } from '../../src/core';
import { createHarness } from '../../src/react/testHarness';
import { nativeState, openURL, resetNativeMock, styleOf } from '../../src/expo/testing/reactNativeMock';
import { AnnouncementModal } from './AnnouncementModal';
import { TourCard } from './TourCard';
import { WhatsNewButton } from './WhatsNewButton';

vi.mock('react-native', async () => (await import('../../src/expo/testing/reactNativeMock')).reactNativeModule);
vi.mock('react-native-svg', async () => (await import('../../src/expo/testing/reactNativeMock')).svgModule);
// The templates import the package index, which re-exports the router bindings.
vi.mock('expo-router', () => ({}));

beforeEach(resetNativeMock);

const tour = defineTour({
    key: 'onboarding',
    title: 'Onboarding',
    steps: [
        { key: 'welcome', title: 'Welcome', body: 'Let us show you around' },
        { key: 'upgrade', title: 'Upgrade here', body: 'Plans live here', anchor: 'billing.upgrade' },
        { key: 'finish', title: 'All set', body: 'Enjoy' },
    ],
});

const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));

describe('TourCard', () => {
    async function renderTour(props: ComponentProps<typeof TourCard> = {}) {
        const harness = createHarness({ tours: [tour], anchors: ['billing.upgrade'] });
        render(<TourCard {...props} />, { wrapper: harness.wrapper });
        await act(() => harness.controller.startTour('onboarding'));
        return harness.controller;
    }

    it('walks a full tour', async () => {
        const controller = await renderTour();

        expect(screen.getByRole('heading', { name: 'Welcome' })).toBeInTheDocument();
        expect(screen.getByText('1 / 3')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();

        click('Next');
        await screen.findByRole('heading', { name: 'Upgrade here' });
        expect(screen.getByText('2 / 3')).toBeInTheDocument();

        click('Next');
        await screen.findByRole('heading', { name: 'All set' });
        click('Done');

        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
        expect(controller.getSnapshot().runner.phase).toBe('idle');
    });

    it('skips from the Skip and Close buttons', async () => {
        const controller = await renderTour();
        click('Skip tour');
        expect(controller.getSnapshot().runner.phase).toBe('idle');

        await act(() => controller.startTour('onboarding'));
        click('Close tour');
        expect(controller.getSnapshot().runner.phase).toBe('idle');
    });

    it('takes its labels from props', async () => {
        await renderTour({ labels: { next: 'Далее', skip: 'Пропустить', progress: ({ position, total }) => `${position} из ${total}` } });

        expect(screen.getByRole('button', { name: 'Далее' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Пропустить' })).toBeInTheDocument();
        expect(screen.getByText('1 из 3')).toBeInTheDocument();
    });

    it.each([
        ['light', '#ffffff'],
        ['dark', '#171717'],
    ] as const)('follows the %s colour scheme', async (scheme, surface) => {
        nativeState.colorScheme = scheme;
        await renderTour();

        expect(styleOf(screen.getByRole('dialog')).backgroundColor).toBe(surface);
    });

    it('lays its own colours over the scheme palette', async () => {
        nativeState.colorScheme = 'dark';
        await renderTour({ colors: { surface: '#102030', accent: '#ff0000' } });

        expect(styleOf(screen.getByRole('dialog'))).toMatchObject({ backgroundColor: '#102030', borderColor: '#404040' });
        expect(styleOf(screen.getByRole('button', { name: 'Next' }))).toMatchObject({ backgroundColor: '#ff0000' });
    });

    it('passes presentation and insets on to the popover', async () => {
        await renderTour({ presentation: 'sheet', insets: { bottom: 34 } });

        expect(styleOf(screen.getByRole('dialog').parentElement as HTMLElement)).toMatchObject({
            position: 'absolute',
            bottom: 0,
            paddingBottom: 34,
        });
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

    async function setup(props: ComponentProps<typeof WhatsNewButton> = {}) {
        const harness = createHarness({ tours: [tour], announcements: feed });
        render(<WhatsNewButton {...props} />, { wrapper: harness.wrapper });
        await act(() => harness.controller.refresh());
        return harness;
    }

    it('shows a sparkle icon in a button named by its label', async () => {
        await setup({ label: 'Latest' });

        const button = screen.getByRole('button', { name: 'Latest (2)' });
        expect(within(button).getByTestId('svg')).toBeInTheDocument();
    });

    it('shows the unread count and clears it once the panel is opened', async () => {
        const { controller } = await setup({ locale: 'en-US' });
        click("What's new (2)");

        expect(screen.getByText('Dark mode')).toBeInTheDocument();
        expect(screen.getByText('Faster search')).toBeInTheDocument();
        expect(screen.getByText('Mar 1, 2026')).toBeInTheDocument();
        await waitFor(() => expect(controller.getSnapshot().inbox?.unreadCount).toBe(0));
        expect(screen.getByRole('button', { name: "What's new" })).toBeInTheDocument();
    });

    it('keeps the new markers while the panel is open and marks the unread items seen once', async () => {
        const { source, controller } = await setup();
        const markSeen = vi.spyOn(source, 'markSeen');
        click(/What's new/);

        await waitFor(() => expect(controller.getSnapshot().inbox?.unreadCount).toBe(0));
        expect(screen.getAllByText('New')).toHaveLength(2);
        expect(markSeen).toHaveBeenCalledTimes(1);
        expect(markSeen).toHaveBeenCalledWith(['news_one', 'news_two']);
    });

    it('formats dates with the default format', async () => {
        await setup({ locale: 'en-US' });
        click(/What's new/);

        expect(screen.getByText('Mar 1, 2026')).toBeInTheDocument();
    });

    it('formats dates with formatDate and never touches Intl', async () => {
        const intl = vi.spyOn(Intl, 'DateTimeFormat');
        await setup({ formatDate: (isoDate) => `on ${isoDate.slice(0, 10)}` });
        click(/What's new/);

        expect(screen.getByText('on 2026-03-01')).toBeInTheDocument();
        expect(intl).not.toHaveBeenCalled();
    });

    it('takes colours for the badge and for the panel it opens', async () => {
        nativeState.colorScheme = 'dark';
        await setup({ colors: { badge: '#00aa00' }, panelColors: { surface: '#102030' } });

        const badge = screen.getByText('2').parentElement as HTMLElement;
        expect(styleOf(badge)).toMatchObject({ backgroundColor: '#00aa00' });
        click(/What's new/);
        expect(styleOf(screen.getByTestId('modal').firstElementChild as HTMLElement)).toMatchObject({ backgroundColor: '#102030' });
        expect(styleOf(screen.getByRole('heading', { name: "What's new" }))).toMatchObject({ color: '#f5f5f5' });
    });

    it('keeps the panel closed until the button is pressed, and closes it again', async () => {
        await setup();
        expect(screen.queryByTestId('modal')).toBeNull();

        click(/What's new/);
        expect(screen.getByTestId('modal')).toBeInTheDocument();

        click('Close');
        expect(screen.queryByTestId('modal')).toBeNull();
    });

    it('says so when there is nothing new', async () => {
        const harness = createHarness();
        render(<WhatsNewButton />, { wrapper: harness.wrapper });

        click("What's new");

        expect(screen.getByText('Nothing new yet.')).toBeInTheDocument();
    });

    it('opens the CTA link and records the click', async () => {
        const { source } = await setup();
        const recordClick = vi.spyOn(source, 'recordClick');
        click(/What's new/);

        fireEvent.click(screen.getByRole('link', { name: 'Read more' }));

        expect(recordClick).toHaveBeenCalledWith('news_one');
        expect(openURL).toHaveBeenCalledWith('https://example.com/dark');
    });

    it('closes the panel and starts the linked tour', async () => {
        const { controller } = await setup();
        click(/What's new/);

        click('Take the tour');

        expect(screen.queryByTestId('modal')).toBeNull();
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
        tourKey: 'onboarding',
    });

    it('shows the modal-tier announcement and closes on acknowledge', async () => {
        const { wrapper, source } = createHarness({ tours: [tour], announcements: [modal], route: '/home' });
        const markSeen = vi.spyOn(source, 'markSeen');
        render(<AnnouncementModal />, { wrapper });

        expect(await screen.findByRole('heading', { name: 'Big news' })).toBeInTheDocument();
        expect(screen.getByText('Something changed')).toBeInTheDocument();

        click('Got it');

        await waitFor(() => expect(markSeen).toHaveBeenCalledWith(['big_news']));
        await waitFor(() => expect(screen.queryByTestId('modal')).toBeNull());
    });

    it('acknowledges and starts the linked tour', async () => {
        const harness = createHarness({ tours: [tour], announcements: [modal], route: '/home' });
        render(<AnnouncementModal />, { wrapper: harness.wrapper });
        await screen.findByRole('heading', { name: 'Big news' });

        click('Take the tour');

        await waitFor(() => expect(harness.controller.getSnapshot().runner.tour?.key).toBe('onboarding'));
    });

    it('takes its colours from props over the scheme palette', async () => {
        nativeState.colorScheme = 'dark';
        const { wrapper } = createHarness({ tours: [tour], announcements: [modal], route: '/home' });
        render(<AnnouncementModal colors={{ surface: '#102030' }} />, { wrapper });

        await screen.findByRole('heading', { name: 'Big news' });

        expect(styleOf(screen.getByRole('dialog'))).toMatchObject({ backgroundColor: '#102030' });
        expect(styleOf(screen.getByRole('heading', { name: 'Big news' }))).toMatchObject({ color: '#f5f5f5' });
    });

    it('renders nothing without an announcement to show', () => {
        const { wrapper } = createHarness({ route: '/home' });
        render(<AnnouncementModal />, { wrapper });

        expect(screen.queryByTestId('modal')).toBeNull();
    });
});

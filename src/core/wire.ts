import type {
    Announcement,
    AnnouncementTier,
    Inbox,
    Interruption,
    Placement,
    ProgressInput,
    Tour,
    TourStatus,
    TourStep,
} from './types';

export interface WireStep {
    step_key: string;
    order: number;
    /** Empty means a centered step. */
    anchor_key: string;
    /** Empty means the current route. */
    route: string;
    title: string;
    body: string;
    placement: Placement;
    spotlight_padding: number;
    is_required: boolean;
}

export interface WireTour {
    key: string;
    revision: number;
    title: string;
    trigger: 'manual' | 'route';
    steps: WireStep[];
}

export interface WireTourState {
    status: TourStatus;
    last_step_index: number;
    completed_at: string | null;
    dismissed_at: string | null;
}

export interface WireTourDetail extends WireTour {
    state: WireTourState | null;
}

export interface WireAnnouncement {
    key: string;
    tier: AnnouncementTier;
    title: string;
    body: string;
    image_url: string;
    cta_label: string;
    cta_url: string;
    published_at: string | null;
    tour_key: string | null;
    is_unread: boolean;
}

export interface WireInterruption {
    kind: 'tour' | 'announcement';
    tour: WireTour | null;
    announcement: WireAnnouncement | null;
}

export interface WireInbox {
    unread_count: number;
    items: WireAnnouncement[];
    interruption: WireInterruption | null;
}

export interface WireProgress {
    status: TourStatus;
    step_index: number;
    auto_started: boolean;
}

function fromWireStep(step: WireStep): TourStep {
    return {
        key: step.step_key,
        ...(step.anchor_key && { anchor: step.anchor_key }),
        ...(step.route && { route: step.route }),
        title: step.title,
        body: step.body,
        placement: step.placement,
        padding: step.spotlight_padding,
        required: step.is_required,
        advanceOn: 'next',
    };
}

// The payload carries no route pattern, so a route-triggered tour maps to the match-everything pattern.
export function fromWireTour(tour: WireTour): Tour {
    return {
        key: tour.key,
        revision: tour.revision,
        title: tour.title,
        trigger: tour.trigger === 'route' ? { route: '*' } : 'manual',
        steps: [...tour.steps].sort((a, b) => a.order - b.order).map(fromWireStep),
    };
}

export function fromWireAnnouncement(announcement: WireAnnouncement): Announcement {
    return {
        key: announcement.key,
        tier: announcement.tier,
        title: announcement.title,
        body: announcement.body,
        ...(announcement.image_url && { imageUrl: announcement.image_url }),
        ...(announcement.cta_url && { cta: { label: announcement.cta_label, url: announcement.cta_url } }),
        publishedAt: announcement.published_at,
        ...(announcement.tour_key && { tourKey: announcement.tour_key }),
        unread: announcement.is_unread,
    };
}

function fromWireInterruption({ kind, tour, announcement }: WireInterruption): Interruption | null {
    if (kind === 'tour' && tour) return { kind, tour: fromWireTour(tour) };
    if (kind === 'announcement' && announcement) return { kind, announcement: fromWireAnnouncement(announcement) };
    return null;
}

export function fromWireInbox(inbox: WireInbox): Inbox {
    return {
        unreadCount: inbox.unread_count,
        items: inbox.items.map(fromWireAnnouncement),
        interruption: inbox.interruption && fromWireInterruption(inbox.interruption),
    };
}

// The backend takes no revision: it records progress against the tour's current one.
export function toWireProgress({ status, stepIndex, autoStarted }: ProgressInput): WireProgress {
    return { status, step_index: stepIndex, auto_started: autoStarted };
}

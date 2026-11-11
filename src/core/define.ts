import { isValidRoutePattern } from './routes';
import type {
    Announcement,
    AnnouncementTier,
    LocalizedText,
    Placement,
    Platform,
    Tour,
    TourStep,
    TourTrigger,
} from './types';

export interface StepDefinition {
    key: string;
    anchor?: string;
    route?: string;
    title: LocalizedText;
    body: LocalizedText;
    placement: Placement;
    padding: number;
    required: boolean;
    advanceOn: 'next' | 'press';
}

export interface TourDefinition {
    key: string;
    revision: number;
    title: LocalizedText;
    trigger: TourTrigger;
    steps: StepDefinition[];
    /** Platforms the tour is offered on. Absent means all. */
    platforms?: Platform[];
}

export interface AnnouncementDefinition {
    key: string;
    tier: AnnouncementTier;
    title: LocalizedText;
    body: LocalizedText;
    imageUrl?: string;
    cta?: { label: LocalizedText; url: string };
    /** ISO 8601. */
    publishedAt: string;
    tourKey?: string;
}

export type StepInput = Pick<StepDefinition, 'key' | 'title' | 'body'> & Partial<StepDefinition>;
export type TourInput = Pick<TourDefinition, 'key' | 'title'> &
    Partial<Omit<TourDefinition, 'steps'>> & { steps: StepInput[] };
export type AnnouncementInput = Pick<AnnouncementDefinition, 'key' | 'title' | 'body' | 'publishedAt'> &
    Partial<AnnouncementDefinition>;

export interface TextLocale {
    locale: string;
    fallbackLocale: string;
}

/** Grammar for tour, step, announcement and anchor keys. Shared with the backend and the CLI. */
export const KEY_PATTERN = /^[a-z0-9_]+(\.[a-z0-9_]+)*$/;

function assertKey(kind: string, key: string): void {
    if (!KEY_PATTERN.test(key)) {
        throw new Error(`Invalid ${kind} key "${key}": use lowercase letters, digits and underscores, dot-separated.`);
    }
}

function assertUnique(kind: string, keys: readonly string[]): void {
    const duplicate = keys.find((key, index) => keys.indexOf(key) !== index);
    if (duplicate !== undefined) throw new Error(`Duplicate ${kind} key "${duplicate}".`);
}

function defineStep(input: StepInput, tourKey: string): StepDefinition {
    assertKey(`step in tour "${tourKey}"`, input.key);
    if (input.anchor !== undefined) assertKey(`anchor of step "${input.key}"`, input.anchor);
    const { placement = 'auto', padding = 8, required = false, advanceOn = 'next', ...rest } = input;
    return { ...rest, placement, padding, required, advanceOn };
}

export function defineTour(input: TourInput): TourDefinition {
    assertKey('tour', input.key);
    const { revision = 1, trigger = 'manual' } = input;
    if (!Number.isInteger(revision) || revision < 1) {
        throw new Error(`Tour "${input.key}" needs a positive integer revision, got ${revision}.`);
    }
    if (input.steps.length === 0) throw new Error(`Tour "${input.key}" needs at least one step.`);
    if (trigger !== 'manual' && !isValidRoutePattern(trigger.route)) {
        throw new Error(`Tour "${input.key}" has an invalid route pattern "${trigger.route}".`);
    }

    const steps = input.steps.map((step) => defineStep(step, input.key));
    assertUnique(`step in tour "${input.key}"`, steps.map((step) => step.key));
    return { key: input.key, revision, title: input.title, trigger, steps, ...(input.platforms && { platforms: input.platforms }) };
}

export function defineAnnouncement(input: AnnouncementInput): AnnouncementDefinition {
    if (Number.isNaN(Date.parse(input.publishedAt))) {
        throw new Error(`Announcement "${input.key}" has an invalid publishedAt "${input.publishedAt}".`);
    }
    const { tier = 'feed', ...rest } = input;
    return { ...rest, tier };
}

export function defineAnchors<const Keys extends readonly string[]>(keys: Keys): Keys {
    keys.forEach((key) => assertKey('anchor', key));
    assertUnique('anchor', keys);
    return keys;
}

export type AnchorKey<Anchors extends readonly string[]> = Anchors[number];

export function resolveText(text: LocalizedText, locale: string, fallbackLocale: string): string {
    if (typeof text === 'string') return text;
    return text[locale] ?? text[fallbackLocale] ?? '';
}

function resolveStep(step: StepDefinition, { locale, fallbackLocale }: TextLocale): TourStep {
    return {
        ...step,
        title: resolveText(step.title, locale, fallbackLocale),
        body: resolveText(step.body, locale, fallbackLocale),
    };
}

export function resolveTour(tour: TourDefinition, textLocale: TextLocale): Tour {
    return {
        ...tour,
        title: resolveText(tour.title, textLocale.locale, textLocale.fallbackLocale),
        steps: tour.steps.map((step) => resolveStep(step, textLocale)),
    };
}

export function resolveAnnouncement(
    announcement: AnnouncementDefinition,
    { locale, fallbackLocale }: TextLocale,
    unread: boolean,
): Announcement {
    const { cta, ...rest } = announcement;
    return {
        ...rest,
        title: resolveText(announcement.title, locale, fallbackLocale),
        body: resolveText(announcement.body, locale, fallbackLocale),
        ...(cta && { cta: { label: resolveText(cta.label, locale, fallbackLocale), url: cta.url } }),
        unread,
    };
}

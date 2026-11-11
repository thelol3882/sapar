# Sapar

*Sapar* (сапар) is Kazakh for a journey. This one takes a person on a short trip through your app, and tells them what is new.

Headless product tours and a "What's New" feed for React, Next.js and Expo: `@thelol3882/sapar`.

- Spotlight tours, announcements (silent, feed or modal) and an unread badge.
- Headless parts plus copy-in Tailwind templates: you own the markup.
- Runs on an in-memory source (definitions in code, state in `localStorage`) or against a backend that speaks the Sapar HTTP contract (see Backend compatibility), over `fetch` or RTK Query.
- Framework-free core with platform adapters for the web (Next.js) and Expo / React Native.
- A `sapar` CLI: `init` scaffolds the setup, `add` copies UI templates (Tailwind, Mantine, Expo), `check` is the CI gate for anchors.

## Install

```bash
pnpm add @thelol3882/sapar
```

Peer dependencies: `react >= 18.3`. Optional: `next >= 15` (for `/next`), `@reduxjs/toolkit >= 2` and `react-redux >= 9` (for `/rtk`).

## Quick start (Next.js App Router + Tailwind)

Define a tour and its anchors once:

```ts
// tours/definitions.ts
import { defineAnchors, defineTour } from '@thelol3882/sapar';

export const anchors = defineAnchors(['nav.menu', 'billing.invoices']);

export const onboarding = defineTour({
    key: 'onboarding',
    title: 'Welcome',
    trigger: { route: '/dashboard' },
    steps: [
        { key: 'welcome', title: 'Welcome', body: 'A quick look around.' },
        { key: 'menu', anchor: 'nav.menu', title: 'Navigation', body: 'Everything lives here.' },
    ],
});
```

Mount the provider in a client component under your root layout:

```tsx
// app/tours-provider.tsx
'use client';

import { memorySource } from '@thelol3882/sapar';
import { NextSaparProvider } from '@thelol3882/sapar/next';
import { localStorageStore } from '@thelol3882/sapar/web';
import type { ReactNode } from 'react';
import { onboarding } from '../tours/definitions';

const source = memorySource({ tours: [onboarding], storage: localStorageStore() });

export function AppSaparProvider({ children }: { children: ReactNode }) {
    return <NextSaparProvider source={source}>{children}</NextSaparProvider>;
}
```

Create the source once (module scope or `useMemo`): the provider recreates its controller whenever the `source` identity changes.

Mark what a tour can point at, and render a card copied from `templates/tailwind` once inside the provider:

```tsx
'use client';

import { useTourAnchor } from '@thelol3882/sapar/web';
import { TourCard } from '@/components/tours/TourCard'; // copied from templates/tailwind

export function Menu() {
    return <nav {...useTourAnchor('nav.menu')}>...</nav>;
}

export function AppShell({ children }: { children: ReactNode }) {
    return (
        <AppSaparProvider>
            {children}
            <TourCard />
        </AppSaparProvider>
    );
}
```

Server components can mark anchors with a plain attribute instead: `<section data-sapar="billing.invoices">`.

Start a tour on demand with `useSapar().startTour('onboarding')`.

## Defining tours in code

```ts
import { defineAnchors, defineAnnouncement, defineTour } from '@thelol3882/sapar';

export const release = defineAnnouncement({
    key: 'release_2026_03',
    tier: 'modal', // 'silent' | 'feed' | 'modal'
    title: { en: 'Faster invoices', ru: 'Быстрее счета' },
    body: { en: 'Invoices now load instantly.', ru: 'Счета загружаются мгновенно.' },
    publishedAt: '2026-03-01T00:00:00Z',
    tourKey: 'onboarding',
});
```

Keys are lowercase, digits and underscores, dot-separated. Text is a string or a per-locale map. Changing a tour's `revision` re-offers it.

`defineAnchors` keeps anchor names typed. Wrap `useTourAnchor` once so a typo fails to compile:

```ts
import type { AnchorKey } from '@thelol3882/sapar';
import { useTourAnchor } from '@thelol3882/sapar/web';
import { anchors } from './definitions';

export const useAnchor = (key: AnchorKey<typeof anchors>) => useTourAnchor(key);
```

## Sources

A source is where tours, announcements and per-user state come from (`SaparSource`).

**In memory.** Definitions live in code, state in a `KeyValueStore`:

```ts
import { memorySource } from '@thelol3882/sapar';
import { localStorageStore } from '@thelol3882/sapar/web';

const source = memorySource({
    tours: [onboarding],
    announcements: [release],
    storage: localStorageStore(),
    locale: () => 'en',
    policy: { cooldownHours: 12 },
    namespace: `app.sapar.${userId}`,
    registeredAt: user.createdAt,
});
```

- **`namespace`** prefixes every storage key. Give each user their own (`app.sapar.${userId}`): on a shared computer, people otherwise share one "seen" state.
- **`registeredAt`** drives the new-user grace period. Without it the grace period is skipped and a brand-new account can be interrupted on its first visit, so pass the account's creation date.

### Texts from your i18n library

Definitions take a string or a per-locale map (`{ en, ru }`). If your texts live in next-intl, i18next or similar, put message keys in the definitions and resolve them with `translate`, which runs every time a text is read:

```tsx
'use client';

function AppSaparProvider({ children }: { children: ReactNode }) {
    const t = useTranslations('tours');
    const latestT = useRef(t);
    useEffect(() => {
        latestT.current = t;
    }, [t]);

    // Created once: `translate` reads the latest `t`, so a locale switch does not change the source.
    const [source] = useState(() =>
        memorySource({ tours, storage: localStorageStore(), translate: (key) => latestT.current(key) }),
    );
    return <NextSaparProvider source={source}>{children}</NextSaparProvider>;
}
```

Keep the source's identity stable. The provider recreates its controller whenever `source` changes: a running tour is closed, and the inbox is fetched again. After a locale switch, call `useSaparController().refresh()` so the What's New items are re-read; a tour that is already running keeps its texts until it is started again.

**HTTP.** The fetch-based client for the backend:

```ts
import { httpSource } from '@thelol3882/sapar';

const source = httpSource({
    baseUrl: '/api/tours',
    credentials: 'include',
    headers: () => ({ Authorization: `Bearer ${getToken()}` }),
    locale: () => document.documentElement.lang,
});
```

**RTK Query.** Reuse your own `createApi` slice, so auth, refresh and the base URL stay in one place. No `tagTypes` edits needed: the `Sapar` tag type is added for you.

```ts
import { createSaparRtk } from '@thelol3882/sapar/rtk';
import { baseApi } from './baseApi';

export const tours = createSaparRtk(baseApi, { basePath: '/tours' });
export const { useGetSaparInboxQuery, useGetAnnouncementsQuery } = tours;
```

```tsx
function AppSaparProvider({ children }: { children: ReactNode }) {
    const source = tours.useSaparSource(); // inside the react-redux <Provider>
    return <NextSaparProvider source={source}>{children}</NextSaparProvider>;
}
```

The RTK source always refetches (the controller owns timing) and invalidates `Tours/inbox` after seen, dismiss and progress writes, so components using `useGetSaparInboxQuery` directly stay in sync. A missing tour resolves to `null`, as with `httpSource`. `createSource(dispatch)` builds the same source outside React.

## Styling: Tailwind, Mantine, your own

The package ships behavior, not CSS. `TourOverlay`, `TourSpotlight` and `TourPopover` are headless; state is exposed as data-attributes you can style with Tailwind variants (for example `data-[placement=top]:...`). `TourStep.Root`, `Title`, `Body`, `Progress`, `Next`, `Back`, `Skip` and `Close` compose your own card, rendered inside `<TourOverlay>`:

```tsx
<TourStep.Root className="w-80 rounded-xl bg-white p-4 shadow-xl">
    <TourStep.Title className="font-semibold" />
    <TourStep.Body className="mt-1 text-sm text-slate-600" />
    <TourStep.Progress className="mt-3 text-xs" />
    <TourStep.Back />
    <TourStep.Next />
    <TourStep.Skip />
</TourStep.Root>
```

Buttons take a `render` prop for design-system components, e.g. `<TourStep.Next render={(props) => <Button {...props} />} />`, and `TourOverlay` takes `spotlightStyle` / `popoverStyle` as well as class names.

Two things to know when you restyle:

- **Focus.** `TourStep.Root` receives focus on every step, so keyboard and screen-reader users land on the new step. Your global `:focus-visible` outline will draw around the card; the templates replace it with a ring that follows the card's radius. Do the same in your own card rather than removing focus.
- **Tokens.** The templates' colours are a starting point. Every colour class sits in one `styles` object at the top of each Tailwind template (one `palette` object in the Expo ones), so swapping in your design tokens is a single edit per file.

`templates/tailwind`, `templates/mantine` and `templates/expo` each hold `TourCard`, `WhatsNewButton`, `WhatsNewPanel` and `AnnouncementModal` with the same props; `sapar add` copies them into your app, then edit freely. Use `useTourStep`, `useWhatsNew`, `useWhatsNewPanel` and `useAnnouncementInterruption` to build your own. `useWhatsNewPanel(open)` marks what was unread as seen once per opening, while its `isNew` flag keeps those items marked until the panel closes. The panels take a `formatDate` prop so dates can go through your own helper.

## CLI

```bash
npx sapar init            # detect Next/Expo/React, Tailwind/Mantine, RTK; write sapar.json, definitions, provider, TourCard
npx sapar add --list      # TourCard, WhatsNewButton, WhatsNewPanel, AnnouncementModal
npx sapar add whats-new-panel announcement-modal
npx sapar check           # CI gate: exit 1 on errors, --strict fails on warnings, --format json for tooling
```

`sapar.json` holds the choices (`framework`, `style`, `source`, `componentsDir`, `toursDir`, `importBase`, and anchor scan roots per platform under `platforms`). `add` rewrites template imports to `importBase`: the package name, or the alias of a copied `src/` folder such as `@/shared/tours`. Existing files are never overwritten without `--force`.

`check` parses your sources with the TypeScript compiler (a peer dependency) and reports, per platform: step anchors no element declares (with "did you mean"), anchors missing from `defineAnchors`, invalid route patterns, invalid or duplicate keys, and catalogue anchors nothing declares. A platform with no scanned files is a warning, never a silent pass. Mark a tour `platforms: ['web']` when it only exists on one platform.

`init` flags: `--framework`, `--style`, `--source`, `--components-dir`, `--tours-dir` (for layered apps, e.g. `--tours-dir src/shared/tours`), `--import-base`, `--yes`. When your project has Prettier, `init` and `add` format the files they write with your config (`--no-format` to skip).

`check` reads string literals, and `const`s declared in the same file (`const BOARD_TOUR = 'board.intro'`). A value imported from another file cannot be verified and is reported as a warning: keep keys as literals or local consts.

From a checkout: `node dist/cli/index.js init --cwd ../your-app` (after `pnpm build`).

## Expo / React Native

Start from the Expo Router template. At the time of writing `create-expo-app` 5.x fails with `Cannot find module '@expo/env'`; `npx create-expo-app@3.5.3` works and still pulls the latest template.

```bash
npx expo install react-native-svg @react-native-async-storage/async-storage
npx sapar init --framework expo --style native --source memory --tours-dir src/shared/tours
```

`init` generates a per-user provider. Mount it near the root, then render the card last so its overlay sits above the app:

```tsx
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppSaparProvider } from '@/shared/tours/SaparProvider';
import { TourCard } from '@/components/tours/TourCard';

const TAB_BAR_HEIGHT = 49; // your tab bar's height

export default function RootLayout() {
    const insets = useSafeAreaInsets();
    const { user } = useSession(); // your auth hook
    return (
        <AppSaparProvider userId={user.id} registeredAt={user.createdAt}>
            <Stack />
            <TourCard insets={{ ...insets, bottom: insets.bottom + TAB_BAR_HEIGHT }} colors={{ surface: '#0B1F3A', accent: '#F26B1D' }} />
        </AppSaparProvider>
    );
}
```

Mark anchors with `useTourAnchor`, and wrap scrollable screens in `TourScrollView` so a step can scroll its anchor into view and the spotlight follows when the user scrolls:

```tsx
<TourScrollView>
    <Pressable {...useTourAnchor('jobs.on_my_way')} onPress={startDriving} />
</TourScrollView>
```

A view that already has its own `ref` or `onTouchEnd` passes them in, so spreading does not overwrite them: `useTourAnchor('jobs.card', { ref: cardRef, onTouchEnd })`. A `Pressable`'s `onPress` needs nothing: with `advanceOn: 'press'` the button's own handler runs and the tour advances.

### Card or sheet: `presentation`

`TourOverlay`, `TourPopover` and the `TourCard` templates take `presentation`, read on every render:

| Value | Native | Web |
| --- | --- | --- |
| `'auto'` (default) | The card next to the element when it fits above or below it; a bottom sheet only when it does not (a tall card, a tiny window, an anchor that fills the screen) | A bottom sheet below `compactBreakpointPx` (768), otherwise the card next to the element |
| `'anchored'` | Always next to the element (centred for a step without one) | Same |
| `'sheet'` | Always a bottom sheet | Same |

`compactBreakpointPx` on the adapter is only an extra threshold for `'auto'`: windows narrower than it always get the sheet. Its native default is 0 (off).

<!-- Screenshots: anchored card and bottom sheet on a phone (to be added from a device run). -->

**Safe areas, tab bar, keyboard.** `insets` is the space kept clear at each edge, in both modes. Pass the safe-area insets and add your tab bar's height to `bottom`, so a card near the bottom flips above the element instead of under the tab bar. While the keyboard is open the bottom inset becomes the keyboard's height plus a small gap (the keyboard already covers the tab bar), and it returns when the keyboard hides. The card is placed again after rotation and while a `TourScrollView` scrolls.

**Colours.** The Expo templates take `colors` (`surface`, `text`, `muted`, `accent`, `onAccent`, `pressed`, ...), applied over their light and dark palettes, so you can pass your brand without editing the file. `WhatsNewButton` also takes `panelColors` for the panel it opens.

**Storage.** `asyncStorageStore(AsyncStorage)` works with `@react-native-async-storage/async-storage` 2.x (Expo SDK 58 pins 2.2.0) and 3.x; `mmkvStore(mmkv)` works with `react-native-mmkv` before and after v4.

The Android back button skips a running tour. `/expo` does not need expo-router; only `/expo-router` does. The session cap lasts one app launch; stored progress and the cooldown survive restarts.

## When a tour starts, and what it waits for

- **Started by the user** (`startTour`): step 1 shows as soon as its own anchor is found. Each later step is resolved when the runner reaches it, so an element that unmounted since the start is skipped, never spotlighted stale.
- **Missing anchors**: on a page that is already rendered the runner waits `presentAnchorTimeoutMs` (300 ms) and skips the step; right after navigating to a step's `route` it waits `anchorTimeoutMs` (3 s) for the page to load. A missing step marked `required` ends the run silently, and the tour stays offerable.
- **Started automatically** (route trigger): the tour waits up to `autoStartTimeoutMs` (10 s) for the anchor of its first anchored step, so it never opens on a loading screen. That anchor is your "page ready" signal: render it only once the data is there, e.g. `data-sapar={loaded ? 'board.new_job' : undefined}`. If it never appears, nothing is shown and the session's interruption is not spent.
- **Progress**: `useTourStep()` gives a 1-based `position` and a `total`; steps whose anchors are not on the page right now are left out of both, so "2 / 4" stays honest.

## Interruption rules

Unbidden tours and modals are limited by a policy, applied by the backend or, for `memorySource`, locally:

| Rule | Default | Meaning |
| --- | --- | --- |
| `newUserGraceDays` | 3 | No interruptions for young accounts |
| `cooldownHours` | 24 | Minimum gap between automatic interruptions |
| `dismissalBackoffDays` | 30 | A dismissed tour returns after this long (0 means immediately) |

On top of that the client allows one automatic interruption per session (`sessionCap: false` turns it off). Tours the user starts themselves are never capped.

## `advanceOn: 'press'`

A step with `advanceOn: 'press'` moves on when the user presses the anchored element itself, instead of a Next button:

```ts
{ key: 'open_menu', anchor: 'nav.menu', title: 'Open the menu', body: 'Tap it.', advanceOn: 'press' }
```

## Backend compatibility

A server speaks the contract `httpSource` and `createSaparRtk` use (`inbox/`, `tours/<key>/`, `tours/<key>/progress/`, `seen/`, `dismiss/`, `announcements/`, `announcements/<key>/click/`). Anchors must stay greppable so the backend's `tours_check` and `tours_anchors` commands keep working: spell them as literals, either `useTourAnchor('key')` or `data-sapar="key"`, never built dynamically.

Pass `locales` to the provider if your routes carry a locale prefix; it must match the backend's setting.

## Testing

`createTestAdapter` is a scriptable platform adapter. Pair it with a fake source and the controller:

```ts
import { createTestAdapter, createSaparController, memorySource, memoryStore } from '@thelol3882/sapar';

const adapter = createTestAdapter({ anchors: ['nav.menu'], route: '/dashboard' });
const controller = createSaparController({
    source: memorySource({ tours: [onboarding], storage: memoryStore() }),
    adapter,
});

controller.setRoute('/dashboard');
```

`delayedAnchors` plus `showAnchor` simulate anchors that mount late.

## Migrating from 0.1

Every change that alters what a value means also changes its type, so the compiler finds what to update. The full list with one-line migrations is in [CHANGELOG.md](CHANGELOG.md#020); in short:

- Step numbers are one-based and passed as objects: `useTourStep().position` (was `index`), `announceStep={({ position, total, title }) => …}` (was `announce(index, …)`), `<TourStep.Progress>{({ position, total }) => …}` (was `(index, total)`). Drop every `+ 1`.
- Remove `anchorTimeoutMs` workarounds: missing anchors are skipped after `presentAnchorTimeoutMs` (300 ms) and auto-started tours wait for their first anchor (`autoStartTimeoutMs`, 10 s).
- On Expo, phones now get the card next to the element; pass `presentation="sheet"` for the old bottom sheet, and drop `compactBreakpointPx: 0`. Brand colours go through `colors`.
- `sapar init --tours-dir` chooses where definitions and the provider go; generated memory providers take `userId` and `registeredAt`.
- Re-run `sapar add <Name> --force` to pick up the template fixes, then re-apply your styles.

## Entry points

| Import | Contents |
| --- | --- |
| `@thelol3882/sapar` | Core: types, `defineTour`, `defineAnnouncement`, `defineAnchors`, `createSaparController`, `memorySource`, `httpSource`, `createTestAdapter` |
| `@thelol3882/sapar/react` | `SaparProvider`, `useSapar`, `useTourStep`, `useWhatsNew`, `useWhatsNewPanel`, `useAnnouncementInterruption`, `useSaparController`, `useSaparSnapshot` (no DOM: shared by web and Expo) |
| `@thelol3882/sapar/web` | `useTourAnchor`, `BodyPortal`, `createWebAdapter`, `localStorageStore`, `browserSessionStore`, `TourOverlay`, `TourSpotlight`, `TourPopover`, `TourStep.*` |
| `@thelol3882/sapar/next` | `NextSaparProvider`, `useNextSaparAdapter` |
| `@thelol3882/sapar/rtk` | `createSaparRtk` |
| `@thelol3882/sapar/expo` | `useTourAnchor`, `createExpoAdapter`, `TourScrollView`, `asyncStorageStore`, `mmkvStore`, `TourOverlay`, `TourSpotlight`, `TourPopover`, `TourStep.*`, `computeCardPosition` |
| `@thelol3882/sapar/expo-router` | `ExpoSaparProvider`, `useExpoRouterAdapter` |
| `sapar` (bin) | `init`, `add`, `check` |

## Maintenance

Sapar is a side project, built for my own apps and shared as is. I improve it when my projects need something, so there is no schedule and no promise of support or fixes. Issues and pull requests are welcome; I read them when I can. MIT licensed: use it, fork it, change it.

## License

[MIT](LICENSE)

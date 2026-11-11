# Changelog

## 0.3.0

The package is now **Sapar** (сапар, "a journey"), published as `@thelol3882/sapar` under the MIT licence. Behaviour is the same as 0.2.0; only names change.

### Breaking changes

| Was (0.2, `@shared-kit/tours`) | Now (0.3, `@thelol3882/sapar`) |
| --- | --- |
| `import … from '@shared-kit/tours/…'` | `import … from '@thelol3882/sapar/…'` |
| `ToursProvider`, `NextToursProvider`, `ExpoToursProvider`, `useTours`, `createToursController`, `ToursSource`, `createToursRtk` and the other `*Tours*` names | The same with `Sapar`: `SaparProvider`, `NextSaparProvider`, `ExpoSaparProvider`, `useSapar`, `createSaparController`, `SaparSource`, `createSaparRtk`, … |
| CLI `tours init / add / check`, config `tours.json` | `sapar init / add / check`, `sapar.json` (rename the file) |
| Anchor attribute `data-tour="key"` | `data-sapar="key"` (`useTourAnchor` sets it for you) |
| `memorySource` storage keys `tours.*` (default namespace `tours`) | `sapar.*` (default namespace `sapar`). Pass `namespace: 'tours'` to keep the progress people already have |
| RTK tag type `Tours` | `Sapar` |

Concept names stay: `defineTour`, `Tour`, `TourStep`, `useTourAnchor`, `tourKey`, `--tours-dir`, and the HTTP paths `tours/<key>/`.

## 0.2.0

Changes from the first two integrations (a Next.js app and an Expo app).

### Breaking changes

Every change below that alters what a value means also changes its type, so old code fails to compile instead of silently reading wrong.

| Was (0.1) | Now (0.2) | Migration |
| --- | --- | --- |
| `useTourStep().index` (zero-based) | `position` (one-based) and `total` | `index + 1` → `position` |
| `<TourStep.Root announce={(index, total, title) => …}>` | `announceStep={({ position, total, title }) => …}` | Rename the prop, take an object, drop the `+ 1` |
| `<TourStep.Progress>{(index, total) => …}</TourStep.Progress>` | `{({ position, total }) => …}` | Take an object, drop the `+ 1` |
| Template labels `progress(index, total)`, `announce(index, total, title)` | `progress({ position, total })`, `announceStep({ position, total, title })` | Re-run `sapar add TourCard --force`, or change your copy the same way |
| `RunnerSnapshot.steps` / `ViableStep` / `resolveSteps` | `RunnerSnapshot.handle` and `skipped` | Read the current step through `useTourStep()` |
| Native `compactBreakpointPx` default 768 (phones got the bottom sheet) | Default 0: phones get the card next to the element when it fits | Pass `presentation="sheet"` to keep the old look |
| Generated memory provider took no props | `<AppSaparProvider userId registeredAt>` | Pass the signed-in user's id and creation date |

### Added

- `presentAnchorTimeoutMs` (300) and `autoStartTimeoutMs` (10 000) controller options. Anchors resolve per step: the first step shows as soon as its own anchor is found, missing steps are skipped after the short wait, and the full `anchorTimeoutMs` applies only after a navigation.
- Auto-started tours wait for their first anchor, so a tour never opens on a loading screen.
- `presentation: 'auto' | 'anchored' | 'sheet'` on `TourOverlay`, `TourPopover` and the `TourCard` templates.
- `memorySource({ translate })` for definitions that hold i18n message keys.
- `useWhatsNewPanel(open)`, `BodyPortal`, `formatDate` on the panels, `colors` / `panelColors` on the Expo templates, `render` on `TourStep` buttons.
- CLI: `init --tours-dir`, `--no-format` (otherwise output is formatted with the project's Prettier), `check` resolves same-file string consts.
- `useTourAnchor(key, { ref, onTouchEnd })` on Expo composes the view's own handlers.

### Fixed

- The spotlight kept the previous step's hole when the current step's element was gone.
- The What's New panel and modal templates were trapped in their parent's stacking context; they now portal to `document.body`.
- "New" markers vanished as soon as the panel opened.
- The bottom sheet / card now clears the keyboard and follows `TourScrollView` scrolling and rotation.
- The CLI prints paths with `/` on every OS, and the test suite passes on any locale and on Windows.

## 0.1.0

First package-ready version, split out of `tours/web`.

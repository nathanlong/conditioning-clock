# Conditioning Clock: Initial Build Specification

## Objective

A web-based fitness interval timer with multiple modes, readable from across a gym, with loud, accurate audio cues and matching visual cues. It's usable with a screen reader, a keyboard, or the sound off.

## Decisions (confirmed)

| Topic | Decision |
| --- | --- |
| Framework | **None.** Vanilla TypeScript + Vite. The app is two screens. The hard parts (timing, cue scheduling, recovery) are pure logic that wouldn't benefit from a framework. |
| Location | `conditioning-clock/` (spec in `conditioning-clock/spec/`) |
| Hosting | GitHub Pages at `/conditioning-clock/` on the existing custom domain |
| Sounds | **Custom Web Audio synthesis only.** No Cuelume. Its cues are subtle UI sounds, too quiet for a gym. |
| AMRAP pacing | One pace cue per target round (rep): `paceInterval = duration / repGoal`. Tick marks on the main ring show each division. |
| ETOT config | Set by number of rounds (30s each). The total time is shown, not set. |
| For Time cap | Optional. Off by default; the user can turn it on and set a cap. |
| Tabata final rest | Skipped. The program ends when the last work interval ends. |
| Display precision | Whole seconds only. No tenths. |
| Shared features | Lead-in countdown, pause/resume, screen wake lock, remembered settings, recovery after reload |
| Main visual | A radial ring that fills slowly, with seconds in the center. An outer overall-progress ring appears when there are rounds plus an overall time. |
| Colors | Work blue, rest and lead-in green (ring + digits), overall orange, paused red (main ring + digits; the overall ring stays orange), not started gray (everything). Unfilled ring tracks are a neutral gray. |
| Ready screen | Setup's **Start** opens the timer in a gray idle state. A second **Start** begins the run. |
| Testing | Vitest: pure logic in Node, UI in browser mode (Chromium + WebKit). Playwright E2E smoke tests with axe scans. All of it gates `deploy.sh`. |

## Tech Stack

- TypeScript (strict), Vite, CSS (custom properties, no framework)
- Vitest 4: a `unit` project (Node) and a `browser` project (Vitest browser mode, Chromium + WebKit through `@vitest/browser-playwright`)
- Playwright Test for E2E smoke tests, plus `@axe-core/playwright` for automated accessibility checks
- Prettier

### Dev dependencies (to be approved before install)

`typescript`, `vite`, `vitest`, `@vitest/browser-playwright`, `playwright`, `@playwright/test`, `@axe-core/playwright`, `prettier`. Browsers are installed once with `npx playwright install chromium webkit`, and both Vitest browser mode and E2E share them. There's no Testing Library: Vitest browser mode's built-in `page.getByRole` locators and `userEvent` cover the same ground.

## Commands

- Dev: `npm run dev`
- Build: `npm run build`
- Test (watch, all Vitest projects): `npm run test`
- Test (single run): `npm run test-headless`
- Test, one project: `npm run test-unit` / `npm run test-browser`
- E2E + axe: `npm run test-e2e` (builds and previews the production bundle first)
- Typecheck: `npm run check` (`tsc --noEmit`)
- Deploy: `npm run deploy` (runs `bin/deploy.sh`, which gates on all checks)

## Hosting

GitHub Pages project site, served at `/conditioning-clock/` on the existing custom domain (configured on the user site repo, `nathanlong.github.io`).

- `vite.config.ts` sets `base: '/conditioning-clock/'`. All asset and app URLs must be relative or go through `import.meta.env.BASE_URL`, never a hardcoded `/`.
- Deployment follows `nathanlong.github.io/bin/deploy.sh` (copy it along with `bin/utils.sh`), with a test gate added at the front:
  0. **Gate:** abort if the git working tree is dirty, so every deploy matches a commit. Then run `npm run check && npm run test-headless && npm run test-e2e`; `set -eu` aborts on any failure.
  1. `npm run build` into `dist/`. The build output and the deploy worktree are kept separate, so Vite's `emptyOutDir` never touches git metadata.
  2. Attach a fresh `.gh-pages/` worktree on the `gh-pages` branch, after `rm -rf` and `git worktree prune`.
  3. **Guard:** abort unless `.gh-pages/.git` exists and the worktree is really on `gh-pages`.
  4. `rsync -a --checksum --delete --exclude='.git' dist/ .gh-pages/`
  5. Amend a single `build YYMMDD` commit (`--reset-author`), then `push --force-with-lease`.
  6. Remove the worktree.
- `.gitignore` includes `dist/` and `.gh-pages/`.
- Because the script uses `commit --amend`, the `gh-pages` branch needs an initial commit before the first deploy.
- No `CNAME` file is needed in this repo. The custom domain lives on the user site, and project repos inherit it.
- HTTPS (enforced by Pages) is required for the Wake Lock API and `navigator.audioSession`.
- **Shared origin:** every project under the custom domain shares one origin, and therefore one localStorage. The `cc:v1:` key prefix is required, not just a nicety.

---

## Core Architecture

Every mode compiles into the same data structure: a **Program**. One engine runs every Program, so modes are only config-to-Program builders. Nothing else is mode-specific: timing, audio, persistence, and the run screen are shared.

```
ModeConfig ──build()──▶ Program ──▶ Runner (clock + state machine, no DOM)
                          │              │ state events, elapsedMs()
                          │              ├──▶ Run View: rAF loop → snapshot() → ringState() → DOM
                          │              ├──▶ Announcer (screen reader live region)
                          └── cues[] ────┴──▶ Audio Scheduler (Web Audio timeline)
```

The **Runner** knows nothing about the DOM. The **Run View** owns the requestAnimationFrame loop and only *reads* elapsed time from the runner.

### Types (`src/core/types.ts`)

```ts
type ModeId = 'emom' | 'etot' | 'amrap' | 'forTime' | 'tabata'
type SegmentKind = 'leadIn' | 'work' | 'rest'
type Direction = 'down' | 'up'          // countdown vs. count-up display
type RunState = 'idle' | 'running' | 'paused' | 'finished'

interface Segment {
  kind: SegmentKind                     // UI derives the label: "Get Ready" / "Work" / "Rest"
  startMs: number                       // offset from program start
  durationMs: number                    // Infinity for open-ended (For Time without cap)
  direction: Direction
  round?: number                        // 1-based; absent for leadIn
  totalRounds?: number
}

type SoundId = 'tick' | 'go' | 'rest' | 'pace' | 'finish'

interface Cue {
  atMs: number                          // offset from program start
  sound: SoundId
}

interface Program {
  modeId: ModeId
  segments: Segment[]                   // contiguous, sorted, no gaps
  cues: Cue[]                           // sorted by atMs, deduplicated
  leadInMs: number                      // 0 if disabled
  totalMs: number                       // includes lead-in; Infinity if open-ended
  pace?: { intervalMs: number; repGoal: number }   // AMRAP only
  display: {
    primaryRing: 'segment' | 'minute'   // fill per segment, or wrap every 60s (For Time)
    overallRing: boolean                // show the outer overall-progress ring
    ticks?: { ring: 'main' | 'overall'; at: number[] }  // 0–1 fractions
  }
}
```

Labels are not stored on segments. A single `segmentLabel(segment)` helper in the UI turns `kind` into text, and the round counter ("Round 3 / 10") comes from `round`/`totalRounds`. This keeps the visible text and the screen reader text identical.

### Program invariants (tested for every mode)

- Segments are contiguous: `seg[i].startMs + seg[i].durationMs === seg[i+1].startMs`.
- `totalMs` equals the last segment's end.
- Cues are sorted, and no two fall within 250ms of each other. When two collide, the higher-priority one wins: `finish` > `go`/`rest` > `tick` > `pace`.
- A cue at exactly `atMs = 0` is valid and must play (lead-in disabled → `go` at start).

### Mode definitions (`src/modes/*.ts`)

Each mode is a single declarative object registered in `src/modes/index.ts`:

```ts
interface ModeDefinition<C> {
  id: ModeId
  name: string                          // "EMOM"
  description: string                   // one line, shown under the mode picker
  fields: FieldSpec<C>[]                // drives the generic settings form
  defaults: C
  validate(config: C): string[]         // error messages; empty = valid
  build(config: C, common: CommonConfig): Program
}

interface CommonConfig {
  leadInSec: number                     // default 10, range 0–30, 0 disables
  volume: number                        // 0–1
  muted: boolean
}
```

`FieldSpec` describes number/duration/toggle inputs: `key`, `label`, `unit`, `min`, `max`, `step`, and an optional `enabledBy` for fields that a toggle reveals, such as the For Time cap. **One generic form renderer** builds the settings UI for every mode, so a new mode needs no new UI code. The registry is typed with `satisfies Record<ModeId, ModeDefinition<any>>`.

Shared helpers in `src/modes/builders.ts` keep the builders small:

- `leadIn(sec)`: the prepended lead-in segment
- `intervals({ count, workMs, restMs? })`: alternating work/rest segments with round numbers, and no trailing rest
- `boundaryCues(boundaryMs, sound, prevSegmentStartMs, countdownSec = 3)`: a `tick` each second for the last `countdownSec` seconds, then `sound` at the boundary. The countdown out of the lead-in is always 5s; EMOM/ETOT use 5s for every boundary; everything else uses 3s. Ticks that would fall within 1s of the previous segment's start are dropped, so short segments don't produce overlapping countdowns.
- `mergeCues(...lists)`: sort plus collision resolution (see invariants)

The **last** boundary of every program uses `finish` instead of `go`/`rest`.

### Modes

| Mode | Config (defaults, limits) | Program shape |
| --- | --- | --- |
| **EMOM** | `rounds: 10` (1–60) | `rounds` × 60s `work` segments. 5-4-3-2-1 + `go` into each minute, 5-4-3-2-1 + `finish` at the end. |
| **ETOT** | `rounds: 20` (1–120) | Same as EMOM with 30s intervals. Both come from a shared `intervalMode(intervalSec)` factory. The form shows the derived time ("20 rounds = 10:00"). |
| **AMRAP** | `durationMin: 12` (1–90), rounds (reps) goal optional (off; `repGoal: 4` when on) | One `work` segment. With a goal, a `pace` cue sounds every `duration / repGoal` (validation requires ≥ 3s), and the main ring gets a tick at each division (up to 60). Pace cues within 1s of the countdown or `finish` are dropped. |
| **For Time** | cap toggle off; `capMin: 20` (1–120) when on | One `work` segment counting **up**. No cap: `durationMs = Infinity`, no cues after the lead-in, and the user taps **Done**. Cap on: 3-2-1 + `finish` at the cap, and the run ends there. |
| **Tabata** | `workSec: 20` (5–300), `restSec: 10` (5–300), `rounds: 8` (1–50) | Alternating `work`/`rest`, no trailing rest. 3-2-1 before every change; `go` starts work, `rest` starts rest, `finish` at the end. The overall ring gets a tick at the start of each new round. |

The minimum of 5s for work and rest keeps the 3-2-1 countdowns from overlapping.

Adding a mode later (E2MOM, Death by…, custom intervals) means adding one file in `src/modes/`.

---

## Timing Engine

### Principles

1. **Never accumulate deltas.** Elapsed time is always derived: `elapsed = now() - startedAt - pausedTotal`. Ticks only *read* time, so they can't drift.
2. **Display and audio are separate.** The display loop (requestAnimationFrame) can stall when the tab is hidden or the device is busy. Audio is scheduled ahead on the `AudioContext` clock, so it plays at the right moment either way.
3. **Pure core.** `snapshot()`, `ringState()`, `format()` and the builders are pure functions, so they're fully unit-testable with no timers.

### Clock (`src/core/clock.ts`)

```ts
interface Clock {
  now(): number        // monotonic ms (performance.now) for in-session timing
  wallNow(): number    // Date.now(), used only for persistence and recovery
  setTimeout(fn: () => void, ms: number): number
  clearTimeout(id: number): void
}
```

Timers live on the clock, so a single fake controls both time and timeouts (see Testing Strategy).

### Snapshot (`src/core/snapshot.ts`)

```ts
snapshot(program, elapsedMs) => {
  segment, segmentIndex,
  segmentElapsedMs, segmentRemainingMs,
  workElapsedMs,                        // elapsed excluding lead-in (clamped ≥ 0)
  workTotalMs,                          // totalMs - leadInMs (Infinity if open)
  completedPaceReps?,                   // AMRAP: floor(workElapsed / pace.intervalMs), capped at repGoal
  done: boolean
}
```

- Linear lookup with a cached cursor index (segment counts are small).
- Exactly at a boundary, the **next** segment is current.
- **Center digits** always show the current segment: `ceil(segmentRemaining)` when the direction is `down` (so "0:01" stays on screen for the full final second), and `floor(segmentElapsed)` when it is `up`.
- `format.ts` renders `m:ss`, and `h:mm:ss` from one hour up (long For Time runs).

### Runner (`src/core/runner.ts`)

State machine:

```
idle ──start──▶ running ──pause──▶ paused ──resume──▶ running
                running ──(elapsed ≥ totalMs | Done)──▶ finished
                paused  ──Done (For Time only)───────▶ finished
any   ──reset──▶ idle
```

- Stores `startedAt`, `pausedAt`, `pausedTotal` in monotonic time, plus wall-clock equivalents for persistence.
- Exposes `elapsedMs()` and `state`, and emits `stateChange`. It has no DOM and no rAF.
- **Finish detection doesn't depend on rendering.** On start/resume, the runner arms a `setTimeout` for the remaining time. On every `elapsedMs()` read it also checks `elapsed ≥ totalMs`. Whichever happens first moves the state to `finished`, so persistence and the wake lock clean up correctly even in a hidden tab.
- On `finished`, the reported elapsed time is clamped to `totalMs`, or frozen at the moment of **Done**.

### Audio scheduler (`src/audio/scheduler.ts`)

Uses the lookahead pattern ("A Tale of Two Clocks"):

- Talks to audio only through a small port, so it is testable without Web Audio. `sounds.ts` implements the port with the real `AudioContext`:
  ```ts
  interface AudioPort {
    currentTime(): number                          // seconds, AudioContext clock
    play(sound: SoundId, at: number): { stop(): void }
  }
  ```
- Maps program time to the audio clock with `audioAt = ctx.currentTime + (cue.atMs - runner.elapsedMs()) / 1000`, recalculated on every pass so the two clocks never drift apart.
- A `setInterval` runs every 250ms and schedules each cue with `atMs ≥ elapsed` within a **5s window**. Scheduled cues are tracked by index, so nothing plays twice.
- On `visibilitychange` → hidden, the scheduler runs immediately with the window extended to the rest of the program. Throttled background timers then can't delay cues. The longest program is a few hundred short oscillators, which is cheap. Uncapped For Time has no cues after the lead-in, so its window is always bounded.
- On pause/reset, every scheduled source node is `stop()`ped and the tracking is cleared. On resume, cues are rescheduled from the current position.
- **Platform limit (documented, not fixed):** iOS suspends background pages entirely. If the user switches apps, cues during that time won't play. The clock stays correct, though, so the display is right on return. The wake lock keeps the screen on so this rarely comes up in normal use.

### Sounds (`src/audio/sounds.ts`, `src/audio/context.ts`)

Synthesized with an `OscillatorNode` + `GainNode` envelope (fast attack, short release, no clicks). Square or triangle waves cut through gym noise. Pitches stay in the 500–1400Hz range, which carries well and avoids the very high frequencies that age-related hearing loss affects first.

| SoundId | Character | Visual counterpart (always shown, even when muted) |
| --- | --- | --- |
| `tick` | short beep (~880Hz, 120ms) | the digits count down. From a segment's first countdown tick (5s or 3s before its end), the digits switch to a heavier weight. |
| `go` | long higher beep (~1320Hz, 600ms) | the main ring pulses, the color changes to work, and the label reads "Work" |
| `rest` | two lower beeps (~520Hz) | the main ring pulses, the color changes to rest, and the label reads "Rest" |
| `pace` | short soft blip | the AMRAP target count goes up and briefly highlights |
| `finish` | three rising tones | both rings show full and the label reads "Done" |

- A master gain node applies `volume` and `muted`.
- The `AudioContext` is created and `resume()`d inside the **Start** tap on the run view (autoplay policy).
- iOS: set `navigator.audioSession.type = 'playback'` where supported, so the hardware silent switch doesn't mute the timer. Test on a real device.
- `ctx.onstatechange`: if the context becomes `suspended` or `interrupted` (a phone call, Siri) while running, show the **"Tap to enable sound"** banner (see Recovery).
- The ring pulse is a single, brief scale/opacity change, well under the WCAG limit of 3 flashes per second. It's replaced with an instant color change under `prefers-reduced-motion`.

---

## Shared Features

### Lead-in countdown
A `leadIn` segment prepended by every builder (default 10s, configurable 0–30s, a common setting). It shows "Get Ready" in green, and its last 5 seconds tick into `go`. A lead-in of 0 means the run starts with `go` at time 0.

### Pause / resume / reset / done
- On-screen controls: **Pause/Resume**, **Reset**, **Done** (For Time only), and **Back to setup** (idle and finished only).
- Reset asks for confirmation **only if** the run is `running` or `paused`. The confirmation is a native `<dialog>` opened with `showModal()`, which traps focus and closes on Esc. Never `window.confirm`.
- Resuming re-anchors the clock (`pausedTotal += now - pausedAt`) and reschedules audio from the current position.

### Keyboard shortcuts
- `Space`: start / pause / resume. `R`: reset (with the same confirmation). `Esc`: back to setup when idle or finished.
- The global handler **ignores** events whose target is a `button`, `input`, `select`, `textarea`, or anything inside an open `<dialog>`. Otherwise Space on a focused button would fire twice.
- Shortcuts are listed in a visible hint on the run view and declared with `aria-keyshortcuts` on the matching buttons.

### Screen wake lock (`src/platform/wakeLock.ts`)
- Requested on **Start** and held while `running` **or `paused`**, because a paused athlete still needs to see the screen. Released on `finished`, on `idle` (reset), and when leaving the run view.
- The browser releases the lock when the page is hidden, so it is re-requested on `visibilitychange` → visible while running or paused.
- Feature-detected; fails silently.

### Remembered settings (`src/platform/storage.ts`)
- localStorage keys: `cc:v1:settings:<modeId>`, `cc:v1:common` (lead-in, volume, mute), `cc:v1:lastMode`.
- Every read and write is wrapped in try/catch. Stored values are merged over `defaults` field by field, and each field is clamped to its `FieldSpec` range, so a bad or old value falls back to the default.
- Saved when a run starts, not on every keystroke.

### Recovery after reload
- The runner persists `cc:v1:activeRun` on every state transition into or within `running`/`paused`. Writes happen on transitions only, not per frame:
  ```ts
  { version: 1, modeId, config, common, state, startedAtWall, pausedAtWall?, pausedTotalMs }
  ```
- On load, if `activeRun` exists and its `version` matches, the app rebuilds the Program from the stored config. It re-anchors monotonic time as `startedAt = now() - elapsed`, using elapsed derived from wall-clock values:
  - **Paused:** restored paused at the same position.
  - **Running:** restored running at `wallNow - startedAtWall - pausedTotalMs` (the workout kept going during the reload). If that is past `totalMs`, it shows the finished state.
- When recovered into `running`/`paused`, a full-screen **"Tap to resume sound"** overlay button covers the run view. Browsers require a gesture to resume audio and re-acquire the wake lock. The overlay swallows that first tap so it can't also trigger Pause or Reset underneath. It's a real `<button>` and receives focus.
- Cleared on `finished` and on reset.
- **Stale runs are discarded:** more than 1 hour past the expected finish, or, for uncapped For Time, more than 6 hours after the start.

---

## UI

Two views, swapped in a single `#app` root with no router. Hash-based state (`#/emom`) is optional later.

1. **Setup view**
   - Mode picker: a `<fieldset>` of radio inputs styled as large buttons (a radio group, not tabs), each with the mode's one-line description.
   - The generic settings form for the selected mode, with the derived workout time shown as "10:00 (+0:10 get ready)".
   - Common settings (lead-in, volume, mute) in a `<details>` disclosure labeled "Settings".
   - A large **Start** button that validates, saves settings, and opens the run view in `idle`.
2. **Run view**
   - The radial ring display (below), sized to `min(viewport width, viewport height)` minus the controls.
   - The segment label ("Get Ready" / "Work" / "Rest" / "Paused" / "Ready" / "Done") and the round counter ("Round 3 / 10"). For AMRAP with a goal, "Target 2 / 4".
   - Controls along the bottom, or the side in landscape. Safe-area insets respected.

### Run View Visuals

The main indicator is a **radial ring that fills slowly and continuously**, clockwise from 12 o'clock. The visible seconds sit in the center.

```
        ╭───── overall ring (orange, thinner, larger radius) ─────╮
        │   ╭──── main ring (blue / green on rest, thicker) ───╮   │
        │   │                     Work                         │   │
        │   │                     0:42                         │   │
        │   │                  Round 3 / 10                    │   │
        │   ╰──────────────────────────────────────────────────╯   │
        ╰──────────────────────────────────────────────────────────╯
```

**Rings**
- **Main ring:** the current segment (or the current minute for For Time). Thicker stroke.
- **Overall ring:** progress through the workout, **excluding the lead-in**: `workElapsed / workTotal`. A slightly larger radius, a thinner stroke, and a different color. It only appears when `display.overallRing` is true.
- Each ring sits over a neutral gray track (`--ring-track`), so the unfilled part is still visible.
- Tick marks (`display.ticks`) cross a ring's outer edge: AMRAP pace divisions on the main ring (hidden during the lead-in), Tabata round starts on the overall ring.

**Per mode**

| Mode | Main ring | Overall ring | Center digits |
| --- | --- | --- | --- |
| EMOM / ETOT | fills once per interval | yes | interval time remaining |
| Tabata | fills once per work or rest segment | yes | segment time remaining |
| AMRAP | fills across the whole duration | no (it would duplicate the main ring) | time remaining |
| For Time | **wraps every 60s** like a stopwatch hand (`primaryRing = 'minute'`) | only when capped, filling toward the cap | time elapsed (counts up) |
| Lead-in (all modes) | fills across the lead-in | empty (if shown) | lead-in seconds remaining |

**Run states**

| State | Main ring + digits | Overall ring | Label | Digits show |
| --- | --- | --- | --- | --- |
| `idle` | gray, empty | gray, empty | "Ready" | the first **work** segment's full time (`0:00` for For Time), not the lead-in |
| `running` | blue (work) or green (rest/lead-in) | orange | segment label | live |
| `paused` | **red**, holding position | orange, holding | "Paused" | frozen |
| `finished` | blue, full | orange, full | "Done" | `0:00`, or the final time for For Time |

**Colors.** These are CSS custom properties on `:root`. v1 is a dark theme only; a gym display reads best light-on-dark.

| Token | Color | Used for |
| --- | --- | --- |
| `--ring-work` | blue | main ring + digits: work, For Time, finished |
| `--ring-rest` | green | main ring + digits: rest, lead-in |
| `--ring-overall` | orange | overall ring: running, paused, finished |
| `--ring-paused` | red | main ring + digits: paused |
| `--ring-idle` | gray | everything when idle |
| `--ring-track` | dark gray | the unfilled track of every ring |

Color priority comes from runner state first, then segment kind: `idle → gray`, `paused → red`, otherwise `work ? blue : green`.

**Implementation**
- One inline SVG (`src/ui/rings.ts`) with two `<circle>`s per ring (track and fill), using `pathLength="1"`. Progress is set as `stroke-dashoffset = 1 - progress`, and the ring is rotated -90° to start at 12 o'clock. `stroke-linecap: round`.
- The run view's rAF loop writes ring progress **every frame**. The digits and labels are written only when their text changes, at most once per second. No CSS transitions on the dash offset: the For Time wrap and segment changes must jump straight to empty instead of animating backward.
- The rAF loop runs only while `running`. In other states the view renders once per state change.
- `runView` receives its frame scheduler (`requestFrame`, which defaults to `requestAnimationFrame`) and the runner as parameters, so tests can render exact frames at exact times.
- A pure helper, `ringState(program, snapshot, runState) => { main: { progress, tone }, overall?: { progress, tone } }`, holds all the per-mode and per-state rules above and is unit-tested. `runView` only applies its output, as `data-tone` attributes that CSS maps to tokens.

UI code lives in `src/ui/` as small functions that build DOM with a tiny `h()` helper and subscribe to runner events. No virtual DOM; updates are targeted `textContent`/attribute writes.

---

## Accessibility

Target: **WCAG 2.2 AA**, with gym-specific extras.

### Screen readers
- The SVG rings are `aria-hidden="true"`; all of their information also exists as text.
- The center digits use `role="timer"`, which has an implicit `aria-live="off"`, so screen readers don't read out every second. The digits stay readable on demand.
- A visually hidden **announcer** (`src/ui/announcer.ts`, a `role="status"` polite live region) is fed by runner state and segment changes, not by the visible label. It announces events like "Get ready, 10 seconds", "Round 3 of 10, work", "Rest, 10 seconds", "Paused at 0:42", "Resumed", "Workout complete", and "Final time 12:34".
  - It doesn't announce the 3-2-1 or pace cues; audio and visuals cover those, and announcing them would flood the queue.
  - Under a 1s segment it doesn't announce at all (not possible with current limits, but guarded).
- `<html lang="en">`, and a meaningful `<title>`. While running, `document.title` shows the remaining time and state ("0:42 Work · Conditioning Clock"), which helps when the timer is in a background tab.

### Visual
- **Contrast:** the center digits and labels in every tone (blue, green, red, gray, orange where used) reach ≥ 4.5:1 against the background. They're large text, but we aim for the stricter ratio. Ring fills reach ≥ 3:1 (WCAG 1.4.11 non-text contrast). The ring tracks are decorative. The palette is verified with a contrast checker and with deuteranopia/protanopia simulation, so blue, green, orange and red stay distinguishable.
- **Color is never the only signal:** state and segment always show as text (the Work / Rest / Paused / Ready / Done label), and paused also swaps the Pause button for **Resume** with an icon change.
- **Every sound has a visual counterpart** (see the Sounds table), so the app works fully when muted or for deaf and hard-of-hearing users.
- **Zoom and text size:** the viewport meta must **not** disable zoom (no `user-scalable=no` or `maximum-scale`). Text uses `rem`, and the center digits scale with `clamp()` on `vmin`. The layout works at 200% zoom and 320px CSS width without horizontal scrolling.
- **Motion:** the ring pulse is removed under `prefers-reduced-motion`. The slow ring fill stays, because it is the timer's main content rather than decoration.

### Input
- All controls are native `<button>`/`<input>` elements with visible `:focus-visible` outlines (≥ 3:1 contrast).
- **Target size:** the run view controls are at least 64×64 CSS px (sweaty hands, glancing from a distance), and everything else at least 44×44. Both exceed WCAG 2.5.8.
- **Focus management:** on a view switch, focus moves to the new view's primary control (Start on the run view, the mode picker on setup). When the reset dialog closes, focus returns to the Reset button.
- Keyboard shortcuts follow the conflict rules above and are all single keys, and they're active only on the run view. They're also discoverable through the visible hint and `aria-keyshortcuts`.

### Forms (setup view)
- Every input has a `<label>` that includes its unit ("Rounds", "Work (seconds)"). The For Time cap toggle is a checkbox that reveals the cap field.
- Number inputs use `inputmode="numeric"`, with native `min`/`max`/`step`, plus large **−** / **+** stepper buttons whose accessible names say what they do ("Decrease rounds").
- Validation errors render inline, linked through `aria-describedby`, with `aria-invalid="true"` set. Start stays enabled; pressing it with errors focuses the first invalid field.
- The derived workout time sits in an `<output>` element linked to the form.

---

## Testing Strategy

### Layers

The test pyramid puts most weight on fast, pure tests, with a thin, faithful layer at the top.

| Layer | Runner / environment | Scope | Rough size |
| --- | --- | --- | --- |
| **Unit** | Vitest `unit` project, **Node** | `core/`, `modes/`, `audio/scheduler`, `platform/storage`, `ui/ringState`, `ui/labels`, palette contrast | most tests, runs in well under 1s |
| **Component** | Vitest `browser` project, **Chromium + WebKit** | `ui/*View`, `settingsForm`, `confirmDialog`, `announcer`, `keyboard` against real DOM, focus, `<dialog>` and SVG | dozens |
| **E2E smoke** | Playwright Test against `vite build` + `vite preview` under `/conditioning-clock/` | full user flows, base path, reload/recovery, and axe scans | ~8 |
| **Manual** | real devices | sound character and loudness, silent switch, app switching, VoiceOver | checklist |

**What each layer should *not* do:** unit tests don't touch the DOM. Component tests don't re-test timing math. E2E tests don't assert on individual segments or cues that unit tests already cover; they prove the parts are wired together.

### Vitest configuration

`vitest.config.ts` uses `test.projects`, selected by file name so the environment is never ambiguous:

```ts
projects: [
  { test: { name: 'unit', environment: 'node',
            include: ['src/**/*.test.ts'], exclude: ['src/**/*.browser.test.ts'] } },
  { test: { name: 'browser',
            include: ['src/**/*.browser.test.ts'],
            browser: { enabled: true, provider: playwright(), headless: true,
                       instances: [{ browser: 'chromium' }, { browser: 'webkit' }] } } },
]
```

- `*.test.ts` runs in Node, and `*.browser.test.ts` runs in real browsers. WebKit matters because iOS Safari is a primary target.
- Shared settings: `restoreMocks: true`, `unstubGlobals: true`. Browser tests clear `localStorage` and the `#app` container in `beforeEach`.

### Seams and fakes (`src/test/`)

Every source of non-determinism comes in through a small interface, so tests never patch globals or wait on real time:

| Seam | Production | Fake (in `src/test/fakes.ts`) |
| --- | --- | --- |
| `Clock` (time + timeouts) | `performance.now`, `Date.now`, `setTimeout` | `FakeClock`. `advance(ms)` moves both clocks and fires due timeouts in order. `jump(ms)` moves only wall time, to simulate a reload gap. |
| `AudioPort` | `sounds.ts` (Web Audio) | `FakeAudioPort`, which records `{ sound, at, stopped }` and has a settable `currentTime` |
| `requestFrame` | `requestAnimationFrame` | `ManualFrames`, where `flush()` renders one frame |
| `Storage` | `localStorage` | `MemoryStorage`, plus a `ThrowingStorage` for Safari private mode or a full quota |
| `WakeLockPort` | `navigator.wakeLock` | records request/release calls; can be set to reject |

Test helpers:
- `buildProgram(modeId, overrides?)` builds from defaults.
- `describeProgram(program)` returns a compact, human-readable timeline string, e.g. `0:00 leadIn 10s | 0:10 work R1/8 20s | 0:30 rest R1/8 10s …` and `cues: 0:07 tick, 0:08 tick, …`. Used for readable assertions and for one small inline snapshot per mode's defaults.

### Practices

- **Behavior, not implementation:** assert on public outputs (Program data, runner state, `ringState` results, roles/names/attributes in the DOM), not private fields or call order.
- **No real waiting:** no `sleep`, no real timers, no `waitFor` polling on time. Time moves only through `FakeClock.advance` or Playwright's `page.clock`.
- **Table-driven tests:** `test.each` covers the cases that vary only by input, such as each mode × default/min/max config, the display rounding at `[0, 1, 999, 1000, 1001]` ms around boundaries, and each run state × segment kind for `ringState`.
- **Boundaries first:** every timing test covers exactly-at-boundary, 1ms before, and 1ms after.
- **Accessible queries:** component tests find elements by role and accessible name (`page.getByRole('button', { name: 'Pause' })`). If a test can't find something that way, that is an accessibility bug.
- **Snapshots sparingly:** only the inline `describeProgram` snapshot of each mode's defaults, which doubles as readable documentation. No DOM snapshots.
- **Arrange / Act / Assert,** with test names that state the behavior ("drops pace cues within 1s of finish").
- **Tests ship with the code** in the same phase. Builders and `ringState` are written test-first, since their tests are essentially the spec tables above.

### Unit test focus (Node)

- **Program invariants:** every mode × default/min/max config gives contiguous segments, sorted and deduplicated cues, a correct `totalMs`, and a last boundary of `finish`.
- **Mode specifics:**
  - Tabata has no trailing rest.
  - AMRAP pace math is right and colliding pace cues are dropped.
  - Uncapped For Time is Infinity, with no cues after the lead-in. Capped For Time has a 3-2-1 + `finish`.
  - With lead-in 0, a `go` cue plays at time 0.
- **Snapshot / format:** the boundary rule (the next segment wins), `ceil`/`floor` display, and the `h:mm:ss` rollover.
- **Runner:** every state transition, including the invalid ones (which are ignored). It also covers:
  - pause/resume accounting across several pauses
  - finishing by timeout with no reads
  - Done from both running and paused
  - elapsed time clamping on finish
- **Recovery:** from running, paused, overdue, both stale rules, a corrupt payload, the wrong `version`, and `ThrowingStorage`.
- **Scheduler:**
  - Covers the 5s window, never scheduling a cue twice, `stop()` on pause, rescheduling mid-segment on resume, and extending the window when hidden.
  - A cue exactly at `elapsed` plays. A cue 1ms in the past doesn't.
- **ringState:** every row of the per-mode and run-state tables.
- **Palette contrast:** `styles.css` is imported with `?raw`, the color tokens are parsed, and the test asserts text tones reach ≥ 4.5:1 and ring fills ≥ 3:1 against `--bg`. A failing palette change is caught before review.

### Component test focus (browser)

- **Settings form:**
  - Each field has a label that includes its unit.
  - The steppers clamp at min/max.
  - Errors set `aria-invalid` and `aria-describedby`, and Start focuses the first invalid field.
  - The cap toggle reveals the cap field.
- **Run view:**
  - With FakeClock + ManualFrames, it shows the correct digits, label, round counter, and ring `data-tone`/dash offset at chosen times.
  - The digits use `role="timer"`, and the SVG is `aria-hidden`.
- **Keyboard:**
  - Space toggles pause, but pressing it on a focused button activates the button only once.
  - Shortcuts are inert while the dialog is open.
  - Esc works only when idle or finished.
- **Reset dialog:** opens only when running or paused. Focus moves into the dialog, Esc closes it, and focus returns to Reset.
- **Announcer:** emits the expected text for each event, and none for ticks.
- **Focus management** on view switches, and the recovery overlay swallowing the first tap.

### E2E smoke (`e2e/`, Playwright)

`playwright.config.ts` sets `webServer: npm run build && npm run preview -- --port 4173 --strictPort` and `baseURL: http://localhost:4173/conditioning-clock/`. It has two projects: **WebKit on an iPhone-sized device** and **Chromium on a Pixel-sized device**. Every test calls `page.clock.install()` before navigating, and moves time with `page.clock.runFor()`, so a full Tabata run takes milliseconds.

1. **Boot:** the app loads under the base path with no console errors and no failed requests.
2. **Tabata full run:** Ready (gray) → Start → Get Ready → work/rest tone flips → Done after 4:00 plus the lead-in.
3. **Pause/resume:** red + "Paused", and the digits stay frozen while the clock advances. Resume continues from the same point.
4. **Recovery:** start an EMOM, advance 90s, reload, and the overlay appears. Tapping it shows the correct round and time.
5. **Remembered settings:** change the Tabata config, reload, and the values persist.
6. **For Time:** count up past 1:00 (the ring wraps), then Done shows the final time.
7. **Keyboard only:** pick a mode, set a value, Start, and Space pauses, with no pointer events used.
8. **axe:** `@axe-core/playwright` scans the setup view, the run view in idle, work, rest, paused, and finished, with the reset dialog open, and with the recovery overlay. Tags are `wcag2a`, `wcag2aa`, `wcag21aa`, `wcag22aa`, and any violation fails the test.

E2E doesn't assert on audio output. Audio scheduling is covered by unit tests against `FakeAudioPort`, and the sound itself by the manual checklist.

### Manual checklist (`spec/manual-qa.md`, written in Phase 6)

Covers what automation can't:
- How loud and distinct each sound is in a noisy room.
- The iOS silent switch and `audioSession`.
- App switching and the lock screen.
- Phone-call interruption leading to the sound banner.
- Wake lock on a real device during a 10-minute run.
- A VoiceOver Tabata walkthrough (iOS + macOS).
- 200% zoom and 320px width.
- Color-vision simulation of the final palette.

It's run before the first deploy and after any change to audio, timing, or the palette.

---

## Project Structure

```
conditioning-clock/
  index.html
  package.json
  tsconfig.json
  vite.config.ts
  vitest.config.ts          # unit (node) + browser (chromium, webkit) projects
  playwright.config.ts      # E2E against the production preview
  .gitignore                # dist/, .gh-pages/, test-results/, playwright-report/
  bin/
    deploy.sh  utils.sh
  public/
  spec/
  e2e/
    boot.spec.ts  tabata.spec.ts  pause.spec.ts  recovery.spec.ts
    settings.spec.ts  forTime.spec.ts  keyboard.spec.ts  a11y.spec.ts
  src/
    main.ts                 # boot: load settings, attempt recovery, render
    styles.css              # tokens, layout, ring tones
    test/
      fakes.ts              # FakeClock, FakeAudioPort, ManualFrames, MemoryStorage, ThrowingStorage, FakeWakeLock
      helpers.ts            # buildProgram, describeProgram
    core/
      types.ts
      clock.ts
      snapshot.ts           (+ .test.ts)
      runner.ts             (+ .test.ts)
      format.ts             (+ .test.ts)  # m:ss, h:mm:ss
    modes/
      index.ts              # registry
      builders.ts           (+ .test.ts)
      invariants.test.ts    # every mode × default/min/max
      emom.ts  etot.ts  amrap.ts  forTime.ts  tabata.ts   (+ .test.ts each)
    audio/
      context.ts            # create/unlock/resume, master gain, audioSession, statechange
      sounds.ts             # AudioPort implementation
      scheduler.ts          (+ .test.ts against FakeAudioPort)
    platform/
      storage.ts            (+ .test.ts)
      recovery.ts           (+ .test.ts)
      wakeLock.ts           # WakeLockPort
      keyboard.ts           (+ .browser.test.ts)  # shortcuts + conflict rules
    ui/
      h.ts
      palette.test.ts       # contrast of styles.css tokens
      setupView.ts          (+ .browser.test.ts)
      settingsForm.ts       (+ .browser.test.ts)
      runView.ts            (+ .browser.test.ts)
      rings.ts              # SVG ring rendering
      ringState.ts          (+ .test.ts)  # pure per-mode / per-state ring rules
      labels.ts             (+ .test.ts)  # segmentLabel, round counter, announcer text
      announcer.ts          (+ .browser.test.ts)
      confirmDialog.ts      (+ .browser.test.ts)
```

---

## Build Phases

Each phase ends with `npm run check` and `npm run test-headless` passing. From Phase 5 on, `npm run test-e2e` must pass too. Tests are written in the same phase as the code they cover.

### Phase 1: Scaffold + test harness (walking skeleton)
- `npm create vite@latest` (vanilla-ts), strict tsconfig, Prettier, the scripts above, `.gitignore`.
- `base: '/conditioning-clock/'` in `vite.config.ts`. `index.html` with `lang="en"`, a zoom-friendly viewport meta, `theme-color`, and a `<title>`.
- After approval of the dev dependencies: Vitest with both projects, Playwright browsers, `playwright.config.ts`.
- **Prove the harness works** with one trivial test per layer: a unit test, a browser test that mounts a button and finds it by role in Chromium and WebKit, and the E2E boot test (base path, no console errors).
- `src/test/fakes.ts` with `FakeClock`, plus tests for the fake itself (timeouts fire in order, `jump` moves only wall time).

### Phase 2: Core engine (pure, no DOM)
- `types.ts`, `format.ts`, `builders.ts`, all five mode builders, `snapshot.ts`, `src/test/helpers.ts`.
- Write the builders test-first from the Modes table: the invariants suite, the per-mode specifics, and one inline `describeProgram` snapshot per mode's defaults.
- Snapshot and format boundary tests (see Unit test focus).

### Phase 3: Runner + persistence
- `clock.ts`, `runner.ts`, `storage.ts`, `recovery.ts`, and the `MemoryStorage`/`ThrowingStorage` fakes.
- Runner and recovery tests driven entirely by `FakeClock` (see Unit test focus).

### Phase 4: Audio
- `context.ts`, `sounds.ts` (the `AudioPort`), `scheduler.ts`, and `FakeAudioPort`.
- Scheduler tests against `FakeAudioPort` (see Unit test focus).
- Manual: a dev-only button (`import.meta.env.DEV`) that plays each sound for tuning.

### Phase 5: UI
- `h.ts`, `labels.ts`, `settingsForm.ts`, `setupView.ts`, `runView.ts`, `rings.ts`, `ringState.ts`, `announcer.ts`, `confirmDialog.ts`, `keyboard.ts`, the color tokens, and `ManualFrames`.
- Wire up `main.ts`: boot → recovery check → view.
- Write `ringState` test-first from the per-mode and run-state tables. Add the palette contrast test.
- Component tests in Chromium + WebKit (see Component test focus).
- E2E smoke tests 2–8, including the axe scans.

### Phase 6: Platform polish + manual QA
- Wake lock (held through pause), the recovery overlay, the audio-interrupted banner, the reduced-motion pulse swap, safe areas, the landscape layout, and the `document.title` updates. Each comes with tests at the right layer (e.g. FakeWakeLock request/release across states).
- Write `spec/manual-qa.md` and run it on iOS Safari and Android Chrome.

### Phase 7: Deploy
- Create the GitHub repo `conditioning-clock`. Create an orphan `gh-pages` branch with one empty initial commit and push it.
- Add the `bin/` scripts (`chmod +x`) with the test gate and `"deploy": "./bin/deploy.sh"`.
- Enable Pages from the `gh-pages` branch.
- Verify on the live custom-domain URL: assets load under `/conditioning-clock/`, HTTPS works, wake lock works, and sound works on a phone.

---

## Future

- A PWA/offline phase. The service worker scope and manifest `start_url` would need to be `/conditioning-clock/`.
- A light theme (`prefers-color-scheme: light`) with its own ring shades that meet contrast.
- Haptic cues through `navigator.vibrate` on Android, as an extra non-audio signal.
- Hash routing (`#/tabata`) so a configured workout can be shared as a link.

# Manual QA Checklist

Covers what automation can't. Run it before the first deploy, and after any change to audio, timing, or the palette. Test on **iOS Safari** (a real iPhone) and **Android Chrome** (a real phone), on the deployed HTTPS URL unless noted.

Record the date, devices, OS and browser versions, and any failures at the bottom.

## Sound

- [ ] In a noisy room (music playing at gym volume), each sound is audible from ~3 m at 80% volume: `tick`, `go`, `rest`, `pace`, `finish`. Use the dev **Sound check** buttons (`npm run dev`) to compare them side by side.
- [ ] The sounds are distinct from each other without looking at the screen: tick (short beep), go (long high beep), rest (two low beeps), pace (soft blip), finish (three rising tones).
- [ ] No clicks or pops at the start or end of any sound.
- [ ] Volume slider and **Mute sound** take effect on the next run.
- [ ] Tabata defaults: every 3-2-1 lines up with the digits changing, and `go`/`rest` land exactly as the label flips.

## iOS audio session

- [ ] With the hardware silent switch **on**, cues still play (`navigator.audioSession.type = 'playback'`, iOS 17+).
- [ ] Start a run, receive (or simulate) a phone call, end it: the **"Sound is off. Tap to enable sound"** banner appears; tapping it restores the cues, on time.
- [ ] Same with Siri invoked mid-run.

## Backgrounding

- [ ] Switch to another tab mid-run (desktop): cues keep playing on time; on return, the display is correct.
- [ ] iOS: switch apps for ~20 s mid-run. Cues during that time may not play (documented platform limit), but on return the time, round and ring are correct.
- [ ] Lock the screen mid-run, unlock: same as above.

## Wake lock

- [ ] Run a 10-minute EMOM without touching the phone: the screen stays on throughout, including a 1-minute pause in the middle.
- [ ] After **Done** or **Reset**, the screen dims and locks on its normal schedule again.

## Recovery

- [ ] Reload mid-run: the **Tap to resume sound** overlay appears; tapping it resumes sound and the wake lock at the right round and time, and doesn't also pause or reset.
- [ ] Reload while paused: it comes back paused at the same time.

## Screen readers

- [ ] VoiceOver (iOS): a full Tabata from setup to Done. Every control is reachable and named; announcements are heard for Get ready, each round, Rest, Paused, Resumed and Workout complete, and the 3-2-1 is **not** announced.
- [ ] VoiceOver (macOS, Safari): same walkthrough with the keyboard only (Space, R, Esc), including the reset dialog.
- [ ] The setup form: each field's label includes its unit; errors are read when an invalid field is focused.

## Visual

- [ ] 200% browser zoom on desktop: setup and run views work with no horizontal scrolling.
- [ ] 320 px CSS width (or iPhone SE with Larger Text): no horizontal scrolling, nothing clipped.
- [ ] Landscape on a phone: controls move to the side, the ring fills the height.
- [ ] Safe areas: nothing is hidden under the notch or home indicator (portrait and landscape).
- [ ] With **Reduce Motion** on, the ring doesn't pulse at segment changes; the color still changes instantly.
- [ ] Readable from ~3 m: digits, label and round counter in every state.
- [ ] Color-vision simulation (Chrome DevTools → Rendering → Emulate vision deficiencies: deuteranopia, protanopia, tritanopia, achromatopsia): work, rest, paused and idle are distinguishable, and the orange overall ring is distinct from the red paused ring.

## Results

| Date | Device / OS / browser | Tester | Failures |
| ---- | --------------------- | ------ | -------- |
|      |                       |        |          |

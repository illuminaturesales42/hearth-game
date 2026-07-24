# Track E — Audio ("M2 audio pass")

**Goal:** give Hearth a voice and a room-tone — without breaking the thing that makes its current audio special.

---

## What exists today (verified — and it matters)

**Hearth ships with zero audio files.** All sound is **synthesised at runtime** via the Web Audio API in `src/ui/feedback.ts`:
- An `AudioContext` created lazily (`:14`), oscillator-based SFX with gain ramps (`:27-34`).
- A **procedural music bed** (`buildMusic`, `:63`) and layered **stems** (`buildStems`, `:129`), deliberately quiet (`peak = 0.05 * musicVol`, `:270`).
- Volumes honour `prefs.musicVol` / `prefs.sfxVol` (`:11-12`, set via `feedback.setVolumes`).

**Consequences:**
- **Payload today is 0 bytes of audio.** Any recorded asset is a *new* payload class for a PWA whose art is already ~44 MB and runtime-cached (not precached).
- The synthesised bed is adaptive and infinitely long — a recorded loop can easily be a **downgrade**. Be selective.

**The one explicit stub:** meditation narration — `src/data/meditations.ts:4` ("the narrated-audio track drops in with the M2 audio pass; for now the player guides with an animated breath pacer + ambient tone") and `src/ui/meditation.ts:4`.

---

## Recommendation: narration first, everything else optional

| Priority | Asset class | Verdict |
|---|---|---|
| **1** | **Meditation narration (VO)** | **Do it.** The only explicitly-stubbed audio; a human voice is something synthesis genuinely cannot fake |
| 2 | Ambient beds (harbour/hearth) | *Optional.* Only if a recorded bed clearly beats the procedural one. A/B before committing |
| 3 | Festival stings | Nice with Track C; short and cheap |
| 4 | UI/minigame SFX | **Probably don't.** The synthesised set is cohesive, instant and free; replacing it risks making the game feel generic |

---

## E1 — Meditation narration (primary)

Seven meditations exist in `src/data/meditations.ts`, each with an exact breath cadence (`inhaleSec`, `holdSec`, `exhaleSec`, `holdOutSec`) and `durationSec` (e.g. Morning Calm: 180 s, 4-2-6-0).

| Field | Value |
|---|---|
| Files | `vo_<meditation-id>.mp3` — e.g. `vo_med-morning.mp3`, one per entry in `MEDITATIONS` |
| Format | **MP3 128 kbps mono** (or Opus ~64 kbps where supported), 44.1 kHz |
| Loudness | Normalise to **−18 LUFS integrated**, true peak ≤ −1 dBTP; gentle, no compression pumping |
| Length | Match each meditation's `durationSec` exactly (±1 s) |
| Budget | ~1.4 MB per 3-minute mono MP3 → **~10 MB for all seven**. Lazy-load per session; never precache |

**Voice direction:** warm, unhurried, low-register, close-mic'd; a friend sitting beside you, not a wellness-app announcer. British English (house style). No music under the VO — the existing ambient tone plays beneath it.

**Script rule — this is the hard constraint:** the narration must **align to the existing breath cadence**, not fight it. Write cue-sheets against each meditation's real numbers, and leave the pacer authoritative — VO guides, the pacer keeps time. Silence between cues is correct and desirable.

**Deliverable per meditation:** the audio file **plus** a written script/cue sheet marking which line lands on which breath phase.

---

## E2 — Ambient beds (optional)
| Field | Value |
|---|---|
| Files | `amb_harbour_day.mp3`, `amb_harbour_night.mp3`, `amb_hearth_interior.mp3`, `amb_rain.mp3` |
| Format | MP3/Opus, **seamless loop**, 60–120 s |
| Loudness | −24 LUFS (a bed, not a feature); must sit *under* the procedural stems, not replace them |
| Loop points | Must be sample-accurate; document loop-start/end |
| Budget | ~1 MB each — keep to 4 files max |

**Only ship these if an A/B against the procedural bed is clearly better.** The adaptive synthesis is a genuine strength.

---

## E3 — Festival stings (pairs with Track C)
| Field | Value |
|---|---|
| Files | `sting_<festival>.mp3` (e.g. `sting_midwinter.mp3`) |
| Length | 2–4 s, one-shot |
| Loudness | −16 LUFS, respects `sfxVol` |
| Budget | <100 KB each |

---

## Delivery & code sketch

**Do not touch the synthesised path.** Add a thin file-audio layer beside it.

```ts
// src/ui/audio-files.ts  (new)
// Lazy, cache-friendly playback for recorded assets. Mirrors artUrl()'s
// "if it exists, use it; else fall back" contract.
export function audioUrl(id: string): string | null;   // '/audio/<id>.mp3' or null
export async function playVoice(id: string, vol: number): Promise<void>;
export function stopVoice(): void;
```
- **Manifest:** mirror the art pattern — a generated `AUDIO_IDS` set so `audioUrl()` returns `null` for absent files and every caller degrades to today's behaviour.
- **Volumes:** route VO through `musicVol`… **no** — VO should follow its own rule: play at `max(musicVol, 0.4)` unless muted, or add a `voiceVol` pref. *Decision needed at implementation;* simplest honest option is to gate VO on `musicVol > 0` and scale by it.
- **Meditation UI** (`src/ui/meditation.ts`): if `audioUrl('vo_' + id)` exists, play it alongside the pacer; otherwise the current pacer+tone experience is unchanged.
- **PWA caching** (`vite.config.ts`): audio must be **runtime-cached, never precached** — add a `/audio/` route with its own `cacheName` (`hearth-audio`) and a small `maxEntries`, exactly as `/art/` is handled. Do **not** let audio share the art cache (`maxEntries: 500`, already ~680 art ids — it would thrash).
- **Autoplay policy:** browsers block audio before a user gesture. The existing `AudioContext` is created lazily for this reason — the same rule applies: start VO only from the player's tap on "Begin".
- **Offline:** first play requires network; once cached it works offline. Acceptable — document it.

---

## Acceptance checklist
- [ ] Narration plays in sync with the breath pacer; pacer remains authoritative
- [ ] Absent audio → today's pacer+tone experience, unchanged (delete-file test)
- [ ] Volume prefs honoured; muting silences VO
- [ ] Audio runtime-cached under its own cache name; **not** precached; art cache untouched
- [ ] Playback only starts from a user gesture
- [ ] Total added payload documented and within budget (~10 MB for VO)
- [ ] Synthesised SFX/music path unchanged
- [ ] `npx tsc --noEmit`, `npx vitest run` green

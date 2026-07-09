# Hearth on Android — the native wrap (roadmap Phase B)

The web build can't read steps or sleep, and iOS evicts web storage after 7
quiet days — so the **Capacitor app with real health data + cloud saves is the
actual product**. Cloud saves already ship (same-origin `/v1/save`, see
[`DEPLOY.md`](DEPLOY.md)). This is the Android health wrap.

> **Why this doc and not a committed `android/` project:** the build machine at
> the time of writing had no JDK and no Android SDK, so `cap add android` and the
> Gradle build must run where Android Studio lives. The *hard part* — turning raw
> Health Connect records into the game's `HealthSnapshot` (local-day steps, the
> 18:00→noon sleep window, asleep-stage summing, source-app attribution) — is
> already written and unit-tested in
> [`src/health/health-connect.ts`](src/health/health-connect.ts)
> (`tests/health-connect.test.ts`, 10 cases). The steps below are the thin,
> platform-bound glue around it.

## Prerequisites (one-time)
- JDK 17, Android Studio + SDK (API 34+), an Android device/emulator with **Health Connect** installed.
- Google Play Console account (for closed testing — 12 testers × 14 days is mandatory for new accounts).

## 1. Add the platform
```bash
pnpm add @capacitor/android
pnpm build                 # produces dist/ (the web assets Capacitor ships)
npx cap add android
npx cap sync android
npx cap open android       # opens Android Studio
```
`capacitor.config.ts` already sets `appId net.mastermind.hearth`, `appName Hearth`, `webDir dist`.

## 2. Health Connect plugin
Pick a maintained community plugin (e.g. `capacitor-health-connect`) — Google Fit is dead end-2026, Health Connect is the only path. Add the permissions to `android/app/src/main/AndroidManifest.xml`:
```xml
<uses-permission android:name="android.permission.health.READ_STEPS"/>
<uses-permission android:name="android.permission.health.READ_FLOORS_CLIMBED"/>
<uses-permission android:name="android.permission.health.READ_SLEEP"/>
```
and the Health Connect privacy-policy intent-filter (Play requires a reachable policy URL that says: read-only, on-device, never shared, never in analytics).

## 3. Wire the adapter (≈20 lines) → the tested core
In a small `HealthConnectProvider implements HealthProvider`, read the day's
records through the plugin, map each into the shapes from `health-connect.ts`,
then hand off to `snapshotFromRecords` — which does all the aggregation:

```ts
import { snapshotFromRecords } from './health-connect';
import type { QuantityRecord, SleepSession } from './health-connect';

const { start, end } = localDayWindow(Date.now()); // widen sleep to start-6h
const stepsRecs: QuantityRecord[] = (await plugin.readRecords({ type: 'Steps', ... }))
  .records.map(r => ({ startTime: +new Date(r.startTime), endTime: +new Date(r.endTime), value: r.count }));
// …same for FloorsClimbed (value: r.floors) and SleepSession (stages + metadata.dataOrigin)
const snap = snapshotFromRecords(stepsRecs, floorRecs, sleepSessions, Date.now());
game.syncHealth(snap);
```
Then in [`src/platform/providers.ts`](src/platform/providers.ts) `pickHealthProvider()`, return the `HealthConnectProvider` when `isNativePlatform()` and the Android Health Connect plugin is present (iOS keeps the existing `CapacitorHealthProvider`/HealthKit path). Only the record-field mapping is plugin-specific — verify it against the chosen plugin's exact response, the aggregation needs no changes.

## 4. Compliance (apps get rejected on paperwork, not code)
- Read-only; **health data never feeds analytics** and never leaves the device.
- Play Data-Safety form + per-datatype purpose strings + a public privacy policy.
- `game.syncHealth()` already caps the conversion (steps→energy 1/500 cap 20, sleep ≥7h → +10) idempotently per day.

## 5. Build + test
`npx cap open android` → Build → Generate Signed Bundle/APK, or wire the same into CI. Recruit the 12 closed-testers from the email list once it exists.

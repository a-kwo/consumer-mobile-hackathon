# Score

Score reads your pace, the weather, the time of day and where you are, plays the song that fits the moment, and turns the day into a soundtrack you can share. The design and status are in `PLAN.md`; the look is specified in `05-visual-identity.md`.

## Run it

There are three ways to run the app. The first two need no build and no queue.

### 1. In a browser (fastest look)

```sh
npm install
npx expo start --web
```

Open the printed `localhost` address and narrow the window to phone width. Everything works except the cymatic figure around the cover (it is native only) and the step sensor.

### 2. On your own phone with Expo Go (real sensors)

Install **Expo Go** from the App Store or Play Store, then:

```sh
npx expo start --go
```

Scan the QR code with the phone's camera (iOS) or from inside Expo Go (Android). The phone and the computer must be on the same Wi-Fi; if they cannot see each other, add `--tunnel`.

- The step sensor works in Expo Go on iOS. On Android it needs a development build.
- This is the only way to try Automatic mode (live steps, location and weather) without building the app.

### 3. On a Revyl cloud device

```sh
revyl device start --platform android --app-id d9e67510-f59d-4a41-b692-540e6c253739 --open
revyl device start --platform ios --app-id 051f1327-94be-4624-93a1-7c647289b5f7 --open
```

These open the latest uploaded build in a browser viewer. Cloud devices have no step sensor, so the scene is set by hand on the Scene tab. Stop devices when you are done (`revyl device stop --all`): the organisation has two shared slots for builds and devices together.

To build a new version: `revyl build --profile preview --platform android --remote` (or `ios`). Android builds start within seconds. iOS builds sometimes wait several minutes for a free machine on Revyl's side; submitting a second iOS build for the same app cancels the first, so submit once and wait.

## Backend

The backend is Convex (`convex/`). `npx convex dev` pushes function changes to your dev deployment. `node scripts/smoke-next.mjs` checks picking, logging and the soundtrack end to end.

## Checks

```sh
npx tsc --noEmit
npx expo lint
npx expo-doctor
```

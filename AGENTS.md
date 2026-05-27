# Agent Notes

## Android Phone Installs

Do not install `android/app/build/outputs/apk/debug/app-debug.apk` onto the phone for normal handoff. The debug APK expects a Metro/dev-server JavaScript bundle and can show `Unable to load script` when Metro is not running.

For a standalone phone install, build and install the bundled hosted release APK:

```sh
npm run android:build:hosted
adb install -r android/app/build/outputs/apk/release/app-release.apk
adb shell am start -n com.preciouscaptures/.MainActivity
```

If Java is not found, use OpenJDK 17:

```sh
JAVA_HOME=/opt/homebrew/opt/openjdk@17 npm run android:build:hosted
```

The hosted build script embeds the JavaScript bundle and hosted Supabase configuration.

## Supabase Pushes

Only push/deploy Supabase when backend files changed, such as `supabase/functions`, `supabase/migrations`, or API/server code that is actually deployed. Pure React Native UI changes in `app/App.tsx` do not require a Supabase push.

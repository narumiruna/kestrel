set shell := ["bash", "-cu"]

java_home := env_var_or_default("JAVA_HOME", "/opt/homebrew/opt/openjdk/libexec/openjdk.jdk/Contents/Home")
android_sdk := env_var_or_default("ANDROID_HOME", env_var_or_default("ANDROID_SDK_ROOT", home_directory() + "/Library/Android/sdk"))
adb := android_sdk + "/platform-tools/adb"
gradle := 'ANDROID_HOME="' + android_sdk + '" JAVA_HOME="' + java_home + '" PATH="' + java_home + '/bin:$PATH" ./gradlew'
dev_compose := "docker compose -f compose.dev.yaml"
webtest_compose := "docker compose -p kestrel-webtest -f compose.dev.yaml"
package := "dev.narumi.kestrel"
activity := package + "/.MainActivity"
apk := "app/build/outputs/apk/debug/app-debug.apk"

# show available recipes without changing local or device state
[group('Meta')]
default:
    @just --list

# show available recipes
[group('Meta')]
help:
    @just --list

# verify every workspace without writing source files
[group('Quality')]
verify:
    just android-verify
    just backend-check
    just web-verify

# format Android and Web code
[group('Quality')]
format:
    just android-format
    just web-format

# check Android and Web formatting/lint without writing changes
[group('Quality')]
check:
    just android-check
    just web-check

# run Android detekt and Web lint
[group('Quality')]
lint:
    just android-lint
    just web-lint

# build the Android debug APK
[group('Android')]
build: android-build

# build the Android debug APK
[group('Android')]
android-build: _require-android-sdk
    {{ gradle }} :app:assembleDebug

# build the signed release APK (requires KESTREL_RELEASE_* environment variables)
[group('Android')]
release: _require-android-sdk
    {{ gradle }} :app:assembleRelease

# clean Gradle outputs
[group('Android')]
clean: android-clean

# clean Gradle outputs
[group('Android')]
android-clean:
    {{ gradle }} clean

# format Android code with Spotless
[group('Android')]
android-format:
    {{ gradle }} spotlessApply

# check Android formatting without writing changes
[group('Android')]
android-check:
    {{ gradle }} spotlessCheck

# run Android detekt
[group('Android')]
android-lint:
    {{ gradle }} detekt

# run Android debug-variant JVM unit tests
[group('Android')]
test: android-test

# run Android debug-variant JVM unit tests
[group('Android')]
android-test: _require-android-sdk
    {{ gradle }} :app:testDebugUnitTest

# validate Android Compose screenshots without updating references
[group('Android')]
android-ui: _require-android-sdk
    {{ gradle }} :app:validateDebugScreenshotTest

# update Android Compose screenshot references (review images; never commit binaries)
[confirm('Update Android screenshot reference images?')]
[group('Android')]
android-ui-update: _require-android-sdk
    {{ gradle }} :app:updateDebugScreenshotTest

# run all non-destructive Android quality gates
[group('Android')]
android-verify:
    just android-check
    just android-lint
    just android-test
    just android-ui
    just android-build

# regenerate the detekt baseline (accept current warnings)
[confirm('Regenerate the Detekt baseline and accept current warnings?')]
[group('Android')]
lint-baseline:
    {{ gradle }} detektBaseline

# update JavaScript packages within their declared ranges and update Android libraries
[group('Setup')]
update:
    npx --yes npm-check-updates@19.1.1 --packageFile backend/package.json --target semver --peer --upgrade
    npm install --prefix backend
    npx --yes npm-check-updates@19.1.1 --packageFile web/package.json --target semver --peer --upgrade
    npm install --prefix web
    cd web && ./node_modules/.bin/biome migrate --write
    {{ gradle }} versionCatalogUpdate

# install exact Web dependencies from the lockfile
[group('Setup')]
[working-directory('web')]
web-install:
    npm ci

# format Web code with the repository Biome binary
[group('Web')]
[working-directory('web')]
web-format: _require-web-deps
    ./node_modules/.bin/biome check --write .

# check Web formatting, lint, and imports without writing changes
[group('Web')]
[working-directory('web')]
web-check: _require-web-deps
    ./node_modules/.bin/biome ci .

# run Web lint only
[group('Web')]
[working-directory('web')]
web-lint: _require-web-deps
    ./node_modules/.bin/biome lint .

# generate Next.js route types and run TypeScript
[group('Web')]
[working-directory('web')]
web-typecheck: _require-web-deps
    npm run typecheck

# build the production Web application
[group('Web')]
[working-directory('web')]
web-build: _require-web-deps
    npm run build

# run all Web quality gates
[group('Web')]
web-verify:
    just web-check
    just web-typecheck
    just web-build

# install exact Backend dependencies from the lockfile
[group('Setup')]
[working-directory('backend')]
backend-install:
    npm ci

# generate the Backend Prisma client
[group('Backend')]
[working-directory('backend')]
backend-prisma-generate: _require-backend-deps
    npm run prisma:generate

# format Backend source and tests with Prettier
[group('Backend')]
[working-directory('backend')]
backend-format: _require-backend-deps
    npm run format

# lint Backend source and tests
[group('Backend')]
[working-directory('backend')]
backend-lint: _require-backend-deps
    npm run lint

# run Backend unit tests
[group('Backend')]
[working-directory('backend')]
backend-test: _require-backend-deps
    npm run test

# run Backend end-to-end tests
[group('Backend')]
[working-directory('backend')]
backend-test-e2e: _require-backend-deps
    npm run test:e2e

# type-check Backend production sources
[group('Backend')]
[working-directory('backend')]
backend-typecheck: _require-backend-deps
    npm run typecheck

# build the Backend application
[group('Backend')]
[working-directory('backend')]
backend-build: _require-backend-deps
    npm run build

# run the complete Backend quality gate
[group('Backend')]
backend-check:
    just backend-prisma-generate
    just backend-lint
    just backend-test
    just backend-test-e2e
    just backend-typecheck
    just backend-build

# start the Web/Backend/Postgres dev stack with hot reload
[group('Cloud')]
cloud-up:
    {{ dev_compose }} --profile watch up --build

# stop the dev stack without removing its database volume
[group('Cloud')]
cloud-down:
    {{ dev_compose }} --profile watch --profile image down

# follow hot-reload dev stack logs
[group('Cloud')]
cloud-log:
    {{ dev_compose }} logs -f web-watch backend-watch postgres

# start the isolated browser-review stack on localhost:3401
[group('Cloud')]
webtest-up:
    KESTREL_DEV_WEB_PORT=3401 KESTREL_DEV_BACKEND_PORT=3400 KESTREL_DEV_POSTGRES_PORT=15433 {{ webtest_compose }} --profile watch up --build

# stop the isolated browser-review stack without removing its database volume
[group('Cloud')]
webtest-down:
    {{ webtest_compose }} --profile watch --profile image down

# follow isolated browser-review stack logs
[group('Cloud')]
webtest-log:
    {{ webtest_compose }} logs -f web-watch backend-watch postgres

# install git hooks with prek
[group('Setup')]
hooks:
    prek install

# run all hooks on every tracked file
[group('Quality')]
hooks-all:
    prek run --all-files

# install or replace the debug APK on the connected device
[group('Device')]
install: _require-adb
    "{{ adb }}" install -r {{ apk }}

# force-stop and relaunch the app
[group('Device')]
run: _require-adb
    "{{ adb }}" shell am force-stop {{ package }}
    "{{ adb }}" shell am start -n {{ activity }}

# build, install, and run on the connected device
[group('Device')]
br: android-build install run

# force-stop the app
[group('Device')]
stop: _require-adb
    "{{ adb }}" shell am force-stop {{ package }}

# uninstall the app and all of its private data
[confirm('Uninstall Kestrel and permanently remove its app-private data?')]
[group('Device')]
uninstall: _require-adb
    "{{ adb }}" uninstall {{ package }}

# list connected devices
[group('Device')]
devices: _require-adb
    "{{ adb }}" devices

# follow logcat filtered to Kestrel and crashes
[group('Device')]
log: _require-adb
    "{{ adb }}" logcat | grep --line-buffered -iE "AndroidRuntime|FATAL|JNI DETECTED|{{ package }}|MapLibre|LocationService"

# clear logcat, then follow with the same filter
[group('Device')]
logf: _require-adb
    "{{ adb }}" logcat -c
    just log

# dump current DataStore prefs as a hex preview
[group('Device')]
prefs: _require-adb
    "{{ adb }}" shell "run-as {{ package }} cat files/datastore/kestrel_prefs.preferences_pb" | xxd | head -40

# clear all app data (resets prefs, mock state, and favorites)
[confirm('Permanently clear Kestrel prefs, favorites, and mock state?')]
[group('Device')]
reset: _require-adb
    "{{ adb }}" shell pm clear {{ package }}

[private]
_require-android-sdk:
    @test -d "{{ android_sdk }}" || { printf '%s\n' 'Android SDK not found. Set ANDROID_HOME or ANDROID_SDK_ROOT.' >&2; exit 1; }

[private]
_require-adb: _require-android-sdk
    @test -x "{{ adb }}" || { printf '%s\n' 'adb not found in the configured Android SDK.' >&2; exit 1; }

[private]
_require-web-deps:
    @test -x web/node_modules/.bin/biome && test -x web/node_modules/.bin/next || { printf '%s\n' 'Web dependencies are missing. Run: just web-install' >&2; exit 1; }

[private]
_require-backend-deps:
    @test -x backend/node_modules/.bin/eslint && test -x backend/node_modules/.bin/jest && test -x backend/node_modules/.bin/nest && test -x backend/node_modules/.bin/prisma || { printf '%s\n' 'Backend dependencies are missing. Run: just backend-install' >&2; exit 1; }

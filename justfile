set shell := ["bash", "-cu"]

java_home := env_var("JAVA_HOME")
adb := "$HOME/Library/Android/sdk/platform-tools/adb"
package := "dev.narumi.kestrel"
activity := package + "/.MainActivity"
apk := "app/build/outputs/apk/debug/app-debug.apk"

# build, install, and launch
default: br

# build the debug APK
build:
    just android-build

# build the Android debug APK
android-build:
    JAVA_HOME="{{java_home}}" PATH="{{java_home}}/bin:$PATH" ./gradlew :app:assembleDebug

# build the signed release APK (requires KESTREL_RELEASE_* environment variables)
release:
    JAVA_HOME="{{java_home}}" PATH="{{java_home}}/bin:$PATH" ./gradlew :app:assembleRelease

# clean Gradle outputs
clean:
    JAVA_HOME="{{java_home}}" PATH="{{java_home}}/bin:$PATH" ./gradlew clean

# format Android and web code
format:
    JAVA_HOME="{{java_home}}" PATH="{{java_home}}/bin:$PATH" ./gradlew spotlessApply
    just web-format

# check Android formatting and web formatting/lint without writing changes
check:
    just android-check
    just web-check

# check Android formatting without writing changes
android-check:
    JAVA_HOME="{{java_home}}" PATH="{{java_home}}/bin:$PATH" ./gradlew spotlessCheck

# run Android detekt and web lint
lint:
    just android-lint
    just web-lint

# run Android detekt only
android-lint:
    JAVA_HOME="{{java_home}}" PATH="{{java_home}}/bin:$PATH" ./gradlew detekt

# format web code with Biome (safe fixes and import sorting)
web-format:
    cd web && npm exec -- biome check --write .

# check web formatting/lint/import sorting without writing changes
web-check:
    cd web && npm exec -- biome ci .

# run web lint only
web-lint:
    cd web && npm exec -- biome lint .

# run debug-variant JVM unit tests
test:
    just android-test

# run Android debug-variant JVM unit tests
android-test:
    JAVA_HOME="{{java_home}}" PATH="{{java_home}}/bin:$PATH" ./gradlew :app:testDebugUnitTest

# start the web/backend/Postgres dev stack with hot reload
cloud-up:
    docker compose -f compose.dev.yaml --profile watch up --build

# stop the dev stack without removing its database volume
cloud-down:
    docker compose -f compose.dev.yaml --profile watch --profile image down

# follow hot-reload dev stack logs
cloud-log:
    docker compose -f compose.dev.yaml logs -f web-watch backend-watch postgres

# start the browser-test dev stack with hot reload on localhost:3401
webtest-up:
    KESTREL_DEV_WEB_PORT=3401 KESTREL_DEV_BACKEND_PORT=3400 KESTREL_DEV_POSTGRES_PORT=15433 docker compose -p kestrel-webtest -f compose.dev.yaml --profile watch up --build

# stop the browser-test stack without removing its database volume
webtest-down:
    docker compose -p kestrel-webtest -f compose.dev.yaml --profile watch --profile image down

# follow browser-test stack logs
webtest-log:
    docker compose -p kestrel-webtest -f compose.dev.yaml logs -f web-watch backend-watch postgres

# regenerate the detekt baseline (accept current warnings)
lint-baseline:
    JAVA_HOME="{{java_home}}" PATH="{{java_home}}/bin:$PATH" ./gradlew detektBaseline

# install git hooks with prek
hooks:
    prek install

# run all hooks on every tracked file
hooks-all:
    prek run --all-files

# install or replace the debug APK on the connected device
install:
    {{adb}} install -r {{apk}}

# force-stop and relaunch the app
run:
    {{adb}} shell am force-stop {{package}}
    {{adb}} shell am start -n {{activity}}

# build, install, and run
br: build install run

# force-stop the app
stop:
    {{adb}} shell am force-stop {{package}}

# uninstall the app
uninstall:
    {{adb}} uninstall {{package}}

# list connected devices
devices:
    {{adb}} devices

# follow logcat filtered to Kestrel and crashes
log:
    {{adb}} logcat | grep --line-buffered -iE "AndroidRuntime|FATAL|JNI DETECTED|{{package}}|MapLibre|LocationService"

# clear logcat, then follow with the same filter
logf:
    {{adb}} logcat -c
    just log

# dump current DataStore prefs as a hex preview
prefs:
    {{adb}} shell "run-as {{package}} cat files/datastore/kestrel_prefs.preferences_pb" | xxd | head -40

# clear all app data (resets prefs, mock state, and favorites)
reset:
    {{adb}} shell pm clear {{package}}

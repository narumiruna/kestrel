set shell := ["bash", "-cu"]

java_home := env_var_or_default("JAVA_HOME", "/Applications/Android Studio.app/Contents/jbr/Contents/Home")
adb := "$HOME/Library/Android/sdk/platform-tools/adb"
package := "dev.narumi.kestrel"
activity := package + "/.MainActivity"
apk := "app/build/outputs/apk/debug/app-debug.apk"

# build, install, launch
default: br

# build debug APK
build:
    just android-build

# build debug APK (Android only)
android-build:
    JAVA_HOME="{{java_home}}" PATH="{{java_home}}/bin:$PATH" ./gradlew :app:assembleDebug

# build release APK (unsigned unless signing config is added)
release:
    JAVA_HOME="{{java_home}}" PATH="{{java_home}}/bin:$PATH" ./gradlew :app:assembleRelease

# clean gradle outputs
clean:
    JAVA_HOME="{{java_home}}" PATH="{{java_home}}/bin:$PATH" ./gradlew clean

# auto-format Android + web code
format:
    JAVA_HOME="{{java_home}}" PATH="{{java_home}}/bin:$PATH" ./gradlew spotlessApply
    just web-format

# verify Android + web formatting/lint without changing files
check:
    just android-check
    just web-check

# verify Android formatting without changing files
android-check:
    JAVA_HOME="{{java_home}}" PATH="{{java_home}}/bin:$PATH" ./gradlew spotlessCheck

# run Android detekt + web linter
lint:
    just android-lint
    just web-lint

# run Android detekt only
android-lint:
    JAVA_HOME="{{java_home}}" PATH="{{java_home}}/bin:$PATH" ./gradlew detekt

# auto-format web code with Biome, including safe fixes and import sorting
web-format:
    cd web && npm exec -- biome check --write .

# verify web formatting/lint/import sorting without changing files
web-check:
    cd web && npm exec -- biome ci .

# run web linter only
web-lint:
    cd web && npm exec -- biome lint .

# run JVM unit tests (debug variant)
test:
    just android-test

# run Android JVM unit tests (debug variant)
android-test:
    JAVA_HOME="{{java_home}}" PATH="{{java_home}}/bin:$PATH" ./gradlew :app:testDebugUnitTest

# start the web + backend + postgres dev stack with Docker Compose
cloud-up:
    docker compose up --build

# stop the web + backend + postgres dev stack
cloud-down:
    docker compose down

# follow logs for the web + backend + postgres dev stack
cloud-log:
    docker compose logs -f web backend postgres

# regenerate detekt baseline (accept current warnings as-is)
lint-baseline:
    JAVA_HOME="{{java_home}}" PATH="{{java_home}}/bin:$PATH" ./gradlew detektBaseline

# install git hooks via prek (drop-in pre-commit replacement)
hooks:
    prek install

# run all hooks against every tracked file
hooks-all:
    prek run --all-files

# install (replacing) the debug APK on the connected device
install:
    {{adb}} install -r {{apk}}

# force-stop then relaunch the app
run:
    {{adb}} shell am force-stop {{package}}
    {{adb}} shell am start -n {{activity}}

# build + install + run
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

# clear logcat then follow with the same filter
logf:
    {{adb}} logcat -c
    just log

# dump the current DataStore prefs file as a hex preview
prefs:
    {{adb}} shell "run-as {{package}} cat files/datastore/kestrel_prefs.preferences_pb" | xxd | head -40

# clear all app data (resets prefs, mock state, favorites)
reset:
    {{adb}} shell pm clear {{package}}

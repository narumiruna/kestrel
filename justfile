set shell := ["bash", "-cu"]

java_home := "/Applications/Android Studio.app/Contents/jbr/Contents/Home"
adb := "$HOME/Library/Android/sdk/platform-tools/adb"
package := "dev.narumi.kestrel"
activity := package + "/.MainActivity"
apk := "app/build/outputs/apk/debug/app-debug.apk"

# build, install, launch
default: br

# build debug APK
build:
    JAVA_HOME="{{java_home}}" PATH="{{java_home}}/bin:$PATH" ./gradlew :app:assembleDebug

# clean gradle outputs
clean:
    JAVA_HOME="{{java_home}}" PATH="{{java_home}}/bin:$PATH" ./gradlew clean

# auto-format Kotlin / xml / misc with spotless + ktlint
format:
    JAVA_HOME="{{java_home}}" PATH="{{java_home}}/bin:$PATH" ./gradlew spotlessApply

# verify formatting without changing files
check:
    JAVA_HOME="{{java_home}}" PATH="{{java_home}}/bin:$PATH" ./gradlew spotlessCheck

# run detekt static analysis
lint:
    JAVA_HOME="{{java_home}}" PATH="{{java_home}}/bin:$PATH" ./gradlew detekt

# run JVM unit tests (debug variant)
test:
    JAVA_HOME="{{java_home}}" PATH="{{java_home}}/bin:$PATH" ./gradlew :app:testDebugUnitTest

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

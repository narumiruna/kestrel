plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
}

val appVersionCode = providers.gradleProperty("appVersionCode").get().toInt()
val appVersionName = providers.gradleProperty("appVersionName").get()
val releaseKeystorePath = providers.environmentVariable("KESTREL_RELEASE_KEYSTORE_PATH").orNull
val releaseStorePassword = providers.environmentVariable("KESTREL_RELEASE_STORE_PASSWORD").orNull
val releaseKeyAlias = providers.environmentVariable("KESTREL_RELEASE_KEY_ALIAS").orNull
val releaseKeyPassword = providers.environmentVariable("KESTREL_RELEASE_KEY_PASSWORD").orNull
val hasReleaseSigning =
    listOf(
        releaseKeystorePath,
        releaseStorePassword,
        releaseKeyAlias,
        releaseKeyPassword,
    ).all { !it.isNullOrBlank() }

android {
    namespace = "dev.narumi.kestrel"
    compileSdk {
        version = release(37)
    }

    defaultConfig {
        applicationId = "dev.narumi.kestrel"
        minSdk = 29
        targetSdk = 36
        versionCode = appVersionCode
        versionName = appVersionName

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    signingConfigs {
        if (hasReleaseSigning) {
            create("release") {
                storeFile = file(requireNotNull(releaseKeystorePath))
                storePassword = releaseStorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
            }
        }
    }

    buildTypes {
        release {
            signingConfig = signingConfigs.findByName("release")
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_26
        targetCompatibility = JavaVersion.VERSION_26
    }
    buildFeatures {
        compose = true
    }
}

kotlin {
    jvmToolchain(26)
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_26
    }
}

val verifyReleaseSigning =
    tasks.register("verifyReleaseSigning") {
        doLast {
            check(hasReleaseSigning) {
                "Release signing requires KESTREL_RELEASE_KEYSTORE_PATH, " +
                    "KESTREL_RELEASE_STORE_PASSWORD, KESTREL_RELEASE_KEY_ALIAS, and " +
                    "KESTREL_RELEASE_KEY_PASSWORD"
            }
            check(file(requireNotNull(releaseKeystorePath)).isFile) {
                "Release keystore does not exist: $releaseKeystorePath"
            }
        }
    }

tasks.matching { it.name == "preReleaseBuild" }.configureEach {
    dependsOn(verifyReleaseSigning)
}

dependencies {
    implementation(platform(libs.androidx.compose.bom))
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.compose.material3)
    implementation(libs.androidx.compose.material3.adaptive.navigation.suite)
    implementation(libs.androidx.compose.material.icons.extended)
    implementation(libs.androidx.compose.ui)
    implementation(libs.androidx.compose.ui.graphics)
    implementation(libs.androidx.compose.ui.tooling.preview)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.accompanist.permissions)
    implementation(libs.maplibre.android.sdk)
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    ksp(libs.androidx.room.compiler)
    testImplementation(libs.junit)
    androidTestImplementation(platform(libs.androidx.compose.bom))
    androidTestImplementation(libs.androidx.compose.ui.test.junit4)
    androidTestImplementation(libs.androidx.espresso.core)
    androidTestImplementation(libs.androidx.junit)
    debugImplementation(libs.androidx.compose.ui.test.manifest)
    debugImplementation(libs.androidx.compose.ui.tooling)
}

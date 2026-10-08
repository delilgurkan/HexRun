import org.jetbrains.kotlin.gradle.dsl.JvmTarget

/*
 * HexRun Wear OS eşlikçi uygulaması (Wear OS 3+). Koşuyu telefon kaydeder; saat canlı HUD'u
 * gösterir, bilekte titreşir ve duraklat / devam / bitir komutlarını gönderir.
 * Data Layer eşleşmesi için applicationId ve imza telefon uygulamasıyla aynı olmalı.
 */
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

fun cfg(name: String, default: String = ""): String =
    providers.gradleProperty(name).orElse(providers.environmentVariable(name)).getOrElse(default)

val releaseKeystore = cfg("HEXRUN_KEYSTORE_PATH")

android {
    namespace = "co.hexrun.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "co.hexrun.app"
        minSdk = 30
        targetSdk = 35
        // Play aynı sürümde telefon ve saat paketinin ayrı sürüm kodu taşımasını ister.
        versionCode = cfg("HEXRUN_WEAR_VERSION_CODE", (cfg("HEXRUN_VERSION_CODE", "1").toInt() + 100_000_000).toString()).toInt()
        versionName = cfg("HEXRUN_VERSION_NAME", "1.0.0")
    }

    signingConfigs {
        if (releaseKeystore.isNotEmpty()) {
            create("release") {
                storeFile = file(releaseKeystore)
                storePassword = cfg("HEXRUN_KEYSTORE_PASSWORD")
                keyAlias = cfg("HEXRUN_KEY_ALIAS")
                keyPassword = cfg("HEXRUN_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        debug {
            versionNameSuffix = "-debug"
        }
        release {
            isMinifyEnabled = false
            if (releaseKeystore.isNotEmpty()) signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
    }

    packaging {
        resources {
            excludes += setOf(
                "/META-INF/{AL2.0,LGPL2.1}",
                "/META-INF/versions/9/previous-compilation-data.bin",
                // :core üzerinden gelen h3-java'nın yerel kütüphaneleri; saatte H3 kullanılmaz.
                "linux-*/**", "darwin-*/**", "windows-*/**", "freebsd-*/**", "android-*/**",
            )
        }
    }

    testOptions {
        unitTests {
            isReturnDefaultValues = true
        }
    }

    lint {
        abortOnError = true
        warningsAsErrors = false
        checkReleaseBuilds = false
        disable += setOf("GradleDependency", "AndroidGradlePluginVersion", "NewerVersionAvailable", "ObsoleteLintCustomCheck", "MonochromeLauncherIcon")
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
        freeCompilerArgs.addAll("-opt-in=kotlin.RequiresOptIn")
    }
}

dependencies {
    implementation(project(":core"))

    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.coroutines.play.services)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.runtime.compose)

    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.foundation)
    implementation(libs.wear.compose.material)
    implementation(libs.wear.compose.foundation)

    implementation(libs.play.services.wearable)

    testImplementation(libs.junit4)
}

import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
    id("org.jetbrains.kotlin.plugin.serialization")
}

/** Yapılandırma: önce Gradle özelliği (-P / gradle.properties), sonra ortam değişkeni. */
fun cfg(name: String, default: String = ""): String =
    providers.gradleProperty(name).orElse(providers.environmentVariable(name)).getOrElse(default)

fun quoted(s: String) = "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"") + "\""

val releaseKeystore = cfg("HEXRUN_KEYSTORE_PATH")

android {
    namespace = "co.hexrun.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "co.hexrun.app"
        minSdk = 26
        targetSdk = 35
        versionCode = cfg("HEXRUN_VERSION_CODE", "1").toInt()
        versionName = cfg("HEXRUN_VERSION_NAME", "1.0.0")
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        buildConfigField("String", "API_URL", quoted(cfg("HEXRUN_API_URL", "https://api.hexrun.co")))
        buildConfigField("String", "MAP_STYLE_URL", quoted(cfg("HEXRUN_MAP_STYLE_URL", "https://tiles.openfreemap.org/styles/positron")))
        buildConfigField("String", "MAP_STYLE_URL_DARK", quoted(cfg("HEXRUN_MAP_STYLE_URL_DARK", "https://tiles.openfreemap.org/styles/dark")))
        buildConfigField("String", "GOOGLE_WEB_CLIENT_ID", quoted(cfg("HEXRUN_GOOGLE_WEB_CLIENT_ID")))
        buildConfigField("String", "TERMS_URL", quoted(cfg("HEXRUN_TERMS_URL", "https://hexrun.co/kosullar/")))
        buildConfigField("String", "PRIVACY_URL", quoted(cfg("HEXRUN_PRIVACY_URL", "https://hexrun.co/gizlilik/")))
        buildConfigField("String", "LICENSES_URL", quoted(cfg("HEXRUN_LICENSES_URL", "https://hexrun.co/lisanslar")))
        // google-services.json yoksa Firebase bu değerlerle elle başlatılır (hepsi boşsa push kapalı).
        buildConfigField("String", "FIREBASE_APP_ID", quoted(cfg("HEXRUN_FIREBASE_APP_ID")))
        buildConfigField("String", "FIREBASE_API_KEY", quoted(cfg("HEXRUN_FIREBASE_API_KEY")))
        buildConfigField("String", "FIREBASE_PROJECT_ID", quoted(cfg("HEXRUN_FIREBASE_PROJECT_ID")))
        buildConfigField("String", "FIREBASE_SENDER_ID", quoted(cfg("HEXRUN_FIREBASE_SENDER_ID")))
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
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            if (releaseKeystore.isNotEmpty()) signingConfig = signingConfigs.getByName("release")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources {
            excludes += setOf(
                "/META-INF/{AL2.0,LGPL2.1}",
                "/META-INF/versions/9/previous-compilation-data.bin",
                // h3-java JAR'ındaki masaüstü yerel kütüphaneleri; Android'de jniLibs kullanılır.
                "linux-*/**", "darwin-*/**", "windows-*/**", "freebsd-*/**", "android-*/**",
            )
        }
    }

    testOptions {
        unitTests {
            isIncludeAndroidResources = true
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

/*
 * h3-java, Android yerel kütüphanelerini (arm64, arm) JAR kaynağı olarak taşır. Bunları
 * jniLibs olarak paketleriz; böylece H3Core.newSystemInstance() System.loadLibrary ile yükler.
 */
abstract class ExtractH3Natives : DefaultTask() {
    @get:InputFiles
    abstract val jar: ConfigurableFileCollection

    @get:OutputDirectory
    abstract val outputDir: DirectoryProperty

    @get:Inject
    abstract val fs: FileSystemOperations

    @get:Inject
    abstract val archives: ArchiveOperations

    @TaskAction
    fun extract() {
        val out = outputDir.get().asFile
        out.deleteRecursively()
        val abis = mapOf("android-arm64" to "arm64-v8a", "android-arm" to "armeabi-v7a")
        val tree = archives.zipTree(jar.singleFile)
        for ((dir, abi) in abis) {
            fs.copy {
                from(tree) { include("$dir/libh3-java.so") }
                eachFile { path = "$abi/libh3-java.so" }
                includeEmptyDirs = false
                into(out)
            }
        }
    }
}

val h3Natives: Configuration by configurations.creating { isTransitive = false }

val extractH3 = tasks.register<ExtractH3Natives>("extractH3Natives") {
    jar.from(h3Natives)
    outputDir.set(layout.buildDirectory.dir("generated/h3jni"))
}

androidComponents {
    onVariants { variant ->
        variant.sources.jniLibs?.addGeneratedSourceDirectory(extractH3, ExtractH3Natives::outputDir)
    }
}

// Firebase yapılandırması varsa (CI gizli değişkeninden yazılır) Google Services eklentisi uygulanır.
if (file("google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
}

dependencies {
    implementation(project(":core"))
    h3Natives(libs.h3)

    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.coroutines.play.services)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.process)
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.androidx.security.crypto)
    implementation(libs.androidx.work.runtime)
    implementation(libs.androidx.browser)
    implementation(libs.androidx.credentials)
    implementation(libs.androidx.credentials.play)
    implementation(libs.googleid)

    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.graphics)
    implementation(libs.compose.ui.tooling.preview)
    implementation(libs.compose.foundation)
    implementation(libs.compose.material3)
    debugImplementation(libs.compose.ui.tooling)
    debugImplementation(libs.compose.ui.test.manifest)

    implementation(libs.maplibre)
    implementation(libs.play.services.location)
    implementation(libs.play.services.wearable)
    implementation(libs.firebase.messaging)

    testImplementation(libs.junit4)
    testImplementation(kotlin("test"))
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.robolectric)
    testImplementation(libs.androidx.test.core)
    testImplementation(libs.androidx.test.junit)
    testImplementation(platform(libs.compose.bom))
    testImplementation(libs.compose.ui.test.junit4)
}

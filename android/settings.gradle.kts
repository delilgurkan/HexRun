/*
 * HexRun Android: :core (saf Kotlin/JVM, her yerde derlenir) + :app (telefon) + :wear (Wear OS).
 *
 * Android modülleri yalnız bir Android SDK bulunduğunda eklenir:
 *   - ANDROID_HOME / ANDROID_SDK_ROOT ortam değişkeni, ya da
 *   - local.properties içinde sdk.dir, ya da
 *   - -PwithAndroid (CI) bayrağı.
 * Böylece SDK'sız bir makinede `./gradlew :core:test` yalnız JDK + Maven Central ile çalışır.
 */
pluginManagement {
    // pluginManagement ayrı değerlendirilir; SDK tespiti burada da yapılır.
    val sdkPresent = providers.gradleProperty("withAndroid").isPresent ||
        !System.getenv("ANDROID_HOME").isNullOrBlank() ||
        !System.getenv("ANDROID_SDK_ROOT").isNullOrBlank() ||
        (file("local.properties").takeIf { it.exists() }?.readText()?.contains("sdk.dir") == true)
    repositories {
        // Varsayılan Maven Central adresi bazı ağlarda hız sınırına takılıyor; önce repo1.
        maven("https://repo1.maven.org/maven2")
        gradlePluginPortal()
        if (sdkPresent) google()
        mavenCentral()
    }
}

fun localSdkDir(): String? {
    val f = file("local.properties")
    if (!f.exists()) return null
    val p = java.util.Properties()
    f.inputStream().use { p.load(it) }
    return p.getProperty("sdk.dir")?.takeIf { it.isNotBlank() }
}

val withAndroid: Boolean = providers.gradleProperty("withAndroid").isPresent ||
    !System.getenv("ANDROID_HOME").isNullOrBlank() ||
    !System.getenv("ANDROID_SDK_ROOT").isNullOrBlank() ||
    localSdkDir() != null

gradle.extra["withAndroid"] = withAndroid

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.PREFER_SETTINGS)
    repositories {
        maven("https://repo1.maven.org/maven2")
        if (withAndroid) google()
        mavenCentral()
    }
}

rootProject.name = "hexrun-android"

include(":core")
if (withAndroid) {
    include(":app")
    include(":wear")
} else {
    logger.lifecycle("HexRun: Android SDK bulunamadı; yalnız :core derleniyor (CI'da -PwithAndroid).")
}

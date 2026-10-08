import org.jetbrains.kotlin.gradle.dsl.JvmTarget

/** Platformdan bağımsız oyun mantığı: JVM'de test edilir, :app ve :wear tarafından kullanılır. */
plugins {
    alias(libs.plugins.kotlin.jvm)
    alias(libs.plugins.kotlin.serialization)
    `java-library`
}

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
        freeCompilerArgs.add("-Xjsr305=strict")
    }
}

dependencies {
    api(libs.kotlinx.coroutines.core)
    api(libs.kotlinx.serialization.json)
    api(libs.okhttp)
    api(libs.h3)

    testImplementation(platform(libs.junit.bom))
    testImplementation(libs.junit.jupiter)
    testRuntimeOnly(libs.junit.platform.launcher)
    testImplementation(kotlin("test-junit5"))
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.okhttp.mockwebserver)
}

val vectorsDir = rootProject.projectDir.resolve("../shared/test-vectors").canonicalFile

tasks.test {
    useJUnitPlatform()
    // Ortak test vektörleri (TypeScript motorundan üretilir): shared/test-vectors/*.json
    systemProperty("hexrun.vectors", vectorsDir.path)
    inputs.dir(vectorsDir).withPathSensitivity(PathSensitivity.RELATIVE)
    testLogging {
        events("failed", "skipped")
        exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL
        showStandardStreams = false
    }
}

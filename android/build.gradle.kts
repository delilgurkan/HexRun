/*
 * Kök derleme. Android Gradle eklentisi (AGP) ve Google Services eklentisi yalnız Android SDK
 * varken (settings.gradle.kts → gradle.extra["withAndroid"]) sınıf yoluna eklenir; böylece
 * dl.google.com'a erişimi olmayan bir makinede de :core derlenip test edilir.
 */
buildscript {
    val withAndroid = gradle.extra["withAndroid"] as Boolean
    repositories {
        maven("https://repo1.maven.org/maven2")
        if (withAndroid) google()
        mavenCentral()
        gradlePluginPortal()
    }
    dependencies {
        if (withAndroid) {
            classpath("com.android.tools.build:gradle:${libs.versions.agp.get()}")
            classpath("com.google.gms:google-services:${libs.versions.googleServices.get()}")
        }
    }
}

plugins {
    alias(libs.plugins.kotlin.jvm) apply false
    alias(libs.plugins.kotlin.android) apply false
    alias(libs.plugins.kotlin.serialization) apply false
    alias(libs.plugins.kotlin.compose) apply false
}

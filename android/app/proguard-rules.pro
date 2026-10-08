# kotlinx.serialization
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keepclassmembers class kotlinx.serialization.json.** { *** Companion; }
-keepclasseswithmembers class kotlinx.serialization.json.** { kotlinx.serialization.KSerializer serializer(...); }
-keep,includedescriptorclasses class co.hexrun.**$$serializer { *; }
-keepclassmembers class co.hexrun.** { *** Companion; }
-keepclasseswithmembers class co.hexrun.** { kotlinx.serialization.KSerializer serializer(...); }

# H3 (JNI): yerel yöntemler adla bağlanır.
-keep class com.uber.h3core.** { *; }

# MapLibre
-keep class org.maplibre.** { *; }
-dontwarn org.maplibre.**

# OkHttp
-dontwarn okhttp3.internal.platform.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**

# Google Credential Manager
-if class androidx.credentials.CredentialManager
-keep class androidx.credentials.playservices.** { *; }

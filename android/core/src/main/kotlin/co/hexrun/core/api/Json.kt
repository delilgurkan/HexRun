package co.hexrun.core.api

import kotlinx.serialization.json.Json

/** Ortak JSON yapılandırması: bilinmeyen alanlar yok sayılır, null'lar gönderilmez. */
val HexJson: Json = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
    coerceInputValues = true
    encodeDefaults = true
    isLenient = true
}

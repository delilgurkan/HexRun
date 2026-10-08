package co.hexrun.core.api

import kotlinx.serialization.Serializable

@Serializable
data class Tokens(
    val accessToken: String,
    val refreshToken: String,
    /** Erişim jetonunun bitişi (epoch ms). */
    val expiresAt: Long,
)

/** Jeton deposu: Android'de EncryptedSharedPreferences, testte bellek. */
interface TokenStore {
    suspend fun get(): Tokens?
    suspend fun set(t: Tokens)
    suspend fun clear()
}

class MemoryTokenStore(initial: Tokens? = null) : TokenStore {
    @Volatile private var t: Tokens? = initial
    override suspend fun get(): Tokens? = t
    override suspend fun set(t: Tokens) { this.t = t }
    override suspend fun clear() { t = null }
}

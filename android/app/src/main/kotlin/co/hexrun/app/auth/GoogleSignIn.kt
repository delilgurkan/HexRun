package co.hexrun.app.auth

import android.content.Context
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.NoCredentialException
import co.hexrun.app.BuildConfig
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential

sealed interface GoogleResult {
    data class Token(val idToken: String) : GoogleResult
    data object Cancelled : GoogleResult
    data object NotConfigured : GoogleResult
    data object NoAccount : GoogleResult
    data class Failed(val message: String?) : GoogleResult
}

/**
 * Credential Manager + Google ID ile giriş. Sunucu `idToken`'ı JWKS ile doğrular
 * (POST /v1/auth/google). `HEXRUN_GOOGLE_WEB_CLIENT_ID` (web istemci kimliği) gerekir.
 */
object GoogleSignIn {
    val configured: Boolean get() = BuildConfig.GOOGLE_WEB_CLIENT_ID.isNotBlank()

    suspend fun signIn(activityContext: Context): GoogleResult {
        if (!configured) return GoogleResult.NotConfigured
        val cm = CredentialManager.create(activityContext)
        val option = GetGoogleIdOption.Builder()
            .setFilterByAuthorizedAccounts(false)
            .setServerClientId(BuildConfig.GOOGLE_WEB_CLIENT_ID)
            .setAutoSelectEnabled(false)
            .build()
        val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
        return try {
            val res = cm.getCredential(activityContext, request)
            val cred = res.credential
            if (cred is CustomCredential && cred.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
                GoogleResult.Token(GoogleIdTokenCredential.createFrom(cred.data).idToken)
            } else {
                GoogleResult.Failed("unexpected credential")
            }
        } catch (e: GetCredentialCancellationException) {
            GoogleResult.Cancelled
        } catch (e: NoCredentialException) {
            GoogleResult.NoAccount
        } catch (e: GetCredentialException) {
            GoogleResult.Failed(e.message)
        } catch (e: Exception) {
            GoogleResult.Failed(e.message)
        }
    }
}

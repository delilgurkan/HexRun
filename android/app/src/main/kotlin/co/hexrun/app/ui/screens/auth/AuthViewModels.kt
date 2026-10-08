package co.hexrun.app.ui.screens.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import co.hexrun.app.data.AuthRepository
import co.hexrun.app.data.MeRepository
import co.hexrun.app.data.PrefsStore
import co.hexrun.app.ui.attempt
import co.hexrun.core.api.ErrorText
import co.hexrun.core.api.HexRunApi
import co.hexrun.core.api.UpdateMeRequest
import co.hexrun.core.api.UsernameAvailability
import co.hexrun.core.colors.Slot
import co.hexrun.core.format.Format
import co.hexrun.core.i18n.S
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

private val EMAIL_RE = Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]{2,}$")
private val USERNAME_RE = Regex("^[a-z0-9_]{3,20}$")

data class EmailUi(
    val email: String = "",
    val code: String = "",
    val step: Step = Step.EMAIL,
    val busy: Boolean = false,
    val error: String? = null,
    val devCode: String? = null,
) {
    enum class Step { EMAIL, CODE }
}

/** E-posta ile tek kullanımlık kod (şifresiz) giriş. */
class EmailViewModel(private val api: HexRunApi, private val auth: AuthRepository, private val me: MeRepository) : ViewModel() {
    private val _ui = MutableStateFlow(EmailUi())
    val ui: StateFlow<EmailUi> = _ui.asStateFlow()

    fun setEmail(v: String) = _ui.update { it.copy(email = v, error = null) }
    fun setCode(v: String) = _ui.update { it.copy(code = v.filter(Char::isDigit).take(6), error = null) }
    fun backToEmail() = _ui.update { it.copy(step = EmailUi.Step.EMAIL, error = null) }

    fun send() {
        val e = _ui.value.email.trim().lowercase()
        if (!EMAIL_RE.matches(e)) {
            _ui.update { it.copy(error = S.auth.invalidEmail) }
            return
        }
        _ui.update { it.copy(busy = true, error = null) }
        viewModelScope.launch {
            attempt { api.emailStart(e) }
                .onSuccess { r -> _ui.update { it.copy(busy = false, step = EmailUi.Step.CODE, devCode = r.devCode, code = r.devCode ?: it.code) } }
                .onFailure { err -> _ui.update { it.copy(busy = false, error = ErrorText.of(err)) } }
        }
    }

    /** Doğrular; başarılıysa `needsProfile` ile döner. */
    fun verify(onSignedIn: (needsProfile: Boolean) -> Unit) {
        val s = _ui.value
        _ui.update { it.copy(busy = true, error = null) }
        viewModelScope.launch {
            attempt { api.emailVerify(s.email.trim().lowercase(), s.code.trim()) }
                .onSuccess { res ->
                    auth.completeSignIn(res, me)
                    _ui.update { it.copy(busy = false) }
                    onSignedIn(res.needsProfile)
                }
                .onFailure { err -> _ui.update { it.copy(busy = false, error = ErrorText.of(err)) } }
        }
    }
}

data class ProfileSetupUi(
    val username: String = "",
    val displayName: String = "",
    val slot: Slot = Slot.KEH,
    val checking: Boolean = false,
    val availability: UsernameAvailability? = null,
    val mine: String? = null,
    val busy: Boolean = false,
    val error: String? = null,
) {
    val normalized: String get() = username.trim().lowercase()
    val valid: Boolean get() = USERNAME_RE.matches(normalized)
    val ok: Boolean get() = valid && (mine == normalized || (availability?.username == normalized && availability.available))
    val initials: String get() = Format.initials(displayName.ifBlank { username.ifBlank { "H R" } })

    /** Kullanıcı adı altındaki ipucu. */
    val hint: String?
        get() = when {
            username.isNotEmpty() && !valid -> S.profileSetup.invalid
            valid && checking -> S.profileSetup.checking
            ok -> S.profileSetup.available
            availability != null && availability.username == normalized && !availability.available -> when (availability.reason) {
                "reserved" -> S.profileSetup.reserved
                "invalid" -> S.profileSetup.invalid
                else -> S.profileSetup.taken
            }
            else -> null
        }
}

/** Profil kurulumu: kullanıcı adı (uygunluk, 350 ms gecikmeli) + imza rengi + komşu kuralı. */
class ProfileSetupViewModel(
    private val api: HexRunApi,
    private val prefs: PrefsStore,
    private val me: MeRepository,
    private val debounceMs: Long = 350,
) : ViewModel() {
    private val _ui = MutableStateFlow(ProfileSetupUi())
    val ui: StateFlow<ProfileSetupUi> = _ui.asStateFlow()
    private var check: Job? = null

    init {
        viewModelScope.launch {
            val m = me.ensure() ?: return@launch
            _ui.update {
                it.copy(
                    username = it.username.ifEmpty { m.username },
                    displayName = it.displayName.ifEmpty { m.displayName },
                    slot = m.slot,
                    mine = m.username.takeIf { u -> u.isNotEmpty() },
                )
            }
        }
    }

    fun setUsername(v: String) {
        _ui.update { it.copy(username = v.lowercase().take(20), error = null) }
        val s = _ui.value
        check?.cancel()
        if (!s.valid || s.normalized == s.mine) {
            _ui.update { it.copy(checking = false) }
            return
        }
        _ui.update { it.copy(checking = true) }
        val name = s.normalized
        check = viewModelScope.launch {
            delay(debounceMs)
            attempt { api.username(name) }
                .onSuccess { a -> _ui.update { it.copy(checking = false, availability = a.copy(username = name)) } }
                .onFailure { _ui.update { it.copy(checking = false) } }
        }
    }

    fun setDisplayName(v: String) = _ui.update { it.copy(displayName = v.take(40)) }
    fun setSlot(s: Slot) = _ui.update { it.copy(slot = s) }

    fun submit(onDone: () -> Unit) {
        val s = _ui.value
        if (!s.ok) return
        _ui.update { it.copy(busy = true, error = null) }
        viewModelScope.launch {
            attempt { api.updateMe(UpdateMeRequest(username = s.normalized, displayName = s.displayName.trim().ifBlank { null }, slot = s.slot)) }
                .onSuccess { m ->
                    me.set(m)
                    prefs.update { it.copy(needsProfile = false) }
                    _ui.update { it.copy(busy = false) }
                    onDone()
                }
                .onFailure { e -> _ui.update { it.copy(busy = false, error = ErrorText.of(e)) } }
        }
    }
}

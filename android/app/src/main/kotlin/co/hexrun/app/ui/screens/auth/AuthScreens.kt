package co.hexrun.app.ui.screens.auth

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextFieldColors
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withLink
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import co.hexrun.app.BuildConfig
import co.hexrun.app.auth.GoogleResult
import co.hexrun.app.auth.GoogleSignIn
import co.hexrun.app.nav.LocalGraph
import co.hexrun.app.nav.LocalNav
import co.hexrun.app.nav.Routes
import co.hexrun.app.ui.attempt
import co.hexrun.app.ui.components.ButtonKind
import co.hexrun.app.ui.components.DataText
import co.hexrun.app.ui.components.HButton
import co.hexrun.app.ui.components.HScreen
import co.hexrun.app.ui.components.HText
import co.hexrun.app.ui.components.HexTexture
import co.hexrun.app.ui.components.PlayerBadge
import co.hexrun.app.ui.components.SectionTitle
import co.hexrun.app.ui.components.TextButtonH
import co.hexrun.app.ui.components.Tone
import co.hexrun.app.ui.theme.Hex
import co.hexrun.app.ui.theme.Radii
import co.hexrun.app.ui.theme.Space
import co.hexrun.app.util.openUrl
import co.hexrun.core.api.ErrorText
import co.hexrun.core.colors.Palette
import co.hexrun.core.colors.Slot
import co.hexrun.core.i18n.S
import kotlinx.coroutines.launch

@Composable
fun hexFieldColors(): TextFieldColors {
    val c = Hex.colors
    return OutlinedTextFieldDefaults.colors(
        focusedBorderColor = c.ink, unfocusedBorderColor = c.line2, focusedContainerColor = c.surf, unfocusedContainerColor = c.surf,
        focusedTextColor = c.ink, unfocusedTextColor = c.ink, cursorColor = c.ink, focusedPlaceholderColor = c.ink3, unfocusedPlaceholderColor = c.ink3,
        focusedLabelColor = c.ink2, unfocusedLabelColor = c.ink3,
    )
}

/** Kullanım koşulları ve gizlilik bağlantıları. */
@Composable
fun LegalText() {
    val c = Hex.colors
    val links = TextLinkStyles(style = SpanStyle(textDecoration = TextDecoration.Underline, color = c.ink))
    val text: AnnotatedString = buildAnnotatedString {
        append(S.auth.legalPre)
        withLink(LinkAnnotation.Url(BuildConfig.TERMS_URL, links)) { append(S.auth.terms) }
        append(S.auth.legalMid)
        withLink(LinkAnnotation.Url(BuildConfig.PRIVACY_URL, links)) { append(S.auth.privacy) }
        append(S.auth.legalPost)
    }
    Text(text, style = Hex.type.callout.copy(fontSize = 13.sp, textAlign = TextAlign.Center), color = c.ink2, modifier = Modifier.fillMaxWidth())
}

/** 02 · Kayıt / giriş: Android'de Google en üstte; e-posta kodu her yerde. Apple yok. */
@Composable
fun AuthScreen() {
    val graph = LocalGraph.current
    val nav = LocalNav.current
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    AuthContent(
        busy = busy,
        error = error,
        onGoogle = {
            busy = true
            error = null
            scope.launch {
                when (val r = GoogleSignIn.signIn(context)) {
                    is GoogleResult.Token -> attempt { graph.api.google(r.idToken) }
                        .onSuccess { res ->
                            graph.auth.completeSignIn(res, graph.me)
                            nav.reset(if (res.needsProfile) Routes.AUTH_PROFILE else Routes.main())
                        }
                        .onFailure { error = ErrorText.of(it) }
                    GoogleResult.Cancelled -> Unit
                    GoogleResult.NotConfigured -> error = S.auth.googleMissing
                    GoogleResult.NoAccount -> error = S.auth.googleNoAccount
                    is GoogleResult.Failed -> error = S.common.genericError
                }
                busy = false
            }
        },
        onEmail = { nav.go(Routes.AUTH_EMAIL) },
    )
}

@Composable
fun AuthContent(busy: Boolean, error: String?, onGoogle: () -> Unit, onEmail: () -> Unit) {
    val c = Hex.colors
    Box(Modifier.fillMaxSize().background(c.bg)) {
        HexTexture(Modifier.fillMaxSize())
        Column(
            Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding().padding(horizontal = Space.gutter).padding(top = 48.dp, bottom = 16.dp),
            verticalArrangement = Arrangement.SpaceBetween,
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                HText("hexrun", style = Hex.type.display.copy(fontSize = 64.sp, lineHeight = 66.sp), heading = true)
                HText(S.auth.tagline, style = Hex.type.title2)
            }
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                HButton(S.auth.google, onGoogle, Modifier.fillMaxWidth(), big = true, loading = busy)
                HButton(S.auth.email, onEmail, Modifier.fillMaxWidth(), big = true, kind = ButtonKind.Secondary)
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                    HText(S.auth.haveAccount, style = Hex.type.callout, tone = Tone.Ink2)
                    TextButtonH(S.auth.login, onEmail)
                }
                if (error != null) HText(error, style = Hex.type.callout, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive })
                LegalText()
            }
        }
    }
}

@Composable
fun EmailScreen() {
    val graph = LocalGraph.current
    val nav = LocalNav.current
    val vm: EmailViewModel = viewModel { EmailViewModel(graph.api, graph.auth, graph.me) }
    val ui by vm.ui.collectAsStateWithLifecycle()
    EmailContent(
        ui = ui,
        onBack = { if (ui.step == EmailUi.Step.CODE) vm.backToEmail() else nav.back() },
        onEmail = vm::setEmail,
        onCode = vm::setCode,
        onSend = vm::send,
        onVerify = { vm.verify { needsProfile -> nav.reset(if (needsProfile) Routes.AUTH_PROFILE else Routes.main()) } },
    )
}

@Composable
fun EmailContent(ui: EmailUi, onBack: () -> Unit, onEmail: (String) -> Unit, onCode: (String) -> Unit, onSend: () -> Unit, onVerify: () -> Unit) {
    val focus = remember { FocusRequester() }
    androidx.activity.compose.BackHandler(enabled = ui.step == EmailUi.Step.CODE, onBack = onBack)
    HScreen(
        title = if (ui.step == EmailUi.Step.EMAIL) S.auth.emailTitle else S.auth.codeTitle,
        large = true,
        onBack = onBack,
        footer = {
            if (ui.step == EmailUi.Step.EMAIL) {
                HButton(S.auth.sendCode, onSend, Modifier.fillMaxWidth(), big = true, loading = ui.busy, enabled = ui.email.isNotBlank())
            } else {
                HButton(S.auth.verify, onVerify, Modifier.fillMaxWidth(), big = true, loading = ui.busy, enabled = ui.code.trim().length >= 4)
                TextButtonH(S.auth.resend, onSend, Modifier.fillMaxWidth())
            }
        },
    ) {
        if (ui.step == EmailUi.Step.EMAIL) {
            HText(S.auth.emailBody, tone = Tone.Ink2)
            OutlinedTextField(
                value = ui.email, onValueChange = onEmail, modifier = Modifier.fillMaxWidth(),
                placeholder = { Text(S.auth.emailPlaceholder) }, singleLine = true, textStyle = Hex.type.body.copy(fontSize = 17.sp),
                label = { Text(S.auth.emailTitle) },
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Send, capitalization = KeyboardCapitalization.None, autoCorrectEnabled = false),
                keyboardActions = KeyboardActions(onSend = { onSend() }),
                shape = RoundedCornerShape(Radii.s), colors = hexFieldColors(),
            )
        } else {
            HText(S.auth.codeBody(ui.email.trim()), tone = Tone.Ink2)
            LaunchedEffect(Unit) { runCatching { focus.requestFocus() } }
            OutlinedTextField(
                value = ui.code, onValueChange = onCode, modifier = Modifier.fillMaxWidth().focusRequester(focus),
                singleLine = true, label = { Text(S.auth.codeTitle) },
                textStyle = Hex.type.data.copy(fontSize = 28.sp, lineHeight = 34.sp, letterSpacing = 10.sp, textAlign = TextAlign.Center),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.NumberPassword, imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { onVerify() }),
                shape = RoundedCornerShape(Radii.s), colors = hexFieldColors(),
            )
            if (ui.devCode != null) DataText(S.auth.devCode(ui.devCode), tone = Tone.Ink3)
        }
        if (ui.error != null) HText(ui.error, style = Hex.type.callout, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive })
    }
}

@Composable
fun ProfileSetupScreen() {
    val graph = LocalGraph.current
    val nav = LocalNav.current
    val vm: ProfileSetupViewModel = viewModel { ProfileSetupViewModel(graph.api, graph.prefs, graph.me) }
    val ui by vm.ui.collectAsStateWithLifecycle()
    ProfileSetupContent(ui, vm::setUsername, vm::setDisplayName, vm::setSlot, onSubmit = { vm.submit { nav.reset(Routes.main()) } })
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ProfileSetupContent(ui: ProfileSetupUi, onUsername: (String) -> Unit, onDisplayName: (String) -> Unit, onSlot: (Slot) -> Unit, onSubmit: () -> Unit) {
    val c = Hex.colors
    HScreen(
        title = S.profileSetup.title,
        large = true,
        footer = { HButton(S.profileSetup.submit, onSubmit, Modifier.fillMaxWidth(), big = true, enabled = ui.ok, loading = ui.busy) },
    ) {
        SectionTitle(S.profileSetup.username)
        OutlinedTextField(
            value = ui.username, onValueChange = onUsername, modifier = Modifier.fillMaxWidth(), singleLine = true,
            prefix = { Text("@", style = Hex.type.title2, color = c.ink3) }, textStyle = Hex.type.body.copy(fontSize = 17.sp),
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.None, autoCorrectEnabled = false, imeAction = ImeAction.Next),
            shape = RoundedCornerShape(Radii.s), colors = hexFieldColors(),
            label = { Text(S.profileSetup.username) },
        )
        ui.hint?.let { HText(it, style = Hex.type.callout, tone = if (ui.ok) Tone.Ink else Tone.Ink2, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }) }
        SectionTitle(S.profileSetup.displayName)
        OutlinedTextField(
            value = ui.displayName, onValueChange = onDisplayName, modifier = Modifier.fillMaxWidth(), singleLine = true,
            textStyle = Hex.type.body.copy(fontSize = 17.sp), shape = RoundedCornerShape(Radii.s), colors = hexFieldColors(),
            label = { Text(S.profileSetup.displayName) },
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words),
        )
        SectionTitle(S.profileSetup.color)
        FlowRow(Modifier.fillMaxWidth().selectableGroup(), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            for (s in Palette.SLOTS) {
                val sel = s == ui.slot
                Column(
                    Modifier.width(72.dp).selectable(sel, role = Role.RadioButton, onClick = { onSlot(s) }).semantics { contentDescription = Palette.name(s) },
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    Box(Modifier.size(52.dp).clip(CircleShape).background(c.player(s)).border(if (sel) 3.dp else 1.dp, if (sel) c.ink else c.line, CircleShape))
                    HText(Palette.name(s), style = Hex.type.callout.copy(fontSize = 13.sp), tone = if (sel) Tone.Ink else Tone.Ink2, maxLines = 1)
                }
            }
        }
        Row(Modifier.padding(top = 8.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
            PlayerBadge(ui.slot, ui.initials, size = 44.dp, ring = true)
            HText(S.profileSetup.neighborRule(Palette.name(ui.slot)), tone = Tone.Ink2, modifier = Modifier.weight(1f))
        }
        if (ui.error != null) HText(ui.error, style = Hex.type.callout)
    }
}

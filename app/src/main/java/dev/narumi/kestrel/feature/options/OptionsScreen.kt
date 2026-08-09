package dev.narumi.kestrel.feature.options

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.autofill.ContentDataType
import androidx.compose.ui.autofill.ContentType
import androidx.compose.ui.autofill.contentType
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDataType
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.narumi.kestrel.core.cloud.CloudApiException
import dev.narumi.kestrel.core.cloud.CloudAuthRepository
import dev.narumi.kestrel.core.cloud.CloudPlaceConflict
import dev.narumi.kestrel.core.cloud.CloudSession
import dev.narumi.kestrel.core.cloud.CloudSyncRepository
import dev.narumi.kestrel.core.cloud.CloudSyncState
import dev.narumi.kestrel.core.cloud.RemoteCommandStatus
import dev.narumi.kestrel.core.cloud.RemoteControlRepository
import dev.narumi.kestrel.core.cloud.RemoteControlRuntimeStatus
import dev.narumi.kestrel.core.cloud.normalizeCloudApiBaseUrl
import dev.narumi.kestrel.core.data.CloudSettings
import dev.narumi.kestrel.core.data.KestrelPrefs
import dev.narumi.kestrel.core.data.MockPlaybackSettings
import dev.narumi.kestrel.core.data.RandomRoutePreference
import dev.narumi.kestrel.core.data.RemoteControlSettings
import dev.narumi.kestrel.core.data.StartupPreference
import dev.narumi.kestrel.core.library.LibraryRepository
import dev.narumi.kestrel.ui.components.KestrelActionRow
import dev.narumi.kestrel.ui.components.KestrelCard
import dev.narumi.kestrel.ui.components.KestrelScreenHeader
import dev.narumi.kestrel.ui.components.KestrelSectionHeader
import dev.narumi.kestrel.ui.components.PersistedActionResult
import dev.narumi.kestrel.ui.components.runPersistedAction
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.launch
import java.io.IOException
import java.net.URI
import java.util.Date

private data class CloudLoginForm(
    val username: String = "",
    val password: String = "",
    val oneTimeCode: String = "",
    val useRecoveryCode: Boolean = false,
)

private enum class ConflictResolutionChoice { KeepDevice, KeepCloud, KeepBoth }

private data class PendingConflictResolution(
    val conflict: CloudPlaceConflict,
    val choice: ConflictResolutionChoice,
)

private data class CloudSettingsUiState(
    val apiBaseUrl: String,
    val loading: Boolean,
    val message: String?,
    val error: String?,
    val session: CloudSession?,
    val syncState: CloudSyncState,
)

private fun Modifier.autofillText(contentType: ContentType): Modifier =
    fillMaxWidth()
        .contentType(contentType)
        .semantics { contentDataType = ContentDataType.Text }

@Composable
private fun OptionsCard(
    title: String,
    subtitle: String,
    content: @Composable () -> Unit,
) {
    KestrelCard {
        KestrelSectionHeader(title = title, subtitle = subtitle)
        content()
    }
}

@Composable
internal fun OptionsDisclosureCard(
    title: String,
    subtitle: String,
    summary: String,
    expanded: Boolean,
    onExpandedChange: (Boolean) -> Unit,
    content: @Composable () -> Unit,
) {
    val changeFocusRequester = remember { FocusRequester() }
    var wasExpanded by remember { mutableStateOf(expanded) }
    LaunchedEffect(expanded) {
        if (wasExpanded && !expanded) changeFocusRequester.requestFocus()
        wasExpanded = expanded
    }
    BackHandler(enabled = expanded) { onExpandedChange(false) }
    KestrelCard(
        modifier =
            Modifier.semantics {
                stateDescription = optionsDisclosureStateDescription(expanded)
            },
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            KestrelSectionHeader(
                title = title,
                subtitle = subtitle,
                modifier = Modifier.weight(1f),
            )
            TextButton(
                onClick = { onExpandedChange(!expanded) },
                modifier =
                    Modifier
                        .focusRequester(changeFocusRequester)
                        .semantics {
                            stateDescription = optionsDisclosureStateDescription(expanded)
                        },
            ) {
                Text(if (expanded) "Cancel" else "Change")
            }
        }
        Text(
            text = summary,
            style = MaterialTheme.typography.titleSmall,
            color = MaterialTheme.colorScheme.onSurface,
        )
        if (expanded) content()
    }
}

@Suppress("LongMethod")
@Composable
fun OptionsScreen(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val prefs = remember { KestrelPrefs(context) }
    val libraryRepository = remember { LibraryRepository.getInstance(context) }
    val scope = rememberCoroutineScope()

    val loadedItems by
        libraryRepository.items.collectAsStateWithLifecycle(initialValue = null)
    val items = loadedItems.orEmpty()
    val startup by prefs.startupPreference.collectAsStateWithLifecycle(StartupPreference())
    val randomRoute by prefs.randomRoutePreference.collectAsStateWithLifecycle(RandomRoutePreference())
    val mockPlayback by prefs.mockPlaybackSettings.collectAsStateWithLifecycle(MockPlaybackSettings())

    var defaultPointCount by remember { mutableStateOf("") }
    var defaultSpacingMeters by remember { mutableStateOf("") }
    var mapLinksExpanded by rememberSaveable { mutableStateOf(OptionsSection.MapLinks.defaultExpanded) }
    var playbackExpanded by rememberSaveable { mutableStateOf(OptionsSection.Playback.defaultExpanded) }
    var randomRouteExpanded by rememberSaveable { mutableStateOf(OptionsSection.RandomRoute.defaultExpanded) }
    var settingsBusy by remember { mutableStateOf(false) }
    var settingsMessage by remember { mutableStateOf<String?>(null) }
    var settingsError by remember { mutableStateOf<String?>(null) }

    LaunchedEffect(randomRoute.defaultPointCount, randomRoute.defaultSpacingMeters) {
        defaultPointCount = randomRoute.defaultPointCount.toString()
        defaultSpacingMeters = formatMeters(randomRoute.defaultSpacingMeters)
    }

    fun runSettingsAction(
        successMessage: String,
        onSuccess: () -> Unit,
        block: suspend () -> Unit,
    ) {
        if (settingsBusy) return
        settingsBusy = true
        settingsMessage = null
        settingsError = null
        scope.launch {
            try {
                when (
                    val result =
                        runPersistedAction(
                            failureMessage =
                                "Could not save this setting. The previous value is unchanged; try again.",
                            block = block,
                        )
                ) {
                    PersistedActionResult.Success -> {
                        settingsMessage = successMessage
                        onSuccess()
                    }
                    is PersistedActionResult.Failure -> settingsError = result.message
                }
            } finally {
                settingsBusy = false
            }
        }
    }

    Column(
        modifier =
            modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        KestrelScreenHeader(
            title = "Settings",
            subtitle = "Choose how Kestrel opens, recovers routes, syncs, and accepts Web control.",
        )

        (settingsError ?: settingsMessage)?.let {
            KestrelCard(
                modifier =
                    Modifier.semantics {
                        liveRegion =
                            if (settingsError != null) LiveRegionMode.Assertive else LiveRegionMode.Polite
                    },
            ) {
                Text(
                    text = it,
                    color = if (settingsError != null) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
                )
            }
        }

        StartupPreferenceCard(
            items = items,
            itemsLoading = loadedItems == null,
            startup = startup,
            saving = settingsBusy,
            error = settingsError,
            onSave = { preference, onSuccess ->
                runSettingsAction("Saved app opening behavior.", onSuccess) {
                    prefs.setStartupPreference(preference)
                }
            },
        )

        MapLinksOptionsCard(
            expanded = mapLinksExpanded,
            onExpandedChange = { mapLinksExpanded = it },
        )

        RandomRouteDefaultsCard(
            pointCount = defaultPointCount,
            spacingMeters = defaultSpacingMeters,
            preference = randomRoute,
            expanded = randomRouteExpanded,
            onExpandedChange = { randomRouteExpanded = it },
            onPointCountChange = { defaultPointCount = it.filter(Char::isDigit).take(4) },
            onSpacingMetersChange = {
                defaultSpacingMeters = it.filter { ch -> ch.isDigit() || ch == '.' }.take(7)
            },
            saving = settingsBusy,
            error = settingsError,
            onSave = { resetToRecommended, onSuccess ->
                runSettingsAction("Saved random route defaults.", onSuccess) {
                    if (resetToRecommended) {
                        prefs.resetRandomRoutePreference()
                    } else {
                        prefs.setRandomRouteDefaults(
                            defaultPointCount.toIntOrNull() ?: return@runSettingsAction,
                            defaultSpacingMeters.toDoubleOrNull() ?: return@runSettingsAction,
                        )
                    }
                }
            },
        )

        MockPlaybackSettingsCard(
            settings = mockPlayback,
            expanded = playbackExpanded,
            onExpandedChange = { playbackExpanded = it },
            saving = settingsBusy,
            error = settingsError,
            onSave = { seconds, onSuccess ->
                runSettingsAction("Saved route recovery behavior.", onSuccess) {
                    prefs.setProgressWriteIntervalSeconds(seconds)
                }
            },
        )

        CloudSettingsSection()
    }
}

@Suppress("CyclomaticComplexMethod", "LongMethod")
@Composable
private fun CloudSettingsSection() {
    val context = LocalContext.current
    val prefs = remember { KestrelPrefs(context) }
    val authRepository = remember { CloudAuthRepository.getInstance(context) }
    val syncRepository = remember { CloudSyncRepository.getInstance(context) }
    val remoteControlRepository = remember { RemoteControlRepository.getInstance(context) }
    val scope = rememberCoroutineScope()

    val cloudSettings by prefs.cloudSettings.collectAsStateWithLifecycle(CloudSettings())
    val cloudSyncState by syncRepository.syncState.collectAsStateWithLifecycle(CloudSyncState())
    val placeConflicts by syncRepository.placeConflicts.collectAsStateWithLifecycle(emptyList())
    val remoteControlSettings by prefs.remoteControlSettings.collectAsStateWithLifecycle(RemoteControlSettings())
    val remoteControlStatus by remoteControlRepository.runtimeStatus.collectAsStateWithLifecycle(RemoteControlRuntimeStatus())

    var loginForm by remember { mutableStateOf(CloudLoginForm()) }
    var cloudSession by remember { mutableStateOf<CloudSession?>(null) }
    var cloudSessionLoaded by remember { mutableStateOf(false) }
    var cloudExpanded by rememberSaveable { mutableStateOf(OptionsSection.Cloud.defaultExpanded) }
    var remoteExpanded by rememberSaveable { mutableStateOf(OptionsSection.RemoteControl.defaultExpanded) }
    var cloudMessage by remember { mutableStateOf<String?>(null) }
    var cloudError by remember { mutableStateOf<String?>(null) }
    var cloudLoading by remember { mutableStateOf(false) }
    var apiBaseUrl by remember { mutableStateOf(cloudSettings.apiBaseUrl) }
    var confirmRemoteEnable by remember { mutableStateOf(false) }
    var confirmSignOut by remember { mutableStateOf(false) }
    var pendingConflictResolution by remember { mutableStateOf<PendingConflictResolution?>(null) }

    LaunchedEffect(Unit) {
        try {
            cloudSession = authRepository.currentSession()
        } catch (error: CancellationException) {
            throw error
        } catch (error: IllegalStateException) {
            cloudError = "Could not read the saved cloud session: ${error.toCloudErrorMessage()}"
        } finally {
            cloudSessionLoaded = true
        }
    }

    LaunchedEffect(cloudSettings.apiBaseUrl) {
        apiBaseUrl = cloudSettings.apiBaseUrl
    }

    fun setRemoteControlEnabled(enabled: Boolean) {
        launchCloudUiAction(
            scope = scope,
            setLoading = { cloudLoading = it },
            setError = { cloudError = it },
            setMessage = { cloudMessage = it },
        ) {
            val changed = remoteControlRepository.setEnabled(enabled)
            check(changed) { remoteControlRepository.runtimeStatus.value.error ?: "Remote control was not changed" }
            cloudMessage = if (enabled) "Web remote control enabled" else "Web remote control disabled"
        }
    }

    fun resolveConflict(pending: PendingConflictResolution) {
        launchCloudUiAction(
            scope = scope,
            setLoading = { cloudLoading = it },
            setError = { cloudError = it },
            setMessage = { cloudMessage = it },
        ) {
            when (pending.choice) {
                ConflictResolutionChoice.KeepDevice -> {
                    syncRepository.resolveConflictUseLocal(pending.conflict.id)
                    cloudMessage = "Kept this device's version"
                }
                ConflictResolutionChoice.KeepCloud -> {
                    syncRepository.resolveConflictUseCloud(pending.conflict.id)
                    cloudMessage = "Kept the cloud version"
                }
                ConflictResolutionChoice.KeepBoth -> {
                    syncRepository.resolveConflictKeepBoth(pending.conflict.id)
                    cloudMessage = "Kept both versions"
                }
            }
        }
    }

    fun signOut() {
        launchCloudUiAction(
            scope = scope,
            setLoading = { cloudLoading = it },
            setError = { cloudError = it },
            setMessage = { cloudMessage = it },
        ) {
            if (remoteControlSettings.enabled) {
                val disabled = remoteControlRepository.setEnabled(false)
                check(disabled) {
                    remoteControlRepository.runtimeStatus.value.error
                        ?: "Remote control must be disabled before signing out"
                }
            }
            authRepository.logout()
            cloudSession = null
            cloudMessage = "Signed out"
        }
    }

    if (confirmRemoteEnable) {
        ConfirmRemoteControlDialog(
            deviceName = remoteControlSettings.deviceName,
            onConfirm = {
                confirmRemoteEnable = false
                setRemoteControlEnabled(true)
            },
            onDismiss = { confirmRemoteEnable = false },
        )
    }

    pendingConflictResolution?.let { pending ->
        ConfirmConflictResolutionDialog(
            pending = pending,
            onConfirm = {
                pendingConflictResolution = null
                resolveConflict(pending)
            },
            onDismiss = { pendingConflictResolution = null },
        )
    }

    if (confirmSignOut) {
        ConfirmSignOutDialog(
            remoteControlEnabled = remoteControlSettings.enabled,
            onConfirm = {
                confirmSignOut = false
                signOut()
            },
            onDismiss = { confirmSignOut = false },
        )
    }

    CloudSettingsCard(
        uiState =
            buildCloudSettingsUiState(
                apiBaseUrl = apiBaseUrl,
                loading = cloudLoading,
                message = cloudMessage,
                error = cloudError,
                session = cloudSession,
                syncState = cloudSyncState,
            ),
        loginForm = loginForm,
        sessionLoaded = cloudSessionLoaded,
        expanded = cloudExpanded,
        onExpandedChange = { expanded ->
            if (!expanded) {
                apiBaseUrl = cloudSettings.apiBaseUrl
                loginForm = CloudLoginForm()
            }
            cloudExpanded = expanded
        },
        onApiBaseUrlChange = { apiBaseUrl = it },
        onLoginFormChange = { loginForm = it },
        onSaveApiBaseUrl = {
            launchCloudUiAction(
                scope = scope,
                setLoading = { cloudLoading = it },
                setError = { cloudError = it },
                setMessage = { cloudMessage = it },
            ) {
                prefs.setCloudApiBaseUrl(apiBaseUrl)
                cloudMessage = "Saved API base URL"
            }
        },
        onLogin = {
            launchCloudUiAction(
                scope = scope,
                setLoading = { cloudLoading = it },
                setError = { cloudError = it },
                setMessage = { cloudMessage = it },
            ) {
                val session =
                    if (loginForm.useRecoveryCode) {
                        authRepository.loginWithRecoveryCode(
                            username = loginForm.username,
                            password = loginForm.password,
                            recoveryCode = loginForm.oneTimeCode,
                        )
                    } else {
                        authRepository.loginWithTotp(
                            username = loginForm.username,
                            password = loginForm.password,
                            totpCode = loginForm.oneTimeCode,
                        )
                    }
                cloudSession = session
                loginForm = CloudLoginForm()
                syncRepository.syncNow()
                cloudMessage = "Signed in as ${session.username}"
            }
        },
        onRefreshSession = {
            launchCloudUiAction(
                scope = scope,
                setLoading = { cloudLoading = it },
                setError = { cloudError = it },
                setMessage = { cloudMessage = it },
            ) {
                val refreshedSession = authRepository.refreshSession()
                cloudSession = refreshedSession
                if (refreshedSession == null) {
                    cloudError = "Session expired. Please sign in again."
                } else {
                    cloudMessage = "Session refreshed"
                }
            }
        },
        onLogout = {
            if (remoteControlSettings.enabled) confirmSignOut = true else signOut()
        },
        onSyncNow = {
            launchCloudUiAction(
                scope = scope,
                setLoading = { cloudLoading = it },
                setError = { cloudError = it },
                setMessage = { cloudMessage = it },
            ) {
                syncRepository.syncNow()
                cloudMessage = "Sync complete"
            }
        },
    )

    RemoteControlSettingsCard(
        settings = remoteControlSettings,
        status = remoteControlStatus,
        signedIn = cloudSession != null,
        loading = cloudLoading,
        expanded = remoteExpanded,
        onExpandedChange = { remoteExpanded = it },
        onEnabledChange = { enabled ->
            if (enabled) confirmRemoteEnable = true else setRemoteControlEnabled(false)
        },
    )

    CloudConflictCard(
        conflicts = placeConflicts,
        loading = cloudLoading,
        onUseCloud = { conflict ->
            pendingConflictResolution =
                PendingConflictResolution(conflict, ConflictResolutionChoice.KeepCloud)
        },
        onUseLocal = { conflict ->
            pendingConflictResolution =
                PendingConflictResolution(conflict, ConflictResolutionChoice.KeepDevice)
        },
        onKeepBoth = { conflict ->
            pendingConflictResolution =
                PendingConflictResolution(conflict, ConflictResolutionChoice.KeepBoth)
        },
    )
}

@Composable
private fun CloudSettingsCard(
    uiState: CloudSettingsUiState,
    loginForm: CloudLoginForm,
    sessionLoaded: Boolean,
    expanded: Boolean,
    onExpandedChange: (Boolean) -> Unit,
    onApiBaseUrlChange: (String) -> Unit,
    onLoginFormChange: (CloudLoginForm) -> Unit,
    onSaveApiBaseUrl: () -> Unit,
    onLogin: () -> Unit,
    onRefreshSession: () -> Unit,
    onLogout: () -> Unit,
    onSyncNow: () -> Unit,
) {
    val serverValid = isValidCloudServerAddress(uiState.apiBaseUrl)
    OptionsDisclosureCard(
        title = OptionsSection.Cloud.title,
        subtitle = "Connect to Kestrel cloud and keep favorites synced.",
        summary =
            if (uiState.loading) {
                "Working…"
            } else {
                cloudSummary(
                    sessionLoaded = sessionLoaded,
                    username = uiState.session?.username,
                    error = uiState.error ?: uiState.syncState.lastError,
                )
            },
        expanded = expanded,
        onExpandedChange = onExpandedChange,
    ) {
        OutlinedTextField(
            value = uiState.apiBaseUrl,
            onValueChange = onApiBaseUrlChange,
            label = { Text("Server address") },
            singleLine = true,
            isError = uiState.apiBaseUrl.isNotBlank() && !serverValid,
            supportingText = {
                if (!serverValid && uiState.apiBaseUrl.isNotBlank()) {
                    Text("Enter an http:// or https:// server address with a host.")
                }
            },
            enabled = uiState.session == null && !uiState.loading,
            modifier = Modifier.fillMaxWidth(),
        )
        Text(
            text =
                if (uiState.session == null) {
                    "Production default is https://kestrel.narumi.dev. Kestrel previews the effective server before saving."
                } else {
                    "Sign out before changing servers so account and remote-control state cannot be split."
                },
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (serverValid) {
            Text(
                text = "Effective server: ${normalizeCloudApiBaseUrl(uiState.apiBaseUrl)}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        KestrelActionRow {
            OutlinedButton(
                onClick = onSaveApiBaseUrl,
                enabled = uiState.session == null && !uiState.loading && serverValid,
            ) { Text("Use this server") }
        }

        if (uiState.session == null) {
            CloudSignedOutCardContent(
                loginForm = loginForm,
                loading = uiState.loading,
                onLoginFormChange = onLoginFormChange,
                onLogin = onLogin,
            )
        } else {
            CloudSignedInCardContent(
                session = uiState.session,
                syncState = uiState.syncState,
                loading = uiState.loading,
                onRefreshSession = onRefreshSession,
                onLogout = onLogout,
                onSyncNow = onSyncNow,
            )
        }

        CloudStatusMessage(
            message = uiState.message,
            error = uiState.error,
        )
    }
}

@Composable
private fun RemoteControlSettingsCard(
    settings: RemoteControlSettings,
    status: RemoteControlRuntimeStatus,
    signedIn: Boolean,
    loading: Boolean,
    expanded: Boolean,
    onExpandedChange: (Boolean) -> Unit,
    onEnabledChange: (Boolean) -> Unit,
) {
    OptionsDisclosureCard(
        title = OptionsSection.RemoteControl.title,
        subtitle = "Let the web dashboard send mock commands to this Android device.",
        summary =
            if (loading) {
                "Working…"
            } else {
                remoteControlSummary(
                    enabled = settings.enabled,
                    signedIn = signedIn,
                    deviceName = settings.deviceName,
                    error = status.error,
                )
            },
        expanded = expanded,
        onExpandedChange = onExpandedChange,
    ) {
        ListItem(
            headlineContent = { Text("Allow web remote control") },
            supportingContent = {
                Text("Kestrel must be open or the mock service must be running.")
            },
            trailingContent = {
                Switch(
                    checked = settings.enabled,
                    onCheckedChange = onEnabledChange,
                    enabled = !loading && (signedIn || settings.enabled),
                )
            },
        )
        Text(
            text = "Device: ${settings.deviceName ?: "Not registered"}",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = "Last status: ${status.lastCommandStatus?.toUserLabel() ?: status.message ?: "Waiting for commands"}",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (!signedIn) {
            Text(
                text = "Sign in to cloud sync before enabling remote control.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
            )
        }
        status.error?.let {
            Text(
                text = it,
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
            )
        }
    }
}

@Composable
private fun CloudSignedOutCardContent(
    loginForm: CloudLoginForm,
    loading: Boolean,
    onLoginFormChange: (CloudLoginForm) -> Unit,
    onLogin: () -> Unit,
) {
    OutlinedTextField(
        value = loginForm.username,
        onValueChange = { onLoginFormChange(loginForm.copy(username = it)) },
        label = { Text("Username") },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text),
        modifier = Modifier.autofillText(ContentType.Username),
    )
    OutlinedTextField(
        value = loginForm.password,
        onValueChange = { onLoginFormChange(loginForm.copy(password = it)) },
        label = { Text("Password") },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
        visualTransformation = PasswordVisualTransformation(),
        modifier = Modifier.autofillText(ContentType.Password),
    )
    if (loginForm.username.isNotBlank() && loginForm.password.isNotBlank()) {
        OutlinedTextField(
            value = loginForm.oneTimeCode,
            onValueChange = { onLoginFormChange(loginForm.copy(oneTimeCode = it)) },
            label = { Text(if (loginForm.useRecoveryCode) "Recovery code" else "Authenticator code") },
            singleLine = true,
            keyboardOptions =
                KeyboardOptions(
                    keyboardType = if (loginForm.useRecoveryCode) KeyboardType.Password else KeyboardType.NumberPassword,
                ),
            modifier = Modifier.autofillText(ContentType.SmsOtpCode),
        )
        TextButton(
            onClick = {
                onLoginFormChange(
                    loginForm.copy(
                        oneTimeCode = "",
                        useRecoveryCode = !loginForm.useRecoveryCode,
                    ),
                )
            },
        ) {
            Text(if (loginForm.useRecoveryCode) "Use authenticator code" else "Use a recovery code")
        }
    } else {
        Text(
            text = "Enter your username and password to continue to verification.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
    KestrelActionRow {
        Button(
            onClick = onLogin,
            enabled =
                !loading &&
                    loginForm.username.isNotBlank() &&
                    loginForm.password.isNotBlank() &&
                    loginForm.oneTimeCode.isNotBlank(),
        ) {
            Text(if (loading) "Signing in…" else "Sign in")
        }
    }
}

@Composable
private fun CloudSignedInCardContent(
    session: CloudSession,
    syncState: CloudSyncState,
    loading: Boolean,
    onRefreshSession: () -> Unit,
    onLogout: () -> Unit,
    onSyncNow: () -> Unit,
) {
    Text(
        text = "Signed in as ${session.username}",
        style = MaterialTheme.typography.titleSmall,
    )
    Text(
        text = "Access token expires at ${Date(session.accessTokenExpiresAt)}",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    Text(
        text = "Last synced: ${syncState.lastSyncedAt?.let(::Date)?.toString() ?: "Never"}",
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    syncState.lastError?.let {
        Text(
            text = "Last sync error: $it",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.error,
        )
    }
    KestrelActionRow {
        Button(onClick = onSyncNow, enabled = !loading) {
            Text(if (loading) "Syncing…" else "Sync now")
        }
        if (syncState.lastError != null) {
            OutlinedButton(onClick = onRefreshSession, enabled = !loading) {
                Text("Reconnect")
            }
        }
        OutlinedButton(onClick = onLogout, enabled = !loading) {
            Text("Sign out")
        }
    }
}

@Composable
private fun CloudConflictCard(
    conflicts: List<CloudPlaceConflict>,
    loading: Boolean,
    onUseCloud: (CloudPlaceConflict) -> Unit,
    onUseLocal: (CloudPlaceConflict) -> Unit,
    onKeepBoth: (CloudPlaceConflict) -> Unit,
) {
    if (conflicts.isEmpty()) return
    OptionsCard(
        title = "Sync conflicts",
        subtitle = "Choose which place version to keep.",
    ) {
        conflicts.forEachIndexed { index, conflict ->
            if (index > 0) HorizontalDivider()
            CloudConflictItem(
                conflict = conflict,
                loading = loading,
                onUseCloud = { onUseCloud(conflict) },
                onUseLocal = { onUseLocal(conflict) },
                onKeepBoth = { onKeepBoth(conflict) },
            )
        }
    }
}

@Composable
private fun CloudConflictItem(
    conflict: CloudPlaceConflict,
    loading: Boolean,
    onUseCloud: () -> Unit,
    onUseLocal: () -> Unit,
    onKeepBoth: () -> Unit,
) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            text = conflict.localName,
            style = MaterialTheme.typography.titleSmall,
        )
        Text(
            text = "This device: ${conflict.localName} (${formatCoordinate(conflict.localLatitude)}, ${formatCoordinate(conflict.localLongitude)})",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        conflict.localDescription?.let {
            Text("Device description: $it", style = MaterialTheme.typography.bodySmall)
        }
        Text(
            text = "Cloud: ${conflict.cloudName} (${formatCoordinate(conflict.cloudLatitude)}, ${formatCoordinate(conflict.cloudLongitude)})",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        conflict.cloudDescription?.let {
            Text("Cloud description: $it", style = MaterialTheme.typography.bodySmall)
        }
        KestrelActionRow {
            OutlinedButton(onClick = onUseCloud, enabled = !loading) { Text("Keep cloud version") }
            Button(onClick = onUseLocal, enabled = !loading) { Text("Keep this device") }
            OutlinedButton(onClick = onKeepBoth, enabled = !loading) { Text("Keep both") }
        }
    }
}

@Composable
private fun ConfirmConflictResolutionDialog(
    pending: PendingConflictResolution,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    val effect =
        when (pending.choice) {
            ConflictResolutionChoice.KeepDevice ->
                "Replace the cloud copy with this device's name, coordinates, and description."
            ConflictResolutionChoice.KeepCloud ->
                "Replace this device's saved copy with the cloud name, coordinates, and description."
            ConflictResolutionChoice.KeepBoth ->
                "Keep two Favorites so neither version is overwritten."
        }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Resolve ${pending.conflict.localName}?") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(effect)
                Text(
                    "This device: ${pending.conflict.localName} · " +
                        "${formatCoordinate(pending.conflict.localLatitude)}, ${formatCoordinate(pending.conflict.localLongitude)}",
                )
                Text(
                    "Cloud: ${pending.conflict.cloudName} · " +
                        "${formatCoordinate(pending.conflict.cloudLatitude)}, ${formatCoordinate(pending.conflict.cloudLongitude)}",
                )
            }
        },
        confirmButton = { Button(onClick = onConfirm) { Text("Confirm resolution") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
private fun ConfirmRemoteControlDialog(
    deviceName: String?,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Allow Web remote control?") },
        text = {
            Text(
                "The Web dashboard will be able to replace or stop this device's mock location " +
                    "while Kestrel is open or its mock service is running. Device: ${deviceName ?: "registered after confirmation"}.",
            )
        },
        confirmButton = { Button(onClick = onConfirm) { Text("Allow remote control") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
private fun ConfirmSignOutDialog(
    remoteControlEnabled: Boolean,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Sign out?") },
        text = {
            Text(
                if (remoteControlEnabled) {
                    "Kestrel will disable Web remote control before removing this account from the device."
                } else {
                    "Cloud sync will stop until you sign in again. Local Favorites remain on this device."
                },
            )
        },
        confirmButton = { Button(onClick = onConfirm) { Text("Sign out") } },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } },
    )
}

@Composable
private fun CloudStatusMessage(
    message: String?,
    error: String?,
) {
    message?.let {
        Text(
            text = it,
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.primary,
        )
    }
    error?.let {
        Text(
            text = it,
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive },
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.error,
        )
    }
}

private fun formatCoordinate(value: Double): String = "%.5f".format(value)

private fun RemoteCommandStatus.toUserLabel(): String =
    when (this) {
        RemoteCommandStatus.QUEUED -> "Waiting on the device"
        RemoteCommandStatus.DELIVERED -> "Received by this device"
        RemoteCommandStatus.APPLIED -> "Last command applied"
        RemoteCommandStatus.FAILED -> "Last command failed"
        RemoteCommandStatus.EXPIRED -> "Last command expired"
    }

internal fun isValidCloudServerAddress(value: String): Boolean =
    runCatching { URI(value.trim()) }
        .getOrNull()
        ?.let { it.scheme in setOf("http", "https") && !it.host.isNullOrBlank() }
        ?: false

private fun buildCloudSettingsUiState(
    apiBaseUrl: String,
    loading: Boolean,
    message: String?,
    error: String?,
    session: CloudSession?,
    syncState: CloudSyncState,
): CloudSettingsUiState =
    CloudSettingsUiState(
        apiBaseUrl = apiBaseUrl,
        loading = loading,
        message = message,
        error = error,
        session = session,
        syncState = syncState,
    )

private fun launchCloudUiAction(
    scope: kotlinx.coroutines.CoroutineScope,
    setLoading: (Boolean) -> Unit,
    setError: (String?) -> Unit,
    setMessage: (String?) -> Unit,
    block: suspend () -> Unit,
) {
    scope.launch {
        runCloudAction(
            setLoading = setLoading,
            setError = setError,
            setMessage = setMessage,
            block = block,
        )
    }
}

private suspend fun runCloudAction(
    setLoading: (Boolean) -> Unit,
    setError: (String?) -> Unit,
    setMessage: (String?) -> Unit,
    block: suspend () -> Unit,
) {
    setLoading(true)
    setError(null)
    setMessage(null)
    try {
        block()
    } catch (error: CloudApiException) {
        setError(error.message)
    } catch (error: IOException) {
        setError(error.toCloudErrorMessage())
    } catch (error: CancellationException) {
        throw error
    } catch (error: IllegalStateException) {
        setError(error.toCloudErrorMessage())
    } catch (_: Exception) {
        setError("Unexpected cloud error. Check your connection and try again.")
    } finally {
        setLoading(false)
    }
}

private fun Throwable.toCloudErrorMessage(): String = message ?: "Unexpected cloud error"

@Suppress("UnusedPrivateFunction")
@Preview(showBackground = true)
@Composable
private fun CloudConflictCardPreview() {
    MaterialTheme {
        CloudConflictCard(
            conflicts =
                listOf(
                    CloudPlaceConflict(
                        id = "conflict-1",
                        libraryItemId = "item-1",
                        baseVersion = 2,
                        remoteVersion = 3,
                        localName = "Local cafe",
                        localDescription = "Edited on Android",
                        localLatitude = 25.033,
                        localLongitude = 121.565,
                        cloudName = "Cloud cafe",
                        cloudDescription = "Edited on web",
                        cloudLatitude = 25.034,
                        cloudLongitude = 121.566,
                    ),
                ),
            loading = false,
            onUseCloud = {},
            onUseLocal = {},
            onKeepBoth = {},
        )
    }
}

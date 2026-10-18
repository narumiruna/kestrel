package dev.narumi.kestrel.feature.options

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.autofill.ContentDataType
import androidx.compose.ui.autofill.ContentType
import androidx.compose.ui.autofill.contentType
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDataType
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import dev.narumi.kestrel.R
import dev.narumi.kestrel.core.cloud.AndroidQrLoginMethod
import dev.narumi.kestrel.core.cloud.AndroidQrLoginProgress
import dev.narumi.kestrel.core.cloud.AndroidQrLoginRetryableException
import dev.narumi.kestrel.core.cloud.CloudApiException
import dev.narumi.kestrel.core.cloud.CloudAuthRepository
import dev.narumi.kestrel.core.cloud.CloudErrorContext
import dev.narumi.kestrel.core.cloud.CloudMessage
import dev.narumi.kestrel.core.cloud.CloudMessageException
import dev.narumi.kestrel.core.cloud.CloudMessageId
import dev.narumi.kestrel.core.cloud.CloudPlaceConflict
import dev.narumi.kestrel.core.cloud.CloudSession
import dev.narumi.kestrel.core.cloud.CloudSyncRepository
import dev.narumi.kestrel.core.cloud.CloudSyncState
import dev.narumi.kestrel.core.cloud.GoogleQrCodeScanner
import dev.narumi.kestrel.core.cloud.OidcMethod
import dev.narumi.kestrel.core.cloud.QrCodeScanResult
import dev.narumi.kestrel.core.cloud.RemoteCommandStatus
import dev.narumi.kestrel.core.cloud.RemoteControlRepository
import dev.narumi.kestrel.core.cloud.RemoteControlRuntimeStatus
import dev.narumi.kestrel.core.cloud.findActivity
import dev.narumi.kestrel.core.cloud.normalizeCloudApiBaseUrl
import dev.narumi.kestrel.core.data.KestrelPrefs
import dev.narumi.kestrel.core.data.MockPlaybackSettings
import dev.narumi.kestrel.core.data.RandomRoutePreference
import dev.narumi.kestrel.core.data.RemoteControlSettings
import dev.narumi.kestrel.core.data.StartupPreference
import dev.narumi.kestrel.core.library.LibraryRepository
import dev.narumi.kestrel.ui.components.KestrelActionRow
import dev.narumi.kestrel.ui.components.KestrelCard
import dev.narumi.kestrel.ui.components.KestrelIcons
import dev.narumi.kestrel.ui.components.KestrelScreenHeader
import dev.narumi.kestrel.ui.components.KestrelSectionHeader
import dev.narumi.kestrel.ui.components.PersistedActionResult
import dev.narumi.kestrel.ui.components.runPersistedAction
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.io.IOException
import java.net.URI
import java.util.Locale

private enum class ConflictResolutionChoice { KeepDevice, KeepCloud, KeepBoth }

private data class PendingConflictResolution(
    val conflict: CloudPlaceConflict,
    val choice: ConflictResolutionChoice,
)

private data class CloudSettingsUiState(
    val apiBaseUrl: String,
    val loading: Boolean,
    val message: OptionsMessage?,
    val error: OptionsMessage?,
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

@Suppress("LongMethod")
@Composable
fun OptionsScreen(
    pendingOidcCallback: String? = null,
    onOidcCallbackConsumed: (String) -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val prefs = remember { KestrelPrefs(context) }
    val libraryRepository = remember { LibraryRepository.getInstance(context) }
    val drafts: OptionsDraftViewModel = viewModel()
    // Mutations stay composition-scoped: recreation cancels them rather than replaying them.
    val scope = rememberCoroutineScope()

    val loadedItems by
        libraryRepository.items.collectAsStateWithLifecycle(initialValue = null)
    val items = loadedItems.orEmpty()
    val startup by prefs.startupPreference.collectAsStateWithLifecycle(StartupPreference())
    val loadedRandomRoute by prefs.randomRoutePreference.collectAsStateWithLifecycle(initialValue = null)
    val randomRoute = loadedRandomRoute ?: RandomRoutePreference()
    val mockPlayback by prefs.mockPlaybackSettings.collectAsStateWithLifecycle(MockPlaybackSettings())

    var defaultPointCount by drafts.defaultPointCount
    var defaultSpacingMeters by drafts.defaultSpacingMeters
    var mapLinksExpanded by rememberSaveable { mutableStateOf(OptionsSection.MapLinks.defaultExpanded) }
    var playbackExpanded by rememberSaveable { mutableStateOf(OptionsSection.Playback.defaultExpanded) }
    var randomRouteExpanded by rememberSaveable { mutableStateOf(OptionsSection.RandomRoute.defaultExpanded) }
    var settingsBusy by remember { mutableStateOf(false) }
    var settingsMessage by rememberSaveable { mutableStateOf<OptionsMessage?>(null) }
    var settingsError by rememberSaveable { mutableStateOf<OptionsMessage?>(null) }

    LaunchedEffect(loadedRandomRoute) {
        drafts.loadRandomRoute(loadedRandomRoute)
    }

    fun runSettingsAction(
        successMessage: Int,
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
                    runPersistedAction(
                        failureMessage = optionsMessage(R.string.options_save_failure),
                        block = block,
                    )
                ) {
                    PersistedActionResult.Success -> {
                        settingsMessage = optionsMessage(successMessage)
                        onSuccess()
                    }

                    is PersistedActionResult.Failure -> {
                        settingsError = optionsMessage(R.string.options_save_failure)
                    }
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
            title = stringResource(R.string.options_settings),
            subtitle = stringResource(R.string.options_make_kestrel_work_your_way),
            icon = KestrelIcons.SettingsOutlined,
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
                    text = it.text(),
                    color = if (settingsError != null) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
                )
            }
        }

        KestrelSectionHeader(title = stringResource(R.string.options_on_this_device), modifier = Modifier.padding(top = 8.dp))
        LanguageSettingsCard()
        StartupPreferenceCard(
            items = items,
            itemsLoading = loadedItems == null,
            startup = startup,
            saving = settingsBusy,
            error = settingsError?.text(),
            onSave = { preference, onSuccess ->
                runSettingsAction(R.string.options_saved_app_opening_behavior, onSuccess) {
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
            saving = settingsBusy || loadedRandomRoute == null,
            error = settingsError?.text(),
            onSave = { resetToRecommended, onSuccess ->
                runSettingsAction(R.string.options_saved_random_route_defaults, onSuccess) {
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
            error = settingsError?.text(),
            onSave = { seconds, onSuccess ->
                runSettingsAction(R.string.options_saved_route_recovery_behavior, onSuccess) {
                    prefs.setProgressWriteIntervalSeconds(seconds)
                }
            },
        )

        KestrelSectionHeader(title = stringResource(R.string.options_connected_services), modifier = Modifier.padding(top = 12.dp))
        CloudSettingsSection(
            drafts = drafts,
            pendingOidcCallback = pendingOidcCallback,
            onOidcCallbackConsumed = onOidcCallbackConsumed,
        )
    }
}

@Suppress("CyclomaticComplexMethod", "LongMethod", "ThrowsCount", "TooGenericExceptionCaught")
@Composable
private fun CloudSettingsSection(
    drafts: OptionsDraftViewModel,
    pendingOidcCallback: String?,
    onOidcCallbackConsumed: (String) -> Unit,
) {
    val context = LocalContext.current
    val prefs = remember { KestrelPrefs(context) }
    val authRepository = remember { CloudAuthRepository.getInstance(context) }
    val syncRepository = remember { CloudSyncRepository.getInstance(context) }
    val remoteControlRepository = remember { RemoteControlRepository.getInstance(context) }
    val scannerActivity = context.findActivity()
    val qrCodeScanner = remember(scannerActivity) { scannerActivity?.let(::GoogleQrCodeScanner) }
    val scope = rememberCoroutineScope()

    val loadedCloudSettings by prefs.cloudSettings.collectAsStateWithLifecycle(initialValue = null)
    val cloudSyncState by syncRepository.syncState.collectAsStateWithLifecycle(CloudSyncState())
    val placeConflicts by syncRepository.placeConflicts.collectAsStateWithLifecycle(emptyList())
    val remoteControlSettings by prefs.remoteControlSettings.collectAsStateWithLifecycle(RemoteControlSettings())
    val remoteControlStatus by remoteControlRepository.runtimeStatus.collectAsStateWithLifecycle(RemoteControlRuntimeStatus())

    var loginForm by drafts.loginForm
    var cloudSession by remember { mutableStateOf<CloudSession?>(null) }
    var cloudSessionLoaded by remember { mutableStateOf(false) }
    var cloudExpanded by rememberSaveable { mutableStateOf(OptionsSection.Cloud.defaultExpanded) }
    var remoteExpanded by rememberSaveable { mutableStateOf(OptionsSection.RemoteControl.defaultExpanded) }
    var cloudMessage by rememberSaveable { mutableStateOf<OptionsMessage?>(null) }
    var cloudError by rememberSaveable { mutableStateOf<OptionsMessage?>(null) }
    var cloudLoading by remember { mutableStateOf(false) }
    var oidcMethod by remember { mutableStateOf(OidcMethod(enabled = false)) }
    var androidQrLoginMethod by remember { mutableStateOf(AndroidQrLoginMethod()) }
    var androidQrLoginState by remember { mutableStateOf<AndroidQrLoginUiState>(AndroidQrLoginUiState.Restoring) }
    var apiBaseUrl by drafts.apiBaseUrl
    var confirmRemoteEnable by remember { mutableStateOf(false) }
    var confirmSignOut by remember { mutableStateOf(false) }
    var pendingConflictResolution by remember { mutableStateOf<PendingConflictResolution?>(null) }

    suspend fun applyAndroidQrProgress(progress: AndroidQrLoginProgress) {
        androidQrLoginState =
            when (progress) {
                is AndroidQrLoginProgress.Confirmation -> {
                    AndroidQrLoginUiState.Confirmation(progress.details)
                }

                is AndroidQrLoginProgress.Waiting -> {
                    AndroidQrLoginUiState.Waiting(progress.details, progress.retryAfterSeconds)
                }

                is AndroidQrLoginProgress.Completed -> {
                    cloudSession = progress.session
                    loginForm = CloudLoginForm()
                    syncRepository.syncNow()
                    cloudMessage = optionsMessage(R.string.options_signed_in_qr, progress.session.username)
                    AndroidQrLoginUiState.Idle
                }

                AndroidQrLoginProgress.Denied -> {
                    AndroidQrLoginUiState.Denied
                }

                AndroidQrLoginProgress.Expired -> {
                    AndroidQrLoginUiState.Expired
                }
            }
    }

    LaunchedEffect(Unit) {
        try {
            cloudSession = authRepository.currentSession()
            if (cloudSession != null) loginForm = CloudLoginForm()
        } catch (error: CancellationException) {
            throw error
        } catch (error: IllegalStateException) {
            cloudError = error.toOptionsError()
        } finally {
            cloudSessionLoaded = true
        }
    }

    LaunchedEffect(loadedCloudSettings) {
        drafts.loadCloudSettings(loadedCloudSettings)
    }

    LaunchedEffect(loadedCloudSettings?.apiBaseUrl) {
        if (loadedCloudSettings == null) return@LaunchedEffect
        try {
            val methods = authRepository.getAuthMethods()
            oidcMethod = methods.oidc
            androidQrLoginMethod = methods.androidQrLogin
        } catch (error: CancellationException) {
            throw error
        } catch (_: CloudApiException) {
            oidcMethod = OidcMethod(enabled = false)
            androidQrLoginMethod = AndroidQrLoginMethod()
        } catch (_: IOException) {
            oidcMethod = OidcMethod(enabled = false)
            androidQrLoginMethod = AndroidQrLoginMethod()
        } catch (_: IllegalStateException) {
            oidcMethod = OidcMethod(enabled = false)
            androidQrLoginMethod = AndroidQrLoginMethod()
        }
    }

    LaunchedEffect(cloudSessionLoaded, pendingOidcCallback) {
        if (!cloudSessionLoaded || pendingOidcCallback != null) {
            return@LaunchedEffect
        }
        if (cloudSession != null) {
            androidQrLoginState = AndroidQrLoginUiState.Idle
            return@LaunchedEffect
        }
        try {
            val qrProgress = authRepository.resumeAndroidQrLogin()
            if (qrProgress != null) {
                applyAndroidQrProgress(qrProgress)
                return@LaunchedEffect
            }
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            androidQrLoginState =
                AndroidQrLoginUiState.Error(
                    message = error.toOptionsError(CloudErrorContext.QrLogin),
                    retryPendingAttempt = true,
                )
            return@LaunchedEffect
        }
        runCloudAction(
            setLoading = { cloudLoading = it },
            setError = { cloudError = it },
            setMessage = { cloudMessage = it },
            errorContext = CloudErrorContext.SignIn,
        ) {
            val session = authRepository.resumeOidcLogin() ?: return@runCloudAction
            cloudSession = session
            loginForm = CloudLoginForm()
            syncRepository.syncNow()
            cloudMessage = optionsMessage(R.string.options_signed_in_provider, session.username, oidcMethod.displayName)
        }
        androidQrLoginState = AndroidQrLoginUiState.Idle
    }

    LaunchedEffect(androidQrLoginState) {
        val waiting = androidQrLoginState as? AndroidQrLoginUiState.Waiting ?: return@LaunchedEffect
        delay(waiting.retryAfterSeconds * 1_000L)
        try {
            applyAndroidQrProgress(authRepository.pollAndroidQrLogin())
        } catch (error: CancellationException) {
            throw error
        } catch (error: Exception) {
            androidQrLoginState =
                AndroidQrLoginUiState.Error(
                    message = error.toOptionsError(CloudErrorContext.QrLogin),
                    retryPendingAttempt = true,
                )
        }
    }

    fun setRemoteControlEnabled(enabled: Boolean) {
        launchCloudUiAction(
            scope = scope,
            setLoading = { cloudLoading = it },
            setError = { cloudError = it },
            setMessage = { cloudMessage = it },
            errorContext = CloudErrorContext.RemoteControl,
        ) {
            val changed = remoteControlRepository.setEnabled(enabled)
            if (!changed) {
                throw CloudMessageException(
                    remoteControlRepository.runtimeStatus.value.error ?: CloudMessage(CloudMessageId.RemoteFailed),
                )
            }
            cloudMessage = if (enabled) optionsMessage(R.string.options_remote_enabled) else optionsMessage(R.string.options_remote_disabled)
        }
    }

    fun resolveConflict(pending: PendingConflictResolution) {
        launchCloudUiAction(
            scope = scope,
            setLoading = { cloudLoading = it },
            setError = { cloudError = it },
            setMessage = { cloudMessage = it },
            errorContext = CloudErrorContext.Sync,
        ) {
            when (pending.choice) {
                ConflictResolutionChoice.KeepDevice -> {
                    syncRepository.resolveConflictUseLocal(pending.conflict.id)
                    cloudMessage = optionsMessage(R.string.options_kept_device)
                }

                ConflictResolutionChoice.KeepCloud -> {
                    syncRepository.resolveConflictUseCloud(pending.conflict.id)
                    cloudMessage = optionsMessage(R.string.options_kept_cloud)
                }

                ConflictResolutionChoice.KeepBoth -> {
                    syncRepository.resolveConflictKeepBoth(pending.conflict.id)
                    cloudMessage = optionsMessage(R.string.options_kept_both)
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
            errorContext = CloudErrorContext.SignIn,
        ) {
            if (remoteControlSettings.enabled) {
                val disabled = remoteControlRepository.setEnabled(false)
                if (!disabled) {
                    throw CloudMessageException(
                        remoteControlRepository.runtimeStatus.value.error ?: CloudMessage(CloudMessageId.RemoteStillEnabled),
                    )
                }
            }
            authRepository.logout()
            cloudSession = null
            cloudMessage = optionsMessage(R.string.options_signed_out)
        }
    }

    fun scanAndroidQrCode() {
        if (androidQrLoginState.blocksOtherAuthentication()) return
        androidQrLoginState = AndroidQrLoginUiState.OpeningScanner
        cloudError = null
        cloudMessage = null
        scope.launch {
            when (val result = qrCodeScanner?.scan() ?: QrCodeScanResult.Unavailable) {
                is QrCodeScanResult.Success -> {
                    androidQrLoginState = AndroidQrLoginUiState.Claiming
                    try {
                        applyAndroidQrProgress(authRepository.prepareAndroidQrLogin(result.rawValue))
                    } catch (error: CancellationException) {
                        throw error
                    } catch (error: Exception) {
                        androidQrLoginState =
                            AndroidQrLoginUiState.Error(
                                message = error.toOptionsError(CloudErrorContext.QrLogin),
                                retryPendingAttempt = error is AndroidQrLoginRetryableException,
                            )
                    }
                }

                QrCodeScanResult.Cancelled -> {
                    androidQrLoginState = AndroidQrLoginUiState.Idle
                }

                QrCodeScanResult.ScannerDownloadFailed -> {
                    androidQrLoginState = AndroidQrLoginUiState.ScannerDownloadFailed
                }

                QrCodeScanResult.Unavailable -> {
                    androidQrLoginState = AndroidQrLoginUiState.ScannerUnavailable
                }

                is QrCodeScanResult.Failure -> {
                    androidQrLoginState =
                        AndroidQrLoginUiState.Error(
                            message = optionsMessage(R.string.options_scanner_failed),
                            retryPendingAttempt = false,
                        )
                }
            }
        }
    }

    fun confirmAndroidQrLogin() {
        val confirmation = androidQrLoginState as? AndroidQrLoginUiState.Confirmation ?: return
        androidQrLoginState = AndroidQrLoginUiState.Confirming(confirmation.details)
        scope.launch {
            try {
                applyAndroidQrProgress(authRepository.confirmAndroidQrLogin())
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                androidQrLoginState =
                    AndroidQrLoginUiState.Error(
                        message = error.toOptionsError(CloudErrorContext.QrLogin),
                        retryPendingAttempt = true,
                    )
            }
        }
    }

    fun cancelAndroidQrLogin() {
        scope.launch {
            runCatching { authRepository.cancelAndroidQrLogin() }
            val completedSession = authRepository.currentSession()
            if (completedSession == null) {
                androidQrLoginState = AndroidQrLoginUiState.Idle
            } else {
                cloudSession = completedSession
                androidQrLoginState = AndroidQrLoginUiState.Idle
                syncRepository.syncNow()
                cloudMessage = optionsMessage(R.string.options_signed_in_as, completedSession.username)
            }
        }
    }

    fun retryAndroidQrLogin() {
        val pending = (androidQrLoginState as? AndroidQrLoginUiState.Error)?.retryPendingAttempt == true
        if (!pending) {
            scanAndroidQrCode()
            return
        }
        androidQrLoginState = AndroidQrLoginUiState.Claiming
        scope.launch {
            try {
                val progress = authRepository.resumeAndroidQrLogin()
                androidQrLoginState = AndroidQrLoginUiState.Idle
                if (progress != null) applyAndroidQrProgress(progress)
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                androidQrLoginState =
                    AndroidQrLoginUiState.Error(
                        message = error.toOptionsError(CloudErrorContext.QrLogin),
                        retryPendingAttempt = true,
                    )
            }
        }
    }

    LaunchedEffect(pendingOidcCallback) {
        val callbackUri = pendingOidcCallback ?: return@LaunchedEffect
        runCloudAction(
            setLoading = { cloudLoading = it },
            setError = { cloudError = it },
            setMessage = { cloudMessage = it },
            errorContext = CloudErrorContext.SignIn,
        ) {
            handleOptionsOidcCallback(
                completeLogin = { authRepository.completeOidcLogin(callbackUri) },
                consumeCallback = { onOidcCallbackConsumed(callbackUri) },
            ) { session ->
                cloudSession = session
                loginForm = CloudLoginForm()
                syncRepository.syncNow()
                cloudMessage = optionsMessage(R.string.options_signed_in_provider, session.username, oidcMethod.displayName)
            }
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
        serverValid = isValidCloudServerAddress(apiBaseUrl),
        sessionLoaded = cloudSessionLoaded,
        expanded = cloudExpanded,
        onExpandedChange = { expanded ->
            if (!expanded) {
                loadedCloudSettings?.let { apiBaseUrl = it.apiBaseUrl }
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
                errorContext = CloudErrorContext.ServerSettings,
            ) {
                authRepository.setCloudApiBaseUrl(apiBaseUrl)
                cloudMessage = optionsMessage(R.string.options_saved_api_url)
            }
        },
        onLogin = {
            launchCloudUiAction(
                scope = scope,
                setLoading = { cloudLoading = it },
                setError = { cloudError = it },
                setMessage = { cloudMessage = it },
                errorContext = CloudErrorContext.SignIn,
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
                cloudMessage = optionsMessage(R.string.options_signed_in_as, session.username)
            }
        },
        oidcMethod = oidcMethod,
        androidQrLoginMethod = androidQrLoginMethod,
        androidQrLoginState = androidQrLoginState,
        onAndroidQrScan = ::scanAndroidQrCode,
        onAndroidQrConfirm = ::confirmAndroidQrLogin,
        onAndroidQrCancel = ::cancelAndroidQrLogin,
        onAndroidQrRetry = ::retryAndroidQrLogin,
        onOidcLogin = {
            launchCloudUiAction(
                scope = scope,
                setLoading = { cloudLoading = it },
                setError = { cloudError = it },
                setMessage = { cloudMessage = it },
                errorContext = CloudErrorContext.SignIn,
            ) {
                val authorizationUrl = authRepository.beginOidcLogin()
                context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(authorizationUrl)))
                cloudMessage = optionsMessage(R.string.options_continue_browser)
            }
        },
        onRefreshSession = {
            launchCloudUiAction(
                scope = scope,
                setLoading = { cloudLoading = it },
                setError = { cloudError = it },
                setMessage = { cloudMessage = it },
                errorContext = CloudErrorContext.SignIn,
            ) {
                val refreshedSession = authRepository.refreshSession()
                cloudSession = refreshedSession
                if (refreshedSession == null) {
                    cloudError = optionsMessage(R.string.options_session_expired)
                } else {
                    cloudMessage = optionsMessage(R.string.options_session_refreshed)
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
                errorContext = CloudErrorContext.Sync,
            ) {
                syncRepository.syncNow()
                cloudMessage = optionsMessage(R.string.options_sync_complete)
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

@Suppress("LongMethod")
@Composable
private fun CloudSettingsCard(
    uiState: CloudSettingsUiState,
    loginForm: CloudLoginForm,
    serverValid: Boolean,
    sessionLoaded: Boolean,
    expanded: Boolean,
    onExpandedChange: (Boolean) -> Unit,
    onApiBaseUrlChange: (String) -> Unit,
    onLoginFormChange: (CloudLoginForm) -> Unit,
    onSaveApiBaseUrl: () -> Unit,
    onLogin: () -> Unit,
    oidcMethod: OidcMethod,
    androidQrLoginMethod: AndroidQrLoginMethod,
    androidQrLoginState: AndroidQrLoginUiState,
    onAndroidQrScan: () -> Unit,
    onAndroidQrConfirm: () -> Unit,
    onAndroidQrCancel: () -> Unit,
    onAndroidQrRetry: () -> Unit,
    onOidcLogin: () -> Unit,
    onRefreshSession: () -> Unit,
    onLogout: () -> Unit,
    onSyncNow: () -> Unit,
) {
    val authenticationBlocked = uiState.loading || androidQrLoginState.blocksOtherAuthentication()
    OptionsDisclosureCard(
        title = stringResource(OptionsSection.Cloud.title),
        icon = KestrelIcons.Cloud,
        subtitle = stringResource(R.string.options_connect_to_kestrel_cloud_and_keep_favorites_synced),
        summary =
            if (uiState.session == null && androidQrLoginState != AndroidQrLoginUiState.Idle) {
                androidQrLoginState.summary().text()
            } else if (uiState.loading) {
                stringResource(R.string.options_working)
            } else {
                cloudSummary(
                    sessionLoaded = sessionLoaded,
                    username = uiState.session?.username,
                    error = uiState.error?.text() ?: uiState.syncState.lastError?.text(),
                ).text()
            },
        expanded = expanded,
        onExpandedChange = onExpandedChange,
    ) {
        OutlinedTextField(
            value = uiState.apiBaseUrl,
            onValueChange = onApiBaseUrlChange,
            label = { Text(stringResource(R.string.options_server_address)) },
            singleLine = true,
            isError = uiState.apiBaseUrl.isNotBlank() && !serverValid,
            supportingText = {
                if (!serverValid && uiState.apiBaseUrl.isNotBlank()) {
                    Text(stringResource(R.string.options_enter_an_http_or_https_server_address_with_a))
                }
            },
            enabled = uiState.session == null && !authenticationBlocked,
            modifier = Modifier.fillMaxWidth(),
        )
        Text(
            text =
                if (uiState.session == null) {
                    stringResource(R.string.options_production_default_is_https_kestrel_narumi_dev_kestrel_previews)
                } else {
                    stringResource(R.string.options_sign_out_before_changing_servers_so_account_and_remote)
                },
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (serverValid) {
            Text(
                text = stringResource(R.string.options_effective_server, normalizeCloudApiBaseUrl(uiState.apiBaseUrl)),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        KestrelActionRow {
            OutlinedButton(
                onClick = onSaveApiBaseUrl,
                enabled = uiState.session == null && !authenticationBlocked && serverValid,
            ) { Text(stringResource(R.string.options_use_this_server)) }
        }

        if (uiState.session == null) {
            CloudSignedOutCardContent(
                loginForm = loginForm,
                loading = authenticationBlocked,
                onLoginFormChange = onLoginFormChange,
                onLogin = onLogin,
                oidcMethod = oidcMethod,
                onOidcLogin = onOidcLogin,
                androidQrLoginMethod = androidQrLoginMethod,
                androidQrLoginState = androidQrLoginState,
                onAndroidQrScan = onAndroidQrScan,
                onAndroidQrConfirm = onAndroidQrConfirm,
                onAndroidQrCancel = onAndroidQrCancel,
                onAndroidQrRetry = onAndroidQrRetry,
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
        title = stringResource(OptionsSection.RemoteControl.title),
        icon = KestrelIcons.Devices,
        subtitle = stringResource(R.string.options_let_the_web_dashboard_send_mock_commands_to_this),
        summary =
            if (loading) {
                stringResource(R.string.options_working)
            } else {
                remoteControlSummary(
                    enabled = settings.enabled,
                    signedIn = signedIn,
                    deviceName = settings.deviceName,
                    error = status.error?.text(),
                ).text()
            },
        expanded = expanded,
        onExpandedChange = onExpandedChange,
    ) {
        ListItem(
            headlineContent = { Text(stringResource(R.string.options_allow_web_remote_control)) },
            supportingContent = {
                Text(stringResource(R.string.options_kestrel_must_be_open_or_the_mock_service_must))
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
            text = stringResource(R.string.options_device, settings.deviceName ?: stringResource(R.string.options_not_registered)),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text =
                stringResource(
                    R.string.options_last_status,
                    status.lastCommandStatus?.let { stringResource(it.toUserLabel()) }
                        ?: status.message?.text()
                        ?: stringResource(R.string.options_waiting_commands),
                ),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        if (!signedIn) {
            Text(
                text = stringResource(R.string.options_sign_in_to_cloud_sync_before_enabling_remote_control),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
            )
        }
        status.error?.let {
            Text(
                text = it.text(),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.error,
            )
        }
    }
}

@Suppress("LongMethod")
@Composable
private fun CloudSignedOutCardContent(
    loginForm: CloudLoginForm,
    loading: Boolean,
    onLoginFormChange: (CloudLoginForm) -> Unit,
    onLogin: () -> Unit,
    oidcMethod: OidcMethod,
    onOidcLogin: () -> Unit,
    androidQrLoginMethod: AndroidQrLoginMethod,
    androidQrLoginState: AndroidQrLoginUiState,
    onAndroidQrScan: () -> Unit,
    onAndroidQrConfirm: () -> Unit,
    onAndroidQrCancel: () -> Unit,
    onAndroidQrRetry: () -> Unit,
) {
    OutlinedTextField(
        value = loginForm.username,
        onValueChange = { onLoginFormChange(loginForm.copy(username = it)) },
        label = { Text(stringResource(R.string.options_username)) },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Text),
        modifier = Modifier.autofillText(ContentType.Username),
    )
    OutlinedTextField(
        value = loginForm.password,
        onValueChange = { onLoginFormChange(loginForm.copy(password = it)) },
        label = { Text(stringResource(R.string.options_password)) },
        singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
        visualTransformation = PasswordVisualTransformation(),
        modifier = Modifier.autofillText(ContentType.Password),
    )
    if (loginForm.username.isNotBlank() && loginForm.password.isNotBlank()) {
        OutlinedTextField(
            value = loginForm.oneTimeCode,
            onValueChange = { onLoginFormChange(loginForm.copy(oneTimeCode = it)) },
            label = { Text(if (loginForm.useRecoveryCode) stringResource(R.string.options_recovery_code) else stringResource(R.string.options_authenticator_code)) },
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
            Text(if (loginForm.useRecoveryCode) stringResource(R.string.options_use_authenticator_code) else stringResource(R.string.options_use_a_recovery_code))
        }
    } else {
        Text(
            text = stringResource(R.string.options_enter_your_username_and_password_to_continue_to_verification),
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
            Text(if (loading) stringResource(R.string.options_signing_in) else stringResource(R.string.options_sign_in))
        }
    }
    if (oidcMethod.enabled) {
        HorizontalDivider()
        OutlinedButton(
            onClick = onOidcLogin,
            enabled = !loading,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text(stringResource(R.string.options_continue_provider, oidcMethod.displayName))
        }
    }
    AndroidQrLoginContent(
        method = androidQrLoginMethod,
        state = androidQrLoginState,
        enabled = !loading || androidQrLoginState.blocksOtherAuthentication(),
        onScan = onAndroidQrScan,
        onConfirm = onAndroidQrConfirm,
        onCancel = onAndroidQrCancel,
        onRetry = onAndroidQrRetry,
    )
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
        text = stringResource(R.string.options_signed_in_as, session.username),
        style = MaterialTheme.typography.titleSmall,
    )
    Text(
        text = stringResource(R.string.options_access_expires, optionsDate(session.accessTokenExpiresAt)),
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    Text(
        text = stringResource(R.string.options_last_synced, syncState.lastSyncedAt?.let { optionsDate(it) } ?: stringResource(R.string.options_never)),
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
    syncState.lastError?.let {
        Text(
            text = stringResource(R.string.options_last_sync_error, it.text()),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.error,
        )
    }
    KestrelActionRow {
        Button(onClick = onSyncNow, enabled = !loading) {
            Text(if (loading) stringResource(R.string.options_syncing) else stringResource(R.string.options_sync_now))
        }
        if (syncState.lastError != null) {
            OutlinedButton(onClick = onRefreshSession, enabled = !loading) {
                Text(stringResource(R.string.options_reconnect))
            }
        }
        OutlinedButton(onClick = onLogout, enabled = !loading) {
            Text(stringResource(R.string.options_sign_out))
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
        title = stringResource(R.string.options_sync_conflicts),
        subtitle = stringResource(R.string.options_choose_which_place_version_to_keep),
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
            text = stringResource(R.string.options_conflict_device, conflict.localName, formatCoordinate(conflict.localLatitude), formatCoordinate(conflict.localLongitude)),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        conflict.localDescription?.let {
            Text(stringResource(R.string.options_device_description, it), style = MaterialTheme.typography.bodySmall)
        }
        Text(
            text = stringResource(R.string.options_conflict_cloud, conflict.cloudName, formatCoordinate(conflict.cloudLatitude), formatCoordinate(conflict.cloudLongitude)),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        conflict.cloudDescription?.let {
            Text(stringResource(R.string.options_cloud_description, it), style = MaterialTheme.typography.bodySmall)
        }
        KestrelActionRow {
            OutlinedButton(onClick = onUseCloud, enabled = !loading) { Text(stringResource(R.string.options_keep_cloud_version)) }
            Button(onClick = onUseLocal, enabled = !loading) { Text(stringResource(R.string.options_keep_this_device)) }
            OutlinedButton(onClick = onKeepBoth, enabled = !loading) { Text(stringResource(R.string.options_keep_both)) }
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
            ConflictResolutionChoice.KeepDevice -> {
                stringResource(R.string.options_replace_the_cloud_copy_with_this_device_s_name)
            }

            ConflictResolutionChoice.KeepCloud -> {
                stringResource(R.string.options_replace_this_device_s_saved_copy_with_the_cloud)
            }

            ConflictResolutionChoice.KeepBoth -> {
                stringResource(R.string.options_keep_two_favorites_so_neither_version_is_overwritten)
            }
        }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.options_resolve_named, pending.conflict.localName)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(effect)
                Text(
                    stringResource(
                        R.string.options_conflict_device,
                        pending.conflict.localName,
                        formatCoordinate(pending.conflict.localLatitude),
                        formatCoordinate(pending.conflict.localLongitude),
                    ),
                )
                Text(
                    stringResource(
                        R.string.options_conflict_cloud,
                        pending.conflict.cloudName,
                        formatCoordinate(pending.conflict.cloudLatitude),
                        formatCoordinate(pending.conflict.cloudLongitude),
                    ),
                )
            }
        },
        confirmButton = { Button(onClick = onConfirm) { Text(stringResource(R.string.options_confirm_resolution)) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.options_cancel)) } },
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
        title = { Text(stringResource(R.string.options_remote_confirm_title)) },
        text = {
            Text(
                stringResource(
                    R.string.options_remote_confirmation,
                    deviceName ?: stringResource(R.string.options_registered_after_confirmation),
                ),
            )
        },
        confirmButton = { Button(onClick = onConfirm) { Text(stringResource(R.string.options_allow_remote_control)) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.options_cancel)) } },
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
        title = { Text(stringResource(R.string.options_sign_out_title)) },
        text = {
            Text(
                if (remoteControlEnabled) {
                    stringResource(R.string.options_kestrel_will_disable_web_remote_control_before_removing_this)
                } else {
                    stringResource(R.string.options_cloud_sync_will_stop_until_you_sign_in_again)
                },
            )
        },
        confirmButton = { Button(onClick = onConfirm) { Text(stringResource(R.string.options_sign_out)) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.options_cancel)) } },
    )
}

@Composable
private fun CloudStatusMessage(
    message: OptionsMessage?,
    error: OptionsMessage?,
) {
    message?.let {
        Text(
            text = it.text(),
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.primary,
        )
    }
    error?.let {
        Text(
            text = it.text(),
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive },
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.error,
        )
    }
}

private fun formatCoordinate(value: Double): String = String.format(Locale.ROOT, "%.5f", value)

private fun RemoteCommandStatus.toUserLabel(): Int =
    when (this) {
        RemoteCommandStatus.QUEUED -> R.string.options_command_queued
        RemoteCommandStatus.DELIVERED -> R.string.options_command_delivered
        RemoteCommandStatus.APPLIED -> R.string.options_command_applied
        RemoteCommandStatus.FAILED -> R.string.options_command_failed
        RemoteCommandStatus.EXPIRED -> R.string.options_command_expired
    }

internal fun isValidCloudServerAddress(value: String): Boolean =
    runCatching { URI(value.trim()) }
        .getOrNull()
        ?.let { it.scheme in setOf("http", "https") && !it.host.isNullOrBlank() }
        ?: false

private fun buildCloudSettingsUiState(
    apiBaseUrl: String,
    loading: Boolean,
    message: OptionsMessage?,
    error: OptionsMessage?,
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
    setError: (OptionsMessage?) -> Unit,
    setMessage: (OptionsMessage?) -> Unit,
    errorContext: CloudErrorContext = CloudErrorContext.General,
    block: suspend () -> Unit,
) {
    scope.launch {
        runCloudAction(
            setLoading = setLoading,
            setError = setError,
            setMessage = setMessage,
            errorContext = errorContext,
            block = block,
        )
    }
}

internal suspend fun handleOptionsOidcCallback(
    completeLogin: suspend () -> CloudSession,
    consumeCallback: () -> Unit,
    onSignedIn: suspend (CloudSession) -> Unit,
) {
    val session =
        try {
            completeLogin()
        } finally {
            // Consume before sync can suspend. On failure, durable auth state still owns recovery.
            consumeCallback()
        }
    onSignedIn(session)
}

// The UI action boundary maps all failures; cancellation must still propagate.
@Suppress("TooGenericExceptionCaught")
internal suspend fun runCloudAction(
    setLoading: (Boolean) -> Unit,
    setError: (OptionsMessage?) -> Unit,
    setMessage: (OptionsMessage?) -> Unit,
    errorContext: CloudErrorContext = CloudErrorContext.General,
    block: suspend () -> Unit,
) {
    setLoading(true)
    setError(null)
    setMessage(null)
    try {
        block()
    } catch (error: CloudApiException) {
        setError(error.toOptionsError(errorContext))
    } catch (error: IOException) {
        setError(error.toOptionsError(errorContext))
    } catch (error: CancellationException) {
        throw error
    } catch (error: IllegalStateException) {
        setError(error.toOptionsError(errorContext))
    } catch (error: Exception) {
        setError(error.toOptionsError(errorContext))
    } finally {
        setLoading(false)
    }
}

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

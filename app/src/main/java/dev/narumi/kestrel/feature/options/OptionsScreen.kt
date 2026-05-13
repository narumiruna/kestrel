package dev.narumi.kestrel.feature.options

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
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
import dev.narumi.kestrel.core.data.CloudSettings
import dev.narumi.kestrel.core.data.KestrelPrefs
import dev.narumi.kestrel.core.data.RandomRoutePreference
import dev.narumi.kestrel.core.data.StartupPreference
import dev.narumi.kestrel.core.library.LibraryItemWithContent
import dev.narumi.kestrel.core.library.LibraryRepository
import dev.narumi.kestrel.core.library.description
import kotlinx.coroutines.launch
import java.io.IOException
import java.util.Date

private data class CloudLoginForm(
    val username: String = "",
    val password: String = "",
    val oneTimeCode: String = "",
    val useRecoveryCode: Boolean = false,
)

private data class CloudSettingsUiState(
    val apiBaseUrl: String,
    val loading: Boolean,
    val message: String?,
    val error: String?,
    val session: CloudSession?,
    val syncState: CloudSyncState,
)

@Composable
fun OptionsScreen(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val prefs = remember { KestrelPrefs(context) }
    val libraryRepository = remember { LibraryRepository.getInstance(context) }
    val scope = rememberCoroutineScope()

    val items by libraryRepository.items.collectAsStateWithLifecycle(emptyList())
    val startup by prefs.startupPreference.collectAsStateWithLifecycle(StartupPreference())
    val randomRoute by prefs.randomRoutePreference.collectAsStateWithLifecycle(RandomRoutePreference())

    var defaultPointCount by remember { mutableStateOf("") }
    var defaultSpacingMeters by remember { mutableStateOf("") }

    LaunchedEffect(randomRoute.defaultPointCount, randomRoute.defaultSpacingMeters) {
        defaultPointCount = randomRoute.defaultPointCount.toString()
        defaultSpacingMeters = formatMeters(randomRoute.defaultSpacingMeters)
    }

    fun update(pref: StartupPreference) {
        scope.launch { prefs.setStartupPreference(pref) }
    }

    Column(
        modifier =
            modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        CloudSettingsSection()

        StartupPreferenceCard(
            items = items,
            startup = startup,
            onUpdate = ::update,
        )

        RandomRouteDefaultsCard(
            pointCount = defaultPointCount,
            spacingMeters = defaultSpacingMeters,
            hasLastUsed = randomRoute.usesLastSettings,
            onPointCountChange = { defaultPointCount = it.filter(Char::isDigit).take(4) },
            onSpacingMetersChange = {
                defaultSpacingMeters = it.filter { ch -> ch.isDigit() || ch == '.' }.take(7)
            },
            onSave = {
                scope.launch {
                    prefs.setRandomRouteDefaults(
                        defaultPointCount.toIntOrNull() ?: return@launch,
                        defaultSpacingMeters.toDoubleOrNull() ?: return@launch,
                    )
                }
            },
            onReset = { scope.launch { prefs.resetRandomRoutePreference() } },
        )

        FavoriteStartupPicker(
            items = items,
            startup = startup,
            onSelect = { item ->
                update(
                    StartupPreference(
                        mode = StartupPreference.Mode.Favorite,
                        libraryItemId = item.item.id,
                    ),
                )
            },
        )
    }
}

@Suppress("LongMethod")
@Composable
private fun CloudSettingsSection() {
    val context = LocalContext.current
    val prefs = remember { KestrelPrefs(context) }
    val authRepository = remember { CloudAuthRepository.getInstance(context) }
    val syncRepository = remember { CloudSyncRepository.getInstance(context) }
    val scope = rememberCoroutineScope()

    val cloudSettings by prefs.cloudSettings.collectAsStateWithLifecycle(CloudSettings())
    val cloudSyncState by syncRepository.syncState.collectAsStateWithLifecycle(CloudSyncState())
    val placeConflicts by syncRepository.placeConflicts.collectAsStateWithLifecycle(emptyList())

    var loginForm by remember { mutableStateOf(CloudLoginForm()) }
    var cloudSession by remember { mutableStateOf<CloudSession?>(null) }
    var cloudMessage by remember { mutableStateOf<String?>(null) }
    var cloudError by remember { mutableStateOf<String?>(null) }
    var cloudLoading by remember { mutableStateOf(false) }
    var apiBaseUrl by remember { mutableStateOf(cloudSettings.apiBaseUrl) }

    LaunchedEffect(Unit) {
        cloudSession = authRepository.currentSession()
    }

    LaunchedEffect(cloudSettings.apiBaseUrl) {
        apiBaseUrl = cloudSettings.apiBaseUrl
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
                loginForm = loginForm.copy(oneTimeCode = "")
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
            launchCloudUiAction(
                scope = scope,
                setLoading = { cloudLoading = it },
                setError = { cloudError = it },
                setMessage = { cloudMessage = it },
            ) {
                authRepository.logout()
                cloudSession = null
                cloudMessage = "Signed out"
            }
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

    CloudConflictCard(
        conflicts = placeConflicts,
        loading = cloudLoading,
        onUseCloud = { conflict ->
            launchCloudUiAction(
                scope = scope,
                setLoading = { cloudLoading = it },
                setError = { cloudError = it },
                setMessage = { cloudMessage = it },
            ) {
                syncRepository.resolveConflictUseCloud(conflict.id)
                cloudMessage = "Applied cloud version"
            }
        },
        onUseLocal = { conflict ->
            launchCloudUiAction(
                scope = scope,
                setLoading = { cloudLoading = it },
                setError = { cloudError = it },
                setMessage = { cloudMessage = it },
            ) {
                syncRepository.resolveConflictUseLocal(conflict.id)
                cloudMessage = "Uploaded local version"
            }
        },
        onKeepBoth = { conflict ->
            launchCloudUiAction(
                scope = scope,
                setLoading = { cloudLoading = it },
                setError = { cloudError = it },
                setMessage = { cloudMessage = it },
            ) {
                syncRepository.resolveConflictKeepBoth(conflict.id)
                cloudMessage = "Kept both versions"
            }
        },
    )
}

@Composable
private fun CloudSettingsCard(
    uiState: CloudSettingsUiState,
    loginForm: CloudLoginForm,
    onApiBaseUrlChange: (String) -> Unit,
    onLoginFormChange: (CloudLoginForm) -> Unit,
    onSaveApiBaseUrl: () -> Unit,
    onLogin: () -> Unit,
    onRefreshSession: () -> Unit,
    onLogout: () -> Unit,
    onSyncNow: () -> Unit,
) {
    Text(
        text = "Cloud sync",
        style = MaterialTheme.typography.titleMedium,
    )
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            OutlinedTextField(
                value = uiState.apiBaseUrl,
                onValueChange = onApiBaseUrlChange,
                label = { Text("API base URL") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Text(
                text = "Production default is https://kestrel.narumi.dev; /api/backend is added automatically.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            OutlinedButton(onClick = onSaveApiBaseUrl) { Text("Save API URL") }

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
        modifier = Modifier.fillMaxWidth(),
    )
    OutlinedTextField(
        value = loginForm.password,
        onValueChange = { onLoginFormChange(loginForm.copy(password = it)) },
        label = { Text("Password") },
        singleLine = true,
        visualTransformation = PasswordVisualTransformation(),
        modifier = Modifier.fillMaxWidth(),
    )
    StartupRadioRow(
        label = "Use recovery code instead of TOTP",
        selected = loginForm.useRecoveryCode,
        onSelect = {
            onLoginFormChange(loginForm.copy(useRecoveryCode = !loginForm.useRecoveryCode))
        },
    )
    if (loginForm.username.isNotBlank() && loginForm.password.isNotBlank()) {
        OutlinedTextField(
            value = loginForm.oneTimeCode,
            onValueChange = { onLoginFormChange(loginForm.copy(oneTimeCode = it)) },
            label = { Text(if (loginForm.useRecoveryCode) "Recovery code" else "TOTP code") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
    } else {
        Text(
            text = "Fill username and password first; the TOTP/recovery code field appears next.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
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
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Button(onClick = onSyncNow, enabled = !loading) {
            Text(if (loading) "Syncing…" else "Sync now")
        }
        OutlinedButton(onClick = onRefreshSession, enabled = !loading) {
            Text("Refresh session")
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
    Text(
        text = "Sync conflicts",
        style = MaterialTheme.typography.titleMedium,
    )
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = "Choose which place version to keep.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
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
            text = "Local: ${conflict.localName} (${formatCoordinate(conflict.localLatitude)}, ${formatCoordinate(conflict.localLongitude)})",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            text = "Cloud: ${conflict.cloudName} (${formatCoordinate(conflict.cloudLatitude)}, ${formatCoordinate(conflict.cloudLongitude)})",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedButton(onClick = onUseCloud, enabled = !loading) { Text("Use Cloud") }
            Button(onClick = onUseLocal, enabled = !loading) { Text("Use Local") }
            OutlinedButton(onClick = onKeepBoth, enabled = !loading) { Text("Keep Both") }
        }
    }
}

@Composable
private fun CloudStatusMessage(
    message: String?,
    error: String?,
) {
    message?.let {
        Text(
            text = it,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.primary,
        )
    }
    error?.let {
        Text(
            text = it,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.error,
        )
    }
}

@Composable
private fun StartupPreferenceCard(
    items: List<LibraryItemWithContent>,
    startup: StartupPreference,
    onUpdate: (StartupPreference) -> Unit,
) {
    Text(
        text = "When opening the app",
        style = MaterialTheme.typography.titleMedium,
    )
    Card(modifier = Modifier.fillMaxWidth()) {
        StartupRadioRow(
            label = "Last position",
            selected = startup.mode == StartupPreference.Mode.Last,
            onSelect = { onUpdate(StartupPreference(StartupPreference.Mode.Last)) },
        )
        HorizontalDivider()
        StartupRadioRow(
            label = "Current location",
            selected = startup.mode == StartupPreference.Mode.Current,
            onSelect = { onUpdate(StartupPreference(StartupPreference.Mode.Current)) },
        )
        HorizontalDivider()
        StartupRadioRow(
            label =
                if (items.isEmpty()) {
                    "A favorite (none yet — long-press the map)"
                } else {
                    "A favorite"
                },
            selected = startup.mode == StartupPreference.Mode.Favorite,
            enabled = items.isNotEmpty(),
            onSelect = {
                val target =
                    items.firstOrNull { it.item.id == startup.libraryItemId }
                        ?: items.firstOrNull()
                        ?: return@StartupRadioRow
                onUpdate(
                    StartupPreference(
                        mode = StartupPreference.Mode.Favorite,
                        libraryItemId = target.item.id,
                    ),
                )
            },
        )
    }
}

@Composable
private fun FavoriteStartupPicker(
    items: List<LibraryItemWithContent>,
    startup: StartupPreference,
    onSelect: (LibraryItemWithContent) -> Unit,
) {
    if (startup.mode != StartupPreference.Mode.Favorite || items.isEmpty()) return
    Text(
        text = "Pick a favorite",
        style = MaterialTheme.typography.titleSmall,
    )
    Card(modifier = Modifier.fillMaxWidth()) {
        items.forEachIndexed { index, item ->
            if (index > 0) HorizontalDivider()
            StartupRadioRow(
                label = item.name,
                supporting = item.description(),
                selected = startup.libraryItemId == item.item.id,
                onSelect = { onSelect(item) },
            )
        }
    }
}

@Composable
private fun RandomRouteDefaultsCard(
    pointCount: String,
    spacingMeters: String,
    hasLastUsed: Boolean,
    onPointCountChange: (String) -> Unit,
    onSpacingMetersChange: (String) -> Unit,
    onSave: () -> Unit,
    onReset: () -> Unit,
) {
    val parsedPointCount = pointCount.toIntOrNull()
    val parsedSpacing = spacingMeters.toDoubleOrNull()
    val valid = isValidRandomRoute(parsedPointCount, parsedSpacing)
    Text(
        text = "Random route defaults",
        style = MaterialTheme.typography.titleMedium,
    )
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = "Used when no previous random route settings exist.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (hasLastUsed) {
                Text(
                    text = "Generate random route is currently using last used settings.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            OutlinedTextField(
                value = pointCount,
                onValueChange = onPointCountChange,
                label = { Text("Point count (2–1000)") },
                isError = pointCount.isNotBlank() && !isValidPointCount(parsedPointCount),
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = spacingMeters,
                onValueChange = onSpacingMetersChange,
                label = { Text("Spacing meters (1–10000)") },
                isError = spacingMeters.isNotBlank() && !isValidSpacing(parsedSpacing),
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Text(
                text =
                    "Estimated distance: " +
                        if (parsedPointCount != null && parsedSpacing != null) {
                            formatDistance((parsedPointCount - 1).coerceAtLeast(0) * parsedSpacing)
                        } else {
                            "—"
                        },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = onSave,
                    enabled = valid,
                ) { Text("Save") }
                OutlinedButton(onClick = onReset) { Text("Reset to recommended") }
            }
        }
    }
}

private fun isValidPointCount(value: Int?): Boolean =
    value != null &&
        value in RandomRoutePreference.MIN_POINT_COUNT..RandomRoutePreference.MAX_POINT_COUNT

private fun isValidSpacing(value: Double?): Boolean =
    value != null &&
        value >= RandomRoutePreference.MIN_SPACING_METERS &&
        value <= RandomRoutePreference.MAX_SPACING_METERS

private fun isValidRandomRoute(
    pointCount: Int?,
    spacingMeters: Double?,
): Boolean = isValidPointCount(pointCount) && isValidSpacing(spacingMeters)

private fun formatMeters(value: Double): String = if (value % 1.0 == 0.0) value.toInt().toString() else value.toString()

private fun formatDistance(meters: Double): String =
    if (meters >= 1000.0) {
        "%.1f km".format(meters / 1000.0)
    } else {
        "${formatMeters(meters)} m"
    }

private fun formatCoordinate(value: Double): String = "%.5f".format(value)

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
    } catch (error: IllegalStateException) {
        setError(error.toCloudErrorMessage())
    } finally {
        setLoading(false)
    }
}

private fun Throwable.toCloudErrorMessage(): String = message ?: "Unexpected cloud error"

@Suppress("UnusedPrivateMember")
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

@Composable
private fun StartupRadioRow(
    label: String,
    selected: Boolean,
    onSelect: () -> Unit,
    enabled: Boolean = true,
    supporting: String? = null,
) {
    ListItem(
        headlineContent = { Text(label) },
        supportingContent = supporting?.let { { Text(it) } },
        leadingContent = {
            RadioButton(selected = selected, onClick = onSelect, enabled = enabled)
        },
        modifier =
            Modifier
                .fillMaxWidth()
                .selectable(selected = selected, enabled = enabled, onClick = onSelect),
    )
}

package com.fmdx.android

import android.app.Application
import android.content.ComponentName
import android.content.Context
import android.util.Log
import androidx.annotation.OptIn
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.fmdx.android.audio.PlaybackService
import com.fmdx.android.data.ControlConnection
import com.fmdx.android.data.FmDxRepository
import com.fmdx.android.data.PluginConnection
import com.fmdx.android.model.SignalUnit
import com.fmdx.android.model.SpectrumPoint
import com.fmdx.android.model.TunerInfo
import com.fmdx.android.model.TunerState
import com.google.common.util.concurrent.ListenableFuture
import com.google.common.util.concurrent.MoreExecutors
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.OkHttpClient
import java.util.Locale
import java.util.concurrent.TimeUnit

@OptIn(UnstableApi::class)
class MainViewModel(application: Application) : AndroidViewModel(application) {
    private val okHttpClient = OkHttpClient.Builder()
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .build()
    private val repository = FmDxRepository(okHttpClient)

    private val preferences = application.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private val _uiState = MutableStateFlow(UiState(spectrum = baselineSpectrum()))
    val uiState: StateFlow<UiState> = _uiState

    private val commandFlow = MutableSharedFlow<String>(extraBufferCapacity = 64, onBufferOverflow = BufferOverflow.DROP_OLDEST)

    private var controlConnection: ControlConnection? = null
    private var pluginConnection: PluginConnection? = null
    private var commandJob: Job? = null
    private var pingJob: Job? = null
    private var controllerFuture: ListenableFuture<MediaController>? = null
    private val controller: MediaController? get() = controllerFuture?.let { if (it.isDone) it.get() else null }


    private val europeProgrammes = listOf(
        "No PTY", "News", "Current Affairs", "Info",
        "Sport", "Education", "Drama", "Culture", "Science", "Varied",
        "Pop M", "Rock M", "Easy Listening", "Light Classical",
        "Serious Classical", "Other Music", "Weather", "Finance",
        "Children's Programmes", "Social Affairs", "Religion", "Phone-in",
        "Travel", "Leisure", "Jazz Music", "Country Music", "National Music",
        "Oldies Music", "Folk Music", "Documentary", "Alarm Test"
    )

    init {
        restorePersistedServerUrl()
        initializeMediaController()
    }

    private fun initializeMediaController() {
        val sessionToken = SessionToken(getApplication(), ComponentName(getApplication(), PlaybackService::class.java))
        controllerFuture = MediaController.Builder(getApplication(), sessionToken).buildAsync()
        controllerFuture?.addListener(
            {
                controller?.addListener(object : Player.Listener {
                    override fun onIsPlayingChanged(isPlaying: Boolean) {
                        _uiState.update { it.copy(audioPlaying = isPlaying) }
                    }
                })
            },
            MoreExecutors.directExecutor()
        )
    }


    fun updateServerUrl(url: String) {
        _uiState.update { it.copy(serverUrl = url) }
    }

    fun connect() {
        val current = _uiState.value
        if (current.isConnecting) return
        val rawUrl = current.serverUrl
        if (rawUrl.isBlank()) {
            _uiState.update { it.copy(errorMessage = "Server URL is required") }
            return
        }
        val sanitized = try {
            sanitizeUrl(rawUrl)
        } catch (ex: IllegalArgumentException) {
            _uiState.update { it.copy(errorMessage = ex.message ?: "Invalid URL") }
            return
        }
        logDebug("connect(): sanitized server URL=$sanitized")
        persistServerUrl(sanitized)
        val connectingMessage = "Connecting to $sanitized…"
        _uiState.update {
            it.copy(
                serverUrl = sanitized,
                isConnecting = true,
                errorMessage = null,
                statusMessage = connectingMessage
            )
        }
        viewModelScope.launch {
            try {
                logDebug("connect(): fetching tuner info")
                val info = repository.fetchTunerInfo(sanitized, BuildConfig.USER_AGENT)
                val connectionName = info.tunerName.takeIf { it.isNotBlank() } ?: sanitized
                logDebug("connect(): tuner info resolved -> name=${info.tunerName}, description=${info.tunerDescription}")
                _uiState.update {
                    it.copy(
                        serverUrl = sanitized,
                        tunerInfo = info,
                        antennas = info.antennaNames,
                        tunerState = it.tunerState,
                        errorMessage = null,
                        isConnected = true,
                        isConnecting = false,
                        statusMessage = "Connected to $connectionName"
                    )
                }
                startControlConnection(sanitized)
                startPluginConnection(sanitized)
                startPing(sanitized)
                refreshSpectrum(sanitized)
            } catch (ex: Exception) {
                logDebug("connect(): failed", ex)
                _uiState.update {
                    it.copy(
                        errorMessage = ex.message,
                        isConnected = false,
                        isConnecting = false,
                        statusMessage = ex.message ?: "Connection failed"
                    )
                }
            }
        }
    }

    fun disconnect() {
        controlConnection?.close()
        controlConnection = null
        pluginConnection?.close()
        pluginConnection = null
        commandJob?.cancel()
        commandJob = null
        pingJob?.cancel()
        pingJob = null
        controller?.stop()
        _uiState.update {
            it.copy(
                isConnected = false,
                isConnecting = false,
                audioPlaying = false,
                statusMessage = "Disconnected"
            )
        }
    }

    fun toggleAudio() {
        val state = _uiState.value
        val player = controller ?: return

        if (player.isPlaying) {
            player.pause()
        } else {
            if (player.currentMediaItem == null) {
                val mediaItem = MediaItem.Builder()
                    .setMediaId(state.serverUrl)
                    .build()
                player.setMediaItem(mediaItem)
            }
            player.prepare()
            player.play()
        }

    }

    fun tuneStep(stepHz: Int) {
        val current = _uiState.value.tunerState?.freqKHz ?: return
        sendCommand("T${current + stepHz}")
        resetRds()
    }

    fun tuneToFrequency(valueMHz: Double) {
        val kHz = (valueMHz * 1000).toInt()
        sendCommand("T$kHz")
        resetRds()
    }

    fun toggleIms() {
        val state = _uiState.value.tunerState ?: return
        val eq = if (state.eq) 1 else 0
        val ims = if (state.ims) 0 else 1
        sendCommand("G${eq}${ims}")
    }

    fun toggleEq() {
        val state = _uiState.value.tunerState ?: return
        val eq = if (state.eq) 0 else 1
        val ims = if (state.ims) 1 else 0
        sendCommand("G${eq}${ims}")
    }

    fun cycleAntenna() {
        val state = _uiState.value.tunerState ?: return
        val antennas = _uiState.value.antennas.takeIf { it.isNotEmpty() } ?: listOf("Default")
        val count = antennas.size
        val current = state.antennaIndex ?: 0
        val next = if (count > 0) (current + 1) % count else 0
        sendCommand("Z$next")
        _uiState.update { it.copy(tunerState = it.tunerState?.copy(antennaIndex = next)) }
    }

    fun setSignalUnit(unit: SignalUnit) {
        _uiState.update { it.copy(signalUnit = unit) }
    }

    fun requestSpectrumScan() {
        val url = _uiState.value.serverUrl
        val plugin = pluginConnection ?: return
        if (url.isBlank()) return
        viewModelScope.launch {
            _uiState.update { it.copy(isScanning = true) }
            plugin.requestSpectrumScan()
            val deadline = System.currentTimeMillis() + 10000
            var fetched = false
            while (System.currentTimeMillis() < deadline) {
                delay(500)
                val points = try {
                    repository.fetchSpectrumData(url, BuildConfig.USER_AGENT)
                } catch (ex: Exception) {
                    _uiState.update { it.copy(errorMessage = ex.message) }
                    null
                }
                if (points != null) {
                    _uiState.update { it.copy(spectrum = ensureSpectrum(points)) }
                    fetched = true
                    break
                }
            }
            if (!fetched) {
                _uiState.update { it.copy(spectrum = ensureSpectrum(it.spectrum)) }
            }
            _uiState.update { it.copy(isScanning = false) }
        }
    }

    fun refreshSpectrum() {
        val url = _uiState.value.serverUrl
        if (url.isBlank()) return
        viewModelScope.launch {
            refreshSpectrum(url)
        }
    }

    private suspend fun refreshSpectrum(url: String) {
        val points = try {
            repository.fetchSpectrumData(url, BuildConfig.USER_AGENT)
        } catch (ex: Exception) {
            _uiState.update { it.copy(errorMessage = ex.message) }
            null
        }
        if (points != null) {
            _uiState.update { it.copy(spectrum = ensureSpectrum(points)) }
        }
    }

    private fun startControlConnection(url: String) {
        logDebug("startControlConnection(): opening control socket")
        controlConnection?.close()
        commandJob?.cancel()
        val connection = repository.connectControl(
            url,
            BuildConfig.USER_AGENT,
            viewModelScope,
            onState = { state ->
                logDebug("control socket: state update freq=${state.freqKHz} users=${state.users}")
                _uiState.update {
                    it.copy(
                        tunerState = state,
                        antennas = if (it.antennas.isEmpty() && it.tunerInfo != null) it.tunerInfo.antennaNames else it.antennas
                    )
                }
            },
            onClosed = {
                logDebug("control socket: closed")
                _uiState.update {
                    it.copy(
                        isConnected = false,
                        isConnecting = false,
                        statusMessage = "Connection closed"
                    )
                }
            },
            onError = { error ->
                logDebug("control socket: error", error)
                _uiState.update {
                    it.copy(
                        errorMessage = error.message,
                        statusMessage = error.message
                    )
                }
            }
        )
        controlConnection = connection
        commandJob = viewModelScope.launch {
            commandFlow.collect { cmd ->
                logDebug("control socket: sending command=$cmd")
                connection.send(cmd)
            }
        }
    }

    private fun startPluginConnection(url: String) {
        logDebug("startPluginConnection(): opening plugin socket")
        pluginConnection?.close()
        pluginConnection = repository.connectPlugin(url, BuildConfig.USER_AGENT) { error ->
            logDebug("plugin socket: error", error)
            _uiState.update { it.copy(errorMessage = error.message) }
        }
    }

    private fun startPing(url: String) {
        logDebug("startPing(): scheduling ping job")
        pingJob?.cancel()
        pingJob = viewModelScope.launch {
            while (true) {
                val ping = try {
                    logDebug("startPing(): sending ping request")
                    repository.ping(url, BuildConfig.USER_AGENT)
                } catch (ex: Exception) {
                    logDebug("startPing(): ping failed", ex)
                    _uiState.update { it.copy(errorMessage = ex.message) }
                    null
                }
                ping?.let { value ->
                    logDebug("startPing(): ping=${'$'}value ms")
                    _uiState.update { it.copy(pingMs = value) }
                }
                delay(5000)
            }
        }
    }

    private fun sendCommand(command: String) {
        commandFlow.tryEmit(command)
    }

    private fun resetRds() {
        val state = _uiState.value.tunerState ?: return
        _uiState.update {
            it.copy(
                tunerState = state.copy(
                    ps = "",
                    rt0 = "",
                    rt1 = ""
                )
            )
        }
    }

    override fun onCleared() {
        super.onCleared()
        disconnect()
        controllerFuture?.let { MediaController.releaseFuture(it) }
    }

    fun formatSignal(state: TunerState?, unit: SignalUnit): String {
        val signal = state?.signalDbf ?: return "--"
        val value = when (unit) {
            SignalUnit.DBF -> signal
            SignalUnit.DBUV -> signal - 11.25
            SignalUnit.DBM -> signal - 120
        }
        return String.format(Locale.US, "%.1f %s", value, unit.displayName)
    }

    fun currentPty(state: TunerState?): String {
        return state?.ptyDisplay(europeProgrammes) ?: "0/None"
    }

    fun antennaLabel(): String {
        val antennas = _uiState.value.antennas
        val index = _uiState.value.tunerState?.antennaIndex ?: 0
        return if (antennas.isNotEmpty() && index in antennas.indices) antennas[index] else "Default"
    }

    private fun sanitizeUrl(input: String): String {
        val trimmed = input.trim()
        if (trimmed.isEmpty()) {
            throw IllegalArgumentException("Server URL is required")
        }

        val withHttpScheme = when {
            trimmed.startsWith("http://", ignoreCase = true) -> trimmed
            trimmed.startsWith("https://", ignoreCase = true) -> trimmed
            trimmed.startsWith("ws://", ignoreCase = true) -> "http://" + trimmed.substringAfter("://")
            trimmed.startsWith("wss://", ignoreCase = true) -> "https://" + trimmed.substringAfter("://")
            else -> "http://$trimmed"
        }

        val httpUrl = withHttpScheme.toHttpUrlOrNull()
            ?: throw IllegalArgumentException("Invalid server URL")

        val rebuilt = httpUrl.newBuilder().build()
        val asString = rebuilt.toString()
        val sanitized = if (rebuilt.encodedPath == "/") {
            asString.trimEnd('/')
        } else {
            asString
        }
        logDebug("sanitizeUrl(): input=${'$'}input resolved=${'$'}sanitized")
        return sanitized
    }

    private fun ensureSpectrum(points: List<SpectrumPoint>): List<SpectrumPoint> {
        return if (points.isEmpty()) baselineSpectrum() else points
    }

    companion object {
        private const val PREFS_NAME = "fm_dx_prefs"
        private const val KEY_LAST_SERVER_URL = "last_server_url"
        private const val TAG = "MainViewModel"

        private fun baselineSpectrum(): List<SpectrumPoint> {
            val list = mutableListOf<SpectrumPoint>()
            var freq = 83.0
            while (freq <= 108.0 + 1e-6) {
                list += SpectrumPoint(freq, 0.0)
                freq += 0.05
            }
            return list
        }
    }

    private fun persistServerUrl(url: String) {
        preferences.edit().putString(KEY_LAST_SERVER_URL, url).apply()
    }

    private fun restorePersistedServerUrl() {
        val persisted = preferences.getString(KEY_LAST_SERVER_URL, null) ?: return
        val sanitized = runCatching { sanitizeUrl(persisted) }.getOrNull() ?: persisted
        _uiState.update { it.copy(serverUrl = sanitized) }
    }

    private fun logDebug(message: String, throwable: Throwable? = null) {
        if (!BuildConfig.DEBUG) return
        if (throwable != null) {
            Log.d(TAG, message, throwable)
        } else {
            Log.d(TAG, message)
        }
    }
}

data class UiState(
    val serverUrl: String = "",
    val tunerInfo: TunerInfo? = null,
    val tunerState: TunerState? = null,
    val pingMs: Long? = null,
    val audioPlaying: Boolean = false,
    val isConnected: Boolean = false,
    val isConnecting: Boolean = false,
    val antennas: List<String> = emptyList(),
    val spectrum: List<SpectrumPoint> = emptyList(),
    val isScanning: Boolean = false,
    val errorMessage: String? = null,
    val signalUnit: SignalUnit = SignalUnit.DBF,
    val statusMessage: String? = null
)

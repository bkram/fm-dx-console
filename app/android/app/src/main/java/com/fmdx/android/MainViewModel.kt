package com.fmdx.android

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.fmdx.android.audio.WebSocketAudioPlayer
import com.fmdx.android.data.ControlConnection
import com.fmdx.android.data.FmDxRepository
import com.fmdx.android.data.PluginConnection
import com.fmdx.android.model.SignalUnit
import com.fmdx.android.model.SpectrumPoint
import com.fmdx.android.model.TunerInfo
import com.fmdx.android.model.TunerState
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import okhttp3.OkHttpClient
import java.util.Locale
import java.util.concurrent.TimeUnit

class MainViewModel(application: Application) : AndroidViewModel(application) {
    private val okHttpClient = OkHttpClient.Builder()
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .build()
    private val repository = FmDxRepository(okHttpClient)
    private val audioPlayer = WebSocketAudioPlayer(application, okHttpClient)

    private val _uiState = MutableStateFlow(UiState(spectrum = baselineSpectrum()))
    val uiState: StateFlow<UiState> = _uiState

    private val commandFlow = MutableSharedFlow<String>(extraBufferCapacity = 64, onBufferOverflow = BufferOverflow.DROP_OLDEST)

    private var controlConnection: ControlConnection? = null
    private var pluginConnection: PluginConnection? = null
    private var commandJob: Job? = null
    private var pingJob: Job? = null

    private val europeProgrammes = listOf(
        "No PTY", "News", "Current Affairs", "Info",
        "Sport", "Education", "Drama", "Culture", "Science", "Varied",
        "Pop M", "Rock M", "Easy Listening", "Light Classical",
        "Serious Classical", "Other Music", "Weather", "Finance",
        "Children's Programmes", "Social Affairs", "Religion", "Phone-in",
        "Travel", "Leisure", "Jazz Music", "Country Music", "National Music",
        "Oldies Music", "Folk Music", "Documentary", "Alarm Test"
    )

    fun updateServerUrl(url: String) {
        _uiState.update { it.copy(serverUrl = url) }
    }

    fun connect() {
        val rawUrl = _uiState.value.serverUrl
        if (rawUrl.isBlank()) {
            _uiState.update { it.copy(errorMessage = "Server URL is required") }
            return
        }
        val sanitized = sanitizeUrl(rawUrl)
        viewModelScope.launch {
            try {
                val info = repository.fetchTunerInfo(sanitized, BuildConfig.USER_AGENT)
                _uiState.update {
                    it.copy(
                        serverUrl = sanitized,
                        tunerInfo = info,
                        antennas = info.antennaNames,
                        tunerState = it.tunerState,
                        errorMessage = null,
                        isConnected = true
                    )
                }
                startControlConnection(sanitized)
                startPluginConnection(sanitized)
                startPing(sanitized)
                refreshSpectrum(sanitized)
            } catch (ex: Exception) {
                _uiState.update { it.copy(errorMessage = ex.message, isConnected = false) }
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
        viewModelScope.launch { audioPlayer.stop() }
        _uiState.update {
            it.copy(
                isConnected = false,
                audioPlaying = false,
                statusMessage = "Disconnected"
            )
        }
    }

    fun toggleAudio() {
        val url = _uiState.value.serverUrl
        if (url.isBlank()) return
        viewModelScope.launch {
            if (audioPlayer.isPlaying()) {
                audioPlayer.stop()
                _uiState.update { it.copy(audioPlaying = false) }
            } else {
                try {
                    audioPlayer.play(url, BuildConfig.USER_AGENT) { error ->
                        viewModelScope.launch {
                            _uiState.update {
                                it.copy(errorMessage = error.message, audioPlaying = false)
                            }
                        }
                    }
                    _uiState.update { it.copy(audioPlaying = true, statusMessage = "Audio playing") }
                } catch (ex: Exception) {
                    _uiState.update { it.copy(errorMessage = ex.message, audioPlaying = false) }
                }
            }
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

    fun refresh() {
        val current = _uiState.value.tunerState?.freqKHz ?: return
        sendCommand("T$current")
        resetRds()
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
        _uiState.update { it.copy(spectrum = ensureSpectrum(points ?: it.spectrum)) }
    }

    private fun startControlConnection(url: String) {
        controlConnection?.close()
        commandJob?.cancel()
        val connection = repository.connectControl(
            url,
            BuildConfig.USER_AGENT,
            viewModelScope,
            onState = { state ->
                _uiState.update {
                    it.copy(
                        tunerState = state,
                        statusMessage = "Updated ${System.currentTimeMillis()}",
                        antennas = if (it.antennas.isEmpty() && it.tunerInfo != null) it.tunerInfo.antennaNames else it.antennas
                    )
                }
            },
            onClosed = {
                _uiState.update { it.copy(isConnected = false) }
            },
            onError = { error ->
                _uiState.update { it.copy(errorMessage = error.message) }
            }
        )
        controlConnection = connection
        commandJob = viewModelScope.launch {
            commandFlow.collect { cmd ->
                connection.send(cmd)
            }
        }
    }

    private fun startPluginConnection(url: String) {
        pluginConnection?.close()
        pluginConnection = repository.connectPlugin(url, BuildConfig.USER_AGENT) { error ->
            _uiState.update { it.copy(errorMessage = error.message) }
        }
    }

    private fun startPing(url: String) {
        pingJob?.cancel()
        pingJob = viewModelScope.launch {
            while (true) {
                val ping = try {
                    repository.ping(url, BuildConfig.USER_AGENT)
                } catch (ex: Exception) {
                    _uiState.update { it.copy(errorMessage = ex.message) }
                    null
                }
                ping?.let { value ->
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
        viewModelScope.launch { audioPlayer.release() }
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
        return input.trim().lowercase(Locale.US).replace("#", "").replace("?", "")
    }

    private fun ensureSpectrum(points: List<SpectrumPoint>): List<SpectrumPoint> {
        return if (points.isEmpty()) baselineSpectrum() else points
    }

    companion object {
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
}

data class UiState(
    val serverUrl: String = "",
    val tunerInfo: TunerInfo? = null,
    val tunerState: TunerState? = null,
    val pingMs: Long? = null,
    val audioPlaying: Boolean = false,
    val isConnected: Boolean = false,
    val antennas: List<String> = emptyList(),
    val spectrum: List<SpectrumPoint> = emptyList(),
    val isScanning: Boolean = false,
    val errorMessage: String? = null,
    val signalUnit: SignalUnit = SignalUnit.DBF,
    val statusMessage: String? = null
)

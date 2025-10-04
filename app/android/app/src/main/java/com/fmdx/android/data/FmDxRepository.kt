package com.fmdx.android.data

import android.util.Log
import com.fmdx.android.BuildConfig
import com.fmdx.android.model.SpectrumPoint
import com.fmdx.android.model.TunerInfo
import com.fmdx.android.model.TunerState
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import org.jsoup.Jsoup
import org.jsoup.nodes.Document
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

class FmDxRepository(
    val client: OkHttpClient
) {
    fun connectControl(
        baseUrl: String,
        userAgent: String,
        scope: CoroutineScope,
        onState: (TunerState) -> Unit,
        onClosed: () -> Unit,
        onError: (Throwable) -> Unit
    ): ControlConnection {
        val wsUrl = buildWebSocketUrl(baseUrl, "text")
        logDebug("connectControl(): opening $wsUrl")
        val request = Request.Builder()
            .url(wsUrl)
            .header("User-Agent", "$userAgent (control)")
            .build()
        val commandChannel = Channel<String>(capacity = Channel.UNLIMITED)
        lateinit var connection: ControlConnection
        val webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                logDebug("control socket: open with response=${response.code}")
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                logDebug("control socket: message length=${text.length}")
                try {
                    val state = TunerState.fromJson(text)
                    onState(state)
                } catch (t: Throwable) {
                    logDebug("control socket: failed to parse message", t)
                    onError(t)
                }
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                logDebug("control socket: closing code=$code reason=$reason")
                webSocket.close(code, reason)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                logDebug("control socket: closed code=$code reason=$reason")
                onClosed()
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                logDebug("control socket: failure code=${response?.code}", t)
                onError(t)
                onClosed()
            }
        })
        connection = ControlConnection(webSocket, commandChannel)
        scope.launch {
            for (command in commandChannel) {
                logDebug("control socket: sending queued command=$command")
                if (!webSocket.send(command)) {
                    logDebug("control socket: command send failed")
                    break
                }
                delay(COMMAND_THROTTLE_MS)
            }
        }
        return connection
    }

    fun connectPlugin(
        baseUrl: String,
        userAgent: String,
        onError: (Throwable) -> Unit
    ): PluginConnection {
        val wsUrl = buildWebSocketUrl(baseUrl, "data_plugins")
        logDebug("connectPlugin(): opening $wsUrl")
        val request = Request.Builder()
            .url(wsUrl)
            .header("User-Agent", "$userAgent (plugin)")
            .build()
        val webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                logDebug("plugin socket: open with response=${response.code}")
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                logDebug("plugin socket: failure code=${response?.code}", t)
                onError(t)
            }
        })
        return PluginConnection(webSocket)
    }

    suspend fun fetchTunerInfo(url: String, userAgent: String): TunerInfo {
        logDebug("fetchTunerInfo(): requesting metadata from $url")
        val httpUrl = url.toHttpUrlOrNull() ?: throw IllegalArgumentException("Invalid URL")
        val staticUrl = httpUrl.newBuilder()
            .addPathSegments("static_data")
            .build()

        var tunerName = ""
        var tunerDesc = ""
        var activeAnt: Int? = null
        val antennaNames = mutableListOf<String>()

        try {
            client.newCall(
                Request.Builder()
                    .url(staticUrl)
                    .header("User-Agent", userAgent)
                    .build()
            ).execute().use { response ->
                if (response.isSuccessful) {
                    val body = response.body?.string()
                    if (!body.isNullOrBlank()) {
                        val json = JSONObject(body)
                        tunerName = json.optString("tunerName", tunerName)
                        tunerDesc = json.optString("tunerDesc", tunerDesc)
                        activeAnt = when {
                            json.has("antSel") -> json.optInt("antSel")
                            json.has("activeAnt") -> json.optInt("activeAnt")
                            json.optJSONObject("ant")?.has("active") == true ->
                                json.optJSONObject("ant")?.optInt("active")
                            else -> activeAnt
                        }
                        json.optJSONObject("ant")?.optJSONArray("names")?.let { arr ->
                            for (i in 0 until arr.length()) {
                                arr.optString(i)?.takeIf { it.isNotBlank() }?.let(antennaNames::add)
                            }
                        }
                    }
                }
            }
        } catch (_: IOException) {
            // ignore static data fetch errors
        }

        logDebug("fetchTunerInfo(): scraping fallback HTML")
        val document: Document = Jsoup.connect(url)
            .userAgent(userAgent)
            .timeout(TIMEOUT_MS.toInt())
            .get()
        if (tunerName.isBlank()) {
            tunerName = document.selectFirst("meta[property=og:title]")?.attr("content")
                ?.replace("FM-DX WebServer ", "")
                ?.trim()
                ?: ""
        }
        if (tunerDesc.isBlank()) {
            tunerDesc = document.selectFirst("meta[property=og:description]")?.attr("content")
                ?.replace("Server description: ", "")
                ?.trim()
                ?: ""
        }
        if (antennaNames.isEmpty()) {
            val elements = document.select("#data-ant ul.options li, #data-ant li")
            elements.forEach { el ->
                val text = el.text().trim()
                if (text.isNotEmpty()) {
                    antennaNames += text
                }
            }
        }
        if (antennaNames.isEmpty()) {
            if (document.selectFirst("#data-ant-container") != null || document.selectFirst("#data-ant") != null) {
                antennaNames += "Default"
            }
        }
        if (antennaNames.isEmpty()) {
            antennaNames += "Default"
        }
        val active = activeAnt ?: 0
        return TunerInfo(
            tunerName = tunerName,
            tunerDescription = tunerDesc,
            antennaNames = antennaNames,
            activeAntenna = active
        )
    }

    suspend fun ping(url: String, userAgent: String): Long {
        logDebug("ping(): sending request to $url")
        val httpUrl = url.toHttpUrlOrNull() ?: throw IllegalArgumentException("Invalid URL")
        val pingUrl = httpUrl.newBuilder()
            .addPathSegments("ping")
            .build()
        val request = Request.Builder().url(pingUrl).header("User-Agent", userAgent).build()
        val start = System.nanoTime()
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                throw IOException("Ping failed: ${response.code}")
            }
        }
        val end = System.nanoTime()
        return TimeUnit.NANOSECONDS.toMillis(end - start)
    }

    suspend fun fetchSpectrumData(url: String, userAgent: String): List<SpectrumPoint>? {
        logDebug("fetchSpectrumData(): requesting data from $url")
        val httpUrl = url.toHttpUrlOrNull() ?: return null
        val spectrumUrl = httpUrl.newBuilder()
            .addPathSegments("spectrum-graph-plugin")
            .build()
        val request = Request.Builder()
            .url(spectrumUrl)
            .header("User-Agent", userAgent)
            .header("X-Plugin-Name", "SpectrumGraphPlugin")
            .build()
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) {
                logDebug("fetchSpectrumData(): request failed code=${response.code}")
                return null
            }
            val body = response.body?.string() ?: return null
            val json = JSONObject(body)
            val dataset = when {
                json.optString("sd").isNotBlank() -> json.optString("sd")
                json.has("ad") -> {
                    val ad = json.optInt("ad")
                    json.optString("sd$ad")
                }
                else -> null
            } ?: return null
            return dataset.split(',')
                .mapNotNull { pair ->
                    val parts = pair.split('=')
                    if (parts.size != 2) return@mapNotNull null
                    val freq = parts[0].toDoubleOrNull()?.div(1000.0)
                    val sig = parts[1].toDoubleOrNull()
                    if (freq != null && sig != null) SpectrumPoint(freq, sig) else null
                }
        }
    }

    companion object {
        private const val COMMAND_THROTTLE_MS = 125L
        private const val TIMEOUT_MS = 10000L
        private const val TAG = "FmDxRepository"
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

class ControlConnection internal constructor(
    private val webSocket: WebSocket,
    private val channel: Channel<String>
) {
    fun send(command: String) {
        channel.trySend(command)
    }

    fun close() {
        channel.close()
        webSocket.close(1000, null)
    }
}

class PluginConnection internal constructor(
    private val webSocket: WebSocket
) {
    fun requestSpectrumScan() {
        val payload = """{"type":"spectrum-graph","action":"scan","value":{"status":"scan"}}"""
        webSocket.send(payload)
    }

    fun close() {
        webSocket.close(1000, null)
    }
}

fun buildWebSocketUrl(url: String, vararg pathSegments: String): String {
    val httpUrl = url.toHttpUrlOrNull() ?: throw IllegalArgumentException("Invalid server URL")
    val builder = httpUrl.newBuilder()
    pathSegments.forEach { segment ->
        if (segment.isNotEmpty()) {
            builder.addPathSegment(segment.trim('/'))
        }
    }
    val built = builder.build()
    val httpString = built.toString()
    val normalized = if (pathSegments.isEmpty() && built.encodedPath == "/") {
        httpString.removeSuffix("/")
    } else {
        httpString
    }
    val httpScheme = built.scheme
    val wsScheme = if (httpScheme.equals("https", ignoreCase = true)) "wss" else "ws"
    return normalized.replaceFirst("$httpScheme://", "$wsScheme://")
}

fun formatWebSocketUrl(url: String): String = buildWebSocketUrl(url)

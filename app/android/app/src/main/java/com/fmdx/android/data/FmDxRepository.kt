package com.fmdx.android.data

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
import okhttp3.internal.closeQuietly
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
        val wsUrl = "${formatWebSocketUrl(baseUrl)}/text"
        val request = Request.Builder()
            .url(wsUrl)
            .header("User-Agent", "$userAgent (control)")
            .build()
        val commandChannel = Channel<String>(capacity = Channel.UNLIMITED)
        lateinit var connection: ControlConnection
        val webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onMessage(webSocket: WebSocket, text: String) {
                try {
                    val state = TunerState.fromJson(text)
                    onState(state)
                } catch (t: Throwable) {
                    onError(t)
                }
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                webSocket.close(code, reason)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                onClosed()
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                onError(t)
                onClosed()
            }
        })
        connection = ControlConnection(webSocket, commandChannel)
        scope.launch {
            for (command in commandChannel) {
                if (!webSocket.send(command)) {
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
        val wsUrl = "${formatWebSocketUrl(baseUrl)}/data_plugins"
        val request = Request.Builder()
            .url(wsUrl)
            .header("User-Agent", "$userAgent (plugin)")
            .build()
        val webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                onError(t)
            }
        })
        return PluginConnection(webSocket)
    }

    suspend fun fetchTunerInfo(url: String, userAgent: String): TunerInfo {
        val httpUrl = url.toHttpUrlOrNull() ?: throw IllegalArgumentException("Invalid URL")
        val staticUrl = httpUrl.newBuilder().apply {
            if (encodedPath.endsWith('/')) {
                addPathSegment("static_data")
            } else {
                addPathSegment("")
                addPathSegment("static_data")
            }
        }.build()

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
        val httpUrl = url.toHttpUrlOrNull() ?: throw IllegalArgumentException("Invalid URL")
        val pingUrl = httpUrl.newBuilder().apply {
            if (!encodedPath.endsWith('/')) {
                addPathSegment("")
            }
            addPathSegment("ping")
        }.build()
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
        val httpUrl = url.toHttpUrlOrNull() ?: return null
        val spectrumUrl = httpUrl.newBuilder().apply {
            if (!encodedPath.endsWith('/')) {
                addPathSegment("")
            }
            addPathSegment("spectrum-graph-plugin")
        }.build()
        val request = Request.Builder()
            .url(spectrumUrl)
            .header("User-Agent", userAgent)
            .header("X-Plugin-Name", "SpectrumGraphPlugin")
            .build()
        client.newCall(request).execute().use { response ->
            if (!response.isSuccessful) return null
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
        webSocket.closeQuietly(1000, null)
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
        webSocket.closeQuietly(1000, null)
    }
}

fun formatWebSocketUrl(url: String): String {
    var trimmed = url.trim()
    if (trimmed.endsWith('/')) trimmed = trimmed.dropLast(1)
    return when {
        trimmed.startsWith("http://", ignoreCase = true) ->
            "ws://" + trimmed.removePrefix("http://")
        trimmed.startsWith("https://", ignoreCase = true) ->
            "wss://" + trimmed.removePrefix("https://")
        else -> trimmed
    }
}

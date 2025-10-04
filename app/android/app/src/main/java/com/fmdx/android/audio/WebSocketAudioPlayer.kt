package com.fmdx.android.audio

import android.net.Uri
import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.BaseDataSource
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSpec
import androidx.media3.exoplayer.drm.DrmSessionManagerProvider
import androidx.media3.exoplayer.source.MediaSource
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import androidx.media3.exoplayer.upstream.LoadErrorHandlingPolicy
import com.fmdx.android.data.buildWebSocketUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString.Companion.toByteString
import java.io.IOException
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import kotlin.math.min

@UnstableApi
class WebSocketMediaSourceFactory(
    private val client: OkHttpClient,
    private val userAgent: String,
    private val networkBuffer: Int,
    private val onError: (Throwable) -> Unit
) : MediaSource.Factory {

    override fun setDrmSessionManagerProvider(drmSessionManagerProvider: DrmSessionManagerProvider): MediaSource.Factory {
        return this
    }

    override fun setLoadErrorHandlingPolicy(loadErrorHandlingPolicy: LoadErrorHandlingPolicy): MediaSource.Factory {
        return this
    }

    override fun createMediaSource(mediaItem: MediaItem): MediaSource {
        val baseUrl = mediaItem.mediaId ?: throw IllegalArgumentException("mediaId must be set to the base URL")
        val wsUrl = buildWebSocketUrl(baseUrl, "audio")
        val dataSourceFactory = DataSource.Factory {
            WebSocketStreamDataSource(client, wsUrl, userAgent, networkBuffer, onError)
        }
        val richMediaItem = mediaItem.buildUpon()
            .setUri(wsUrl)
            .setMimeType(MimeTypes.AUDIO_MPEG)
            .setLiveConfiguration(
                MediaItem.LiveConfiguration.Builder()
                    .setTargetOffsetMs(500)
                    .build()
            )
            .build()
        return ProgressiveMediaSource.Factory(dataSourceFactory)
            .createMediaSource(richMediaItem)
    }

    override fun getSupportedTypes(): IntArray {
        return intArrayOf(C.TYPE_OTHER)
    }
}

@UnstableApi
private class WebSocketStreamDataSource(
    private val client: OkHttpClient,
    private val url: String,
    private val userAgent: String,
    private val networkBuffer: Int,
    private val onError: (Throwable) -> Unit
) : BaseDataSource(true) {
    private val queue = LinkedBlockingQueue<ByteArray>(networkBuffer)
    private val endMarker = ByteArray(0)
    private var currentBuffer: ByteArray? = null
    private var bufferPosition = 0
    private var webSocket: WebSocket? = null
    private var closed = false
    private var failure: Throwable? = null
    private var dataSpec: DataSpec? = null

    override fun open(dataSpec: DataSpec): Long {
        this.dataSpec = dataSpec
        transferInitializing(dataSpec)
        transferStarted(dataSpec)
        val request = Request.Builder()
            .url(url)
            .header("User-Agent", "$userAgent (audio)")
            .build()
        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                webSocket.send("{\"type\":\"fallback\",\"data\":\"mp3\"}".encodeToByteArray().toByteString())
            }

            override fun onMessage(webSocket: WebSocket, bytes: okio.ByteString) {
                val packet = bytes.toByteArray()
                while (!queue.offer(packet)) {
                    queue.poll()
                }
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                while (!queue.offer(endMarker)) {
                    queue.poll()
                }
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                failure = t
                onError(t)
                while (!queue.offer(endMarker)) {
                    queue.poll()
                }
            }
        })
        return C.LENGTH_UNSET.toLong()
    }

    override fun getUri(): Uri? {
        return dataSpec?.uri
    }

    override fun read(buffer: ByteArray, offset: Int, readLength: Int): Int {
        while (true) {
            val data = currentBuffer
            if (data != null && bufferPosition < data.size) {
                val toCopy = min(readLength, data.size - bufferPosition)
                System.arraycopy(data, bufferPosition, buffer, offset, toCopy)
                bufferPosition += toCopy
                bytesTransferred(toCopy)
                return toCopy
            }
            val next = queue.poll(1, TimeUnit.SECONDS) ?: continue
            if (next === endMarker) {
                failure?.let { throw IOException("Audio stream error", it) }
                return C.RESULT_END_OF_INPUT
            }
            currentBuffer = next
            bufferPosition = 0
        }
    }

    override fun close() {
        if (closed) return
        closed = true
        webSocket?.close(1000, null)
        while (!queue.offer(endMarker)) {
            queue.poll()
        }
        currentBuffer = null
        bufferPosition = 0
        transferEnded()
    }

    fun shutdown() {
        close()
    }
}

package com.fmdx.android.audio

import android.content.Context
import android.net.Uri
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.datasource.BaseDataSource
import androidx.media3.datasource.DataSource
import androidx.media3.datasource.DataSpec
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import com.fmdx.android.data.formatWebSocketUrl
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
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

class WebSocketAudioPlayer(
    private val context: Context,
    private val client: OkHttpClient
) {
    private val mutex = Mutex()
    private var player: ExoPlayer? = null
    private var currentDataSource: WebSocketStreamDataSource? = null

    suspend fun play(
        baseUrl: String,
        userAgent: String,
        onError: (Throwable) -> Unit
    ) {
        mutex.withLock {
            stopLocked()
            val wsUrl = "${formatWebSocketUrl(baseUrl)}/audio"
            val factory = DataSource.Factory {
                WebSocketStreamDataSource(client, wsUrl, userAgent, onError).also {
                    currentDataSource = it
                }
            }
            val mediaItem = MediaItem.Builder()
                .setUri(wsUrl)
                .setMimeType(MimeTypes.AUDIO_MPEG)
                .build()
            val mediaSource = ProgressiveMediaSource.Factory(factory).createMediaSource(mediaItem)
            val exoPlayer = ExoPlayer.Builder(context).build()
            exoPlayer.addListener(object : Player.Listener {
                override fun onPlayerError(error: PlaybackException) {
                    onError(error)
                }
            })
            exoPlayer.setMediaSource(mediaSource)
            exoPlayer.prepare()
            exoPlayer.playWhenReady = true
            player = exoPlayer
        }
    }

    suspend fun stop() {
        mutex.withLock {
            stopLocked()
        }
    }

    fun isPlaying(): Boolean = player?.isPlaying == true

    private fun stopLocked() {
        player?.release()
        player = null
        currentDataSource?.shutdown()
        currentDataSource = null
    }

    suspend fun release() {
        stop()
    }
}

private class WebSocketStreamDataSource(
    private val client: OkHttpClient,
    private val url: String,
    private val userAgent: String,
    private val onError: (Throwable) -> Unit
) : BaseDataSource(true) {
    private val queue = LinkedBlockingQueue<ByteArray>()
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
                queue.offer(bytes.toByteArray())
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                queue.offer(endMarker)
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                failure = t
                onError(t)
                queue.offer(endMarker)
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
        queue.offer(endMarker)
        currentBuffer = null
        bufferPosition = 0
        transferEnded()
    }

    fun shutdown() {
        close()
    }
}

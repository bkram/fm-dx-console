package com.fmdx.android.audio

import android.content.Context
import android.content.Intent
import androidx.annotation.OptIn
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.MediaSession
import androidx.media3.session.MediaSessionService
import com.fmdx.android.BuildConfig
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import okhttp3.OkHttpClient

@OptIn(UnstableApi::class)
class PlaybackService : MediaSessionService() {
    private var mediaSession: MediaSession? = null

    override fun onCreate() {
        super.onCreate()
        val preferences = getSharedPreferences("fm_dx_prefs", Context.MODE_PRIVATE)
        val networkBuffer = preferences.getInt("network_buffer", 2)
        val playerBuffer = preferences.getInt("player_buffer", 2000)

        val client = OkHttpClient.Builder().build()
        val webSocketMediaSourceFactory = WebSocketMediaSourceFactory(client, BuildConfig.USER_AGENT, networkBuffer) { error ->
            // TODO: Handle error
        }
        val loadControl = DefaultLoadControl.Builder()
            .setBufferDurationsMs(
                /* minBufferMs = */ playerBuffer,
                /* maxBufferMs = */ playerBuffer * 2,
                /* bufferForPlaybackMs = */ playerBuffer / 2,
                /* bufferForPlaybackAfterRebufferMs = */ playerBuffer
            )
            .build()
        val player = ExoPlayer.Builder(this)
            .setMediaSourceFactory(webSocketMediaSourceFactory)
            .setLoadControl(loadControl)
            .build()
        mediaSession = MediaSession.Builder(this, player)
            .setCallback(PlaybackCallback())
            .build()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaSession? = mediaSession

    override fun onTaskRemoved(rootIntent: Intent?) {
        mediaSession?.player?.let { player ->
            if (!player.playWhenReady || player.mediaItemCount == 0) {
                stopSelf()
            }
        }
    }

    override fun onDestroy() {
        mediaSession?.run {
            player.release()
            release()
            mediaSession = null
        }
        super.onDestroy()
    }

    private inner class PlaybackCallback : MediaSession.Callback {
        override fun onPlaybackResumption(
            mediaSession: MediaSession,
            controller: MediaSession.ControllerInfo
        ): ListenableFuture<MediaSession.MediaItemsWithStartPosition> {
            val player = mediaSession.player
            player.play()
            val mediaItems = mutableListOf<MediaItem>()
            for (i in 0 until player.mediaItemCount) {
                mediaItems.add(player.getMediaItemAt(i))
            }
            return Futures.immediateFuture(
                MediaSession.MediaItemsWithStartPosition(
                    mediaItems,
                    player.currentMediaItemIndex,
                    player.currentPosition
                )
            )
        }

        override fun onSetMediaItems(
            mediaSession: MediaSession,
            controller: MediaSession.ControllerInfo,
            mediaItems: MutableList<MediaItem>,
            startWindowIndex: Int,
            startPositionMs: Long
        ): ListenableFuture<MediaSession.MediaItemsWithStartPosition> {
            val player = mediaSession.player
            player.setMediaItems(mediaItems, startWindowIndex, startPositionMs)
            return Futures.immediateFuture(
                MediaSession.MediaItemsWithStartPosition(
                    mediaItems,
                    startWindowIndex,
                    startPositionMs
                )
            )
        }
    }
}

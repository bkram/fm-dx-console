// Chromium audio output adapter. UI updates are supplied as callbacks.
const AUDIO_MIME = 'audio/mpeg';

export function createAudioPlayer(wsUrl, { onStats = () => {}, onStopped = () => {} } = {}) {
  if (typeof MediaSource === 'undefined' || !MediaSource.isTypeSupported(AUDIO_MIME)) {
    console.error('MediaSource cannot decode', AUDIO_MIME);
    return null;
  }

  const player = {
    ws: null,
    mediaSource: new MediaSource(),
    sourceBuffer: null,
    queue: [],
    audio: new Audio(),
    objectUrl: null,
    stopped: false,
    started: false,
    rateTimer: null,
    queueBytes: 0,
    bytesIn: 0,
    bytesPrev: 0,
    bytesAt: 0
  };

  player.audio.preload = 'auto';
  player.audio.autoplay = false;
  player.objectUrl = URL.createObjectURL(player.mediaSource);
  player.audio.src = player.objectUrl;

  const drain = () => {
    if (player.stopped || !player.sourceBuffer || player.sourceBuffer.updating) return;
    const buffered = player.sourceBuffer.buffered;
    if (buffered.length && player.audio.currentTime - buffered.start(0) > 30) {
      player.sourceBuffer.remove(buffered.start(0), player.audio.currentTime - 10);
      return;
    }
    if (player.queue.length === 0) return;
    const chunk = player.queue.shift();
    player.queueBytes -= chunk.byteLength;
    try { player.sourceBuffer.appendBuffer(chunk); }
    catch (err) { console.warn('MSE append failed:', err.message); }
  };

  // Gentle drift control + LCD live indicators (bitrate / buffer %).
  const tickRate = () => {
    if (!player.sourceBuffer || player.audio.paused) {
      onStats({ buffer: null });
      return;
    }

    // Bitrate from incoming byte rate.
    const now = performance.now();
    if (player.bytesAt && now - player.bytesAt >= 800) {
      const deltaBytes = player.bytesIn - player.bytesPrev;
      const deltaMs = now - player.bytesAt;
      const kbps = Math.round((deltaBytes * 8) / deltaMs);
      onStats({ bitrate: kbps });
      player.bytesPrev = player.bytesIn;
      player.bytesAt = now;
    }

    if (player.audio.buffered.length === 0) {
      onStats({ buffer: 0 });
      return;
    }
    const end = player.audio.buffered.end(player.audio.buffered.length - 1);
    const behind = end - player.audio.currentTime;
    const raw = Math.max(0, Math.min(100, (behind / 2.0) * 100));
    // EMA smooths flicker as playbackRate nudges currentTime around.
    player.bufferEma = player.bufferEma == null ? raw : (player.bufferEma * 0.7 + raw * 0.3);
    onStats({ buffer: Math.round(player.bufferEma) });

    if (behind > 2.5)      player.audio.playbackRate = 1.10;
    else if (behind > 1.2) player.audio.playbackRate = 1.04;
    else if (behind < 0.3) player.audio.playbackRate = 0.98;
    else                   player.audio.playbackRate = 1.00;
  };

  player.mediaSource.addEventListener('sourceopen', () => {
    if (player.stopped || player.sourceBuffer) return;
    try {
      player.sourceBuffer = player.mediaSource.addSourceBuffer(AUDIO_MIME);
      player.sourceBuffer.mode = 'sequence';
      player.sourceBuffer.addEventListener('updateend', drain);
    } catch (err) {
      console.error('MSE addSourceBuffer failed:', err);
      return;
    }
    drain();
    // Wait for enough buffer before starting play so we don't stall.
    player.audio.addEventListener('canplay', () => {
      if (player.stopped || player.started) return;
      player.started = true;
      player.audio.play()
        .then(() => { if (!player.stopped) player.rateTimer = setInterval(tickRate, 500); })
        .catch(err => console.warn('Audio play failed:', err));
    }, { once: true });
  }, { once: true });

  player.ws = new WebSocket(wsUrl);
  player.ws.binaryType = 'arraybuffer';
  player.ws.onopen = () => {
    player.ws.send(JSON.stringify({ type: 'fallback', data: 'mp3' }));
  };
  player.ws.onmessage = (ev) => {
    if (player.stopped || !(ev.data instanceof ArrayBuffer) || ev.data.byteLength > 1024 * 1024) return;
    player.bytesIn += ev.data.byteLength;
    if (!player.bytesAt) { player.bytesAt = performance.now(); player.bytesPrev = 0; }
    while (player.queue.length && player.queueBytes + ev.data.byteLength > 1024 * 1024) {
      player.queueBytes -= player.queue.shift().byteLength;
    }
    player.queue.push(new Uint8Array(ev.data));
    player.queueBytes += ev.data.byteLength;
    drain();
  };
  player.ws.onerror = (err) => console.warn('Audio WS error:', err);
  player.ws.onclose = () => {
    if (!player.stopped) {
      player.stop();
      onStopped();
    }
  };

  player.stop = () => {
    player.stopped = true;
    if (player.rateTimer) { clearInterval(player.rateTimer); player.rateTimer = null; }
    if (player.ws) {
      player.ws.onclose = null;
      try { player.ws.close(); } catch (_) {}
      player.ws = null;
    }
    player.queue = [];
    player.queueBytes = 0;
    if (player.sourceBuffer && player.mediaSource.readyState === 'open') {
      try { player.sourceBuffer.abort(); } catch (_) {}
      try { player.mediaSource.endOfStream(); } catch (_) {}
    }
    if (player.audio) {
      player.audio.playbackRate = 1.0;
      player.audio.pause();
      player.audio.removeAttribute('src');
      player.audio.load();
    }
    if (player.objectUrl) URL.revokeObjectURL(player.objectUrl);
  };

  return player;
}


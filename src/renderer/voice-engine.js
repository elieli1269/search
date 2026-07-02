class VoiceIntentEngine {
  constructor({ onTranscript, onState, onTick }) {
    this.onTranscript = onTranscript;
    this.onState = onState;
    this.onTick = onTick;
    this.mediaRecorder = null;
    this.stream = null;
    this.chunks = [];
    this.recording = false;
    this.cancelled = false;
    this.maxTimer = null;
    this.tickTimer = null;
    this.startedAt = 0;
    this.maxDurationMs = 20000;
  }

  async startPushToTalk() {
    if (this.recording) return;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: false
    });
    this.chunks = [];
    this.cancelled = false;
    this.startedAt = Date.now();
    this.mediaRecorder = new MediaRecorder(this.stream, {
      mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : undefined
    });
    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size) this.chunks.push(event.data);
    };
    this.mediaRecorder.onstop = () => this.flush();
    this.mediaRecorder.start(250);
    this.recording = true;
    this.onState('listening');
    this.emitTick();
    this.tickTimer = setInterval(() => this.emitTick(), 250);
    this.maxTimer = setTimeout(() => this.stopPushToTalk(), this.maxDurationMs);
  }

  stopPushToTalk() {
    if (!this.recording || !this.mediaRecorder) return;
    this.recording = false;
    clearTimeout(this.maxTimer);
    clearInterval(this.tickTimer);
    this.onState('thinking');
    this.mediaRecorder.stop();
  }

  cancelPushToTalk() {
    if (!this.recording || !this.mediaRecorder) return;
    this.cancelled = true;
    this.chunks = [];
    this.recording = false;
    clearTimeout(this.maxTimer);
    clearInterval(this.tickTimer);
    this.mediaRecorder.stop();
  }

  togglePushToTalk() {
    if (this.recording) this.stopPushToTalk();
    else this.startPushToTalk();
  }

  emitTick() {
    if (!this.onTick) return;
    this.onTick({
      elapsedMs: Date.now() - this.startedAt,
      maxDurationMs: this.maxDurationMs,
      recording: this.recording
    });
  }

  async flush() {
    const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
    this.stopStream();
    if (this.cancelled) {
      this.cancelled = false;
      this.onTick?.({ elapsedMs: 0, maxDurationMs: this.maxDurationMs, recording: false });
      return this.onState('idle');
    }
    if (!this.chunks.length) return this.onState('idle');
    const blob = new Blob(this.chunks, { type: mimeType });
    const base64 = await this.blobToBase64(blob);
    try {
      const text = await window.semanticBrowser.voice.transcribe({ base64, mimeType: blob.type });
      if (text.trim()) await this.onTranscript(text.trim());
    } catch (error) {
      this.onTranscript(`Erreur transcription: ${error.message}`);
    } finally {
      this.onTick?.({ elapsedMs: 0, maxDurationMs: this.maxDurationMs, recording: false });
      this.onState('idle');
    }
  }

  stopStream() {
    if (this.stream) this.stream.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.mediaRecorder = null;
  }

  blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result).split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}

window.VoiceIntentEngine = VoiceIntentEngine;

class VoiceIntentEngine {
  constructor({ onTranscript, onState }) {
    this.onTranscript = onTranscript;
    this.onState = onState;
    this.mediaRecorder = null;
    this.stream = null;
    this.chunks = [];
    this.recording = false;
    this.maxTimer = null;
  }

  async startPushToTalk() {
    if (this.recording) return;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: false
    });
    this.chunks = [];
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
    this.maxTimer = setTimeout(() => this.stopPushToTalk(), 20000);
  }

  stopPushToTalk() {
    if (!this.recording || !this.mediaRecorder) return;
    this.recording = false;
    clearTimeout(this.maxTimer);
    this.onState('thinking');
    this.mediaRecorder.stop();
  }

  togglePushToTalk() {
    if (this.recording) this.stopPushToTalk();
    else this.startPushToTalk();
  }

  async flush() {
    const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
    this.stopStream();
    if (!this.chunks.length) return this.onState('idle');
    const blob = new Blob(this.chunks, { type: mimeType });
    const base64 = await this.blobToBase64(blob);
    try {
      const text = await window.semanticBrowser.voice.transcribe({ base64, mimeType: blob.type });
      if (text.trim()) await this.onTranscript(text.trim());
    } catch (error) {
      this.onTranscript(`Erreur transcription: ${error.message}`);
    } finally {
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

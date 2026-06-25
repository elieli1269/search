class VoiceIntentEngine {
  constructor({ onTranscript, onState }) {
    this.onTranscript = onTranscript;
    this.onState = onState;
    this.mediaRecorder = null;
    this.audioContext = null;
    this.analyser = null;
    this.chunks = [];
    this.speaking = false;
    this.silenceFrames = 0;
  }

  async start() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
    this.audioContext = new AudioContext();
    const source = this.audioContext.createMediaStreamSource(stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 1024;
    source.connect(this.analyser);
    this.mediaRecorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : undefined });
    this.mediaRecorder.ondataavailable = (event) => { if (event.data.size) this.chunks.push(event.data); };
    this.mediaRecorder.onstop = () => this.flush();
    this.loop();
  }

  loop() {
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(data);
    const energy = data.reduce((sum, value) => sum + value, 0) / data.length;

    if (energy > 18 && !this.speaking) {
      this.speaking = true;
      this.silenceFrames = 0;
      this.chunks = [];
      this.mediaRecorder.start(250);
      this.onState('listening');
    } else if (this.speaking && energy < 10) {
      this.silenceFrames += 1;
      if (this.silenceFrames > 28) {
        this.speaking = false;
        this.mediaRecorder.stop();
        this.onState('thinking');
      }
    } else if (this.speaking) {
      this.silenceFrames = 0;
    }

    requestAnimationFrame(() => this.loop());
  }

  async flush() {
    if (!this.chunks.length) return this.onState('idle');
    const blob = new Blob(this.chunks, { type: this.mediaRecorder.mimeType || 'audio/webm' });
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

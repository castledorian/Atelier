// Effets sonores 100 % synthétisés (WebAudio) : aucune ressource à charger.
export type SfxName =
  | 'key'
  | 'hit'
  | 'kill'
  | 'bigkill'
  | 'ding'
  | 'error'
  | 'breach'
  | 'sweep'
  | 'mult'
  | 'ready'
  | 'wave'
  | 'clear'
  | 'over'
  | 'start';

export class Sfx {
  enabled = true;
  private ac: AudioContext | null = null;
  private out: GainNode | null = null;
  private noise: AudioBuffer | null = null;

  /** À appeler depuis un geste utilisateur (clic, touche) pour débloquer l'audio. */
  unlock() {
    if (!this.ac) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      try {
        this.ac = new AC();
      } catch {
        return;
      }
      const ac = this.ac;
      const comp = ac.createDynamicsCompressor();
      this.out = ac.createGain();
      this.out.gain.value = 0.5;
      this.out.connect(comp);
      comp.connect(ac.destination);
      const len = Math.floor(ac.sampleRate * 0.6);
      this.noise = ac.createBuffer(1, len, ac.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ac.state === 'suspended') void this.ac.resume().catch(() => {});
  }

  private burst(
    type: BiquadFilterType,
    f0: number,
    f1: number,
    dur: number,
    vol: number,
    delay = 0,
    q = 1,
  ) {
    const ac = this.ac;
    if (!ac || !this.out || !this.noise) return;
    const t = ac.currentTime + delay;
    const src = ac.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const filt = ac.createBiquadFilter();
    filt.type = type;
    filt.Q.value = q;
    filt.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) filt.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(this.out);
    src.start(t, Math.random() * 0.2);
    src.stop(t + dur + 0.02);
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0) {
    const ac = this.ac;
    if (!ac || !this.out) return;
    const t = ac.currentTime + delay;
    const osc = ac.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.out);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private bell(delay = 0, vol = 0.22) {
    this.tone('sine', 2093, 2093, 0.9, vol, delay);
    this.tone('sine', 4186, 4186, 0.45, vol * 0.35, delay);
    this.tone('sine', 6270, 6270, 0.2, vol * 0.15, delay);
  }

  play(name: SfxName) {
    if (!this.enabled || !this.ac || this.ac.state !== 'running') return;
    switch (name) {
      case 'key':
        this.burst('bandpass', 2200 + Math.random() * 1200, 1800, 0.035, 0.55, 0, 1.4);
        this.tone('triangle', 170 + Math.random() * 30, 90, 0.05, 0.3);
        break;
      case 'hit':
        this.burst('lowpass', 1400, 500, 0.06, 0.3);
        break;
      case 'kill':
        this.burst('lowpass', 900, 160, 0.2, 0.7);
        this.tone('sine', 190, 55, 0.2, 0.45);
        break;
      case 'bigkill':
        this.burst('lowpass', 700, 90, 0.42, 0.9);
        this.tone('sine', 150, 36, 0.45, 0.7);
        this.bell(0.03, 0.2);
        break;
      case 'ding':
        this.bell();
        break;
      case 'error':
        this.tone('square', 150, 85, 0.13, 0.22);
        this.burst('lowpass', 400, 200, 0.08, 0.3);
        break;
      case 'breach':
        this.tone('sine', 110, 30, 0.6, 0.9);
        this.burst('lowpass', 500, 60, 0.5, 0.8);
        this.tone('sawtooth', 220, 70, 0.3, 0.2);
        break;
      case 'sweep':
        this.burst('bandpass', 500, 5000, 0.45, 0.7, 0, 3);
        this.burst('highpass', 3000, 6000, 0.45, 0.2);
        this.bell(0.45, 0.3);
        break;
      case 'mult':
        this.tone('triangle', 660, 660, 0.09, 0.22);
        this.tone('triangle', 990, 990, 0.14, 0.22, 0.07);
        break;
      case 'ready':
        this.tone('triangle', 523, 523, 0.1, 0.2);
        this.tone('triangle', 784, 784, 0.1, 0.2, 0.08);
        this.tone('triangle', 1047, 1047, 0.22, 0.22, 0.16);
        break;
      case 'wave':
        this.burst('bandpass', 1200, 3000, 0.22, 0.3, 0, 4);
        this.bell(0.2, 0.16);
        break;
      case 'clear':
        this.tone('triangle', 523, 523, 0.12, 0.2);
        this.tone('triangle', 659, 659, 0.12, 0.2, 0.09);
        this.tone('triangle', 784, 784, 0.12, 0.2, 0.18);
        this.tone('triangle', 1047, 1047, 0.3, 0.22, 0.27);
        break;
      case 'over':
        this.tone('triangle', 392, 370, 0.3, 0.3);
        this.tone('triangle', 311, 290, 0.3, 0.3, 0.26);
        this.tone('triangle', 233, 110, 0.9, 0.35, 0.52);
        this.burst('lowpass', 300, 50, 0.9, 0.5, 0.52);
        break;
      case 'start':
        this.burst('bandpass', 800, 4000, 0.25, 0.4, 0, 3);
        this.bell(0.22, 0.22);
        break;
    }
  }
}

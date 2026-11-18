/**
 * Ambiance sonore de la grotte : un grondement très grave et lointain, et de rares gouttes d'eau
 * qui résonnent longuement. 100 % synthétisé (WebAudio), rien à télécharger.
 */

/** Délai (ms) avant la prochaine goutte : lent, irrégulier. `r` est un nombre au hasard entre 0 et 1. */
export const DROP_MIN_MS = 3800;
export const DROP_MAX_MS = 8200;
export const nextDropDelay = (r: number): number => Math.round(DROP_MIN_MS + (DROP_MAX_MS - DROP_MIN_MS) * Math.max(0, Math.min(1, r)));

/** Hauteur de départ (Hz) d'une goutte : légèrement différente à chaque fois, jamais aiguë. */
export const dropPitch = (r: number): number => Math.round(620 + 520 * Math.max(0, Math.min(1, r)));

export class CaveSound {
  private ac: AudioContext | null = null;
  private master: GainNode | null = null;
  private echo: GainNode | null = null;
  private timer = 0;
  private nodes: Array<OscillatorNode | AudioBufferSourceNode> = [];
  private running = false;

  /** À appeler quand la page de la grotte s'ouvre (le clic sur la porte a déjà débloqué l'audio). */
  start() {
    if (this.running) return;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    let ac: AudioContext;
    try {
      ac = new AC();
    } catch {
      return;
    }
    this.ac = ac;
    this.running = true;
    if (ac.state === 'suspended') void ac.resume().catch(() => {});

    const master = ac.createGain();
    master.gain.value = 0;
    master.gain.linearRampToValueAtTime(0.55, ac.currentTime + 3.5); // la grotte « s'ouvre » doucement
    const comp = ac.createDynamicsCompressor();
    master.connect(comp);
    comp.connect(ac.destination);
    this.master = master;

    // Grondement : deux notes très graves qui se frottent, et un souffle sourd qui monte et descend lentement
    const drone = ac.createGain();
    drone.gain.value = 0.16;
    drone.connect(master);
    for (const [f, g] of [[46, 0.9], [69.3, 0.5], [92, 0.25]] as const) {
      const o = ac.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const og = ac.createGain();
      og.gain.value = g;
      o.connect(og);
      og.connect(drone);
      o.start();
      this.nodes.push(o);
    }
    const len = ac.sampleRate * 2;
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; // bruit « brun » : grave et sourd
      d[i] = last * 3.5;
    }
    const wind = ac.createBufferSource();
    wind.buffer = buf;
    wind.loop = true;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 220;
    const lfo = ac.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ac.createGain();
    lfoGain.gain.value = 90;
    lfo.connect(lfoGain);
    lfoGain.connect(lp.frequency);
    const wg = ac.createGain();
    wg.gain.value = 0.5;
    wind.connect(lp);
    lp.connect(wg);
    wg.connect(master);
    wind.start();
    lfo.start();
    this.nodes.push(wind, lfo);

    // Écho de caverne : deux retards qui se répondent, de plus en plus sourds
    const send = ac.createGain();
    send.gain.value = 0.9;
    const echoOut = ac.createGain();
    echoOut.gain.value = 0.7;
    for (const [time, fb] of [[0.52, 0.52], [0.97, 0.45]] as const) {
      const delay = ac.createDelay(2);
      delay.delayTime.value = time;
      const back = ac.createGain();
      back.gain.value = fb;
      const tone = ac.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = 1500;
      send.connect(delay);
      delay.connect(tone);
      tone.connect(back);
      back.connect(delay);
      tone.connect(echoOut);
    }
    echoOut.connect(master);
    this.echo = send;

    this.timer = window.setTimeout(() => this.drip(), 1600);
  }

  private drip() {
    const ac = this.ac;
    if (!ac || !this.running || !this.master || !this.echo) return;
    if (ac.state === 'running') {
      const t = ac.currentTime;
      const f0 = dropPitch(Math.random());
      const o = ac.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.45, t + 0.11);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.32, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o.connect(g);
      g.connect(this.master); // le son direct, discret
      g.connect(this.echo); // et sa résonance, qui s'étire dans la grotte
      o.start(t);
      o.stop(t + 0.25);
    }
    this.timer = window.setTimeout(() => this.drip(), nextDropDelay(Math.random()));
  }

  /** La grotte se tait doucement, puis le contexte audio est libéré. */
  stop() {
    this.running = false;
    window.clearTimeout(this.timer);
    const ac = this.ac;
    if (!ac) return;
    this.ac = null;
    try {
      if (this.master) {
        this.master.gain.cancelScheduledValues(ac.currentTime);
        this.master.gain.setValueAtTime(this.master.gain.value, ac.currentTime);
        this.master.gain.linearRampToValueAtTime(0, ac.currentTime + 0.6);
      }
    } catch {
      /* ignoré */
    }
    const nodes = this.nodes;
    this.nodes = [];
    window.setTimeout(() => {
      for (const n of nodes) {
        try {
          n.stop();
        } catch {
          /* déjà arrêté */
        }
      }
      void ac.close().catch(() => {});
    }, 800);
  }
}

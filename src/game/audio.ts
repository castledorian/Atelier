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
  | 'cannon'
  | 'mult'
  | 'ready'
  | 'wave'
  | 'clear'
  | 'over'
  | 'start'
  | 'spawn'
  | 'scribble'
  | 'select'
  | 'attack'
  | 'impact'
  | 'correct'
  | 'victory'
  | 'munch'
  | 'yum'
  | 'boing'
  | 'giggle'
  | 'gift'
  | 'chime'
  | 'nope'
  | 'n0'
  | 'n1'
  | 'n2'
  | 'n3'
  | 'n4'
  | 'n5'
  | 'n6'
  | 'n7'
  | 'n8';

/** Durée de chaque effet (secondes), pour le pré-calcul. */
const LENGTH: Record<SfxName, number> = {
  key: 0.1,
  hit: 0.1,
  kill: 0.25,
  bigkill: 1,
  ding: 0.95,
  error: 0.18,
  breach: 0.65,
  sweep: 1.4,
  cannon: 0.5,
  mult: 0.25,
  ready: 0.42,
  wave: 1.15,
  clear: 0.6,
  over: 1.45,
  start: 1.15,
  spawn: 0.6,
  scribble: 0.16,
  select: 0.12,
  attack: 0.8,
  impact: 0.75,
  correct: 0.9,
  victory: 1.6,
  munch: 0.75,
  yum: 0.5,
  boing: 0.4,
  giggle: 0.45,
  gift: 0.9,
  chime: 1,
  nope: 0.4,
  n0: 0.36,
  n1: 0.36,
  n2: 0.36,
  n3: 0.36,
  n4: 0.36,
  n5: 0.36,
  n6: 0.36,
  n7: 0.36,
  n8: 0.36,
};
/** Les neuf notes (gamme pentatonique) des taches de « Mémoire d'encre ». */
const NOTES = [523, 587, 659, 784, 880, 1047, 1175, 1319, 1568];
const NAMES = Object.keys(LENGTH) as SfxName[];

/** Petit synthétiseur : écrit un effet dans un contexte audio (en direct ou hors ligne). */
class Synth {
  constructor(
    private readonly ac: BaseAudioContext,
    private readonly out: AudioNode,
    private readonly noise: AudioBuffer,
    private readonly t0: number,
  ) {}

  burst(type: BiquadFilterType, f0: number, f1: number, dur: number, vol: number, delay = 0, q = 1) {
    const { ac } = this;
    const t = this.t0 + delay;
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

  tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0) {
    const { ac } = this;
    const t = this.t0 + delay;
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

  bell(delay = 0, vol = 0.22) {
    this.tone('sine', 2093, 2093, 0.9, vol, delay);
    this.tone('sine', 4186, 4186, 0.45, vol * 0.35, delay);
    this.tone('sine', 6270, 6270, 0.2, vol * 0.15, delay);
  }

  play(name: SfxName) {
    if (name.length === 2 && name[0] === 'n') {
      const f = NOTES[Number(name[1])] ?? 523;
      this.tone('triangle', f, f, 0.3, 0.24);
      this.tone('sine', f * 2, f * 2, 0.16, 0.06);
      this.burst('bandpass', 2400, 1500, 0.03, 0.2);
      return;
    }
    switch (name) {
      case 'key':
        this.burst('bandpass', 2700, 1800, 0.035, 0.55, 0, 1.4);
        this.tone('triangle', 185, 90, 0.05, 0.3);
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
        // une erreur est une information, pas une punition : un « bloup » grave et bref, sans buzz ni son strident
        this.tone('triangle', 196, 124, 0.16, 0.26);
        this.burst('lowpass', 380, 180, 0.07, 0.18);
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
      case 'cannon':
        // coup de canon : un « boum » grave, un souffle de poudre et un sifflement
        this.tone('sine', 220, 45, 0.3, 0.9);
        this.burst('lowpass', 1400, 200, 0.3, 0.7);
        this.burst('bandpass', 900, 3000, 0.18, 0.25, 0.04, 2);
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
      case 'spawn':
        // une goutte d'encre qui tombe et s'étale : « bloup » grave puis petite bulle qui remonte
        this.tone('sine', 340, 85, 0.22, 0.55);
        this.burst('lowpass', 900, 140, 0.24, 0.45);
        this.tone('sine', 420, 980, 0.12, 0.12, 0.2);
        this.burst('bandpass', 1800, 900, 0.1, 0.12, 0.3, 4);
        break;
      case 'scribble':
        // plume sur le papier : trois grattements très courts
        this.burst('bandpass', 3400, 2600, 0.04, 0.32, 0, 2.5);
        this.burst('bandpass', 2900, 2300, 0.035, 0.24, 0.045, 2.5);
        this.burst('bandpass', 3600, 2800, 0.05, 0.28, 0.09, 2.5);
        break;
      case 'select':
        this.tone('triangle', 740, 740, 0.06, 0.18);
        this.burst('bandpass', 2200, 1600, 0.03, 0.25, 0, 2);
        break;
      case 'attack':
        // l'ennemi se jette en avant (souffle qui monte), puis l'encre s'écrase sur le canon
        this.burst('bandpass', 350, 1900, 0.26, 0.5, 0, 1.6);
        this.tone('sawtooth', 120, 260, 0.22, 0.08);
        this.burst('lowpass', 1500, 140, 0.32, 0.9, 0.27);
        this.tone('sine', 170, 48, 0.36, 0.75, 0.27);
        this.tone('square', 196, 92, 0.18, 0.1, 0.33);
        break;
      case 'impact':
        // le boulet frappe : choc sourd, éclaboussure d'encre, puis l'ennemi s'évapore
        this.tone('sine', 240, 52, 0.26, 0.85);
        this.burst('lowpass', 2400, 260, 0.2, 0.8);
        this.burst('bandpass', 1500, 600, 0.22, 0.35, 0.05, 3);
        this.burst('highpass', 5200, 1800, 0.45, 0.16, 0.22);
        break;
      case 'correct':
        // deux notes claires : la correction est écrite
        this.tone('triangle', 1319, 1319, 0.16, 0.2);
        this.tone('triangle', 1976, 1976, 0.4, 0.2, 0.11);
        this.tone('sine', 3951, 3951, 0.25, 0.05, 0.11);
        break;
      case 'victory':
        for (const [f, d] of [
          [523, 0],
          [659, 0.1],
          [784, 0.2],
          [1047, 0.3],
          [1319, 0.42],
        ] as const)
          this.tone('triangle', f, f, d === 0.42 ? 0.6 : 0.16, 0.2, d);
        this.bell(0.42, 0.18);
        break;
      // ─── La goutte (Tamagotchi) : sons doux, courts et bas en volume, pensés pour une salle de classe ───
      case 'munch':
        // trois petites bouchées feutrées (pas de bruit de bouche réaliste)
        for (const d of [0, 0.22, 0.44]) {
          this.burst('lowpass', 1300, 380, 0.07, 0.22, d, 1.2);
          this.tone('sine', 260, 170, 0.06, 0.1, d);
        }
        break;
      case 'yum':
        // « miam ! » : deux notes qui montent, rondes
        this.tone('sine', 587, 587, 0.14, 0.16);
        this.tone('sine', 880, 880, 0.3, 0.16, 0.12);
        this.tone('triangle', 1760, 1760, 0.18, 0.03, 0.12);
        break;
      case 'boing':
        // la goutte s'écrase puis rebondit
        this.tone('sine', 220, 520, 0.22, 0.2);
        this.tone('sine', 520, 440, 0.14, 0.08, 0.2);
        break;
      case 'giggle':
        // petit rire : quatre notes rapides qui sautillent
        for (const [f, d] of [
          [988, 0],
          [1175, 0.08],
          [1047, 0.16],
          [1319, 0.24],
        ] as const)
          this.tone('triangle', f, f * 0.96, 0.08, 0.09, d);
        break;
      case 'gift':
        // la boîte s'ouvre : un froissement léger puis une cascade montante
        this.burst('bandpass', 1800, 4200, 0.18, 0.12, 0, 2);
        for (const [f, d] of [
          [784, 0.12],
          [988, 0.2],
          [1175, 0.28],
          [1568, 0.36],
        ] as const)
          this.tone('sine', f, f, d === 0.36 ? 0.5 : 0.16, 0.12, d);
        break;
      case 'chime':
        // nouvelle saveur découverte : un carillon clair
        this.tone('sine', 1319, 1319, 0.5, 0.12);
        this.tone('sine', 1976, 1976, 0.7, 0.1, 0.1);
        this.tone('sine', 2637, 2637, 0.35, 0.04, 0.1);
        break;
      case 'nope':
        // « j'ai plus faim » : deux notes graves qui descendent gentiment (jamais un buzz)
        this.tone('triangle', 392, 392, 0.12, 0.12);
        this.tone('triangle', 330, 311, 0.2, 0.12, 0.13);
        break;
    }
  }
}

/**
 * Effets sonores. Chaque effet est calculé UNE fois au démarrage (hors ligne), puis rejoué comme un simple
 * enregistrement : une frappe ne coûte qu'un lecteur audio, ce qui garde le jeu fluide sur les vieux ordinateurs.
 */
export class Sfx {
  enabled = true;
  private ac: AudioContext | null = null;
  private out: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private baked: Partial<Record<SfxName, AudioBuffer>> = {};

  /** À appeler depuis un geste utilisateur (clic, touche) pour débloquer l'audio. */
  unlock() {
    if (!this.ac) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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
      void this.bake(ac.sampleRate);
    }
    if (this.ac.state === 'suspended') void this.ac.resume().catch(() => {});
  }

  /** Pré-calcul de tous les effets ; en attendant (ou sans OfflineAudioContext), ils sont joués en direct. */
  private async bake(rate: number) {
    const OAC =
      window.OfflineAudioContext ||
      (
        window as unknown as {
          webkitOfflineAudioContext?: typeof OfflineAudioContext;
        }
      ).webkitOfflineAudioContext;
    if (!OAC) return;
    for (const name of NAMES) {
      try {
        const oc = new OAC(1, Math.ceil(LENGTH[name] * rate), rate);
        const noise = oc.createBuffer(1, this.noise!.length, rate);
        noise.copyToChannel(this.noise!.getChannelData(0), 0);
        new Synth(oc, oc.destination, noise, 0).play(name);
        this.baked[name] = await oc.startRendering();
      } catch {
        return; // navigateur trop ancien : on garde la synthèse en direct
      }
    }
  }

  play(name: SfxName) {
    if (!this.enabled || !this.ac || !this.out || !this.noise || this.ac.state !== 'running') return;
    const buf = this.baked[name];
    if (!buf) {
      new Synth(this.ac, this.out, this.noise, this.ac.currentTime).play(name);
      return;
    }
    const src = this.ac.createBufferSource();
    src.buffer = buf;
    // légère variation de hauteur : deux frappes ne sonnent jamais exactement pareil
    if (name === 'key' || name === 'hit' || name === 'kill' || name === 'scribble' || name === 'select') src.playbackRate.value = 0.94 + Math.random() * 0.12;
    src.connect(this.out);
    src.start();
  }
}

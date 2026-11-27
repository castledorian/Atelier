/**
 * Ambiance musicale de l'accueil : une petite boucle douce, 100 % synthétisée (WebAudio), rien à télécharger.
 *
 * Ce que dit la recherche, et ce qu'on en a tiré :
 *  - Écouter de la musique n'« active » pas le cortex et ne rend pas plus intelligent (l'« effet Mozart » ne tient pas : méta-analyses
 *    de Chabris 1999 et Pietschnig 2010). Ce qui est établi, c'est un effet par l'humeur et l'éveil : une musique agréable met de bonne humeur
 *    et aide à se sentir bien dans un lieu (Schellenberg 2005, « enjoyment-arousal »).
 *  - En revanche une musique rapide et forte gêne la lecture (Thompson, Schellenberg et Letnic 2012) et une musique chantée gêne la lecture
 *    et la mémoire verbale (Perham et Currie 2014). D'où : instrumentale, lente, très douce, et JAMAIS pendant les jeux (on y lit et on réfléchit).
 *  - Elle n'a aucun bouton : elle accompagne l'accueil, et seulement l'accueil (coupée dès qu'un jeu ou un extrait s'ouvre, et quand l'onglet
 *    est masqué). Les navigateurs la gardent muette jusqu'au premier toucher de l'élève. Volume très doux.
 *
 * Le style : gamme pentatonique majeure (aucune note « fausse », aucune tension), progression Do – La mineur – Fa – Sol, 72 pulsations
 * par minute (le tempo d'une marche tranquille), timbres de gouttes d'eau (le thème de l'encre) avec un petit écho.
 */

/** Tempo : 72 pulsations par minute. */
export const BPM = 72;
export const BEAT = 60 / BPM;
/** Une boucle = 4 mesures de 4 temps (≈ 13 s) ; la mélodie change à chaque tour. */
export const BARS = 4;
/** Gamme pentatonique majeure de Do (demi-tons au-dessus du Do). */
const PENTATONIC = [0, 2, 4, 7, 9];
/** Notes MIDI de la mélodie : de sol 4 à la 5 (jamais aiguë ni grave). */
export const MELODY_LOW = 67;
export const MELODY_HIGH = 81;
/** Accords (notes MIDI graves : fondamentale, tierce, quinte). */
type Chord = readonly [number, number, number];
const C: Chord = [48, 52, 55];
const AM: Chord = [45, 48, 52];
const F: Chord = [41, 45, 48];
const G: Chord = [43, 47, 50];
/** Deux progressions qui alternent d'un tour à l'autre : Do – La mineur – Fa – Sol, puis Do – Sol – La mineur – Fa (la musique ne tourne pas en rond). */
export const PROGRESSIONS: ReadonlyArray<ReadonlyArray<Chord>> = [
  [C, AM, F, G],
  [C, G, AM, F],
];
/** L'accord de la mesure `bar`. */
export const chordAt = (bar: number): Chord => PROGRESSIONS[Math.floor(bar / BARS) % PROGRESSIONS.length][((bar % BARS) + BARS) % BARS];
/** Volume de l'ambiance : très doux, on doit pouvoir parler par-dessus. */
export const MASTER = 0.1;

export const midiToHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
export const isPentatonic = (m: number) => PENTATONIC.includes(((m % 12) + 12) % 12);

export type Rng = () => number;

export interface Note {
  /** début, en temps (0 à 16 pour une mesure de 4 temps ×4 mesures, ici relatif à la mesure) */
  beat: number;
  kind: 'pad' | 'bass' | 'drop' | 'harp';
  midi: number;
  /** durée en temps */
  beats: number;
  /** volume 0..1 (avant le volume général) */
  vol: number;
}

/**
 * Les notes d'une mesure. `bar` = numéro de mesure depuis le début (0, 1, 2…) ; `prev` = dernière note de mélodie jouée
 * (la mélodie marche de proche en proche, sans grands sauts) ; renvoie aussi la dernière note jouée.
 */
export function planBar(bar: number, prev: number, rng: Rng): { notes: Note[]; last: number } {
  const chord = chordAt(bar);
  const notes: Note[] = [];
  // le fond : la fondamentale tenue, et l'accord en nappe très douce
  notes.push({ beat: 0, kind: 'bass', midi: chord[0], beats: 4, vol: 0.5 });
  for (const m of chord) notes.push({ beat: 0, kind: 'pad', midi: m + 12, beats: 4, vol: 0.22 });
  // un fin arpège de harpe sur l'accord : il donne le mouvement, sans jamais passer devant la mélodie
  const arp = [chord[0] + 24, chord[1] + 24, chord[2] + 24, chord[1] + 24];
  [0.5, 1.5, 2.5, 3.5].forEach((beat, k) => notes.push({ beat, kind: 'harp', midi: arp[k], beats: 1.2, vol: 0.14 }));
  // la mélodie : des gouttes, surtout sur les temps, jamais deux mesures identiques
  const scale: number[] = [];
  for (let m = MELODY_LOW; m <= MELODY_HIGH; m++) if (isPentatonic(m)) scale.push(m);
  let i = scale.indexOf(prev);
  if (i < 0) i = Math.floor(scale.length / 2);
  let last = scale[i];
  for (let eighth = 0; eighth < 8; eighth++) {
    const onBeat = eighth % 2 === 0;
    const p = eighth === 0 ? 0.85 : onBeat ? 0.5 : 0.25;
    if (rng() > p) continue;
    const step = Math.floor(rng() * 5) - 2; // −2 … +2 degrés
    i = Math.max(0, Math.min(scale.length - 1, i + (step === 0 ? 1 : step)));
    last = scale[i];
    notes.push({ beat: eighth / 2, kind: 'drop', midi: last, beats: 1.5, vol: onBeat ? 0.42 : 0.3 });
  }
  return { notes, last };
}

/** Le lecteur : il programme la musique quelques secondes à l'avance (aucun travail par image : sans effet sur la fluidité). */
export class Ambiance {
  private ac: AudioContext | null = null;
  private master: GainNode | null = null;
  private delayIn: GainNode | null = null;
  private timer = 0;
  private bar = 0;
  private nextAt = 0;
  private last = 74;
  private running = false;

  get isRunning() {
    return this.running;
  }

  /** Démarre la musique ; le navigateur la laisse muette tant que l'élève n'a pas touché la page (voir resume). */
  start(): boolean {
    if (this.running) return true;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return false;
    let ac: AudioContext;
    try {
      ac = new AC();
    } catch {
      return false;
    }
    this.ac = ac;
    this.running = true;
    if (ac.state === 'suspended') void ac.resume().catch(() => {});
    const master = ac.createGain();
    master.gain.value = 0;
    master.gain.linearRampToValueAtTime(MASTER, ac.currentTime + 2.5); // la musique « arrive » doucement
    const comp = ac.createDynamicsCompressor();
    master.connect(comp);
    comp.connect(ac.destination);
    this.master = master;
    // écho de gouttes d'eau : un retard de croche pointée, qui s'éteint vite
    const echo = ac.createDelay(2);
    echo.delayTime.value = BEAT * 0.75;
    const fb = ac.createGain();
    fb.gain.value = 0.32;
    const tone = ac.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 2200;
    const wet = ac.createGain();
    wet.gain.value = 0.55;
    echo.connect(tone);
    tone.connect(fb);
    fb.connect(echo);
    tone.connect(wet);
    wet.connect(master);
    const delayIn = ac.createGain();
    delayIn.connect(echo);
    this.delayIn = delayIn;
    this.nextAt = ac.currentTime + 0.25;
    this.bar = 0;
    this.timer = window.setInterval(() => this.pump(), 300);
    this.pump();
    return true;
  }

  /** Reprend après une suspension du navigateur (onglet masqué, premier geste de l'élève). */
  resume() {
    if (this.ac && this.ac.state === 'suspended') void this.ac.resume().catch(() => {});
  }

  suspend() {
    if (this.ac && this.ac.state === 'running') void this.ac.suspend().catch(() => {});
  }

  /** Arrête en fondu (≈ 1 s) puis libère l'audio. */
  stop() {
    if (!this.running) return;
    this.running = false;
    window.clearInterval(this.timer);
    const ac = this.ac;
    const master = this.master;
    if (ac && master) {
      try {
        master.gain.cancelScheduledValues(ac.currentTime);
        master.gain.setValueAtTime(master.gain.value, ac.currentTime);
        master.gain.linearRampToValueAtTime(0, ac.currentTime + 0.9);
      } catch {
        /* ignoré */
      }
      window.setTimeout(() => void ac.close().catch(() => {}), 1100);
    }
    this.ac = null;
    this.master = null;
    this.delayIn = null;
  }

  private pump() {
    const ac = this.ac;
    if (!ac || !this.running) return;
    if (this.nextAt < ac.currentTime) this.nextAt = ac.currentTime + 0.1; // retard (onglet endormi) : on repart sans rattraper
    while (this.nextAt < ac.currentTime + 1.5) {
      const { notes, last } = planBar(this.bar, this.last, Math.random);
      this.last = last;
      for (const n of notes) this.play(n, this.nextAt + n.beat * BEAT);
      this.nextAt += 4 * BEAT;
      this.bar++;
    }
  }

  private play(n: Note, t: number) {
    const ac = this.ac;
    const master = this.master;
    if (!ac || !master) return;
    const f = midiToHz(n.midi);
    const dur = n.beats * BEAT;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    if (n.kind === 'harp') {
      g.gain.linearRampToValueAtTime(n.vol, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      this.osc('triangle', f, g, t, dur + 0.05);
      g.connect(master);
      if (this.delayIn) g.connect(this.delayIn);
    } else if (n.kind === 'drop') {
      // une goutte : attaque très vive, longue résonance
      g.gain.linearRampToValueAtTime(n.vol, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      this.osc('sine', f, g, t, dur + 0.05);
      this.osc('triangle', f * 2, g, t, dur * 0.4, 0.25);
      g.connect(master);
      if (this.delayIn) g.connect(this.delayIn);
    } else {
      // nappe et fondamentale : montée et descente lentes
      g.gain.linearRampToValueAtTime(n.vol * 0.5, t + dur * 0.35);
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
      this.osc(n.kind === 'bass' ? 'sine' : 'triangle', f, g, t, dur + 0.05);
      const lp = ac.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = n.kind === 'bass' ? 300 : 900;
      g.connect(lp);
      lp.connect(master);
    }
  }

  private osc(type: OscillatorType, f: number, out: AudioNode, t: number, dur: number, gain = 1) {
    const ac = this.ac;
    if (!ac) return;
    const o = ac.createOscillator();
    o.type = type;
    o.frequency.value = f;
    if (gain !== 1) {
      const g = ac.createGain();
      g.gain.value = gain;
      o.connect(g);
      g.connect(out);
    } else o.connect(out);
    o.start(t);
    o.stop(t + dur);
  }
}

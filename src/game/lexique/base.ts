import type { Sfx } from '../audio';
import type { LexDiff, LexLevel, Rel, Round } from './rounds';
import type { Enemy, LexCallbacks, LexResult, Mode, Part, Phase, Ring, Txt } from './parts';

/** Les champs du moteur (état de la partie, dimensions, calques) : rien à calculer ici. */
export abstract class LexiqueBase {
  protected canvas!: HTMLCanvasElement;
  protected ctx!: CanvasRenderingContext2D;
  protected sfx!: Sfx;
  protected cb!: LexCallbacks;
  protected readonly bg = document.createElement('canvas');
  protected ro: ResizeObserver | null = null;
  protected raf = 0;
  protected last = 0;
  protected dirty = true;
  /** qualité automatique : résolution maximale du canvas (1 = un pixel par pixel CSS) */
  protected quality = 2;
  protected slowAvg = 16.7;
  protected slowFrames = 0;
  protected demoStill = false;

  // Géométrie (pixels CSS)
  protected W = 0;
  protected H = 0;
  protected dpr = 1;
  protected hudH = 58;
  protected cx = 0;
  protected cy = 0;
  protected fs = 20;
  protected u = 1;
  protected compact = false;

  // État
  protected mode: Mode = 'demo';
  protected phase: Phase = 'wait';
  protected paused = false;
  protected shakeOn = true;
  protected wordScale = 1;
  protected rel: Rel = 'melange';
  protected level: LexLevel = 'cm1';
  protected diff: LexDiff = 'standard';
  /** La démonstration joue ses sons (fenêtre d'extrait de l'accueil) ; dans le menu elle reste muette. */
  protected demoSound = false;
  protected used = new Set<string>();
  protected round: Round | null = null;
  protected next: Round | null = null;
  protected enemies: Enemy[] = [];
  protected target: Enemy | null = null;
  protected link: { e: Enemy; t: number } | null = null;
  /** mot central saisi : le fil suit le pointeur */
  protected armed = false;
  protected drag = false;
  protected px = 0;
  protected py = 0;
  protected bx = new Float32Array(10);
  protected by = new Float32Array(10);
  protected parts: Part[] = [];
  protected texts: Txt[] = [];
  protected rings: Ring[] = [];
  protected note: { s: string; good: boolean; t: number; life: number } | null = null;
  protected morph: { s: string; t: number } | null = null;

  protected score = 0;
  protected shown = 0;
  protected streak = 0;
  protected bestStreak = 0;
  protected lives = 3;
  protected wins = 0;
  protected losses = 0;
  protected roundNo = 0;
  protected playTime = 0;
  protected missed: LexResult['missed'] = [];
  protected time = 0;
  protected timer = 0;
  protected shockR = 0;
  protected overT = 0;
  protected overSent = false;
  protected botT = 0;
  protected coreW = 120;
  protected coreH = 50;
  protected core = 0;

  // Ressenti
  protected trauma = 0;
  protected hitStop = 0;
  protected slowT = 0;
  protected flash = 0;
  protected whiteFlash = 0;
  protected scorePunch = 0;
  protected livesPunch = 0;
}

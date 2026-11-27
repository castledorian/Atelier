import type { Sfx } from '../audio';
import { DIFFICULTIES } from '../difficulty';
import type { DiffConfig } from '../difficulty';
import type { Layout } from '../storage';
import { F_DISP, F_WORD } from '../canvas';
import type { Enemy, GameCallbacks, Kind, Mode, Part, Ring, Shot, Txt } from './parts';

/** Les champs du moteur (état de la partie, dimensions, calques) : rien à calculer ici. */
export abstract class GameBase {
  protected canvas!: HTMLCanvasElement;
  protected ctx!: CanvasRenderingContext2D;
  protected sfx!: Sfx;
  protected cb!: GameCallbacks;
  protected readonly bg = document.createElement('canvas');
  protected readonly stains = document.createElement('canvas');
  protected sctx!: CanvasRenderingContext2D;
  protected readonly px = new Float32Array(20);
  protected readonly py = new Float32Array(20);
  protected ro: ResizeObserver | null = null;
  protected raf = 0;
  protected last = 0;
  protected dirty = true;
  /**
   * Qualité automatique : résolution maximale du canvas (1 = un pixel par pixel CSS).
   * Si l'ordinateur n'arrive pas à suivre 60 images/s, on baisse la résolution plutôt que de saccader.
   */
  protected quality = 2;
  protected slowAvg = 16.7;
  protected slowFrames = 0;
  protected cwFont = '';
  /** démo d'arrière-plan figée (ordinateur trop lent : le menu reste fluide) */
  protected demoStill = false;
  /** extrait ouvert depuis l'accueil : la démonstration est jouée avec le son */
  protected demoSound = false;

  // Géométrie (pixels CSS)
  protected W = 0;
  protected H = 0;
  protected dpr = 1;
  protected hudH = 58;
  protected baseH = 32;
  protected dangerY = 400;
  protected ox = 160;
  protected oy = 448;
  protected fs = 20;
  protected cw = 12;
  protected u = 1;
  protected travel = 300;
  protected compact = false;

  // État
  protected mode: Mode = 'demo';
  protected paused = false;
  protected shakeOn = true;
  protected touch = false;
  protected cfg: DiffConfig = DIFFICULTIES.standard;
  protected fWord = F_WORD;
  protected fDisp = F_DISP;
  protected wordScale = 1;
  /** entraînement ciblé : lettres à travailler (majuscules), ou null pour une partie normale */
  protected drill: string | null = null;
  protected letterOk: Record<string, number> = {};
  protected letterErr: Record<string, number> = {};
  protected layout: Layout = 'azerty';
  protected time = 0;
  protected real = 0;
  protected enemies: Enemy[] = [];
  protected shots: Shot[] = [];
  protected parts: Part[] = [];
  protected texts: Txt[] = [];
  protected rings: Ring[] = [];
  protected target: Enemy | null = null;
  protected lastHint: string | null = null;

  protected score = 0;
  protected shown = 0;
  protected combo = 0;
  protected maxCombo = 0;
  protected mult = 1;
  protected lives = 3;
  protected wave = 0;
  protected kills = 0;
  protected correct = 0;
  protected errors = 0;
  protected playTime = 0;
  protected charge = 0;

  protected queue: Kind[] = [];
  protected spawnT = 0;
  protected clearing = false;
  protected clearT = 0;
  protected banner: { t: number; text: string; sub: string } | null = null;
  protected lane1 = -1;
  protected lane2 = -1;
  protected botT = 0;
  protected sweep: { t: number } | null = null;
  protected overT = 0;
  protected overSent = false;

  // Ressenti
  protected trauma = 0;
  protected hitStop = 0;
  protected slowT = 0;
  protected flash = 0;
  protected stainT = 0;
  protected slugKick = 0;
  protected slugErr = 0;
  protected slugCh = '';
  protected scorePunch = 0;
  protected multPunch = 0;
  protected livesPunch = 0;
}

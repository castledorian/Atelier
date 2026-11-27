import type { Sfx } from '../audio';
import type { ItemOutcome } from '../itemstats';
import type { RuleId } from '../encre/rules';
import type { CourseDiff, Level, Missed, Question } from './questions';
import { RED } from '../canvas';
import { SURFACE_STEPS } from './parts';
import type { CourseCallbacks, Gate, Part, Txt } from './parts';

/** Les champs du moteur (état de la partie, dimensions, calques) : rien à calculer ici. */
export abstract class CourseBase {
  protected canvas!: HTMLCanvasElement;
  protected ctx!: CanvasRenderingContext2D;
  protected sfx!: Sfx;
  protected cb!: CourseCallbacks;
  protected readonly bg = document.createElement('canvas');
  protected readonly stains = document.createElement('canvas');
  protected sctx!: CanvasRenderingContext2D;
  protected ro: ResizeObserver | null = null;
  protected raf = 0;
  protected last = 0;

  protected W = 0;
  protected H = 0;
  protected dpr = 1;
  protected quality = 2;
  protected slowAvg = 16.7;
  protected slowFrames = 0;
  protected demoStill = false;
  /** extrait ouvert depuis l'accueil : le calcul s'affiche en haut (derrière le menu, il reste caché) */
  protected demoQuestion = false;
  protected dirty = true;
  protected u = 1;
  protected compact = false;
  protected hudH = 56;
  protected qH = 70;
  protected topY = 0;
  protected colW = 100;
  protected gw = 90;
  protected gh = 60;
  protected penY = 0;
  protected penGap = 100;
  protected barH = 40;
  protected resolveY = 0;
  protected stainT = 0;

  protected shakeOn = true;
  protected shake = 0;
  protected mode: 'demo' | 'play' = 'demo';
  protected paused = false;
  protected level: Level = 'cm1';
  protected diff: CourseDiff = 'standard';
  protected pageA: number[] = [0, 0, 0, 0, 0, 0];
  protected pageE: number[] = [0, 0, 0, 0, 0, 0];
  protected drillQueue: Question[] | null = null;
  protected drillTotal = 0;

  // état de partie
  protected t = 0;
  protected lane = 1;
  protected penX = 0;
  protected penVx = 0;
  protected flood = 0.85;
  protected inkShown = 0.85;
  protected score = 0;
  protected streak = 0;
  protected best = 0;
  protected correct = 0;
  protected wrong = 0;
  protected asked = 0;
  protected shield = false;
  protected gate: Gate | null = null;
  protected spawnIn = 1;
  protected recent: string[] = [];
  protected focus: RuleId[] = [];
  protected lastOk: boolean[] = [];
  protected missed = new Map<string, Missed>();
  protected outcomes: ItemOutcome[] = [];
  protected hitStop = 0;
  protected over = false;
  protected overT = 0;
  protected reported = false;
  protected banner = '';
  protected bannerSub = '';
  protected bannerT = 0;
  protected bannerDur = 1.5;
  protected pageWrong = 0;
  protected won = false;
  protected hintOff = false;
  protected flash = 0;
  protected flashC = RED;
  protected parts: Part[] = [];
  protected texts: Txt[] = [];
  protected pulse = 0;
  protected demoWait = 0;
  protected surf = new Float32Array(SURFACE_STEPS + 1);
}

import type { Sfx } from '../audio';
import type { Grade } from '../grade';
import { MAX_LIVES } from './rounds';
import type { MemDiff, Mode } from './rounds';
import { RED } from '../canvas';
import { OK_WORDS } from './parts';
import type { MemoryCallbacks, Mote, Part, Ring, St, Txt } from './parts';

/** Les champs du moteur (état de la partie, dimensions, calques) : rien à calculer ici. */
export abstract class MemoryBase {
  protected canvas!: HTMLCanvasElement;
  protected ctx!: CanvasRenderingContext2D;
  protected sfx!: Sfx;
  protected cb!: MemoryCallbacks;
  protected readonly bg = document.createElement('canvas');
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
  /** extrait ouvert depuis l'accueil : la démonstration est jouée avec le son */
  protected demoSound = false;
  protected grade: Grade = 'cm1';
  protected dirty = true;
  protected u = 1;
  protected compact = false;
  protected hudH = 56;
  protected qH = 52;
  protected gx = 0;
  protected gy = 0;
  protected gs = 300;

  protected shakeOn = true;
  protected reduced = false;
  protected ts = 1;
  protected shake = 0;
  protected run: 'demo' | 'play' = 'demo';
  protected paused = false;
  protected mode: Mode = 'suite';

  // état de partie
  protected t = 0;
  protected n = 0; // manche en cours (0 à 23)
  protected diff: MemDiff = 'standard';
  protected lives = MAX_LIVES;
  protected score = 0;
  protected streak = 0;
  protected best = 0;
  protected correct = 0;
  protected wrong = 0;
  protected maxSpan = 0;
  protected pageLost = 0;
  protected startPage = 0;
  protected pageA: number[] = [0, 0, 0, 0, 0, 0];
  protected pageE: number[] = [0, 0, 0, 0, 0, 0];
  protected record = 0; // meilleure suite déjà réussie sur cet appareil (La Suite)
  protected recordShown = false;
  protected nearMiss = false;
  protected scoreDisp = 0;
  protected scorePop = 0;
  protected bgStage = -1;
  protected over = false;
  protected won = false;
  protected overT = 0;
  protected reported = false;
  protected st: St = 'banner';
  protected tt = 0;
  protected bannerText = '';
  protected bannerSub = '';
  protected bannerDur = 1.7;
  protected first = true;

  // manche
  protected size = 3;
  protected seq: number[] = [];
  protected targets: number[] = [];
  protected rankOf: number[] = [];
  protected showT = 1.5;
  protected k = 0; // suite : prochaine tache attendue
  protected found = new Set<number>();
  protected lastLit = -1;
  protected cursor = 4;
  protected showCursor = false;
  protected lookT = -99; // dernier moment où le doigt / la souris a bougé
  protected lookX = -1;
  protected lookY = -1;
  protected flash = 0;
  protected flashC = RED;
  protected okWord = OK_WORDS[0];
  protected parts: Part[] = [];
  protected texts: Txt[] = [];
  protected rings: Ring[] = [];
  protected motes: Mote[] = [];
  protected pulse = 0;
  protected botT = 0;
  protected botK = 0;
  protected promptKey = '';
  protected promptT = 0;

  // pièces
  protected shown = new Uint8Array(9); // face actuellement visible
  protected flipTo = new Uint8Array(9); // face de départ pendant une transition (fondu)
  protected flipT = new Float32Array(9).fill(-1); // -1 = au repos, sinon 0 → 1
  protected land = new Float32Array(9); // petit rebond à l'atterrissage
  protected born = new Float32Array(9); // apparition de la grille
  protected ph = new Float32Array(9); // phase propre à chaque pièce (yeux, flottement)
  protected hold = new Float32Array(9); // pièce retenue face visible un instant après un bon choix
  protected mark = new Uint8Array(9); // 0 rien · 1 juste · 2 faux · 3 indice
  protected gz = { lx: 0, ly: 0, blink: 0 };
  protected halo: HTMLCanvasElement | null = null;
  protected faces: HTMLCanvasElement[] = [];
  protected faceR = 0;
  protected faceDpr = 0;
}

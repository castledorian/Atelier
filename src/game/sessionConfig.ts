import { isDifficulty, sanitizeCustom } from './difficulty';
import type { CustomConfig, Difficulty } from './difficulty';
import { COURSE_DIFFS, LEVELS, isCourseDiff, isLevel } from './course/questions';
import type { CourseDiff, Level } from './course/questions';
import { MEM_DIFFS, MODES, PAGES, isMemDiff } from './memory/rounds';
import type { MemDiff, Mode } from './memory/rounds';
import { LEX_DIFFS, LEX_LEVELS, LEX_RELS, isLexDiff, isLexLevel, isRel } from './lexique/rounds';
import type { LexDiff, LexLevel, Rel } from './lexique/rounds';

/**
 * Réglages d'une séance de classe, pour chaque jeu. Les valeurs viennent du serveur : tout est revalidé ici,
 * pour qu'un réglage inconnu ou abîmé retombe toujours sur une partie normale.
 */

export type GameKind = 'typing' | 'math' | 'memory' | 'spelling' | 'lexique';

export interface TypingCfg {
  diff: Difficulty;
  /** utilisé seulement quand diff vaut « perso » */
  custom: CustomConfig;
}
export interface MathCfg {
  level: Level;
  diff: CourseDiff;
}
export interface MemoryCfg {
  mode: Mode;
  diff: MemDiff;
  /** page du cahier où l'on commence (0 à 5) */
  startPage: number;
}

export interface LexiqueCfg {
  rel: Rel;
  diff: LexDiff;
  level: LexLevel;
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export function parseTyping(v: unknown): TypingCfg {
  const o = obj(v);
  return { diff: isDifficulty(o.diff) ? o.diff : 'standard', custom: sanitizeCustom(o.custom) };
}

export function parseMath(v: unknown): MathCfg {
  const o = obj(v);
  return { level: isLevel(o.level) ? o.level : 'cm1', diff: isCourseDiff(o.diff) ? o.diff : 'standard' };
}

/** Chasse aux fautes : mêmes réglages que Course à l'encre (niveau et difficulté). */
export const parseSpelling = (v: unknown): MathCfg => parseMath(v);

export function parseMemory(v: unknown): MemoryCfg {
  const o = obj(v);
  const n = typeof o.startPage === 'number' && Number.isFinite(o.startPage) ? Math.floor(o.startPage) : 0;
  return { mode: o.mode === 'cases' ? 'cases' : 'suite', diff: isMemDiff(o.diff) ? o.diff : 'standard', startPage: Math.max(0, Math.min(PAGES - 1, n)) };
}

export function parseLexique(v: unknown): LexiqueCfg {
  const o = obj(v);
  return { rel: isRel(o.rel) ? o.rel : 'melange', diff: isLexDiff(o.diff) ? o.diff : 'standard', level: isLexLevel(o.level) ? o.level : 'cm1' };
}

export const GAME_NAMES: Record<GameKind, string> = { typing: 'Frappe !', math: 'Course à l’encre', memory: 'Mémoire d’encre', spelling: 'Chasse aux fautes', lexique: 'Mots en orbite' };

const DIFF_LABEL: Record<Difficulty, string> = { apprenti: 'Apprenti', standard: 'Standard', expert: 'Expert', perso: 'Personnalisé' };

/** Phrases lisibles qui résument les réglages (affichées à l'élève et à l'enseignant). */
export function describeConfig(game: GameKind, config: unknown): string[] {
  if (game === 'typing') {
    const c = parseTyping(config);
    if (c.diff !== 'perso') return [DIFF_LABEL[c.diff]];
    const k = c.custom;
    const content = k.content === 'letters' ? 'lettres seules' : k.content === 'words' ? 'mots' : 'mots et lettres';
    return [`Vitesse ${k.speed} %`, `${k.lives} vie${k.lives > 1 ? 's' : ''}`, content, ...(k.content !== 'letters' ? [`mots jusqu’à ${k.maxLen} lettres`] : [])];
  }
  if (game === 'math' || game === 'spelling') {
    const c = parseMath(config);
    return [LEVELS.find((l) => l.id === c.level)?.label ?? c.level, COURSE_DIFFS.find((d) => d.id === c.diff)?.label ?? c.diff];
  }
  if (game === 'lexique') {
    const c = parseLexique(config);
    return [LEX_RELS.find((r) => r.id === c.rel)?.label ?? c.rel, LEX_LEVELS.find((l) => l.id === c.level)?.label ?? c.level, LEX_DIFFS.find((d) => d.id === c.diff)?.label ?? c.diff];
  }
  const c = parseMemory(config);
  return [MODES.find((m) => m.id === c.mode)?.label ?? c.mode, MEM_DIFFS.find((d) => d.id === c.diff)?.label ?? c.diff, ...(c.startPage > 0 ? [`départ à la page ${c.startPage + 1}`] : [])];
}

import { useEffect, useRef, useState } from 'react';
import { BackButton } from '../../components/BackButton';
import { ENEMY_KINDS, kindFor } from '../../components/InkEnemy';
import type { EnemyMood } from '../../components/InkEnemy';
import type { CourseDiff } from '../../game/course/questions';
import { ruleInfo } from '../../game/encre/rules';
import type { RuleId } from '../../game/encre/rules';
import { Sfx } from '../../game/audio';
import { BOSS_AT, HINT, isTyped, roleOf, ROUNDS } from '../../game/spelling/engine';
import type { Item } from '../../game/spelling/engine';
import type { GameState, Round } from './types';
import { fmt, reducedMotion, T } from './helpers';
import { foeName, Hearts, Progress, Stage } from './Stage';
import { Sheet, TypeBox } from './Sheet';

// ═══════════════════════════════ L'écran de jeu ═══════════════════════════════

export interface PlayProps {
  s: GameState;
  round: Round;
  counter: { n: number; score: number };
  summon: RuleId | null;
  diff: CourseDiff;
  sfx: Sfx;
  onWritten: () => void;
  onTap: (i: number) => void;
  onPick: (c: string) => void;
  onNext: () => void;
  onBack: () => void;
  onTip: () => void;
}

/** Fin d'une manche : la créature est touchée, s'enfuit (réponse donnée) ou gagne (plus de vie). */
export type Outcome = 'strike' | 'flee' | 'win' | null;

/**
 * L'écran de combat, en trois bandes de proportions fixes : la scène (ton canon à gauche, la créature à droite), la feuille
 * où la créature écrit sa phrase, puis la zone de réponse, dont la hauteur est réservée pour que rien ne bouge.
 */
export function PlayView({ s, round, counter, summon, diff, sfx, onWritten, onTap, onPick, onNext, onBack, onTip }: PlayProps) {
  const duel = !!s.duel;
  const total = duel ? (s.duel as { items: Item[] }).items.length : ROUNDS;
  const boss = !duel && s.asked === BOSS_AT;
  const role = roleOf(round.item, boss);
  const slot = s.order[s.asked % ENEMY_KINDS];
  const kind = kindFor(role, slot);
  const name = foeName(role, slot);
  const done = round.step === 'done';
  const outcome: Outcome = done ? (round.lost ? 'win' : round.revealed ? 'flee' : 'strike') : null;
  const typed = isTyped(diff, s.level);

  // ─── chronologie des effets : impact du boulet, puis la correction s'écrit ───
  const [impact, setImpact] = useState(false);
  const [corrected, setCorrected] = useState(false);
  useEffect(() => {
    setImpact(false);
    setCorrected(false);
    if (!outcome) return;
    if (outcome !== 'strike' || reducedMotion()) {
      setImpact(outcome === 'strike');
      setCorrected(true);
      if (outcome === 'strike') sfx.play('correct');
      return;
    }
    sfx.play('cannon');
    const a = window.setTimeout(() => {
      setImpact(true);
      sfx.play(boss ? 'bigkill' : 'impact');
    }, T.shot);
    const b = window.setTimeout(() => {
      setCorrected(true);
      sfx.play('correct');
    }, T.shot + T.fix);
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outcome, round.item.id]);

  const mood: EnemyMood = outcome === 'strike' ? (impact ? 'dead' : 'angry') : outcome === 'win' ? 'attack' : round.step === 'write' ? 'write' : round.step === 'fix' || round.hits > 0 ? 'angry' : 'idle';

  const nextRef = useRef<HTMLButtonElement>(null);
  const fixRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (round.step === 'done') nextRef.current?.focus({ preventScroll: true });
    else if (round.step === 'fix' && !typed) fixRef.current?.focus({ preventScroll: true });
  }, [round.step, round.item.id, typed]);

  const ask = round.msg
    ? round.msg
    : round.step === 'write'
      ? `${name} écrit sa phrase…`
      : round.step === 'tap'
        ? 'Touche le mot mal écrit.'
        : round.step === 'fix'
          ? typed
            ? 'Écris la bonne orthographe du mot.'
            : 'Choisis la bonne écriture.'
          : outcome === 'strike'
            ? round.tries > 1
              ? 'Corrigé ! La créature est vaincue.'
              : 'Bravo ! La créature est vaincue.'
            : outcome === 'flee'
              ? 'La créature s’enfuit. Voici la bonne écriture.'
              : 'L’encre a gagné cette fois. Voici la bonne phrase.';
  const askTone = round.msg && !done ? ' hx-ask-bad' : outcome === 'strike' ? ' hx-ask-good' : '';

  return (
    <section aria-label="Partie en cours" className="hx">
      <header className="hx-hud">
        <BackButton onClick={onBack} label="Menu" />
        <div className="hx-hud-mid">
          <span className="hx-count">{duel ? `Duel · ${counter.n}/${total}` : `Phrase ${counter.n}/${total}`}</span>
          <Progress total={total} at={counter.n} boss={!duel} />
        </div>
        <div className="hx-hud-end">
          {!duel && <Hearts hp={s.hp} max={s.maxHp} hits={round.hits} />}
          {!duel && <span className="hx-score num">{fmt(s.score)} pts</span>}
        </div>
      </header>

      <div className="hx-tags">
        <span className="hx-rule" title={ruleInfo(round.item.rule).fault}>
          {duel ? ruleInfo((s.duel as { rule: RuleId }).rule).name : ruleInfo(round.item.rule).name}
        </span>
        {!duel && (summon || s.retry.includes(round.item.id)) && <span className="hx-again">{summon ? 'À revoir' : 'Phrase ratée la dernière fois'}</span>}
      </div>

      <Stage key={round.item.id} role={role} kind={kind} name={name} mood={mood} hits={round.hits} outcome={outcome} impact={impact} />

      <p className={`hx-ask${askTone}`} aria-live="polite">
        {ask}
      </p>

      <Sheet round={round} sfx={sfx} tuto={s.tuto && s.asked === 0} corrected={corrected} onWritten={onWritten} onTap={onTap} />

      <div className="hx-zone">
        <div className={`hx-layer${round.step === 'fix' ? '' : ' off'}`} aria-hidden={round.step !== 'fix'}>
          {typed ? (
            <TypeBox key={round.item.id + round.tries} word={round.item.wrong} active={round.step === 'fix'} onSend={onPick} />
          ) : (
            <div className="hx-choices" role="group" aria-label="Propositions" data-n={round.choices.length}>
              {round.choices.map((c, i) => {
                const tried = round.wrongPicks.includes(c);
                return (
                  <button
                    key={c}
                    ref={i === 0 ? fixRef : undefined}
                    type="button"
                    className={`hx-choice${tried ? ' tried' : ''}`}
                    disabled={tried || round.step !== 'fix'}
                    aria-label={tried ? `${c} : ce n’est pas la bonne écriture` : c}
                    onClick={() => onPick(c)}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          )}
          <div className="hx-help">
            {HINT[diff] === 'cost' && !round.tipShown ? (
              <button type="button" className="hx-hint" onClick={onTip} disabled={round.step !== 'fix'}>
                Voir l’astuce <small>(moins de points)</small>
              </button>
            ) : (
              <p className={`hx-tip${round.tipShown ? '' : ' ghost'}`}>
                <strong>Astuce :</strong> {round.item.tip}
              </p>
            )}
          </div>
        </div>
        <div className={`hx-layer${done ? '' : ' off'}`} aria-hidden={!done}>
          <p className="hx-tip">
            <strong>À retenir :</strong> {round.item.tip}
          </p>
          <div className="hx-end">
            <span className={`hx-gain num${done && !duel && round.gained > 0 ? '' : ' ghost'}`}>+ {round.gained} points</span>
            <button ref={nextRef} type="button" className="btn btn-primary hx-next" onClick={onNext} disabled={!done}>
              {round.lost ? 'Voir mon bilan' : s.asked + 1 >= total ? 'Terminer' : 'Phrase suivante'}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

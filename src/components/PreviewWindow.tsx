import { CannonIcon, InkEnemy } from './InkEnemy';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Sfx } from '../game/audio';
import type { SfxName } from '../game/audio';
import { Game } from '../game/engine';
import { CourseGame } from '../game/course/engine';
import { MemoryGame } from '../game/memory/engine';
import { levelOf } from '../game/grade';
import type { Grade } from '../game/grade';
import { PREVIEWS } from './Preview';
import type { PreviewGame } from './Preview';

const STEP_MS = 5200;

/** Sons joués à chaque étape de l'extrait d'orthographe (les autres jeux jouent leurs propres sons). */
const SPELLING_SOUNDS: Array<SfxName | null> = ['scribble', 'select', 'select', 'impact'];

/**
 * Fenêtre d'extrait : s'ouvre par-dessus l'accueil comme un petit onglet. En haut, le jeu joué tout seul
 * (avec le son, coupable d'un clic) ; en dessous, le texte qui explique, étape par étape, sans jamais le recouvrir.
 */
export default function PreviewWindow({ game, grade, onClose, onPlay }: { game: PreviewGame; grade: Grade | null; onClose: () => void; onPlay: () => void }) {
  const info = PREVIEWS[game];
  const [step, setStep] = useState(0);
  const [sound, setSound] = useState(true);
  const sfx = useMemo(() => new Sfx(), []);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    sfx.enabled = sound;
  }, [sfx, sound]);

  // Le jeu, joué tout seul dans la fenêtre
  useEffect(() => {
    sfx.unlock(); // le clic sur le « i » est le geste qui autorise le son
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (game === 'typing') {
      const g = new Game(canvas, sfx, { onGameOver: () => {}, onHint: () => {}, onCharge: () => {} });
      g.setDemoSound(true);
      g.startDemo();
      return () => g.destroy();
    }
    if (game === 'math') {
      const g = new CourseGame(canvas, sfx, { onOver: () => {} });
      g.startDemo(levelOf(grade), true);
      return () => g.destroy();
    }
    if (game === 'memory') {
      const g = new MemoryGame(canvas, sfx, { onOver: () => {} });
      g.setGrade(levelOf(grade));
      g.setDemoSound(true);
      g.startDemo();
      return () => g.destroy();
    }
  }, [game, grade, sfx]);

  // Les étapes défilent toutes seules ; un clic sur un point reprend le compte
  useEffect(() => {
    const id = window.setTimeout(() => setStep((k) => (k + 1) % info.steps.length), STEP_MS);
    return () => window.clearTimeout(id);
  }, [step, info.steps.length]);

  useEffect(() => {
    if (game !== 'spelling') return;
    const name = SPELLING_SOUNDS[step];
    if (name) sfx.play(name);
  }, [game, step, sfx]);

  // Clavier : Échap ferme, Tab reste dans la fenêtre ; le focus revient au « i » à la fermeture
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const items = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled])')];
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, [onClose]);

  const cur = info.steps[step];
  return (
    <div className="pw-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={dialogRef} className="pw" role="dialog" aria-modal="true" aria-labelledby="pw-title">
        <div className="pw-bar">
          <span className="pw-lights" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span id="pw-title" className="pw-tab">
            Extrait · {info.title}
          </span>
          <button type="button" className="pw-icon" aria-pressed={sound} aria-label={sound ? 'Couper le son' : 'Activer le son'} onClick={() => setSound((v) => !v)}>
            <span aria-hidden="true">{sound ? '🔊' : '🔇'}</span>
            <span className="pw-icon-text">{sound ? 'Son' : 'Muet'}</span>
          </button>
          <button type="button" className="pw-icon" aria-label="Fermer l’extrait" onClick={onClose}>
            <span aria-hidden="true">✕</span>
          </button>
        </div>

        <div className={`pw-view${game === 'spelling' ? ' pw-doc' : ''}`}>
          {game === 'spelling' ? <SpellingScene step={step} /> : <canvas ref={canvasRef} role="img" aria-label={`Extrait de ${info.title} : ${info.goal}`} />}
        </div>

        <div className="pw-body">
          <p className="pw-goal">{info.goal}</p>
          <div className="pw-step" role="status" aria-live="polite">
            <p className="pw-step-title">
              <span className="pw-step-n">{step + 1}</span> {cur.title}
            </p>
            <p className="pw-step-text">{cur.text}</p>
          </div>
          <div className="pw-foot">
            <div className="pw-dots" role="group" aria-label="Étapes de l’extrait">
              {info.steps.map((s, k) => (
                <button key={s.title} type="button" className={k === step ? 'on' : ''} aria-label={`Étape ${k + 1} : ${s.title}`} aria-current={k === step} onClick={() => setStep(k)} />
              ))}
            </div>
            <button ref={closeRef} type="button" className="btn btn-ghost" onClick={onClose}>
              Fermer
            </button>
            <button type="button" className="btn btn-primary" onClick={onPlay}>
              Jouer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Extrait de « Chasse aux fautes » : la créature écrit sa phrase, le mot fautif est entouré, la bonne écriture est choisie,
 * puis le canon tire et la phrase est corrigée. Même dessin que le jeu ; décor seulement, rien n'est cliquable.
 */
function SpellingScene({ step }: { step: number }) {
  const fixed = step >= 3;
  return (
    <div className="hx hx-demo" aria-hidden="true">
      <div className="hx-stage hx-tache" style={{ ['--foe' as string]: '60%' }}>
        <div className="hx-ground" />
        <div className="hx-me">
          <div key={fixed ? 'f' : 'a'} className={`hx-cannon${fixed ? ' fire' : ''}`}>
            <CannonIcon />
            {fixed && <span className="hx-flash" />}
          </div>
          <span className="hx-tag">Toi</span>
        </div>
        <div className="hx-foe">
          <span className="hx-tag hx-foe-tag">Gribouille</span>
          <div className="hx-foe-in" key={step === 0 ? 'in' : 'stay'}>
            <InkEnemy kind={0} mood={fixed ? 'dead' : step === 0 ? 'write' : step === 2 ? 'angry' : 'idle'} name="Gribouille" />
          </div>
        </div>
        {fixed && (
          <span className="hx-ball">
            <i />
          </span>
        )}
      </div>
      <div className="hx-sheet">
        <div className="hx-line">
          <span className="hx-w">Les</span>
          <span className="hx-w">enfants</span>
          {step < 2 && <span className={`hx-w${step === 1 ? ' hx-demo-point' : ''}`}>joue</span>}
          {step === 2 && <span className="hx-w hx-found">joue</span>}
          {fixed && (
            <span className="hx-w hx-fixed on">
              <span className="hx-was">joue</span>
              <span className="hx-right">jouent</span>
            </span>
          )}
          <span className="hx-w">dehors.</span>
        </div>
      </div>
      <div className="hx-choices" data-n="3" style={{ visibility: step === 2 ? 'visible' : 'hidden' }}>
        {['joue', 'jouent', 'joues'].map((c) => (
          <span key={c} className="hx-choice">
            {c}
          </span>
        ))}
      </div>
    </div>
  );
}

import { CannonIcon, InkEnemy } from './InkEnemy';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Sfx } from '../game/audio';
import { Game } from '../game/engine';
import { CourseGame } from '../game/course/engine';
import { MemoryGame } from '../game/memory/engine';
import { levelOf } from '../game/grade';
import type { Grade } from '../game/grade';
import { PREVIEWS } from './Preview';
import type { PreviewGame, PreviewStep } from './Preview';
import { useDialog } from './Dialog';

/**
 * Fenêtre d'extrait : s'ouvre par-dessus l'accueil comme un petit onglet. En haut, le jeu joué tout seul
 * (avec le son, coupable d'un clic) ; en dessous, le texte qui explique, étape par étape, sans jamais le recouvrir.
 * Les étapes ne défilent JAMAIS toutes seules : l'élève passe à la suivante quand il a fini de lire (bouton ou flèches).
 * La zone de texte a toujours la hauteur de l'étape la plus longue : la fenêtre ne change pas de taille d'une étape à l'autre.
 */
export default function PreviewWindow({ game, grade, onClose, onPlay }: { game: PreviewGame; grade: Grade | null; onClose: () => void; onPlay: () => void }) {
  const info = PREVIEWS[game];
  const [step, setStep] = useState(0);
  const [sound, setSound] = useState(true);
  const sfx = useMemo(() => new Sfx(), []);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const lastRef = useRef(info.steps.length - 1);
  lastRef.current = info.steps.length - 1;

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

  const last = info.steps.length - 1;
  const goTo = (k: number) => setStep(Math.max(0, Math.min(last, k)));

  // Chaque étape a son petit son (coupé si l'élève a mis le muet)
  useEffect(() => {
    sfx.play(info.steps[step].sound);
  }, [info, step, sfx]);

  // Fenêtre modale : focus piégé, reste de la page inerte, focus rendu au « i » à la fermeture (voir Dialog.tsx)
  useDialog(dialogRef);

  // Clavier : Échap ferme, flèches ← → changent d'étape
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        e.preventDefault();
        setStep((k) => Math.max(0, Math.min(lastRef.current, k + (e.key === 'ArrowRight' ? 1 : -1))));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
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
          <div className="pw-steps">
            <div key={step} className="pw-step" role="status" aria-live="polite">
              <StepText n={step + 1} step={cur} />
            </div>
            {/* les autres étapes, invisibles : elles donnent à la zone la hauteur de la plus longue */}
            {info.steps.map((s, k) => (
              <div key={s.title} className="pw-step pw-sizer" aria-hidden="true">
                <StepText n={k + 1} step={s} />
              </div>
            ))}
          </div>
          <div className="pw-dots" role="group" aria-label="Étapes de l’extrait">
            {info.steps.map((s, k) => (
              <button key={s.title} type="button" className={k === step ? 'on' : ''} aria-label={`Étape ${k + 1} : ${s.title}`} aria-current={k === step} onClick={() => goTo(k)} />
            ))}
          </div>
          <div className="pw-foot">
            <div className="pw-nav">
              <button type="button" className="btn btn-ghost" disabled={step === 0} onClick={() => goTo(step - 1)}>
                <span aria-hidden="true">←</span> Précédent
              </button>
              <span className="pw-count" aria-hidden="true">
                {step + 1} / {info.steps.length}
              </span>
              <button type="button" className="btn btn-ghost" disabled={step === last} onClick={() => goTo(step + 1)}>
                Suivant <span aria-hidden="true">→</span>
              </button>
            </div>
            <div className="pw-actions">
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
    </div>
  );
}

function StepText({ n, step }: { n: number; step: PreviewStep }) {
  return (
    <>
      <p className="pw-step-title">
        <span className="pw-step-n">{n}</span> {step.title}
      </p>
      <p className="pw-step-text">{step.text}</p>
      <p className="pw-ex">
        <span className="pw-ex-label">Exemple</span> {step.example}
      </p>
    </>
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

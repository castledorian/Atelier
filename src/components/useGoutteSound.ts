import { useCallback, useEffect, useState } from 'react';
import { Sfx } from '../game/audio';
import type { SfxName } from '../game/audio';
import { loadSettings, saveSettings } from '../game/storage';

/**
 * Les sons de la goutte. Ils suivent le réglage « Son » de l'appareil, le même que dans les jeux :
 * couper le son ici le coupe partout (un seul interrupteur à retenir en classe).
 * L'audio ne démarre qu'au premier geste de l'élève (exigence des navigateurs), jamais tout seul.
 */
export function useGoutteSound() {
  const [sfx] = useState(() => new Sfx());
  const [on, setOn] = useState(() => loadSettings().sound);

  useEffect(() => {
    sfx.enabled = on;
  }, [sfx, on]);

  const play = useCallback(
    (name: SfxName) => {
      if (!on) return;
      sfx.unlock();
      sfx.play(name);
    },
    [sfx, on],
  );

  const toggle = useCallback(() => {
    setOn((v) => {
      const next = !v;
      saveSettings({ ...loadSettings(), sound: next });
      return next;
    });
  }, []);

  return { on, toggle, play };
}

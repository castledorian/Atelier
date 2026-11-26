import { useCallback, useEffect, useRef, useState } from 'react';
import { GAIN_EVENT, currentView, feedMeal, needsSend, pet as petLocal, setLook as setLookLocal, storeServer, viewOf } from '../game/goutte/store';
import type { Meal } from '../game/goutte/store';
import { emptyCounters } from '../game/goutte/rules';
import type { GoutteView } from '../game/goutte/store';
import type { Look } from '../game/goutte/rules';
import { fetchGoutte, saveGoutte } from '../server/goutte';

/**
 * La goutte de l'élève, à jour : ce qui est sur l'appareil tout de suite, puis la réponse du serveur (élève connecté).
 * Les changements (friandise donnée, objet porté) sont gardés sur l'appareil et envoyés peu après ; hors ligne, ils partent
 * à la prochaine ouverture.
 */
export function useGoutte(token: string | null, readOnly = false) {
  // lecture seule (observation) : seulement la réponse du serveur, rien de l'appareil
  const [view, setView] = useState<GoutteView>(() => (readOnly ? viewOf(emptyCounters(), null, 0) : currentView()));
  const [synced, setSynced] = useState(false);
  const timer = useRef<number | null>(null);

  const sync = useCallback(async () => {
    if (!token) return;
    const got = await fetchGoutte(token);
    if (readOnly) {
      if (got) setView(viewOf(got.counters, got.look, got.fed));
      setSynced(got !== null);
      return;
    }
    if (got) storeServer(got);
    if (!readOnly && needsSend()) {
      const v = currentView();
      const saved = await saveGoutte(token, v.look, v.fed);
      if (saved) storeServer(saved, true);
    }
    setView(currentView());
    setSynced(got !== null);
  }, [token, readOnly]);

  useEffect(() => {
    if (!readOnly) setView(currentView());
    void sync();
    const onGain = () => {
      if (!readOnly) setView(currentView());
      // le serveur recompte depuis la partie qu'il vient de recevoir : on lui laisse le temps de l'enregistrer
      window.setTimeout(() => void sync(), 2500);
    };
    window.addEventListener(GAIN_EVENT, onGain);
    return () => window.removeEventListener(GAIN_EVENT, onGain);
  }, [sync]);

  const push = useCallback(() => {
    if (!token || readOnly) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void sync(), 800);
  }, [token, readOnly, sync]);

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  /** Donne la prochaine friandise : renvoie ce qui a été mangé (pour l'animation), ou null. */
  const feed = useCallback((): Meal | null => {
    if (readOnly) return null;
    const meal = feedMeal();
    if (!meal) return null;
    setView(meal.view);
    push();
    return meal;
  }, [push, readOnly]);

  /** Une caresse (rien n'est envoyé au serveur : c'est un moment entre l'élève et sa goutte). */
  const pet = useCallback((): boolean => {
    if (readOnly) return false;
    const r = petLocal();
    setView(r.view);
    return r.counted;
  }, [readOnly]);

  /** Les besoins baissent avec le temps : on rafraîchit l'affichage chaque minute. */
  useEffect(() => {
    if (readOnly) return;
    const id = window.setInterval(() => setView(currentView()), 60_000);
    return () => window.clearInterval(id);
  }, [readOnly]);

  const setLook = useCallback(
    (look: Look) => {
      if (readOnly) return;
      setView(setLookLocal(look));
      push();
    },
    [push, readOnly],
  );

  return { view, synced, feed, pet, setLook, refresh: sync };
}

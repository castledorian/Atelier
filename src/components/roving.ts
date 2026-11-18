import { useEffect } from 'react';

/**
 * Flèches du clavier dans les groupes d'onglets (role="tablist") et de choix (role="radiogroup") :
 * ←/↑ et →/↓ passent au précédent / suivant (en boucle), Début / Fin vont au premier / dernier.
 * Le choix est validé en même temps (comme le veut le modèle WAI-ARIA), puis le focus suit.
 * Un seul écouteur pour tout le site : il ne réagit que si le focus est déjà sur un onglet ou un choix,
 * donc il ne gêne jamais les touches des jeux.
 */
export function useRovingArrows() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      const role = t.getAttribute('role');
      if (role !== 'tab' && role !== 'radio') return;
      const group = t.closest(role === 'tab' ? '[role="tablist"]' : '[role="radiogroup"]');
      if (!group) return;
      const items = [...group.querySelectorAll<HTMLElement>(`[role="${role}"]`)].filter((x) => !(x as HTMLButtonElement).disabled);
      const i = items.indexOf(t);
      if (i < 0 || items.length < 2) return;
      let j = i;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % items.length;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + items.length) % items.length;
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = items.length - 1;
      else return;
      e.preventDefault();
      e.stopPropagation();
      items[j].focus();
      items[j].click();
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, []);
}

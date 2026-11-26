/** Pièces communes aux écrans de l'espace « Équilibrage » de l'administration. */

export const ORDER = ['cp', 'ce1', 'ce2', 'cm1', 'cm2'];
export const ALL_GAMES = ['typing', 'math', 'spelling', 'lexique', 'memory', 'facteur'];
export const num = (n: number | null | undefined, unit = '') => (n === null || n === undefined ? '—' : `${String(n).replace('.', ',')}${unit}`);
export const fmt = (n: number) => n.toLocaleString('fr-FR');
export const stamp = () => new Date().toISOString().slice(0, 10);

/** Pourcentage d'erreurs : le chiffre est toujours écrit, la barre n'est qu'un repère. */
export function Meter({ pct, good = false }: { pct: number | null; good?: boolean }) {
  const v = pct ?? 0;
  return (
    <span className={good ? 'adm-meter adm-meter-good' : 'adm-meter'}>
      <span className="adm-meter-bar" aria-hidden="true">
        <i style={{ width: `${Math.min(100, Math.max(0, v))}%` }} />
      </span>
      <strong>{num(pct, ' %')}</strong>
    </span>
  );
}

import { plain, slug } from './words';

/**
 * La voix du facteur : le mot est lu à voix haute une fois le colis rangé.
 *
 * 1. Si un enregistrement existe (`public/facteur/voix/<mot>.mp3`, nommé comme l'image : minuscules, sans accent), c'est lui qui est joué :
 *    même voix, même prononciation sur tous les postes, et rien n'est envoyé nulle part (fichier du site lui-même).
 * 2. Sinon, la voix du poste (synthèse du navigateur) sert de secours, comme avant.
 *
 * La liste des enregistrements présents est relevée à la construction du site (vite.config.ts) : rien d'autre à modifier.
 */

declare const __FACTEUR_VOICES__: string[] | undefined;

const FILES: string[] = typeof __FACTEUR_VOICES__ !== 'undefined' ? __FACTEUR_VOICES__ : [];
const BY_SLUG = new Map(FILES.map((f) => [f.replace(/\.[^.]+$/, ''), f]));

/** Adresse de l'enregistrement du mot (écrit avec ses lettres muettes entre parenthèses ou non), ou null s'il n'existe pas. */
export function voiceFileOf(mark: string): string | null {
  const file = BY_SLUG.get(slug(mark));
  return file ? `./facteur/voix/${file}` : null;
}

/** Mots (hors mots-outils compris) qui n'ont pas encore d'enregistrement : pour dire à l'enseignant ce qu'il reste à fournir. */
export const missingVoices = (marks: string[]): string[] => marks.filter((m) => !BY_SLUG.has(slug(m))).map(slug);

let player: HTMLAudioElement | null = null;
/** Enregistrements déjà chargés (adresse interne du navigateur) : la lecture est alors immédiate. */
const loaded = new Map<string, string>();
/** Repère de la dernière demande de lecture : un chargement tardif ne doit pas parler par-dessus un mot plus récent. */
let ticket = 0;

function speakWithDevice(text: string): void {
  try {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'fr-FR';
    u.rate = 0.8;
    synth.speak(u);
  } catch {
    /* pas de voix sur ce poste : le jeu fonctionne sans */
  }
}

/** Charge l'enregistrement d'un mot (une fois). Rend l'adresse à jouer, ou null s'il n'y en a pas ou s'il ne se charge pas. */
async function load(mark: string): Promise<string | null> {
  const key = slug(mark);
  const known = loaded.get(key);
  if (known) return known;
  const src = voiceFileOf(mark);
  if (!src) return null;
  try {
    const res = await fetch(src);
    if (!res.ok) return null;
    const url = URL.createObjectURL(await res.blob());
    loaded.set(key, url);
    return url;
  } catch {
    return null;
  }
}

/** À lancer au début d'une partie : les enregistrements des mots à venir sont chargés d'avance (quelques Ko chacun). */
export function preloadVoices(marks: string[]): void {
  for (const m of marks) void load(m);
}

/** Lit le mot. Sans enregistrement (ou s'il ne se charge pas), la voix du poste prend le relais. */
export function say(mark: string): void {
  stopSaying();
  const mine = ++ticket;
  void load(mark).then((url) => {
    if (mine !== ticket) return;
    if (!url || typeof Audio === 'undefined') {
      speakWithDevice(plain(mark));
      return;
    }
    try {
      const a = new Audio(url);
      player = a;
      a.addEventListener('error', () => {
        if (player === a && mine === ticket) speakWithDevice(plain(mark));
      });
      const started = a.play();
      if (started && typeof started.catch === 'function') started.catch(() => undefined);
    } catch {
      speakWithDevice(plain(mark));
    }
  });
}

export function stopSaying(): void {
  ticket++;
  try {
    if (player) {
      player.pause();
      player = null;
    }
    window.speechSynthesis?.cancel();
  } catch {
    /* rien */
  }
}

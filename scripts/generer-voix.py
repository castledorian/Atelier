#!/usr/bin/env python3
"""
Génère les voix du jeu « Le facteur » (un fichier .mp3 par mot) avec Piper, une synthèse vocale NEURONALE qui fonctionne
hors ligne sur votre ordinateur. À lancer UNE fois, sur un poste connecté à Internet ; ensuite le site n'a plus besoin de rien.

  pip install piper-tts
  python -m piper.download_voices fr_FR-siwis-medium      # (ou une autre voix française : voir la liste de Piper)
  python scripts/generer-voix.py [--voix fr_FR-siwis-medium] [--dossier public/facteur/voix]

Il faut aussi ffmpeg (conversion en mp3, silence retiré au début et à la fin, volume égalisé).
La liste des mots est dans public/facteur/voix/mots.txt : « slug;texte lu;prononciation ». Si un mot est mal prononcé,
écrire dans la 3e colonne comment le dire (ex. « pull;pull;pul ») puis relancer avec --mot pull.
ÉCOUTER chaque fichier avant de publier : une synthèse lit parfois mal un mot isolé.
Vérifier la licence de la voix choisie (voir sa fiche sur le dépôt de Piper) avant de l'utiliser dans une classe.
"""
import argparse
import pathlib
import subprocess
import sys
import tempfile


def lire_mots(chemin: pathlib.Path):
    for ligne in chemin.read_text(encoding="utf-8").splitlines():
        ligne = ligne.strip()
        if not ligne or ligne.startswith("#"):
            continue
        cols = [c.strip() for c in ligne.split(";")]
        slug = cols[0]
        texte = cols[2] if len(cols) > 2 and cols[2] else (cols[1] if len(cols) > 1 else slug)
        yield slug, texte


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--voix", default="fr_FR-siwis-medium", help="nom du modèle Piper (fichier .onnx)")
    ap.add_argument("--dossier", default="public/facteur/voix")
    ap.add_argument("--mot", action="append", help="ne refaire que ce mot (slug) ; répétable")
    args = ap.parse_args()

    dossier = pathlib.Path(args.dossier)
    mots = list(lire_mots(dossier / "mots.txt"))
    if args.mot:
        mots = [m for m in mots if m[0] in args.mot]

    for slug, texte in mots:
        sortie = dossier / f"{slug}.mp3"
        with tempfile.TemporaryDirectory() as tmp:
            wav = pathlib.Path(tmp) / "mot.wav"
            # une phrase très courte : le point final donne au mot une fin « posée », comme un mot dit seul
            subprocess.run(
                [sys.executable, "-m", "piper", "-m", args.voix, "-f", str(wav), "--", texte + "."],
                check=True,
            )
            subprocess.run(
                [
                    "ffmpeg", "-y", "-loglevel", "error", "-i", str(wav),
                    "-af", "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,loudnorm=I=-16:TP=-1.5",
                    "-ac", "1", "-ar", "22050", "-b:a", "48k", str(sortie),
                ],
                check=True,
            )
        print(f"{slug:14s} {texte!r:18s} -> {sortie}")
    print(f"{len(mots)} fichier(s) écrit(s). Écoutez-les, puis publiez : le site relève les fichiers tout seul.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

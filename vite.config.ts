import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import type { Plugin } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { stampServiceWorker } from "./scripts/sw-version";

/**
 * Politique de sécurité du contenu (CSP) ajoutée à la page à la construction.
 * Le site tient dans un seul fichier : ses scripts sont autorisés par EMPREINTE (sha256), jamais en bloc.
 * Un script injecté par un tiers (ou collé dans une page) ne s'exécute donc pas, et la page ne peut parler
 * qu'à elle-même et au serveur de l'école : aucune donnée ne peut partir ailleurs.
 */
function csp(): Plugin {
  const server = /SERVER_URL: string = '([^']+)'/.exec(readFileSync("src/server/config.ts", "utf8"))?.[1] ?? "";
  return {
    name: "atelier-csp",
    apply: "build",
    enforce: "post",
    generateBundle(_o, bundle) {
      const page = bundle["index.html"];
      if (!page || page.type !== "asset") return;
      let html = String(page.source);
      const hashes = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
        .filter((m) => m[1].trim() !== "")
        .map((m) => `'sha256-${createHash("sha256").update(m[1]).digest("base64")}'`);
      const policy = [
        "default-src 'self'",
        `script-src ${hashes.join(" ") || "'self'"}`,
        "style-src 'self' 'unsafe-inline'", // styles en ligne du site lui-même (React) ; aucun script
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        "media-src 'self' blob:", // voix enregistrées du jeu « Le facteur » (fichiers du site, chargés puis joués en mémoire)
        `connect-src 'self' ${server}`.trim(),
        "manifest-src 'self'",
        "worker-src 'self'",
        "object-src 'none'",
        "frame-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
      ].join("; ");
      html = html.replace(/<meta charset="UTF-8" \/>/, (m) => `${m}\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />\n    <meta name="referrer" content="no-referrer" />`);
      page.source = html;
    },
  };
}

/** Donne au service worker un numéro de cache propre à chaque version du site (empreinte de index.html). */
function swVersion(): Plugin {
  let outDir = "dist";
  return {
    name: "atelier-sw-version",
    apply: "build",
    enforce: "post",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      const page = path.join(outDir, "index.html");
      const sw = path.join(outDir, "sw.js");
      if (!existsSync(page) || !existsSync(sw)) return;
      writeFileSync(sw, stampServiceWorker(readFileSync(sw, "utf8"), readFileSync(page)));
    },
  };
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Images des colis du jeu « Le facteur » : les fichiers déposés dans public/facteur/ (un par mot, nommé comme le mot, sans accent). */
const facteurImages = existsSync("public/facteur") ? readdirSync("public/facteur").filter((f) => /\.(webp|png|jpe?g|svg)$/i.test(f)).sort() : [];

/** Voix enregistrées des mots du jeu « Le facteur » : public/facteur/voix/<mot>.mp3 (même nom que l'image). Sans fichier, la voix du poste sert de secours. */
const facteurVoices = existsSync("public/facteur/voix") ? readdirSync("public/facteur/voix").filter((f) => /\.(mp3|ogg|m4a|wav)$/i.test(f)).sort() : [];

// https://vite.dev/config/
export default defineConfig({
  define: { __FACTEUR_IMAGES__: JSON.stringify(facteurImages), __FACTEUR_VOICES__: JSON.stringify(facteurVoices) },
  // chemins relatifs : le jeu fonctionne quel que soit le dossier où il est publié (GitHub Pages…)
  base: "./",
  plugins: [react(), tailwindcss(), viteSingleFile(), csp(), swVersion()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
});

/**
 * Frappe ! — classement de la classe
 * Script Google Apps Script à coller dans votre propre feuille Google Sheets
 * (voir GUIDE-ENSEIGNANT.md). Les résultats s'écrivent dans l'onglet « Parties ».
 */

var SHEET_NAME = 'Parties';
var HEADER = ['id', 'date', 'code', 'prenom', 'mode', 'score', 'vague', 'mots_par_minute', 'precision_pct'];
var RANKED_MODES = ['apprenti', 'standard', 'expert']; // modes classés
var ALL_MODES = ['apprenti', 'standard', 'expert', 'perso'];
var CODE_RE = /^[A-Z0-9_-]{2,24}$/;
var MAX_ROWS = 20000;

/** À lancer une fois à la main (bouton ▶) pour créer l'onglet et donner l'autorisation au script. */
function installer() {
  sheet_();
}

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEADER);
    sh.setFrozenRows(1);
    sh.getRange('A:A').setNumberFormat('@'); // les identifiants restent du texte
    sh.getRange('B:B').setNumberFormat('yyyy-mm-dd hh:mm');
  }
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function num_(v, min, max) {
  var n = Number(v);
  if (!isFinite(n)) n = 0;
  return Math.round(Math.min(max, Math.max(min, n)));
}

/** Prénom : majuscules, sans accent, 12 caractères, et jamais de début « = + - @ » (une feuille de calcul l'exécuterait). */
function cleanName_(v) {
  var s = String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ._-]/g, '')
    .trim()
    .slice(0, 12)
    .replace(/^[=+\-@.]+/, '');
  return s || 'ANONYME';
}

/** Enregistre (ou met à jour, si le prénom a changé après la partie) un score. */
function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents);
    var code = String(d.code || '').toUpperCase();
    var id = String(d.id || '');
    var diff = String(d.diff || '');
    if (!CODE_RE.test(code)) return json_({ ok: false, error: 'code' });
    if (!/^[A-Za-z0-9]{6,32}$/.test(id)) return json_({ ok: false, error: 'id' });
    if (ALL_MODES.indexOf(diff) < 0) return json_({ ok: false, error: 'mode' });

    var now = Date.now();
    var when = num_(d.date, 0, now + 86400000) || now;
    var row = [id, new Date(when), code, cleanName_(d.name), diff, num_(d.score, 0, 10000000), num_(d.wave, 0, 999), num_(d.wpm, 0, 300), num_(d.acc, 0, 100)];

    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var sh = sheet_();
      var last = sh.getLastRow();
      var found = 0;
      if (last > 1) {
        var keys = sh.getRange(2, 1, last - 1, 3).getValues();
        for (var i = keys.length - 1; i >= 0; i--) {
          if (String(keys[i][0]) === id && String(keys[i][2]).toUpperCase() === code) {
            found = i + 2;
            break;
          }
        }
      }
      if (found) sh.getRange(found, 1, 1, row.length).setValues([row]);
      else sh.appendRow(row);
    } finally {
      lock.releaseLock();
    }
    return json_({ ok: true });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function read_(code) {
  var sh = sheet_();
  var last = sh.getLastRow();
  if (last < 2) return [];
  var vals = sh.getRange(2, 1, Math.min(last - 1, MAX_ROWS), HEADER.length).getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    var v = vals[i];
    if (String(v[2]).toUpperCase() !== code) continue;
    out.push({
      id: String(v[0]),
      date: v[1] instanceof Date ? v[1].getTime() : Number(v[1]) || 0,
      name: String(v[3]),
      diff: String(v[4]),
      score: Number(v[5]) || 0,
      wave: Number(v[6]) || 0,
      wpm: Number(v[7]) || 0,
      acc: Number(v[8]) || 0,
    });
  }
  return out;
}

/** action=top : meilleurs scores d'un mode (le meilleur de chaque prénom) · action=all : toutes les parties · action=ping */
function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    var code = String(p.code || '').toUpperCase();
    if (!CODE_RE.test(code)) return json_({ ok: false, error: 'code' });
    var action = p.action || 'top';

    if (action === 'ping') return json_({ ok: true });

    var rows = read_(code);

    if (action === 'all') {
      rows.sort(function (a, b) {
        return b.date - a.date;
      });
      return json_({ ok: true, rows: rows.slice(0, 5000) });
    }

    var diff = String(p.diff || 'standard');
    if (RANKED_MODES.indexOf(diff) < 0) return json_({ ok: false, error: 'mode' });
    var limit = num_(p.limit || 10, 1, 50);
    var best = {};
    rows.forEach(function (r) {
      if (r.diff !== diff) return;
      var k = r.name.toLowerCase();
      if (!best[k] || r.score > best[k].score) best[k] = r;
    });
    var top = Object.keys(best).map(function (k) {
      return best[k];
    });
    top.sort(function (a, b) {
      return b.score - a.score;
    });
    return json_({ ok: true, rows: top.slice(0, limit) });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

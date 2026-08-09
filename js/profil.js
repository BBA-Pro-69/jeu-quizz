/* =====================================================================
   Quiz Famille · js/profil.js
   Profils et statistiques. Dépend de js/api.js pour le réseau.

   L'identité, c'est un surnom que toi seul connais. Il ne quitte jamais
   ton navigateur : on n'envoie que son empreinte SHA-256. La base ne
   peut donc pas te le révéler, même si quelqu'un la lisait en entier.
   ===================================================================== */
(function (global) {
'use strict';

var LS = 'quiz.profil.v1';
var SEL = 'quiz-famille:';   // sel fixe, contre les tables arc-en-ciel toutes faites

function rpc(nom, corps) {
  return global.Quiz.api('/rpc/' + nom, { method: 'POST', body: corps || {} });
}

/* crypto.subtle n'existe qu'en HTTPS ou sur localhost. En double-clic
   depuis le disque, cette page ne marchera pas, et c'est normal. */
async function empreinte(surnom) {
  if (!global.crypto || !crypto.subtle) throw new Error('Cette page doit être ouverte en HTTPS.');
  var texte = SEL + String(surnom).trim().toLowerCase();
  var bin = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texte));
  return Array.from(new Uint8Array(bin))
    .map(function (o) { return o.toString(16).padStart(2, '0'); }).join('');
}

function dire(e) {
  var m = (e && e.message) || '';
  if (m.indexOf('surnom_pris') >= 0)     return 'Ce surnom est déjà pris. Trouves-en un autre.';
  if (m.indexOf('surnom_inconnu') >= 0)  return 'Aucun profil avec ce surnom.';
  if (m.indexOf('hash_invalide') >= 0)   return 'Surnom illisible, réessaie.';
  if (m.indexOf('Failed to fetch') >= 0) return 'Pas de réseau. Le jeu marche quand même, sans historique.';
  return m || 'Erreur inconnue.';
}

/* ---- session locale -------------------------------------------------
   On garde l'empreinte sur l'appareil pour ne pas retaper le surnom à
   chaque partie. Qui a le téléphone déverrouillé est donc le joueur :
   assumé, c'est un jeu de famille. */
function garder(p) { try { localStorage.setItem(LS, JSON.stringify(p)); } catch (e) {} }
function courant() { try { return JSON.parse(localStorage.getItem(LS)); } catch (e) { return null; } }
function oublier() { try { localStorage.removeItem(LS); } catch (e) {} }

function age(naissance) {
  var n = new Date(naissance), a = new Date();
  var v = a.getFullYear() - n.getFullYear();
  var m = a.getMonth() - n.getMonth();
  if (m < 0 || (m === 0 && a.getDate() < n.getDate())) v--;
  return v;
}
function handicapPour(a) { return a <= 7 ? 'enfant' : a <= 10 ? 'decouverte' : 'normal'; }

async function creer(surnom, prenom, naissance, avatar, couleur) {
  var h = await empreinte(surnom);
  var r = await rpc('creer_profil', {
    p_hash: h, p_prenom: prenom, p_naissance: naissance,
    p_avatar: avatar || null, p_couleur: couleur || '#D8A94B'
  });
  var p = r[0]; p.hash = h; p.surnom = surnom; garder(p); return p;
}

async function connexion(surnom) {
  var h = await empreinte(surnom);
  var r = await rpc('connexion', { p_hash: h });
  var p = r[0]; p.hash = h; p.surnom = surnom; garder(p); return p;
}

async function maj(champs) {
  var p = courant();
  if (!p) throw new Error('surnom_inconnu');
  await rpc('maj_profil', {
    p_hash: p.hash,
    p_prenom: champs.prenom || null,
    p_naissance: champs.naissance || null,
    p_avatar: champs.avatar || null,
    p_couleur: champs.couleur || null
  });
  Object.keys(champs).forEach(function (k) { if (champs[k]) p[k] = champs[k]; });
  garder(p); return p;
}

/* Ce que le jeu affiche des autres : prénom, avatar, âge. Jamais le surnom. */
async function publique(id) {
  var r = await global.Quiz.api('/profils_publics?id=eq.' + encodeURIComponent(id) + '&select=*');
  return r && r[0];
}

/* ---- écriture d'une partie -----------------------------------------
   Une seule requête, en fin de partie. Le jeu ne dépend jamais de son
   succès : si ça casse, on a joué quand même. */
async function enregistrerPartie(mode, salon, lignes, reponses) {
  return rpc('enregistrer_partie', {
    p_mode: mode, p_salon: salon || null,
    p_lignes: lignes, p_reponses: reponses || []
  });
}

/* ---- statistiques --------------------------------------------------- */
var stats = {
  global:     function (id) { return rpc('stats_global',     { p_profil: id }).then(function (r) { return r[0]; }); },
  categories: function (id) { return rpc('stats_categories', { p_profil: id }); },
  difficulte: function (id) { return rpc('stats_difficulte', { p_profil: id }); },
  periode:    function (id, grain) { return rpc('stats_periode', { p_profil: id, p_grain: grain || 'week' }); }
};

/* ---- photo ----------------------------------------------------------
   96 px de côté, recadrée au centre, en WebP. Une photo de téléphone
   fait 4 Mo ; celle-ci fera 4 Ko et tient dans une colonne texte. */
function photo96(fichier) {
  return new Promise(function (ok, non) {
    var img = new Image(), url = URL.createObjectURL(fichier);
    img.onload = function () {
      var c = document.createElement('canvas'); c.width = c.height = 96;
      var x = c.getContext('2d');
      var cote = Math.min(img.width, img.height);
      x.drawImage(img, (img.width - cote) / 2, (img.height - cote) / 2, cote, cote, 0, 0, 96, 96);
      URL.revokeObjectURL(url);
      var d = c.toDataURL('image/webp', 0.8);
      if (d.indexOf('data:image/webp') !== 0) d = c.toDataURL('image/jpeg', 0.8);  // vieux Safari
      ok(d);
    };
    img.onerror = function () { URL.revokeObjectURL(url); non(new Error('Image illisible.')); };
    img.src = url;
  });
}

global.Quiz = global.Quiz || {};
global.Quiz.Profil = {
  empreinte: empreinte, dire: dire, creer: creer, connexion: connexion, maj: maj,
  courant: courant, oublier: oublier, publique: publique, photo96: photo96,
  age: age, handicapPour: handicapPour,
  enregistrerPartie: enregistrerPartie, stats: stats
};

})(window);

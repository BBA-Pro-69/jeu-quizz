/* =====================================================================
   Quiz Famille · js/profil.js
   Le profil de jeu : prénom, date de naissance, avatar, statistiques.

   L'identité vient de js/auth.js (email + mot de passe). Ici on ne
   manipule que ce que les autres joueurs ont le droit de voir.
   L'email n'apparaît nulle part dans ces données, c'est volontaire :
   on joue avec des prénoms, pas avec des adresses.

   On stocke la DATE DE NAISSANCE, jamais l'âge. L'âge se recalcule ;
   un âge stocké devient faux au premier anniversaire.
   ===================================================================== */
(function (global) {
'use strict';

var LS = 'quiz.profil.v1';
var P  = null;

function garder(p) {
  P = p;
  try { p ? localStorage.setItem(LS, JSON.stringify(p)) : localStorage.removeItem(LS); }
  catch (e) {}
  document.dispatchEvent(new CustomEvent('quiz:profil', { detail: p || null }));
}
function courant() {
  if (P) return P;
  try { P = JSON.parse(localStorage.getItem(LS)); } catch (e) { P = null; }
  return P;
}

/* Va chercher le profil en base. Renvoie null si l'utilisateur est
   connecté mais n'a pas encore rempli son profil — c'est l'état normal
   juste après la confirmation de l'email. */
async function charger() {
  if (!global.Quiz.Auth.connecte()) { garder(null); return null; }
  var r = await global.Quiz.rpc('mon_profil', {});
  var p = (r && r[0]) || null;
  garder(p);
  return p;
}

async function creer(prenom, naissance, avatar, couleur) {
  var r = await global.Quiz.rpc('creer_profil', {
    p_prenom: prenom, p_naissance: naissance,
    p_avatar: avatar || null, p_couleur: couleur || '#D8A94B'
  });
  garder(r && r[0]); return P;
}

async function maj(champs) {
  var r = await global.Quiz.rpc('maj_profil', {
    p_prenom:    champs.prenom    || null,
    p_naissance: champs.naissance || null,
    p_avatar:    champs.avatar    || null,
    p_couleur:   champs.couleur   || null
  });
  garder(r && r[0]); return P;
}

function age(naissance) {
  var n = new Date(naissance), a = new Date();
  var v = a.getFullYear() - n.getFullYear();
  var m = a.getMonth() - n.getMonth();
  if (m < 0 || (m === 0 && a.getDate() < n.getDate())) v--;
  return v;
}
function handicapPour(a) { return a <= 7 ? 'enfant' : a <= 10 ? 'decouverte' : 'normal'; }

/* Écriture d'une partie. Une seule requête, en fin de partie.
   Le jeu ne dépend jamais de son succès : si ça casse, on a joué. */
function enregistrerPartie(mode, salon, lignes, reponses) {
  return global.Quiz.rpc('enregistrer_partie', {
    p_mode: mode, p_salon: salon || null,
    p_lignes: lignes || [], p_reponses: reponses || []
  });
}

var stats = {
  global:     function (id) { return global.Quiz.rpc('stats_global',     { p_profil: id }).then(function (r) { return r && r[0]; }); },
  categories: function (id) { return global.Quiz.rpc('stats_categories', { p_profil: id }); },
  difficulte: function (id) { return global.Quiz.rpc('stats_difficulte', { p_profil: id }); },
  periode:    function (id, g) { return global.Quiz.rpc('stats_periode', { p_profil: id, p_grain: g || 'week' }); }
};

function classement(jours, minimum) {
  return global.Quiz.rpc('classement', {
    p_jours: jours || 90, p_minimum: minimum === undefined ? 20 : minimum
  });
}

/* Photo réduite à 96 px, recadrée au centre, en WebP. Une photo de
   téléphone fait 4 Mo ; celle-ci fait 4 Ko et tient dans une colonne
   texte, sans avoir à monter un bucket Storage. */
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
      if (d.indexOf('data:image/webp') !== 0) d = c.toDataURL('image/jpeg', 0.8); // vieux Safari
      ok(d);
    };
    img.onerror = function () { URL.revokeObjectURL(url); non(new Error('Image illisible.')); };
    img.src = url;
  });
}

global.Quiz = global.Quiz || {};
global.Quiz.Profil = {
  courant: courant, charger: charger, creer: creer, maj: maj,
  age: age, handicapPour: handicapPour, photo96: photo96,
  enregistrerPartie: enregistrerPartie, stats: stats, classement: classement,
  COULEURS: ['#D8A94B','#3FA9C9','#C8372D','#4FA96B','#8E6BB8','#E08A3C']
};

})(window);

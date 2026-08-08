/* =====================================================================
   Quiz Famille · js/engine.js
   Vérification des réponses et calcul des points.
   Fonctions pures : rien à l'écran, rien en réseau, rien en mémoire.
   ===================================================================== */
(function (global) {
'use strict';

/* Normalisation d'une réponse libre.
   « L'Éléphant ! » et « elephant » doivent être la même chose.
   Les tableaux `accept` des fichiers sont déjà en minuscules
   sans ponctuation : on ramène la saisie du joueur au même terrain. */
function normaliser(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')  // accents
    .replace(/[^a-z0-9 ]/g, ' ')                        // ponctuation
    .replace(/\s+/g, ' ')
    .trim();
}

/* Vérifie une réponse.
   `reponse` dépend du type :
     qcm        -> index cliqué (0..3)
     vraifaux   -> true / false
     libre      -> texte saisi
     estimation -> nombre saisi
     defi       -> true / false (verdict de la table)
   Retourne { bon, attendu, detail } — detail sert à expliquer à l'écran. */
function verifier(q, reponse, handicap) {
  var attendu = '', bon = false, detail = '';

  if (q.type === 'qcm') {
    attendu = 'ABCD'[q.answer] + ' · ' + q.choices[q.answer];
    bon = Number(reponse) === q.answer;

  } else if (q.type === 'vraifaux') {
    attendu = q.answer ? 'Vrai' : 'Faux';
    bon = (reponse === true || reponse === 'true') === (q.answer === true);

  } else if (q.type === 'libre') {
    attendu = q.answer;
    var saisie = normaliser(reponse);
    var liste  = [normaliser(q.answer)].concat((q.accept || []).map(normaliser));
    bon = saisie.length > 0 && liste.indexOf(saisie) !== -1;
    if (!bon && saisie.length > 3) {
      // Tolérance sur la faute de frappe : la bonne réponse contenue
      // dans la saisie, ou l'inverse. « le mont blanc » vaut « mont blanc ».
      bon = liste.some(function (a) {
        return a.length > 3 && (saisie.indexOf(a) !== -1 || a.indexOf(saisie) !== -1);
      });
    }
    if (!bon) detail = 'Si la table estime que c\'était bon, corrige le verdict.';

  } else if (q.type === 'estimation') {
    var n = parseFloat(String(reponse).replace(',', '.'));
    var m = global.Quiz.marge(q, handicap);
    attendu = q.answer + (q.unit ? ' ' + q.unit : '');
    if (!isNaN(n) && m) {
      bon = n >= m.min && n <= m.max;
      detail = 'accepté de ' + arrondi(m.min) + ' à ' + arrondi(m.max);
    }

  } else if (q.type === 'defi') {
    attendu = 'Défi';
    bon = reponse === true;
  }

  return { bon: bon, attendu: attendu, detail: detail };
}

/* Une question difficile rapporte plus. Rien de plus subtil pour l'instant :
   les modes de jeu ajouteront leurs propres multiplicateurs par-dessus. */
function points(q, bon) {
  return bon ? (q.difficulty || 1) * 10 : 0;
}

function arrondi(n) { return Math.round(n * 100) / 100; }

global.Quiz = global.Quiz || {};
global.Quiz.normaliser = normaliser;
global.Quiz.verifier   = verifier;
global.Quiz.points     = points;

})(window);

/* =====================================================================
   Quiz Famille · js/drawer.js
   Moteur de pioche.

   Charge les bibliothèques, filtre selon l'âge et les réglages,
   tire sans remise, et retient ce qui est déjà sorti.

   Ne touche jamais au DOM, n'affiche rien, ne connaît aucun mode de jeu.
   C'est volontaire : les modes viendront s'appuyer dessus sans le modifier.
   ===================================================================== */
(function (global) {
'use strict';

var LS_VUES = 'quiz.vues.v1';

/* Valeurs de secours, si categories.json ne fournit pas le bloc
   "handicaps". La source de vérité reste le JSON. */
var HANDICAPS = {
  expert:     { label: 'Expert',     pct: 0,  plusMoins: 0, weight: 1.00 },
  confirme:   { label: 'Confirmé',   pct: 5,  plusMoins: 0, weight: 1.05 },
  normal:     { label: 'Normal',     pct: 12, plusMoins: 0, weight: 1.12 },
  decouverte: { label: 'Découverte', pct: 25, plusMoins: 1, weight: 1.25 },
  enfant:     { label: 'Enfant',     pct: 45, plusMoins: 1, weight: 1.45 }
};

/* ---------------------------------------------------------------
   Historique anti-répétition.
   Forme : { "nature-animaux": ["nat-0003", "nat-0011"], ... }
   Un id ne doit jamais être réaffecté dans les fichiers de questions,
   sinon cet historique se met à mentir.
   --------------------------------------------------------------- */
function lireVues() {
  try { return JSON.parse(localStorage.getItem(LS_VUES)) || {}; }
  catch (e) { return {}; }
}

function ecrireVues(v) {
  try { localStorage.setItem(LS_VUES, JSON.stringify(v)); }
  catch (e) { /* navigation privée, quota plein : on continue sans mémoire */ }
}

async function lireJson(url) {
  var res = await fetch(url);
  if (!res.ok) throw new Error('Chargement impossible : ' + url + ' (HTTP ' + res.status + ')');
  return res.json();
}

/* ---------------------------------------------------------------
   Marge de tolérance sur une estimation.

     tol.exact -> écart = handicap.plusMoins  (0, sauf découverte/enfant)
     tol.pct   -> écart = réponse × (tol.pct + handicap.pct) / 100,
                  PLAFONNÉ à trois fois la tolérance de base.

   Le plafond corrige un effet de bord mesuré sur les 218 questions :
   +45 % sur « combien de dents » acceptait de 15 à 49. Le tol.pct
   écrit dans la question dit à quel point elle est devinable —
   25 % (« combien de langues dans le monde ») garde toute sa
   générosité, 6 % (« touches d'un piano ») reste une vraie question.

   Rappel : en mode « le plus proche gagne », rien de tout ceci ne
   s'applique. C'est ecartPondere qui décide. Et c'est le comportement
   par défaut des estimations en partie familiale.
   --------------------------------------------------------------- */
function marge(q, handicap) {
  if (!q || q.type !== 'estimation' || typeof q.answer !== 'number') return null;

  var h   = (typeof handicap === 'string' ? HANDICAPS[handicap] : handicap) || HANDICAPS.normal;
  var tol = q.tol || {};
  var ecart;

  if (tol.exact) {
    ecart = h.plusMoins || 0;
  } else {
    var base    = Math.abs(q.answer) * (tol.pct || 0) / 100;
    var additif = Math.abs(q.answer) * ((tol.pct || 0) + (h.pct || 0)) / 100;
    ecart = Math.min(additif, base * 3);
    if (h.plusMoins) ecart = Math.max(ecart, h.plusMoins);
  }

  return { ecart: ecart, min: q.answer - ecart, max: q.answer + ecart };
}

/* ---------------------------------------------------------------
   Mode « le plus proche gagne » : on ne tolère rien, on pondère.
   L'écart de chaque joueur est divisé par le weight de son handicap
   avant comparaison. Un enfant qui se trompe de 145 fait aussi bien
   qu'un expert qui se trompe de 100.
   --------------------------------------------------------------- */
function ecartPondere(reponseJoueur, q, handicap) {
  var h = (typeof handicap === 'string' ? HANDICAPS[handicap] : handicap) || HANDICAPS.normal;
  return Math.abs(reponseJoueur - q.answer) / (h.weight || 1);
}

/* =====================================================================
   La pioche
   ===================================================================== */
function creerPioche(options) {
  var opt = Object.assign({ base: 'data/', memoire: true }, options || {});

  var index  = null;   // contenu de categories.json
  var metas  = [];     // catégories jouables
  var parId  = {};     // id -> question enrichie
  var banque = {};     // clé catégorie -> tous les ids
  var sacs   = {};     // clé catégorie -> ids pas encore tirés
  var vues   = opt.memoire ? lireVues() : {};

  /* ---- chargement ---- */
  async function charger() {
    index = await lireJson(opt.base + 'categories.json');

    if (index.handicaps) HANDICAPS = index.handicaps;

    // Les extensions non activées ("entre-nous") ne sont pas chargées.
    metas = index.categories.filter(function (c) { return c.enabled !== false; });

    var fichiers = await Promise.all(metas.map(function (c) {
      return lireJson(opt.base + c.file);
    }));

    metas.forEach(function (c, i) {
      var data = fichiers[i];
      banque[c.key] = data.questions.map(function (q) {
        parId[q.id] = Object.assign({}, q, {
          categorie: c.key,
          categorieLabel: data.label || c.label,
          couleur: c.color,
          icone: c.icon
        });
        return q.id;
      });
      remplirSac(c.key);
    });

    return { categories: metas, total: Object.keys(parId).length };
  }

  function remplirSac(cle) {
    var deja = vues[cle] || [];
    sacs[cle] = banque[cle].filter(function (id) { return deja.indexOf(id) === -1; });
  }

  /* ---- filtrage ----
     critere = {
       categories   : ['geek','sport'],   // vide = toutes
       age          : 7,                  // âge du joueur ciblé
       maxDifficulty: 4,
       excludeTags  : ['alcool'],
       types        : ['qcm','vraifaux']  // optionnel
     }                                                            */
  function eligible(q, c) {
    if (!q) return false;
    if (typeof c.age === 'number' && (q.minAge || 0) > c.age) return false;
    if (typeof c.maxDifficulty === 'number' && (q.difficulty || 1) > c.maxDifficulty) return false;
    if (c.types && c.types.indexOf(q.type) === -1) return false;
    if (c.excludeTags && c.excludeTags.length && Array.isArray(q.tags)) {
      for (var i = 0; i < q.tags.length; i++) {
        if (c.excludeTags.indexOf(q.tags[i]) !== -1) return false;
      }
    }
    return true;
  }

  function clesRetenues(c) {
    var demandees = c.categories && c.categories.length ? c.categories : Object.keys(banque);
    return demandees.filter(function (k) { return banque[k]; });
  }

  /* ---- la pioche proprement dite ----
     Sac de jetons : on retire le jeton tiré, on ne le remet pas.
     Sac vide -> on le remplit et on oublie l'historique de cette
     catégorie, plutôt que de refuser de jouer.                    */
  function piocher(critere) {
    var c    = critere || {};
    var cles = clesRetenues(c);

    var dispo = cles.filter(function (k) {
      return sacs[k].some(function (id) { return eligible(parId[id], c); });
    });

    if (!dispo.length) {
      if (c._recycle) return null;            // vraiment rien, même à neuf
      cles.forEach(function (k) { oublier(k); });
      return piocher(Object.assign({}, c, { _recycle: true }));
    }

    // Catégorie tirée uniformément, puis question dans la catégorie :
    // sinon une grosse catégorie écraserait les petites.
    var cle  = dispo[Math.floor(Math.random() * dispo.length)];
    var pool = sacs[cle].filter(function (id) { return eligible(parId[id], c); });
    var id   = pool[Math.floor(Math.random() * pool.length)];

    sacs[cle] = sacs[cle].filter(function (x) { return x !== id; });
    vues[cle] = (vues[cle] || []).concat(id);
    if (opt.memoire) ecrireVues(vues);

    return parId[id];
  }

  /* ---- comptages ----
     restantes() : ce qu'il reste réellement à jouer.
     total()     : le vivier, historique ignoré.
     C'est restantes() qui dit si la soirée va tourner en rond.   */
  function compter(critere, ignorerVues) {
    var c = critere || {};
    return clesRetenues(c).reduce(function (n, k) {
      var source = ignorerVues ? banque[k] : sacs[k];
      return n + source.filter(function (id) { return eligible(parId[id], c); }).length;
    }, 0);
  }

  function oublier(cle) {
    if (cle) {
      delete vues[cle];
      remplirSac(cle);
    } else {
      vues = {};
      Object.keys(banque).forEach(remplirSac);
    }
    if (opt.memoire) ecrireVues(vues);
  }

  return {
    charger:    charger,
    piocher:    piocher,
    restantes:  function (c) { return compter(c, false); },
    total:      function (c) { return compter(c, true);  },
    oublier:    oublier,
    question:   function (id) { return parId[id]; },
    categories: function () { return metas.slice(); },
    index:      function () { return index; },
    vues:       function () { return JSON.parse(JSON.stringify(vues)); }
  };
}

/* ---------------------------------------------------------------- */
global.Quiz = global.Quiz || {};
global.Quiz.creerPioche  = creerPioche;
global.Quiz.marge        = marge;
global.Quiz.ecartPondere = ecartPondere;
global.Quiz.handicaps    = function () { return HANDICAPS; };

})(window);

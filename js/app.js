/* =====================================================================
   Quiz Famille · js/app.js
   Navigation entre écrans, écran de configuration, banc d'essai de pioche.
   Pilote drawer.js, ne réimplémente aucune de ses règles.
   ===================================================================== */
(function () {
'use strict';

var $  = function (s) { return document.querySelector(s); };
var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

var LS_CFG = 'quiz.config.v1';

var pioche = null;
var cats   = [];
var handi  = {};

var cfg = {
  joueurs: [],
  categories: [],
  maxDifficulty: 5,
  exclureAlcool: true
};

/* ---------- écrans ---------- */
function montrer(id) {
  $$('.ecran').forEach(function (e) { e.classList.add('hidden'); });
  $('#' + id).classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------- handicap proposé selon l'âge ----------
   Proposition, pas verdict : le tuteur du select reste modifiable.
   Un enfant de 9 ans passionné de dinosaures mérite « normal ».  */
function handicapPropose(age) {
  if (age <= 7)  return 'enfant';
  if (age <= 10) return 'decouverte';
  return 'normal';
}

/* ---------- joueurs ---------- */
var seq = 1;

function ajouterJoueur(nom, age, hcp) {
  var a = typeof age === 'number' ? age : 30;
  cfg.joueurs.push({
    id: 'j' + (seq++),
    nom: nom || '',
    age: a,
    handicap: hcp || handicapPropose(a)
  });
  rendreJoueurs();
}

function rendreJoueurs() {
  var box = $('#joueurs');
  box.innerHTML = '';

  cfg.joueurs.forEach(function (j, i) {
    var options = Object.keys(handi).map(function (k) {
      return '<option value="' + k + '"' + (k === j.handicap ? ' selected' : '') + '>' +
             (handi[k].label || k) + '</option>';
    }).join('');

    var row = document.createElement('div');
    row.className = 'card p-4 flex flex-wrap items-end gap-3';
    row.innerHTML =
      '<div class="flex-1 min-w-[9rem]">' +
        '<label class="lbl">Prénom</label>' +
        '<input class="inp" data-champ="nom" value="' + escapeAttr(j.nom) + '" placeholder="Joueur ' + (i + 1) + '">' +
      '</div>' +
      '<div class="w-24">' +
        '<label class="lbl">Âge</label>' +
        '<input class="inp" data-champ="age" type="number" min="3" max="110" value="' + j.age + '">' +
      '</div>' +
      '<div class="w-44">' +
        '<label class="lbl">Handicap</label>' +
        '<select class="inp" data-champ="handicap">' + options + '</select>' +
      '</div>' +
      '<button class="btn btn-ghost" data-suppr title="Retirer ce joueur">' +
        '<i class="fa-solid fa-user-minus"></i></button>';

    row.querySelectorAll('[data-champ]').forEach(function (el) {
      el.addEventListener('input', function () {
        var champ = el.getAttribute('data-champ');
        if (champ === 'age') {
          var ancienPropose = handicapPropose(j.age);
          j.age = parseInt(el.value, 10) || 0;
          // On ne réajuste le handicap que s'il n'a pas été touché à la main.
          if (j.handicap === ancienPropose) {
            j.handicap = handicapPropose(j.age);
            row.querySelector('[data-champ="handicap"]').value = j.handicap;
          }
        } else {
          j[champ] = champ === 'nom' ? el.value : el.value;
        }
        sauver(); rafraichirDispo();
      });
    });

    row.querySelector('[data-suppr]').addEventListener('click', function () {
      cfg.joueurs = cfg.joueurs.filter(function (x) { return x.id !== j.id; });
      rendreJoueurs(); sauver(); rafraichirDispo();
    });

    box.appendChild(row);
  });
}

function escapeAttr(s) { return String(s).replace(/"/g, '&quot;'); }

/* ---------- catégories ---------- */
function rendreCategories() {
  var box = $('#categories');
  box.innerHTML = '';

  cats.forEach(function (c) {
    var actif = cfg.categories.indexOf(c.key) !== -1;
    var el = document.createElement('button');
    el.type = 'button';
    el.className = 'cat-tuile' + (actif ? ' on' : '');
    el.style.setProperty('--c', c.color);
    el.innerHTML =
      '<i class="' + c.icon + '"></i>' +
      '<span class="cat-nom">' + c.label + '</span>' +
      '<span class="cat-blurb">' + c.blurb + '</span>' +
      '<span class="cat-age">dès ' + c.minAge + ' ans</span>';

    el.addEventListener('click', function () {
      var i = cfg.categories.indexOf(c.key);
      if (i === -1) cfg.categories.push(c.key); else cfg.categories.splice(i, 1);
      el.classList.toggle('on');
      sauver(); rafraichirDispo();
    });

    box.appendChild(el);
  });
}

/* ---------- disponibilité ----------
   Le chiffre qui compte vraiment : combien de questions restent
   jouables pour chacun. En dessous de 25, la soirée tourne en rond. */
function critereJoueur(j) {
  return {
    categories: cfg.categories,
    age: j.age,
    maxDifficulty: cfg.maxDifficulty,
    excludeTags: tagsExclus()
  };
}

function tagsExclus() {
  var mineur = cfg.joueurs.some(function (j) { return j.age < 13; });
  return (cfg.exclureAlcool || mineur) ? ['alcool'] : [];
}

function rafraichirDispo() {
  var box = $('#dispo');
  if (!pioche) return;

  if (!cfg.joueurs.length || !cfg.categories.length) {
    box.innerHTML = '<p class="text-slate-500 text-sm italic">' +
      'Ajoute au moins un joueur et coche une catégorie.</p>';
    $('#btnPiocher').disabled = true;
    return;
  }

  var lignes = cfg.joueurs.map(function (j) {
    var n = pioche.restantes(critereJoueur(j));
    var t = pioche.total(critereJoueur(j));
    var ton = n < 15 ? 'text-q-red' : (n < 25 ? 'text-amber-400' : 'text-emerald-400');
    return '<tr>' +
      '<td class="text-white font-semibold">' + (j.nom || '—') + '</td>' +
      '<td>' + j.age + ' ans</td>' +
      '<td>' + (handi[j.handicap] ? handi[j.handicap].label : j.handicap) + '</td>' +
      '<td class="' + ton + ' font-bold">' + n + '</td>' +
      '<td class="text-slate-500">' + t + '</td>' +
      '</tr>';
  }).join('');

  var mini = Math.min.apply(null, cfg.joueurs.map(function (j) {
    return pioche.restantes(critereJoueur(j));
  }));

  box.innerHTML =
    '<table><thead><tr><th>Joueur</th><th>Âge</th><th>Handicap</th>' +
    '<th>Restantes</th><th>Vivier</th></tr></thead><tbody>' + lignes + '</tbody></table>' +
    (mini < 25
      ? '<p class="mt-3 text-sm text-amber-400"><i class="fa-solid fa-triangle-exclamation mr-2"></i>' +
        'Le joueur le moins servi n\'a que ' + mini + ' questions. Coche des catégories, ' +
        'ou remonte la difficulté maximale.</p>'
      : '');

  $('#btnPiocher').disabled = false;
}

/* ---------- persistance ---------- */
function sauver() {
  try { localStorage.setItem(LS_CFG, JSON.stringify(cfg)); } catch (e) {}
}
function relire() {
  try {
    var c = JSON.parse(localStorage.getItem(LS_CFG));
    if (c && c.joueurs) {
      cfg = Object.assign(cfg, c);
      seq = cfg.joueurs.length + 1;
    }
  } catch (e) {}
}

/* ---------- banc d'essai de pioche ---------- */
var courante = null;

function remplirSelectJoueur() {
  $('#qPour').innerHTML = cfg.joueurs.map(function (j) {
    return '<option value="' + j.id + '">' + (j.nom || 'Joueur') + ' · ' + j.age + ' ans</option>';
  }).join('');
}

function joueurCourant() {
  var id = $('#qPour').value;
  return cfg.joueurs.filter(function (j) { return j.id === id; })[0] || cfg.joueurs[0];
}

function tirer() {
  var j = joueurCourant();
  if (!j) return;

  courante = pioche.piocher(critereJoueur(j));
  $('#qReponse').classList.add('hidden');
  $('#btnReveler').disabled = false;

  if (!courante) {
    $('#qEnonce').textContent = 'Plus rien à tirer pour ce joueur avec ces réglages.';
    $('#qCat').textContent = '—';
    $('#qChoix').innerHTML = '';
    return;
  }

  $('#qCat').textContent = courante.categorieLabel;
  $('#qCat').style.color = courante.couleur;
  $('#qMeta').textContent =
    courante.type + ' · difficulté ' + courante.difficulty + ' · dès ' + courante.minAge + ' ans' +
    (courante.tags && courante.tags.length ? ' · ' + courante.tags.join(', ') : '');
  $('#qEnonce').textContent = courante.q;

  var choix = '';
  if (courante.type === 'qcm' && Array.isArray(courante.choices)) {
    choix = courante.choices.map(function (t, i) {
      return '<div class="prop">' + 'ABCD'[i] + ' · ' + t + '</div>';
    }).join('');
  } else if (courante.type === 'vraifaux') {
    choix = '<div class="prop">Vrai</div><div class="prop">Faux</div>';
  } else if (courante.type === 'estimation') {
    choix = '<div class="prop text-slate-400">Réponse chiffrée' +
            (courante.unit ? ' — en ' + courante.unit : '') + '</div>';
  } else if (courante.type === 'defi') {
    choix = '<div class="prop text-slate-400">Défi · ' + (courante.duration || 60) + ' s · ' +
            (courante.scoring || 'collectif') + '</div>';
  }
  $('#qChoix').innerHTML = choix;

  $('#qRestantes').textContent = pioche.restantes(critereJoueur(j)) + ' restantes pour ' + (j.nom || 'ce joueur');
}

function reveler() {
  if (!courante) return;
  var j = joueurCourant();
  var txt;

  if (courante.type === 'qcm') {
    txt = 'ABCD'[courante.answer] + ' · ' + courante.choices[courante.answer];
  } else if (courante.type === 'vraifaux') {
    txt = courante.answer ? 'Vrai' : 'Faux';
  } else if (courante.type === 'estimation') {
    var m = Quiz.marge(courante, j.handicap);
    txt = courante.answer + (courante.unit ? ' ' + courante.unit : '');
    if (m) {
      txt += '  —  accepté de ' + arrondi(m.min) + ' à ' + arrondi(m.max) +
             ' (handicap ' + (handi[j.handicap] ? handi[j.handicap].label : j.handicap) + ')';
    }
  } else if (courante.type === 'defi') {
    txt = 'Pas de bonne réponse : c\'est un défi.';
  } else {
    txt = courante.answer + (courante.accept ? '  (aussi : ' + courante.accept.join(', ') + ')' : '');
  }

  $('#qBonne').textContent = txt;
  $('#qFun').textContent = courante.fun || '';
  $('#qFun').classList.toggle('hidden', !courante.fun);
  $('#qReponse').classList.remove('hidden');
  $('#btnReveler').disabled = true;
}

function arrondi(n) { return Math.round(n * 100) / 100; }

/* ---------- démarrage ---------- */
async function demarrer() {
  pioche = Quiz.creerPioche({ base: 'data/' });

  try {
    var r = await pioche.charger();
    cats  = r.categories;
    handi = Quiz.handicaps();
    $('#chargement').textContent = r.total + ' questions chargées, ' + cats.length + ' catégories.';
  } catch (e) {
    $('#chargement').innerHTML =
      '<span class="text-q-red"><i class="fa-solid fa-circle-exclamation mr-2"></i>' +
      e.message + '</span><br>' +
      '<span class="text-slate-500 text-xs">Ouvre la page via GitHub Pages ou un serveur local : ' +
      'un fetch() ne fonctionne pas en double-clic sur un fichier.</span>';
    return;
  }

  relire();
  if (!cfg.joueurs.length) { ajouterJoueur('', 40); ajouterJoueur('', 8); }
  if (!cfg.categories.length) cfg.categories = cats.map(function (c) { return c.key; });

  rendreJoueurs();
  rendreCategories();
  $('#diff').value = cfg.maxDifficulty;
  $('#diffTxt').textContent = cfg.maxDifficulty;
  $('#alcool').checked = cfg.exclureAlcool;
  rafraichirDispo();

  $('#btnJouer').onclick     = function () { montrer('ecran-config'); };
  $('#btnAjouter').onclick   = function () { ajouterJoueur('', 30); sauver(); rafraichirDispo(); };
  $('#btnRetour').onclick    = function () { montrer('ecran-accueil'); };
  $('#btnConfig').onclick    = function () { montrer('ecran-config'); };

  $('#diff').oninput = function () {
    cfg.maxDifficulty = parseInt(this.value, 10);
    $('#diffTxt').textContent = cfg.maxDifficulty;
    sauver(); rafraichirDispo();
  };
  $('#alcool').onchange = function () {
    cfg.exclureAlcool = this.checked; sauver(); rafraichirDispo();
  };
  $('#btnOublier').onclick = function () {
    pioche.oublier(); rafraichirDispo();
    $('#chargement').textContent = 'Historique effacé : toutes les questions redeviennent tirables.';
  };

  $('#btnPiocher').onclick = function () {
    remplirSelectJoueur(); montrer('ecran-pioche'); tirer();
  };
  $('#qPour').onchange   = tirer;
  $('#btnSuivante').onclick = tirer;
  $('#btnReveler').onclick  = reveler;
}

document.addEventListener('DOMContentLoaded', demarrer);

})();

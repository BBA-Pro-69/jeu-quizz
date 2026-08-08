/* =====================================================================
   Quiz Famille · js/app.js
   Écrans, configuration, déroulé d'une partie, résultats.
   Pilote drawer.js et engine.js, ne réimplémente aucune de leurs règles.
   ===================================================================== */
(function () {
'use strict';

var $  = function (s) { return document.querySelector(s); };
var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

var LS_CFG = 'quiz.config.v1';

var pioche = null, cats = [], handi = {};

var cfg = {
  joueurs: [],
  categories: [],
  maxDifficulty: 5,
  exclureAlcool: true,
  parJoueur: 5
};

var P = null;        // partie en cours
var Q = null;        // question affichée
var chrono = null;   // minuteur des défis

/* ================= écrans ================= */
function montrer(id) {
  $$('.ecran').forEach(function (e) { e.classList.add('hidden'); });
  $('#' + id).classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function handicapPropose(age) {
  if (age <= 7)  return 'enfant';
  if (age <= 10) return 'decouverte';
  return 'normal';
}

/* ================= joueurs ================= */
var seq = 1;

function ajouterJoueur(nom, age, hcp) {
  var a = typeof age === 'number' ? age : 30;
  cfg.joueurs.push({
    id: 'j' + (seq++), nom: nom || '', age: a,
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
      '<div class="flex-1 min-w-[9rem]"><label class="lbl">Prénom</label>' +
        '<input class="inp" data-champ="nom" value="' + String(j.nom).replace(/"/g,'&quot;') +
        '" placeholder="Joueur ' + (i + 1) + '"></div>' +
      '<div class="w-24"><label class="lbl">Âge</label>' +
        '<input class="inp" data-champ="age" type="number" min="3" max="110" value="' + j.age + '"></div>' +
      '<div class="w-44"><label class="lbl">Handicap</label>' +
        '<select class="inp" data-champ="handicap">' + options + '</select></div>' +
      '<button class="btn btn-ghost" data-suppr title="Retirer"><i class="fa-solid fa-user-minus"></i></button>';

    row.querySelectorAll('[data-champ]').forEach(function (el) {
      el.addEventListener('input', function () {
        var champ = el.getAttribute('data-champ');
        if (champ === 'age') {
          var ancien = handicapPropose(j.age);
          j.age = parseInt(el.value, 10) || 0;
          if (j.handicap === ancien) {   // pas encore touché à la main
            j.handicap = handicapPropose(j.age);
            row.querySelector('[data-champ="handicap"]').value = j.handicap;
          }
        } else { j[champ] = el.value; }
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

/* ================= catégories ================= */
function rendreCategories() {
  var box = $('#categories');
  box.innerHTML = '';
  cats.forEach(function (c) {
    var el = document.createElement('button');
    el.type = 'button';
    el.className = 'cat-tuile' + (cfg.categories.indexOf(c.key) !== -1 ? ' on' : '');
    el.style.setProperty('--c', c.color);
    el.innerHTML = '<i class="' + c.icon + '"></i><span class="cat-nom">' + c.label + '</span>' +
      '<span class="cat-blurb">' + c.blurb + '</span>' +
      '<span class="cat-age">dès ' + c.minAge + ' ans</span>';
    el.addEventListener('click', function () {
      var i = cfg.categories.indexOf(c.key);
      if (i === -1) cfg.categories.push(c.key); else cfg.categories.splice(i, 1);
      el.classList.toggle('on'); sauver(); rafraichirDispo();
    });
    box.appendChild(el);
  });
}

/* ================= disponibilité ================= */
function tagsExclus() {
  var mineur = cfg.joueurs.some(function (j) { return j.age < 13; });
  return (cfg.exclureAlcool || mineur) ? ['alcool'] : [];
}

function critereJoueur(j) {
  return {
    categories: cfg.categories, age: j.age,
    maxDifficulty: cfg.maxDifficulty, excludeTags: tagsExclus()
  };
}

function rafraichirDispo() {
  var box = $('#dispo');
  if (!pioche) return;

  if (!cfg.joueurs.length || !cfg.categories.length) {
    box.innerHTML = '<p class="text-slate-500 text-sm italic">Ajoute un joueur et coche une catégorie.</p>';
    $('#btnJouerPartie').disabled = true;
    return;
  }

  var lignes = cfg.joueurs.map(function (j) {
    var n = pioche.restantes(critereJoueur(j));
    var ton = n < 15 ? 'text-q-red' : (n < 25 ? 'text-amber-400' : 'text-emerald-400');
    return '<tr><td class="text-white font-semibold">' + (j.nom || '—') + '</td><td>' + j.age +
      ' ans</td><td>' + (handi[j.handicap] ? handi[j.handicap].label : j.handicap) + '</td>' +
      '<td class="' + ton + ' font-bold">' + n + '</td>' +
      '<td class="text-slate-500">' + pioche.total(critereJoueur(j)) + '</td></tr>';
  }).join('');

  var mini = Math.min.apply(null, cfg.joueurs.map(function (j) {
    return pioche.restantes(critereJoueur(j));
  }));

  box.innerHTML = '<table><thead><tr><th>Joueur</th><th>Âge</th><th>Handicap</th>' +
    '<th>Restantes</th><th>Vivier</th></tr></thead><tbody>' + lignes + '</tbody></table>' +
    (mini < 25 ? '<p class="mt-3 text-sm text-amber-400"><i class="fa-solid fa-triangle-exclamation mr-2"></i>' +
      'Le joueur le moins servi n\'a que ' + mini + ' questions.</p>' : '');

  $('#btnJouerPartie').disabled = false;
}

/* ================= persistance ================= */
function sauver() { try { localStorage.setItem(LS_CFG, JSON.stringify(cfg)); } catch (e) {} }
function relire() {
  try {
    var c = JSON.parse(localStorage.getItem(LS_CFG));
    if (c && c.joueurs) { cfg = Object.assign(cfg, c); seq = cfg.joueurs.length + 1; }
  } catch (e) {}
}

/* =====================================================================
   LA PARTIE
   ===================================================================== */
function demarrerPartie() {
  P = {
    joueurs: cfg.joueurs.map(function (j, i) {
      return Object.assign({}, j, { nom: j.nom || 'Joueur ' + (i + 1) });
    }),
    i: 0, tour: 0, stats: {}
  };
  P.joueurs.forEach(function (j) { P.stats[j.id] = { score: 0, bonnes: 0, posees: 0 }; });
  montrer('ecran-jeu');
  poser();
}

function joueurCourant() { return P.joueurs[P.i]; }

function poser() {
  arreterChrono();
  var j = joueurCourant();
  Q = pioche.piocher(critereJoueur(j));

  $('#jTour').textContent = 'Manche ' + (P.tour + 1) + ' / ' + cfg.parJoueur;
  $('#jJoueur').textContent = j.nom;
  $('#jScore').textContent = P.stats[j.id].score + ' pts';
  $('#feedback').classList.add('hidden');
  $('#btnSuivant').classList.add('hidden');

  if (!Q) {
    $('#qEnonce').textContent = 'Plus aucune question disponible pour ' + j.nom + '.';
    $('#qCat').textContent = '—'; $('#zoneReponse').innerHTML = '';
    $('#btnSuivant').classList.remove('hidden');
    return;
  }

  $('#qCat').textContent = Q.categorieLabel;
  $('#qCat').style.color = Q.couleur;
  $('#qMeta').textContent = 'difficulté ' + Q.difficulty + ' · ' + (Q.difficulty * 10) + ' pts';
  $('#qEnonce').textContent = Q.q;
  rendreZoneReponse(Q, j);
}

function rendreZoneReponse(q, j) {
  var z = $('#zoneReponse');
  z.innerHTML = '';

  if (q.type === 'qcm') {
    q.choices.forEach(function (t, i) {
      var b = document.createElement('button');
      b.className = 'prop prop-btn';
      b.innerHTML = '<span class="lettre">' + 'ABCD'[i] + '</span>' + t;
      b.onclick = function () { repondre(i); };
      z.appendChild(b);
    });

  } else if (q.type === 'vraifaux') {
    [['Vrai', true], ['Faux', false]].forEach(function (p) {
      var b = document.createElement('button');
      b.className = 'prop prop-btn text-center font-bold';
      b.textContent = p[0];
      b.onclick = function () { repondre(p[1]); };
      z.appendChild(b);
    });

  } else if (q.type === 'libre' || q.type === 'estimation') {
    var est = q.type === 'estimation';
    z.innerHTML =
      '<input id="saisie" class="inp text-lg" ' +
        (est ? 'type="number" step="any" inputmode="decimal"' : 'type="text" autocomplete="off"') +
        ' placeholder="' + (est ? ('Ton estimation' + (q.unit ? ' en ' + q.unit : '')) : 'Ta réponse') + '">' +
      '<button id="btnValider" class="btn btn-primary w-full mt-3">' +
        '<i class="fa-solid fa-check"></i>Valider</button>';
    $('#btnValider').onclick = function () { repondre($('#saisie').value); };
    $('#saisie').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') repondre($('#saisie').value);
    });
    setTimeout(function () { var s = $('#saisie'); if (s) s.focus(); }, 60);

  } else if (q.type === 'defi') {
    var d = q.duration || 60;
    z.innerHTML =
      '<p class="text-center text-slate-400 text-sm mb-2">' +
        'Défi · ' + d + ' s · notation ' + (q.scoring || 'collectif') + '</p>' +
      '<p id="compte" class="text-center font-serif text-5xl font-black text-white mb-4">' + d + '</p>' +
      '<div class="flex gap-3">' +
        '<button id="btnRate" class="btn btn-ghost flex-1">Raté</button>' +
        '<button id="btnReussi" class="btn btn-primary flex-1">Réussi</button></div>';
    $('#btnReussi').onclick = function () { repondre(true); };
    $('#btnRate').onclick   = function () { repondre(false); };
    lancerChrono(d);
  }
}

function lancerChrono(d) {
  var reste = d;
  chrono = setInterval(function () {
    reste--;
    var el = $('#compte');
    if (!el) return arreterChrono();
    el.textContent = reste;
    if (reste <= 5) el.classList.add('text-q-red');
    if (reste <= 0) arreterChrono();
  }, 1000);
}
function arreterChrono() { if (chrono) { clearInterval(chrono); chrono = null; } }

function repondre(valeur) {
  arreterChrono();
  var j = joueurCourant();
  var r = Quiz.verifier(Q, valeur, j.handicap);
  var pts = Quiz.points(Q, r.bon);

  var st = P.stats[j.id];
  st.posees++;
  if (r.bon) { st.bonnes++; st.score += pts; }
  $('#jScore').textContent = st.score + ' pts';

  $$('.prop-btn').forEach(function (b) { b.disabled = true; });
  var f = $('#feedback');
  f.className = 'card p-5 mt-5 ' + (r.bon ? 'verdict-bon' : 'verdict-faux');
  f.innerHTML =
    '<p class="font-serif text-2xl font-black ' + (r.bon ? 'text-emerald-400' : 'text-q-red') + '">' +
      (r.bon ? 'Bien joué. +' + pts + ' pts' : 'Raté.') + '</p>' +
    (Q.type !== 'defi' ? '<p class="text-white mt-2"><span class="text-slate-500 text-sm">Réponse : </span>' +
      r.attendu + (r.detail ? ' <span class="text-slate-500 text-xs">(' + r.detail + ')</span>' : '') + '</p>' : '') +
    (Q.fun ? '<p class="text-sm text-slate-400 mt-3 italic leading-relaxed">' + Q.fun + '</p>' : '') +
    (Q.type === 'libre' && !r.bon
      ? '<button id="btnQuandMeme" class="btn btn-ghost mt-4 text-xs">' +
        '<i class="fa-solid fa-gavel"></i>La table valide quand même</button>' : '');
  f.classList.remove('hidden');

  if ($('#btnQuandMeme')) {
    $('#btnQuandMeme').onclick = function () {
      st.bonnes++; st.score += Quiz.points(Q, true);
      $('#jScore').textContent = st.score + ' pts';
      this.outerHTML = '<p class="text-xs text-emerald-400 mt-3">Validé par la table. +' +
        Quiz.points(Q, true) + ' pts</p>';
    };
  }

  $('#btnSuivant').classList.remove('hidden');
  $('#btnSuivant').focus();
}

function suivant() {
  P.i++;
  if (P.i >= P.joueurs.length) { P.i = 0; P.tour++; }
  if (P.tour >= cfg.parJoueur) return terminer();
  poser();
}

/* ================= fin de partie ================= */
function terminer() {
  arreterChrono();
  var classement = P.joueurs.slice().sort(function (a, b) {
    return P.stats[b.id].score - P.stats[a.id].score;
  });

  $('#podium').innerHTML = classement.map(function (j, i) {
    var s = P.stats[j.id];
    var medaille = ['🥇', '🥈', '🥉'][i] || (i + 1);
    return '<tr><td class="text-xl">' + medaille + '</td>' +
      '<td class="text-white font-bold">' + j.nom + '</td>' +
      '<td class="text-q-blue font-black text-lg">' + s.score + '</td>' +
      '<td>' + s.bonnes + ' / ' + s.posees + '</td>' +
      '<td class="text-slate-500">' + (s.posees ? Math.round(s.bonnes / s.posees * 100) : 0) + ' %</td></tr>';
  }).join('');

  $('#envoiEtat').textContent = '';
  montrer('ecran-fin');
}

async function envoyerResultats() {
  var btn = $('#btnEnvoyer');
  btn.disabled = true;
  $('#envoiEtat').textContent = 'Envoi…';

  var lignes = P.joueurs.map(function (j) {
    var s = P.stats[j.id];
    return { joueur: j.nom.slice(0, 40), mode: 'libre', score: s.score, bonnes: s.bonnes, posees: s.posees };
  });

  try {
    var res = await Quiz.envoyerScores(lignes);
    $('#envoiEtat').innerHTML = '<span class="text-emerald-400">' + res.length +
      ' résultats enregistrés.</span>';
  } catch (e) {
    // Le jeu n'attend rien du réseau : on informe, on n'empêche rien.
    $('#envoiEtat').innerHTML = '<span class="text-q-red">Échec de l\'envoi : ' + e.message +
      '</span><br><span class="text-xs text-slate-500">La partie compte quand même. ' +
      'Regarde la console (F12) pour le détail.</span>';
    btn.disabled = false;
    console.error('Envoi des scores', e);
  }
}

/* ================= démarrage ================= */
async function demarrer() {
  pioche = Quiz.creerPioche({ base: 'data/' });

  try {
    var r = await pioche.charger();
    cats = r.categories;
    handi = Quiz.handicaps();
    $('#chargement').textContent = r.total + ' questions chargées, ' + cats.length + ' catégories.';
  } catch (e) {
    $('#chargement').innerHTML = '<span class="text-q-red">' + e.message + '</span>';
    console.error(e);
    return;
  }

  relire();
  if (!cfg.joueurs.length) { ajouterJoueur('', 40); ajouterJoueur('', 8); }
  if (!cfg.categories.length) cfg.categories = cats.map(function (c) { return c.key; });

  rendreJoueurs();
  rendreCategories();
  $('#diff').value = cfg.maxDifficulty;
  $('#diffTxt').textContent = cfg.maxDifficulty;
  $('#nbq').value = cfg.parJoueur;
  $('#alcool').checked = cfg.exclureAlcool;
  rafraichirDispo();

  $('#btnJouer').onclick   = function () { montrer('ecran-config'); };
  $('#btnAjouter').onclick = function () { ajouterJoueur('', 30); sauver(); rafraichirDispo(); };
  $('#btnRetour').onclick  = function () { montrer('ecran-accueil'); };

  $('#diff').oninput = function () {
    cfg.maxDifficulty = parseInt(this.value, 10);
    $('#diffTxt').textContent = cfg.maxDifficulty;
    sauver(); rafraichirDispo();
  };
  $('#nbq').oninput = function () {
    cfg.parJoueur = Math.max(1, parseInt(this.value, 10) || 1); sauver();
  };
  $('#alcool').onchange = function () { cfg.exclureAlcool = this.checked; sauver(); rafraichirDispo(); };
  $('#btnOublier').onclick = function () {
    pioche.oublier(); rafraichirDispo();
    $('#dispo').insertAdjacentHTML('beforeend',
      '<p class="text-xs text-emerald-400 mt-2">Historique effacé.</p>');
  };

  $('#btnJouerPartie').onclick = demarrerPartie;
  $('#btnSuivant').onclick     = suivant;
  $('#btnAbandon').onclick     = function () { arreterChrono(); montrer('ecran-config'); };
  $('#btnEnvoyer').onclick     = envoyerResultats;
  $('#btnRejouer').onclick     = function () { montrer('ecran-config'); };

  // Point d'accroche des modes de jeu. Chaque mode vit dans son fichier
  // et se branche ici : app.js n'a jamais besoin de les connaître.
  Quiz.app = {
    pioche: pioche, cfg: cfg, handi: handi,
    montrer: montrer, critereJoueur: critereJoueur, sauver: sauver
  };
  document.dispatchEvent(new CustomEvent('quiz:pret'));
}

document.addEventListener('DOMContentLoaded', demarrer);

})();

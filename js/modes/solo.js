/* =====================================================================
   Quiz Famille · js/modes/solo.js
   Mode « Contre la montre » : un joueur, un chrono global,
   enchaîner le maximum de questions.

   Deux mécaniques qui changent tout par rapport à la partie libre :
     - une bonne réponse rend du temps (+2 s), une mauvaise en coûte
     - les bonnes réponses consécutives multiplient les points

   Les défis (mimes) sont exclus : personne ne peut arbitrer un mime
   qu'il fait tout seul devant sa tablette.
   ===================================================================== */
(function () {
'use strict';

var LS_RECORDS = 'quiz.solo.records.v1';

var A = null;   // Quiz.app
var S = null;   // état de la manche
var Q = null;
var tic = null;

var $ = function (s) { return document.querySelector(s); };
function el(h) { var d = document.createElement('div'); d.innerHTML = h; return d.firstElementChild; }

/* ============ accrochage ============ */
document.addEventListener('quiz:pret', function () {
  A = window.Quiz.app;

  document.body.appendChild(el(
    '<section id="ecran-solo" class="ecran hidden">' +
      '<div id="soloRoot" class="max-w-2xl mx-auto px-5 py-8"></div></section>'
  ));

  var b = el('<button id="btnSolo" class="btn btn-ghost flex-1 text-base">' +
    '<i class="fa-solid fa-stopwatch"></i>Solo · contre la montre</button>');
  var ancre = $('#btnBraquage') || $('#btnJouerPartie');
  ancre.parentNode.insertBefore(b, ancre.nextSibling);
  b.onclick = accueilSolo;
});

/* ============ records ============ */
function lireRecords() {
  try { return JSON.parse(localStorage.getItem(LS_RECORDS)) || {}; } catch (e) { return {}; }
}
function ecrireRecord(nom, score) {
  var r = lireRecords();
  var neuf = !r[nom] || score > r[nom];
  if (neuf) { r[nom] = score; try { localStorage.setItem(LS_RECORDS, JSON.stringify(r)); } catch (e) {} }
  return neuf;
}

/* ============ écran de départ ============ */
function accueilSolo() {
  if (!A.cfg.joueurs.length) { alert('Ajoute au moins un joueur dans les réglages.'); return; }
  var records = lireRecords();

  A.montrer('ecran-solo');
  $('#soloRoot').innerHTML =
    '<p class="kicker text-q-blue">Mode de jeu</p><span class="kicker-line"></span>' +
    '<h2 class="font-serif text-4xl font-black text-white mt-4">Contre la montre</h2>' +
    '<p class="text-sm text-slate-400 mt-3 leading-relaxed">' +
      'Enchaîne le plus de questions possible avant la fin du chrono. ' +
      'Une bonne réponse te rend <strong class="text-white">2 secondes</strong>. ' +
      'Trois bonnes d\'affilée et les points passent en <strong class="text-white">×1,5</strong>, ' +
      'cinq et c\'est <strong class="text-white">×2</strong>. Une erreur remet la série à zéro.</p>' +

    '<div class="card p-5 mt-6 space-y-4">' +
      '<div><label class="lbl" for="soloQui">Qui joue</label>' +
        '<select id="soloQui" class="inp">' +
        A.cfg.joueurs.map(function (j, i) {
          var nom = j.nom || 'Joueur ' + (i + 1);
          return '<option value="' + j.id + '">' + nom + ' · ' + j.age + ' ans' +
            (records[nom] ? '  (record ' + records[nom] + ')' : '') + '</option>';
        }).join('') + '</select></div>' +
      '<div><label class="lbl">Durée</label>' +
        '<div class="flex gap-2" id="soloDuree">' +
        [60, 90, 120].map(function (d) {
          return '<button class="btn btn-ghost flex-1' + (d === 90 ? ' actif' : '') +
            '" data-d="' + d + '">' + d + ' s</button>';
        }).join('') + '</div></div>' +
    '</div>' +

    '<div class="flex flex-col sm:flex-row gap-3 mt-7 pb-10">' +
      '<button id="soloGo" class="btn btn-primary flex-1 text-base">' +
        '<i class="fa-solid fa-play"></i>C\'est parti</button>' +
      '<button id="soloBack" class="btn btn-ghost"><i class="fa-solid fa-arrow-left"></i>Retour</button>' +
    '</div>' +
    '<div id="soloTop"></div>';

  var duree = 90;
  Array.prototype.slice.call(document.querySelectorAll('[data-d]')).forEach(function (b) {
    b.onclick = function () {
      duree = parseInt(b.getAttribute('data-d'), 10);
      document.querySelectorAll('[data-d]').forEach(function (x) { x.classList.remove('actif'); });
      b.classList.add('actif');
    };
  });

  $('#soloBack').onclick = function () { A.montrer('ecran-config'); };
  $('#soloGo').onclick = function () {
    var id = $('#soloQui').value;
    var j = A.cfg.joueurs.filter(function (x) { return x.id === id; })[0];
    demarrer(j, duree);
  };

  classement();
}

/* ============ la manche ============ */
function demarrer(joueur, duree) {
  S = {
    joueur: joueur,
    nom: joueur.nom || 'Joueur',
    reste: duree, duree: duree,
    score: 0, bonnes: 0, posees: 0,
    serie: 0, meilleureSerie: 0,
    fini: false
  };

  $('#soloRoot').innerHTML =
    '<div class="flex items-end justify-between mb-4">' +
      '<div><p class="kicker text-slate-500">Score</p>' +
        '<p id="sScore" class="font-serif text-4xl font-black text-q-blue">0</p></div>' +
      '<div class="text-center"><p class="kicker text-slate-500">Temps</p>' +
        '<p id="sTemps" class="font-serif text-5xl font-black text-white">' + duree + '</p></div>' +
      '<div class="text-right"><p class="kicker text-slate-500">Série</p>' +
        '<p id="sSerie" class="font-serif text-4xl font-black text-slate-600">0</p></div>' +
    '</div>' +
    '<div class="h-1.5 rounded-full bg-white/10 overflow-hidden mb-5">' +
      '<div id="sBarre" class="h-full bg-q-blue" style="width:100%;transition:width .3s linear"></div></div>' +
    '<div class="card p-6"><p id="sCat" class="kicker">—</p>' +
      '<p id="sQ" class="font-serif text-2xl md:text-3xl font-bold text-white mt-3 leading-snug"></p>' +
      '<div id="sZone" class="mt-6 space-y-3"></div></div>' +
    '<div id="sFlash" class="mt-4 h-16"></div>' +
    '<div class="pb-10"><button id="sPasser" class="btn btn-ghost w-full text-xs">' +
      '<i class="fa-solid fa-forward"></i>Passer (coûte 3 s)</button></div>';

  $('#sPasser').onclick = function () { S.reste -= 3; poser(); };

  tic = setInterval(function () {
    S.reste--;
    majChrono();
    if (S.reste <= 0) terminer();
  }, 1000);

  majChrono();
  poser();
}

function majChrono() {
  var t = $('#sTemps'); if (!t) return;
  t.textContent = Math.max(0, S.reste);
  t.className = 'font-serif text-5xl font-black ' + (S.reste <= 10 ? 'text-q-red' : 'text-white');
  $('#sBarre').style.width = Math.max(0, Math.min(100, S.reste / S.duree * 100)) + '%';
}

function multiplicateur() { return S.serie >= 5 ? 2 : (S.serie >= 3 ? 1.5 : 1); }

function poser() {
  if (S.fini) return;
  var c = Object.assign({}, A.critereJoueur(S.joueur), {
    types: ['qcm', 'vraifaux', 'libre', 'estimation']
  });
  Q = A.pioche.piocher(c);
  if (!Q) return terminer('Plus de question disponible.');

  $('#sCat').textContent = Q.categorieLabel;
  $('#sCat').style.color = Q.couleur;
  $('#sQ').textContent = Q.q;
  $('#sFlash').innerHTML = '';

  var z = $('#sZone');
  z.innerHTML = '';

  if (Q.type === 'qcm') {
    Q.choices.forEach(function (t, i) {
      var b = el('<button class="prop prop-btn"><span class="lettre">' + 'ABCD'[i] + '</span>' + t + '</button>');
      b.onclick = function () { repondre(i); };
      z.appendChild(b);
    });
  } else if (Q.type === 'vraifaux') {
    [['Vrai', true], ['Faux', false]].forEach(function (p) {
      var b = el('<button class="prop prop-btn text-center font-bold">' + p[0] + '</button>');
      b.onclick = function () { repondre(p[1]); };
      z.appendChild(b);
    });
  } else {
    var est = Q.type === 'estimation';
    z.innerHTML = '<input id="sIn" class="inp text-lg" ' +
      (est ? 'type="number" step="any" inputmode="decimal"' : 'type="text" autocomplete="off"') +
      ' placeholder="' + (est ? 'Ton estimation' + (Q.unit ? ' en ' + Q.unit : '') : 'Ta réponse') + '">';
    $('#sIn').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') repondre($('#sIn').value);
    });
    $('#sIn').focus();
  }
}

function repondre(valeur) {
  if (S.fini) return;
  var r = Quiz.verifier(Q, valeur, S.joueur.handicap);
  S.posees++;

  var pts = 0;
  if (r.bon) {
    S.serie++;
    if (S.serie > S.meilleureSerie) S.meilleureSerie = S.serie;
    pts = Math.round(Quiz.points(Q, true) * multiplicateur());
    S.score += pts; S.bonnes++;
    S.reste += 2;                       // le temps rendu, la respiration du mode
  } else {
    S.serie = 0;
  }

  $('#sScore').textContent = S.score;
  $('#sSerie').textContent = S.serie;
  $('#sSerie').className = 'font-serif text-4xl font-black ' +
    (S.serie >= 5 ? 'text-q-red' : (S.serie >= 3 ? 'text-amber-400' : 'text-slate-600'));
  majChrono();

  $('#sFlash').innerHTML = r.bon
    ? '<p class="text-center font-serif text-xl font-black text-emerald-400">+' + pts + ' pts' +
      (multiplicateur() > 1 ? ' <span class="text-sm">×' + multiplicateur() + '</span>' : '') +
      ' <span class="text-sm text-slate-500">+2 s</span></p>'
    : '<p class="text-center text-q-red font-bold">Raté · <span class="text-slate-300">' +
      r.attendu + '</span></p>';

  // On enchaîne vite : en contre-la-montre, l'anecdote attendra la
  // partie en famille. Ici, c'est le rythme qui fait le plaisir.
  setTimeout(function () { if (!S.fini) poser(); }, r.bon ? 450 : 1100);
}

/* ============ fin ============ */
function terminer(motif) {
  if (S.fini) return;
  S.fini = true;
  clearInterval(tic); tic = null;

  var record = ecrireRecord(S.nom, S.score);
  var reussite = S.posees ? Math.round(S.bonnes / S.posees * 100) : 0;

  $('#soloRoot').innerHTML =
    '<p class="kicker text-q-blue">' + (motif || 'Temps écoulé') + '</p><span class="kicker-line"></span>' +
    '<h2 class="font-serif text-5xl font-black text-white mt-4">' + S.score + '<span class="text-2xl text-slate-500"> pts</span></h2>' +
    (record ? '<p class="text-amber-400 font-bold mt-2"><i class="fa-solid fa-trophy mr-2"></i>' +
      'Nouveau record personnel.</p>' : '<p class="text-slate-500 mt-2">Record à battre : ' +
      lireRecords()[S.nom] + ' pts.</p>') +

    '<div class="card p-5 mt-6 grid grid-cols-3 gap-4 text-center">' +
      '<div><p class="kicker text-slate-500">Bonnes</p>' +
        '<p class="font-serif text-2xl font-black text-white">' + S.bonnes + '/' + S.posees + '</p></div>' +
      '<div><p class="kicker text-slate-500">Réussite</p>' +
        '<p class="font-serif text-2xl font-black text-white">' + reussite + ' %</p></div>' +
      '<div><p class="kicker text-slate-500">Meilleure série</p>' +
        '<p class="font-serif text-2xl font-black text-white">' + S.meilleureSerie + '</p></div>' +
    '</div>' +

    '<div class="flex flex-col sm:flex-row gap-3 mt-7">' +
      '<button id="sEnv" class="btn btn-primary flex-1"><i class="fa-solid fa-cloud-arrow-up"></i>' +
        'Publier le score</button>' +
      '<button id="sRe" class="btn btn-ghost flex-1"><i class="fa-solid fa-rotate-right"></i>Rejouer</button>' +
    '</div><p id="sEtat" class="text-sm text-center mt-4"></p>' +
    '<div id="soloTop" class="mt-8 pb-10"></div>';

  $('#sRe').onclick  = accueilSolo;
  $('#sEnv').onclick = async function () {
    this.disabled = true;
    $('#sEtat').textContent = 'Envoi…';
    try {
      await Quiz.envoyerScores([{
        joueur: S.nom.slice(0, 40), mode: 'solo',
        score: Math.max(-1000, Math.min(100000, S.score)),
        bonnes: S.bonnes, posees: S.posees
      }]);
      $('#sEtat').innerHTML = '<span class="text-emerald-400">Score publié.</span>';
      classement();
    } catch (e) {
      $('#sEtat').innerHTML = '<span class="text-q-red">Échec : ' + e.message + '</span>';
      console.error(e);
    }
  };

  classement();
}

/* ============ tableau des meilleurs ============
   Le tri et la limite sont faits par Postgres, pas en JavaScript :
   c'est PostgREST qui traduit ces paramètres d'URL en vrai SQL.
   On ne rapatrie que dix lignes au lieu de toute la table.        */
async function classement() {
  var box = $('#soloTop');
  if (!box) return;
  box.innerHTML = '<p class="text-xs text-slate-600 text-center">Chargement du classement…</p>';
  try {
    var top = await Quiz.api('/scores?mode=eq.solo&select=joueur,score,bonnes,posees' +
                             '&order=score.desc&limit=10');
    if (!top.length) { box.innerHTML = ''; return; }
    box.innerHTML =
      '<p class="kicker text-q-blue mb-3">Les dix meilleurs</p>' +
      '<div class="card p-4"><table><tbody>' +
      top.map(function (l, i) {
        return '<tr><td class="text-slate-600 w-8">' + (i + 1) + '</td>' +
          '<td class="text-white font-semibold">' + l.joueur + '</td>' +
          '<td class="text-q-blue font-black text-right">' + l.score + '</td>' +
          '<td class="text-slate-600 text-xs text-right">' + l.bonnes + '/' + l.posees + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  } catch (e) {
    // Pas de réseau, pas de classement, mais le jeu continue.
    box.innerHTML = '<p class="text-xs text-slate-600 text-center">Classement indisponible hors ligne.</p>';
  }
}

})();

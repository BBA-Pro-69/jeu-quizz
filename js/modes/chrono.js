/* =====================================================================
   Quiz Famille · js/modes/chrono.js
   Mode « Le Chrono » : 60 secondes par équipe, en relais.

   La question est toujours tirée pour le joueur qui tient la tablette,
   et la tablette change de mains après chaque question. Un enfant et
   son grand-père dans la même équipe reçoivent donc chacun des
   questions à leur portée, sans que personne n'ait à y penser.
   ===================================================================== */
(function () {
'use strict';

var A = null, C = null, Q = null, tic = null;

var PALETTE = [
  { nom: 'Les Bleus',  couleur: '#41B6E6' },
  { nom: 'Les Rouges', couleur: '#E4002B' },
  { nom: 'Les Jaunes', couleur: '#eab308' },
  { nom: 'Les Verts',  couleur: '#22c55e' }
];

var $ = function (s) { return document.querySelector(s); };
function el(h) { var d = document.createElement('div'); d.innerHTML = h; return d.firstElementChild; }

/* ============ accrochage ============ */
document.addEventListener('quiz:pret', function () {
  A = window.Quiz.app;

  document.body.appendChild(el(
    '<section id="ecran-chrono" class="ecran hidden">' +
      '<div id="chrRoot" class="max-w-2xl mx-auto px-5 py-8"></div></section>'
  ));

  var b = el('<button id="btnChrono" class="btn btn-ghost flex-1 text-base">' +
    '<i class="fa-solid fa-hourglass-half"></i>Le Chrono</button>');
  var ancre = $('#btnSolo') || $('#btnBraquage') || $('#btnJouerPartie');
  ancre.parentNode.insertBefore(b, ancre.nextSibling);
  b.onclick = ecranEquipes;
});

/* ============ équipes ============ */
function ecranEquipes() {
  if (A.cfg.joueurs.length < 2) { alert('Il faut au moins deux joueurs.'); return; }

  C = { assign: {}, nbEquipes: 2, duree: 60, equipes: [], e: 0 };
  A.cfg.joueurs.slice().sort(function (a, b) { return b.age - a.age; })
    .forEach(function (j, i) { C.assign[j.id] = i % C.nbEquipes; });

  A.montrer('ecran-chrono');
  rendreEquipes();
}

function rendreEquipes() {
  $('#chrRoot').innerHTML =
    '<p class="kicker text-amber-400">Mode de jeu</p><span class="kicker-line"></span>' +
    '<h2 class="font-serif text-4xl font-black text-white mt-4">Le Chrono</h2>' +
    '<p class="text-sm text-slate-400 mt-3 leading-relaxed">' +
      'Chaque équipe a un temps donné pour enchaîner le plus de questions possible. ' +
      'Après chaque réponse, <strong class="text-white">la tablette passe au joueur suivant</strong> de ' +
      'l\'équipe. Passer une question coûte 3 secondes.</p>' +

    '<div class="card p-5 mt-6 flex flex-wrap gap-5">' +
      '<div class="w-40"><label class="lbl">Équipes</label><select id="cNb" class="inp">' +
        [2,3,4].map(function (n) {
          return '<option value="' + n + '"' + (n === C.nbEquipes ? ' selected' : '') + '>' + n + '</option>';
        }).join('') + '</select></div>' +
      '<div class="w-40"><label class="lbl">Secondes par équipe</label>' +
        '<input id="cD" class="inp" type="number" min="20" max="180" step="10" value="' + C.duree + '"></div>' +
    '</div>' +

    '<p class="kicker text-q-blue mt-7 mb-3">Touche un joueur pour le déplacer</p>' +
    '<div id="cListe" class="space-y-2"></div>' +

    '<div class="flex flex-col sm:flex-row gap-3 mt-8 pb-10">' +
      '<button id="cGo" class="btn btn-primary flex-1 text-base"><i class="fa-solid fa-play"></i>' +
        'Lancer le chrono</button>' +
      '<button id="cBack" class="btn btn-ghost"><i class="fa-solid fa-arrow-left"></i>Retour</button></div>';

  A.cfg.joueurs.forEach(function (j, i) {
    var p = PALETTE[C.assign[j.id] || 0];
    var row = el('<button class="prop prop-btn flex items-center justify-between"></button>');
    row.style.borderColor = p.couleur;
    row.innerHTML = '<span><span class="font-bold text-white">' + (j.nom || 'Joueur ' + (i + 1)) +
      '</span><span class="text-slate-500 text-sm"> · ' + j.age + ' ans</span></span>' +
      '<span class="font-bold" style="color:' + p.couleur + '">' + p.nom + '</span>';
    row.onclick = function () {
      C.assign[j.id] = (C.assign[j.id] + 1) % C.nbEquipes;
      rendreEquipes();
    };
    $('#cListe').appendChild(row);
  });

  $('#cNb').onchange = function () {
    C.nbEquipes = parseInt(this.value, 10);
    A.cfg.joueurs.forEach(function (j, i) { C.assign[j.id] = i % C.nbEquipes; });
    rendreEquipes();
  };
  $('#cD').oninput  = function () { C.duree = Math.max(20, parseInt(this.value, 10) || 60); };
  $('#cBack').onclick = function () { A.montrer('ecran-config'); };
  $('#cGo').onclick = function () {
    C.equipes = [];
    for (var i = 0; i < C.nbEquipes; i++) {
      var m = A.cfg.joueurs.filter(function (j) { return C.assign[j.id] === i; });
      if (!m.length) { alert(PALETTE[i].nom + ' n\'a personne.'); return; }
      C.equipes.push({
        nom: PALETTE[i].nom, couleur: PALETTE[i].couleur, membres: m,
        score: 0, bonnes: 0, posees: 0, tour: 0
      });
    }
    C.e = 0;
    passageDeRelais();
  };
}

/* ============ écran de passation ============
   Un temps d'arrêt volontaire entre deux équipes : sans lui, le chrono
   de la suivante démarre pendant qu'on se passe encore la tablette. */
function passageDeRelais() {
  if (C.e >= C.equipes.length) return fin();
  var e = C.equipes[C.e];

  $('#chrRoot').innerHTML =
    '<div class="text-center py-16">' +
      '<p class="kicker" style="color:' + e.couleur + '">À vous de jouer</p>' +
      '<h2 class="font-serif text-5xl font-black text-white mt-3">' + e.nom + '</h2>' +
      '<p class="text-slate-400 mt-4">' + e.membres.map(function (m) { return m.nom || 'Joueur'; }).join(' → ') +
        ' → <span class="text-slate-600">et on recommence</span></p>' +
      '<p class="text-sm text-slate-500 mt-6">' + C.duree + ' secondes. ' +
        'Le premier à répondre est <strong class="text-white">' +
        (e.membres[0].nom || 'Joueur') + '</strong>.</p>' +
      '<button id="cStart" class="btn btn-primary text-base mt-8 px-10">' +
        '<i class="fa-solid fa-play"></i>Démarrer</button>' +
    '</div>';

  $('#cStart').onclick = function () { manche(e); };
}

/* ============ la manche d'une équipe ============ */
function manche(e) {
  e.reste = C.duree;
  e.fini = false;

  $('#chrRoot').innerHTML =
    '<div class="flex items-end justify-between mb-4">' +
      '<div><p class="kicker" style="color:' + e.couleur + '">' + e.nom + '</p>' +
        '<p id="cScore" class="font-serif text-4xl font-black text-white">0</p></div>' +
      '<div class="text-right"><p class="kicker text-slate-500">Temps</p>' +
        '<p id="cT" class="font-serif text-5xl font-black text-white">' + C.duree + '</p></div></div>' +
    '<div class="h-1.5 rounded-full bg-white/10 overflow-hidden mb-5">' +
      '<div id="cBar" class="h-full" style="width:100%;background:' + e.couleur +
        ';transition:width .3s linear"></div></div>' +
    '<div class="card p-4 mb-3 text-center" style="border-color:' + e.couleur + '55">' +
      '<p class="kicker text-slate-500">La tablette est à</p>' +
      '<p id="cQui" class="font-serif text-2xl font-black text-white">—</p></div>' +
    '<div class="card p-6"><p id="cCat" class="kicker">—</p>' +
      '<p id="cQ" class="font-serif text-2xl font-bold text-white mt-3 leading-snug"></p>' +
      '<div id="cZone" class="mt-6 space-y-3"></div></div>' +
    '<div id="cFlash" class="mt-4 h-14"></div>' +
    '<div class="pb-10"><button id="cPass" class="btn btn-ghost w-full text-xs">' +
      '<i class="fa-solid fa-forward"></i>Passer (coûte 3 s)</button></div>';

  $('#cPass').onclick = function () { e.reste -= 3; e.tour++; poser(e); };

  tic = setInterval(function () {
    e.reste--;
    majT(e);
    if (e.reste <= 0) finManche(e);
  }, 1000);

  majT(e);
  poser(e);
}

function majT(e) {
  var t = $('#cT'); if (!t) return;
  t.textContent = Math.max(0, e.reste);
  t.className = 'font-serif text-5xl font-black ' + (e.reste <= 10 ? 'text-q-red' : 'text-white');
  $('#cBar').style.width = Math.max(0, e.reste / C.duree * 100) + '%';
}

function joueurDeTour(e) { return e.membres[e.tour % e.membres.length]; }

function poser(e) {
  if (e.fini) return;
  var j = joueurDeTour(e);

  Q = A.pioche.piocher(Object.assign({}, A.critereJoueur(j), {
    types: ['qcm', 'vraifaux', 'libre', 'estimation']   // pas de mime en relais
  }));
  if (!Q) return finManche(e, 'Plus de question disponible.');

  $('#cQui').textContent = j.nom || 'Joueur';
  $('#cQui').style.color = e.couleur;
  $('#cCat').textContent = Q.categorieLabel;
  $('#cCat').style.color = Q.couleur;
  $('#cQ').textContent = Q.q;
  $('#cFlash').innerHTML = '';

  var z = $('#cZone');
  z.innerHTML = '';

  if (Q.type === 'qcm') {
    Q.choices.forEach(function (t, i) {
      var b = el('<button class="prop prop-btn"><span class="lettre">' + 'ABCD'[i] + '</span>' + t + '</button>');
      b.onclick = function () { repondre(e, i); };
      z.appendChild(b);
    });
  } else if (Q.type === 'vraifaux') {
    [['Vrai', true], ['Faux', false]].forEach(function (p) {
      var b = el('<button class="prop prop-btn text-center font-bold">' + p[0] + '</button>');
      b.onclick = function () { repondre(e, p[1]); };
      z.appendChild(b);
    });
  } else {
    var est = Q.type === 'estimation';
    z.innerHTML = '<input id="cIn" class="inp text-lg" ' +
      (est ? 'type="number" step="any" inputmode="decimal"' : 'type="text" autocomplete="off"') +
      ' placeholder="' + (est ? 'Estimation' + (Q.unit ? ' en ' + Q.unit : '') : 'Réponse') + '">';
    $('#cIn').addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') repondre(e, $('#cIn').value);
    });
    $('#cIn').focus();
  }
}

function repondre(e, valeur) {
  if (e.fini) return;
  var j = joueurDeTour(e);
  var r = Quiz.verifier(Q, valeur, j.handicap);
  var pts = Quiz.points(Q, r.bon);

  e.posees++;
  if (r.bon) { e.bonnes++; e.score += pts; }
  e.tour++;                                   // la tablette change de mains

  $('#cScore').textContent = e.score;
  $('#cFlash').innerHTML = r.bon
    ? '<p class="text-center font-serif text-xl font-black text-emerald-400">+' + pts + ' pts</p>'
    : '<p class="text-center text-q-red font-bold">Raté · <span class="text-slate-300">' +
      r.attendu + '</span></p>';

  setTimeout(function () { if (!e.fini) poser(e); }, r.bon ? 450 : 1100);
}

function finManche(e, motif) {
  if (e.fini) return;
  e.fini = true;
  clearInterval(tic); tic = null;

  $('#chrRoot').innerHTML =
    '<div class="text-center py-14">' +
      '<p class="kicker" style="color:' + e.couleur + '">' + (motif || 'Temps écoulé') + '</p>' +
      '<h2 class="font-serif text-6xl font-black text-white mt-3">' + e.score +
        '<span class="text-2xl text-slate-500"> pts</span></h2>' +
      '<p class="text-slate-400 mt-3">' + e.bonnes + ' bonnes sur ' + e.posees + '</p>' +
      '<button id="cNext" class="btn btn-primary text-base mt-8 px-10">' +
        'Équipe suivante<i class="fa-solid fa-arrow-right"></i></button></div>';

  $('#cNext').onclick = function () { C.e++; passageDeRelais(); };
}

/* ============ fin ============ */
function fin() {
  var cl = C.equipes.slice().sort(function (a, b) { return b.score - a.score; });

  $('#chrRoot').innerHTML =
    '<p class="kicker text-amber-400">Terminé</p><span class="kicker-line"></span>' +
    '<h2 class="font-serif text-4xl font-black text-white mt-4 mb-6">' + cl[0].nom + ' prend le chrono</h2>' +
    '<div class="card p-5"><table><tbody>' +
      cl.map(function (e, i) {
        return '<tr><td class="text-xl">' + (['🥇','🥈','🥉'][i] || (i + 1)) + '</td>' +
          '<td class="font-bold" style="color:' + e.couleur + '">' + e.nom + '</td>' +
          '<td class="font-serif text-2xl font-black text-white">' + e.score + '</td>' +
          '<td class="text-slate-500 text-xs">' + e.bonnes + '/' + e.posees + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
    '<div class="flex flex-col sm:flex-row gap-3 mt-7 pb-10">' +
      '<button id="cEnv" class="btn btn-primary flex-1"><i class="fa-solid fa-cloud-arrow-up"></i>' +
        'Enregistrer les scores</button>' +
      '<button id="cRe" class="btn btn-ghost flex-1"><i class="fa-solid fa-rotate-right"></i>Rejouer</button>' +
    '</div><p id="cEtat" class="text-sm text-center"></p>';

  $('#cRe').onclick  = function () { A.montrer('ecran-config'); };
  $('#cEnv').onclick = async function () {
    this.disabled = true;
    $('#cEtat').textContent = 'Envoi…';
    try {
      await Quiz.envoyerScores(C.equipes.map(function (e) {
        return {
          joueur: e.nom.slice(0, 40), mode: 'chrono',
          score: Math.max(-1000, Math.min(100000, e.score)),
          bonnes: e.bonnes, posees: e.posees
        };
      }));
      $('#cEtat').innerHTML = '<span class="text-emerald-400">Scores enregistrés.</span>';
    } catch (err) {
      $('#cEtat').innerHTML = '<span class="text-q-red">Échec : ' + err.message + '</span>';
      console.error(err);
    }
  };
}

})();

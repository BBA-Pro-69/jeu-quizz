/* =====================================================================
   Quiz Famille · js/modes/braquage.js
   Mode « Le Braquage » : équipes, trois jokers à usage unique,
   manche finale avec mise.

   Ce fichier est autonome : il s'accroche à l'événement 'quiz:pret'
   émis par app.js, injecte son propre écran et son propre bouton.
   Aucun autre fichier n'a besoin de le connaître.
   ===================================================================== */
(function () {
'use strict';

var A = null;      // raccourci vers Quiz.app
var B = null;      // état de la partie
var Q = null;      // question affichée
var chrono = null;

var PALETTE = [
  { nom: 'Les Bleus',   couleur: '#41B6E6' },
  { nom: 'Les Rouges',  couleur: '#E4002B' },
  { nom: 'Les Jaunes',  couleur: '#eab308' },
  { nom: 'Les Verts',   couleur: '#22c55e' }
];

var $ = function (s) { return document.querySelector(s); };
function el(html) { var d = document.createElement('div'); d.innerHTML = html; return d.firstElementChild; }

/* ============ accrochage ============ */
document.addEventListener('quiz:pret', function () {
  A = window.Quiz.app;

  document.body.appendChild(el(
    '<section id="ecran-braquage" class="ecran hidden">' +
      '<div id="braqRoot" class="max-w-3xl mx-auto px-5 py-8"></div>' +
    '</section>'
  ));

  var bouton = el('<button id="btnBraquage" class="btn btn-red flex-1 text-base">' +
    '<i class="fa-solid fa-sack-dollar"></i>Le Braquage</button>');
  var ancre = $('#btnJouerPartie');
  ancre.parentNode.insertBefore(bouton, ancre.nextSibling);
  bouton.onclick = ecranEquipes;
});

/* ============ constitution des équipes ============ */
function ecranEquipes() {
  var joueurs = A.cfg.joueurs.filter(function (j) { return j.nom || true; });
  if (joueurs.length < 2) { alert('Il faut au moins deux joueurs.'); return; }

  B = {
    equipes: [],
    assign: {},          // idJoueur -> index d'équipe
    nbEquipes: joueurs.length >= 4 ? 2 : 2,
    manches: 4,
    e: 0, manche: 0,
    cible: null, x2: false,
    phase: 'jeu'
  };

  // Répartition initiale en serpentin sur les âges : les équipes
  // s'équilibrent d'elles-mêmes au lieu de coller les adultes ensemble.
  joueurs.slice().sort(function (a, b) { return b.age - a.age; })
    .forEach(function (j, i) {
      B.assign[j.id] = i % B.nbEquipes;
    });

  A.montrer('ecran-braquage');
  rendreEquipes();
}

function rendreEquipes() {
  var joueurs = A.cfg.joueurs;

  $('#braqRoot').innerHTML =
    '<p class="kicker text-q-red">Mode de jeu</p><span class="kicker-line"></span>' +
    '<h2 class="font-serif text-4xl font-black text-white mt-4">Le Braquage</h2>' +
    '<p class="text-sm text-slate-400 mt-3 leading-relaxed">' +
      'Deux à quatre équipes. Chacune a trois jokers, un seul usage chacun : ' +
      '<strong class="text-white">×2</strong> double la mise, ' +
      '<strong class="text-white">Braquage</strong> vole les points d\'une autre équipe, ' +
      '<strong class="text-white">Bouclier</strong> rend immunisé au prochain vol. ' +
      'À la fin, chaque équipe mise ce qu\'elle veut sur une dernière question.</p>' +

    '<div class="card p-5 mt-6 flex flex-wrap gap-5">' +
      '<div class="w-40"><label class="lbl">Nombre d\'équipes</label>' +
        '<select id="nbEq" class="inp">' +
        [2,3,4].map(function (n) {
          return '<option value="' + n + '"' + (n === B.nbEquipes ? ' selected' : '') + '>' + n + '</option>';
        }).join('') + '</select></div>' +
      '<div class="w-40"><label class="lbl">Manches par équipe</label>' +
        '<input id="nbM" class="inp" type="number" min="1" max="15" value="' + B.manches + '"></div>' +
    '</div>' +

    '<p class="kicker text-q-blue mt-7 mb-3">Les équipes · touche un joueur pour le déplacer</p>' +
    '<div id="listeJoueurs" class="space-y-2"></div>' +

    '<div class="flex flex-col sm:flex-row gap-3 mt-8 pb-10">' +
      '<button id="btnGo" class="btn btn-red flex-1 text-base">' +
        '<i class="fa-solid fa-play"></i>Lancer le braquage</button>' +
      '<button id="btnAnnul" class="btn btn-ghost"><i class="fa-solid fa-arrow-left"></i>Retour</button>' +
    '</div>';

  var liste = $('#listeJoueurs');
  joueurs.forEach(function (j, i) {
    var eq = B.assign[j.id] || 0;
    var p = PALETTE[eq];
    var row = el('<button class="prop prop-btn flex items-center justify-between"></button>');
    row.style.borderColor = p.couleur;
    row.innerHTML =
      '<span><span class="font-bold text-white">' + (j.nom || 'Joueur ' + (i + 1)) + '</span>' +
      '<span class="text-slate-500 text-sm"> · ' + j.age + ' ans</span></span>' +
      '<span class="font-bold" style="color:' + p.couleur + '">' + p.nom + '</span>';
    row.onclick = function () {
      B.assign[j.id] = (B.assign[j.id] + 1) % B.nbEquipes;
      rendreEquipes();
    };
    liste.appendChild(row);
  });

  $('#nbEq').onchange = function () {
    B.nbEquipes = parseInt(this.value, 10);
    A.cfg.joueurs.forEach(function (j, i) { B.assign[j.id] = i % B.nbEquipes; });
    rendreEquipes();
  };
  $('#nbM').oninput  = function () { B.manches = Math.max(1, parseInt(this.value, 10) || 1); };
  $('#btnAnnul').onclick = function () { A.montrer('ecran-config'); };
  $('#btnGo').onclick = lancer;
}

/* ============ lancement ============ */
function lancer() {
  B.equipes = [];
  for (var i = 0; i < B.nbEquipes; i++) {
    var membres = A.cfg.joueurs.filter(function (j) { return B.assign[j.id] === i; });
    if (!membres.length) { alert('L\'équipe ' + PALETTE[i].nom + ' est vide.'); return; }
    B.equipes.push({
      nom: PALETTE[i].nom, couleur: PALETTE[i].couleur, membres: membres,
      score: 0, bonnes: 0, posees: 0, tour: 0,
      jokers: { x2: true, braquage: true, bouclier: true },
      protege: false
    });
  }
  B.e = 0; B.manche = 0; B.phase = 'jeu';
  tourSuivant(true);
}

function equipe()   { return B.equipes[B.e]; }
function repondeur() { var e = equipe(); return e.membres[e.tour % e.membres.length]; }

function tourSuivant(premier) {
  if (!premier) {
    B.e++;
    if (B.e >= B.equipes.length) { B.e = 0; B.manche++; }
  }
  if (B.manche >= B.manches) return mancheFinale();

  B.cible = null; B.x2 = false;
  poser();
}

/* ============ une question ============ */
function poser() {
  arreterChrono();
  var e = equipe(), j = repondeur();
  Q = A.pioche.piocher(A.critereJoueur(j));

  $('#braqRoot').innerHTML =
    tableauScores() +
    '<div class="card p-6 mt-5" style="border-color:' + e.couleur + '55">' +
      '<div class="flex items-center justify-between mb-4">' +
        '<div><p class="kicker" style="color:' + e.couleur + '">' + e.nom + '</p>' +
          '<p class="font-serif text-2xl font-black text-white">' + (j.nom || 'Joueur') + ' répond</p></div>' +
        '<p class="text-xs text-slate-500 text-right">Manche ' + (B.manche + 1) + ' / ' + B.manches + '</p>' +
      '</div>' +
      (Q
        ? '<p id="qCatB" class="kicker" style="color:' + Q.couleur + '">' + Q.categorieLabel + '</p>' +
          '<p class="text-xs text-slate-500 mt-2">difficulté ' + Q.difficulty + ' · ' +
            (Q.difficulty * 10) + ' pts</p>' +
          '<p class="font-serif text-2xl md:text-3xl font-bold text-white mt-3 leading-snug">' + Q.q + '</p>' +
          '<div id="zoneB" class="mt-6 space-y-3"></div>'
        : '<p class="text-slate-400">Plus de question disponible pour ce joueur.</p>') +
    '</div>' +
    zoneJokers() +
    '<div id="fbB"></div>' +
    '<div class="flex gap-3 mt-6 pb-10">' +
      '<button id="btnStopB" class="btn btn-ghost"><i class="fa-solid fa-xmark"></i>Arrêter</button>' +
      '<button id="btnNextB" class="btn btn-primary flex-1 hidden">Suite<i class="fa-solid fa-arrow-right"></i></button>' +
    '</div>';

  $('#btnStopB').onclick = function () { arreterChrono(); A.montrer('ecran-config'); };
  $('#btnNextB').onclick = function () { tourSuivant(false); };
  brancherJokers();
  if (Q) zoneReponse(Q, repondre); else $('#btnNextB').classList.remove('hidden');
}

function tableauScores() {
  return '<div class="grid gap-2" style="grid-template-columns:repeat(' + B.equipes.length + ',minmax(0,1fr))">' +
    B.equipes.map(function (e, i) {
      return '<div class="card p-3 text-center' + (i === B.e ? ' ring-2' : '') + '"' +
        (i === B.e ? ' style="--tw-ring-color:' + e.couleur + '"' : '') + '>' +
        '<p class="text-xs font-bold" style="color:' + e.couleur + '">' + e.nom +
          (e.protege ? ' <i class="fa-solid fa-shield"></i>' : '') + '</p>' +
        '<p class="font-serif text-2xl font-black text-white">' + e.score + '</p></div>';
    }).join('') + '</div>';
}

function zoneJokers() {
  var e = equipe();
  if (B.phase !== 'jeu') return '';
  return '<div class="flex gap-2 mt-4">' +
    '<button class="btn btn-ghost flex-1 text-xs" data-jok="x2"' + (e.jokers.x2 ? '' : ' disabled') +
      '><i class="fa-solid fa-xmark"></i>Double</button>' +
    '<button class="btn btn-ghost flex-1 text-xs" data-jok="braquage"' + (e.jokers.braquage ? '' : ' disabled') +
      '><i class="fa-solid fa-sack-dollar"></i>Braquage</button>' +
    '<button class="btn btn-ghost flex-1 text-xs" data-jok="bouclier"' + (e.jokers.bouclier ? '' : ' disabled') +
      '><i class="fa-solid fa-shield"></i>Bouclier</button>' +
    '</div><p id="jokMsg" class="text-xs text-center mt-2 text-slate-500"></p>';
}

function brancherJokers() {
  Array.prototype.slice.call(document.querySelectorAll('[data-jok]')).forEach(function (b) {
    b.onclick = function () { jouerJoker(b.getAttribute('data-jok')); };
  });
}

function jouerJoker(type) {
  var e = equipe();
  if (!e.jokers[type]) return;

  if (type === 'x2') {
    e.jokers.x2 = false; B.x2 = true;
    $('#jokMsg').innerHTML = '<span class="text-q-blue font-bold">Double activé.</span> ' +
      'Points doublés sur cette question.';

  } else if (type === 'bouclier') {
    e.jokers.bouclier = false; e.protege = true;
    $('#jokMsg').innerHTML = '<span class="text-emerald-400 font-bold">Bouclier levé.</span> ' +
      'Le prochain braquage contre vous échouera.';

  } else if (type === 'braquage') {
    var autres = B.equipes.filter(function (x, i) { return i !== B.e; });
    $('#jokMsg').innerHTML = 'Voler qui ? ' + autres.map(function (x) {
      return '<button class="underline font-bold mx-2" data-cible="' + x.nom + '" style="color:' +
        x.couleur + '">' + x.nom + ' (' + x.score + ')</button>';
    }).join('');
    Array.prototype.slice.call(document.querySelectorAll('[data-cible]')).forEach(function (b) {
      b.onclick = function () {
        e.jokers.braquage = false;
        B.cible = B.equipes.filter(function (x) { return x.nom === b.getAttribute('data-cible'); })[0];
        $('#jokMsg').innerHTML = '<span class="text-q-red font-bold">Braquage armé sur ' +
          B.cible.nom + '.</span> Bonne réponse = vous prenez leurs points.';
      };
    });
  }
  document.querySelectorAll('[data-jok="' + type + '"]')[0].disabled = true;
}

/* ============ saisie de la réponse ============
   Duplication assumée avec app.js : c'est la présentation qui se
   répète, pas les règles. Le verdict reste dans engine.js. */
function zoneReponse(q, cb) {
  var z = $('#zoneB');
  z.innerHTML = '';

  if (q.type === 'qcm') {
    q.choices.forEach(function (t, i) {
      var b = el('<button class="prop prop-btn"><span class="lettre">' + 'ABCD'[i] + '</span>' + t + '</button>');
      b.onclick = function () { cb(i); };
      z.appendChild(b);
    });

  } else if (q.type === 'vraifaux') {
    [['Vrai', true], ['Faux', false]].forEach(function (p) {
      var b = el('<button class="prop prop-btn text-center font-bold">' + p[0] + '</button>');
      b.onclick = function () { cb(p[1]); };
      z.appendChild(b);
    });

  } else if (q.type === 'libre' || q.type === 'estimation') {
    var est = q.type === 'estimation';
    z.innerHTML =
      '<input id="saisieB" class="inp text-lg" ' +
      (est ? 'type="number" step="any" inputmode="decimal"' : 'type="text" autocomplete="off"') +
      ' placeholder="' + (est ? 'Votre estimation' + (q.unit ? ' en ' + q.unit : '') : 'Votre réponse') + '">' +
      '<button id="btnValB" class="btn btn-primary w-full mt-3"><i class="fa-solid fa-check"></i>Valider</button>';
    $('#btnValB').onclick = function () { cb($('#saisieB').value); };
    $('#saisieB').addEventListener('keydown', function (e) { if (e.key === 'Enter') cb($('#saisieB').value); });
    setTimeout(function () { var s = $('#saisieB'); if (s) s.focus(); }, 60);

  } else if (q.type === 'defi') {
    var d = q.duration || 60;
    z.innerHTML = '<p class="text-center text-slate-400 text-sm">Défi · ' + d + ' s</p>' +
      '<p id="compteB" class="text-center font-serif text-5xl font-black text-white my-3">' + d + '</p>' +
      '<div class="flex gap-3"><button id="bRate" class="btn btn-ghost flex-1">Raté</button>' +
      '<button id="bOk" class="btn btn-primary flex-1">Réussi</button></div>';
    $('#bOk').onclick   = function () { cb(true); };
    $('#bRate').onclick = function () { cb(false); };
    lancerChrono(d);
  }
}

function lancerChrono(d) {
  var reste = d;
  chrono = setInterval(function () {
    reste--;
    var c = $('#compteB');
    if (!c) return arreterChrono();
    c.textContent = reste;
    if (reste <= 5) c.classList.add('text-q-red');
    if (reste <= 0) arreterChrono();
  }, 1000);
}
function arreterChrono() { if (chrono) { clearInterval(chrono); chrono = null; } }

/* ============ résolution ============ */
function repondre(valeur) {
  arreterChrono();
  var e = equipe(), j = repondeur();
  var r = Quiz.verifier(Q, valeur, j.handicap);
  var pts = Quiz.points(Q, r.bon) * (B.x2 ? 2 : 1);

  e.posees++; e.tour++;
  if (r.bon) e.bonnes++;

  var recit = '';

  if (r.bon && B.cible) {
    if (B.cible.protege) {
      B.cible.protege = false;
      e.score += pts;
      recit = '<span class="text-emerald-400 font-bold">Bouclier !</span> ' + B.cible.nom +
        ' encaisse le coup. Vous marquez quand même ' + pts + ' pts.';
    } else {
      var vol = Math.min(pts, B.cible.score);
      B.cible.score -= vol; e.score += vol;
      recit = '<span class="text-q-red font-bold">Braquage réussi.</span> ' + vol +
        ' pts arrachés à ' + B.cible.nom + '.';
    }
  } else if (r.bon) {
    e.score += pts;
    recit = '+' + pts + ' pts' + (B.x2 ? ' (doublé)' : '') + '.';
  } else if (B.cible) {
    recit = '<span class="text-q-red font-bold">Braquage manqué.</span> Le joker est perdu.';
  } else {
    recit = 'Zéro point.';
  }

  Array.prototype.slice.call(document.querySelectorAll('.prop-btn')).forEach(function (b) { b.disabled = true; });

  $('#fbB').innerHTML =
    '<div class="card p-5 mt-5 ' + (r.bon ? 'verdict-bon' : 'verdict-faux') + '">' +
      '<p class="font-serif text-2xl font-black ' + (r.bon ? 'text-emerald-400' : 'text-q-red') + '">' +
        (r.bon ? 'Bonne réponse.' : 'Raté.') + '</p>' +
      '<p class="text-slate-200 mt-2">' + recit + '</p>' +
      (Q.type !== 'defi' ? '<p class="text-white mt-2 text-sm"><span class="text-slate-500">Réponse : </span>' +
        r.attendu + '</p>' : '') +
      (Q.fun ? '<p class="text-sm text-slate-400 mt-3 italic">' + Q.fun + '</p>' : '') +
      (Q.type === 'libre' && !r.bon
        ? '<button id="okQuandMeme" class="btn btn-ghost mt-4 text-xs">' +
          '<i class="fa-solid fa-gavel"></i>La table valide quand même</button>' : '') +
    '</div>';

  if ($('#okQuandMeme')) {
    $('#okQuandMeme').onclick = function () {
      e.score += pts; e.bonnes++;
      this.outerHTML = '<p class="text-xs text-emerald-400 mt-3">Validé. +' + pts + ' pts</p>';
    };
  }

  $('#btnNextB').classList.remove('hidden');
}

/* ============ manche finale ============ */
function mancheFinale() {
  B.phase = 'mise';
  $('#braqRoot').innerHTML =
    '<p class="kicker text-q-red">Dernière ligne droite</p><span class="kicker-line"></span>' +
    '<h2 class="font-serif text-4xl font-black text-white mt-4 mb-3">La manche finale</h2>' +
    '<p class="text-sm text-slate-400 mb-6">Chaque équipe mise ce qu\'elle veut sur son score. ' +
      'Bonne réponse, la mise est doublée. Mauvaise, elle est perdue.</p>' +
    B.equipes.map(function (e, i) {
      return '<div class="card p-4 mb-3 flex items-end gap-4">' +
        '<div class="flex-1"><p class="font-bold" style="color:' + e.couleur + '">' + e.nom + '</p>' +
        '<p class="text-slate-500 text-sm">' + e.score + ' pts en banque</p></div>' +
        '<div class="w-32"><label class="lbl">Mise</label>' +
        '<input class="inp" type="number" min="0" max="' + Math.max(0, e.score) +
        '" value="' + Math.floor(Math.max(0, e.score) / 2) + '" data-mise="' + i + '"></div></div>';
    }).join('') +
    '<button id="btnMises" class="btn btn-red w-full mt-4 text-base">' +
      '<i class="fa-solid fa-lock"></i>Verrouiller les mises</button>';

  $('#btnMises').onclick = function () {
    B.equipes.forEach(function (e, i) {
      var v = parseInt(document.querySelector('[data-mise="' + i + '"]').value, 10) || 0;
      e.mise = Math.max(0, Math.min(v, Math.max(0, e.score)));
    });
    B.phase = 'finale'; B.e = 0;
    finaleEquipe();
  };
}

function finaleEquipe() {
  if (B.e >= B.equipes.length) return fin();

  var e = equipe(), j = repondeur();
  Q = A.pioche.piocher(A.critereJoueur(j));

  $('#braqRoot').innerHTML =
    tableauScores() +
    '<div class="card p-6 mt-5" style="border-color:' + e.couleur + '99">' +
      '<p class="kicker" style="color:' + e.couleur + '">' + e.nom + ' · mise de ' + e.mise + ' pts</p>' +
      '<p class="font-serif text-xl font-black text-white mt-1">' + (j.nom || 'Joueur') + ' répond</p>' +
      (Q ? '<p class="text-xs text-slate-500 mt-4">' + Q.categorieLabel + '</p>' +
        '<p class="font-serif text-2xl md:text-3xl font-bold text-white mt-2 leading-snug">' + Q.q + '</p>' +
        '<div id="zoneB" class="mt-6 space-y-3"></div>' : '<p class="text-slate-400">Plus de question.</p>') +
    '</div><div id="fbB"></div>' +
    '<div class="mt-6 pb-10"><button id="btnNextB" class="btn btn-primary w-full hidden">Suite' +
      '<i class="fa-solid fa-arrow-right"></i></button></div>';

  $('#btnNextB').onclick = function () { B.e++; finaleEquipe(); };
  if (!Q) return $('#btnNextB').classList.remove('hidden');

  zoneReponse(Q, function (valeur) {
    arreterChrono();
    var r = Quiz.verifier(Q, valeur, j.handicap);
    e.posees++;
    if (r.bon) { e.bonnes++; e.score += e.mise; } else { e.score -= e.mise; }

    Array.prototype.slice.call(document.querySelectorAll('.prop-btn')).forEach(function (b) { b.disabled = true; });
    $('#fbB').innerHTML = '<div class="card p-5 mt-5 ' + (r.bon ? 'verdict-bon' : 'verdict-faux') + '">' +
      '<p class="font-serif text-2xl font-black ' + (r.bon ? 'text-emerald-400' : 'text-q-red') + '">' +
        (r.bon ? '+' + e.mise + ' pts' : '−' + e.mise + ' pts') + '</p>' +
      (Q.type !== 'defi' ? '<p class="text-white mt-2 text-sm"><span class="text-slate-500">Réponse : </span>' +
        r.attendu + '</p>' : '') +
      (Q.fun ? '<p class="text-sm text-slate-400 mt-3 italic">' + Q.fun + '</p>' : '') + '</div>';
    $('#btnNextB').classList.remove('hidden');
  });
}

/* ============ fin ============ */
function fin() {
  var classement = B.equipes.slice().sort(function (a, b) { return b.score - a.score; });

  $('#braqRoot').innerHTML =
    '<p class="kicker text-q-red">Terminé</p><span class="kicker-line"></span>' +
    '<h2 class="font-serif text-4xl font-black text-white mt-4 mb-6">' + classement[0].nom + ' repart avec la caisse</h2>' +
    '<div class="card p-5"><table><tbody>' +
      classement.map(function (e, i) {
        return '<tr><td class="text-xl">' + (['🥇','🥈','🥉'][i] || (i + 1)) + '</td>' +
          '<td class="font-bold" style="color:' + e.couleur + '">' + e.nom + '</td>' +
          '<td class="font-serif text-2xl font-black text-white">' + e.score + '</td>' +
          '<td class="text-slate-500 text-xs">' + e.bonnes + ' / ' + e.posees + '</td>' +
          '<td class="text-slate-600 text-xs">' + e.membres.map(function (m) { return m.nom; }).join(', ') + '</td></tr>';
      }).join('') +
    '</tbody></table></div>' +
    '<div class="flex flex-col sm:flex-row gap-3 mt-7 pb-10">' +
      '<button id="btnEnvB" class="btn btn-primary flex-1"><i class="fa-solid fa-cloud-arrow-up"></i>' +
        'Enregistrer les scores</button>' +
      '<button id="btnRejB" class="btn btn-ghost flex-1"><i class="fa-solid fa-rotate-right"></i>Rejouer</button>' +
    '</div><p id="envB" class="text-sm text-center"></p>';

  $('#btnRejB').onclick = function () { A.montrer('ecran-config'); };
  $('#btnEnvB').onclick = async function () {
    this.disabled = true;
    $('#envB').textContent = 'Envoi…';
    try {
      var lignes = B.equipes.map(function (e) {
        return {
          joueur: e.nom.slice(0, 40), mode: 'braquage',
          score: Math.max(-1000, Math.min(100000, e.score)),  // bornes du WITH CHECK côté base
          bonnes: e.bonnes, posees: e.posees
        };
      });
      var res = await Quiz.envoyerScores(lignes);
      $('#envB').innerHTML = '<span class="text-emerald-400">' + res.length + ' résultats enregistrés.</span>';
    } catch (err) {
      $('#envB').innerHTML = '<span class="text-q-red">Échec : ' + err.message + '</span>';
      console.error(err);
    }
  };
}

})();

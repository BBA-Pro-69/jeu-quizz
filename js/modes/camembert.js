/* =====================================================================
   Quiz Famille · js/modes/camembert.js
   Mode « Le Camembert » : six parts à remplir, une par catégorie.

   Pas de plateau ni de pions : sur une tablette posée au milieu de la
   table, déplacer un pion case par case ne sert à rien. Le dé désigne
   directement la part jouée. Quand il tombe sur une part déjà gagnée,
   le joueur choisit lui-même — plus le camembert se remplit, plus la
   main est libre, ce qui accélère naturellement les fins de partie.

   Bonne réponse = on rejoue, trois fois d'affilée au maximum.
   Camembert complet = question du centre, catégorie choisie par les
   autres. Elle rate ? On repassera.
   ===================================================================== */
(function () {
'use strict';

var A = null, G = null, Q = null, tic = null;

var $ = function (s) { return document.querySelector(s); };
function el(h) { var d = document.createElement('div'); d.innerHTML = h; return d.firstElementChild; }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}
function arreter() { if (tic) { clearInterval(tic); tic = null; } }

/* ============ accrochage ============ */
document.addEventListener('quiz:pret', function () {
  A = window.Quiz.app;

  document.body.appendChild(el(
    '<section id="ecran-camembert" class="ecran hidden">' +
      '<div id="camRoot" class="max-w-2xl mx-auto px-5 py-8"></div></section>'
  ));

  var b = el('<button id="btnCamembert" class="btn btn-ghost flex-1 text-base">' +
    '<i class="fa-solid fa-chart-pie"></i>Le Camembert</button>');
  var ancre = $('#btnChrono') || $('#btnSolo') || $('#btnBraquage') || $('#btnJouerPartie');
  ancre.parentNode.insertBefore(b, ancre.nextSibling);
  b.onclick = ecranSetup;
});

/* ============ réglages de la partie ============ */
function categoriesDispo() {
  var metas   = A.pioche.categories();
  var cochees = A.cfg.categories || [];
  var l = metas.filter(function (c) { return cochees.indexOf(c.key) !== -1; });
  return l.length ? l : metas;
}

function ecranSetup() {
  if (!A.cfg.joueurs.length) { alert('Ajoute au moins un joueur.'); return; }

  var dispo = categoriesDispo();
  G = { dispo: dispo, choix: dispo.slice(0, 6).map(function (c) { return c.key; }) };

  A.montrer('ecran-camembert');
  rendreSetup();
}

function rendreSetup() {
  arreter();
  $('#camRoot').innerHTML =
    '<p class="kicker text-amber-400">Mode de jeu</p><span class="kicker-line"></span>' +
    '<h2 class="font-serif text-4xl font-black text-white mt-4">Le Camembert</h2>' +
    '<p class="text-sm text-slate-400 mt-3 leading-relaxed">' +
      'Chacun remplit son camembert, une part par catégorie. Bonne réponse, on rejoue ' +
      '(trois fois de suite au maximum). Le dé qui retombe sur une part déjà gagnée vous ' +
      'laisse choisir. Camembert plein, il reste la question du centre.</p>' +

    '<p class="kicker text-q-blue mt-7 mb-1">Les parts</p>' +
    '<p class="text-xs text-slate-500 mb-3">De trois à six catégories. ' +
      '<span id="camNb"></span></p>' +
    '<div id="camCats" class="space-y-2"></div>' +

    '<div class="flex flex-col sm:flex-row gap-3 mt-8 pb-10">' +
      '<button id="camGo" class="btn btn-primary flex-1 text-base">' +
        '<i class="fa-solid fa-dice"></i>Distribuer les camemberts</button>' +
      '<button id="camBack" class="btn btn-ghost"><i class="fa-solid fa-arrow-left"></i>Retour</button>' +
    '</div>';

  G.dispo.forEach(function (c) {
    var on  = G.choix.indexOf(c.key) !== -1;
    var row = el('<button class="prop prop-btn flex items-center justify-between"></button>');
    if (on) row.style.borderColor = c.color;
    row.innerHTML =
      '<span class="flex items-center gap-3">' +
        '<i class="' + c.icon + '" style="color:' + c.color + ';opacity:' + (on ? 1 : .35) + '"></i>' +
        '<span class="' + (on ? 'text-white font-bold' : 'text-slate-500') + '">' + esc(c.label) + '</span>' +
      '</span>' +
      '<span class="text-xs ' + (on ? 'text-emerald-400' : 'text-slate-600') + '">' +
        (on ? 'part ' + (G.choix.indexOf(c.key) + 1) : 'hors jeu') + '</span>';
    row.onclick = function () {
      var i = G.choix.indexOf(c.key);
      if (i !== -1) G.choix.splice(i, 1);
      else if (G.choix.length < 6) G.choix.push(c.key);
      else return;
      rendreSetup();
    };
    $('#camCats').appendChild(row);
  });

  $('#camNb').textContent = G.choix.length + ' sélectionnée' + (G.choix.length > 1 ? 's' : '');
  $('#camGo').disabled = G.choix.length < 3;
  $('#camBack').onclick = function () { A.montrer('ecran-config'); };
  $('#camGo').onclick   = demarrer;
}

/* ============ mise en place ============ */
function demarrer() {
  var parts = G.choix.map(function (k) {
    return G.dispo.filter(function (c) { return c.key === k; })[0];
  });

  G.parts   = parts;
  G.joueurs = A.cfg.joueurs.map(function (j, i) {
    return Object.assign({}, j, {
      nom: j.nom || 'Joueur ' + (i + 1),
      parts: {}, score: 0, bonnes: 0, posees: 0, finale: false
    });
  });
  G.i = 0;
  G.enchaine = 0;
  tour();
}

function joueur() { return G.joueurs[G.i]; }
function nbParts(j) { return Object.keys(j.parts).length; }
function complet(j) { return nbParts(j) >= G.parts.length; }

function mainSuivante() {
  G.enchaine = 0;
  G.i = (G.i + 1) % G.joueurs.length;
  tour();
}

/* ============ le camembert dessiné ============ */
function svgCamembert(j, taille) {
  var n = G.parts.length, r = 52, cx = 60, cy = 60;

  var secteurs = G.parts.map(function (p, i) {
    var a0 = (i * 360 / n - 90) * Math.PI / 180;
    var a1 = ((i + 1) * 360 / n - 90) * Math.PI / 180;
    var x0 = (cx + r * Math.cos(a0)).toFixed(2), y0 = (cy + r * Math.sin(a0)).toFixed(2);
    var x1 = (cx + r * Math.cos(a1)).toFixed(2), y1 = (cy + r * Math.sin(a1)).toFixed(2);
    var grand  = (360 / n) > 180 ? 1 : 0;
    var acquis = !!j.parts[p.key];
    return '<path d="M' + cx + ' ' + cy + ' L' + x0 + ' ' + y0 +
      ' A' + r + ' ' + r + ' 0 ' + grand + ' 1 ' + x1 + ' ' + y1 + ' Z" fill="' + p.color +
      '" fill-opacity="' + (acquis ? '.92' : '.09') + '" stroke="rgba(255,255,255,.22)" stroke-width="1"/>';
  }).join('');

  return '<svg viewBox="0 0 120 120" width="' + taille + '" height="' + taille + '" ' +
    'style="transition:all .3s cubic-bezier(.16,1,.3,1)">' + secteurs +
    '<circle cx="60" cy="60" r="15" fill="#0b1a26" stroke="rgba(255,255,255,.22)"/>' +
    '<text x="60" y="65" text-anchor="middle" font-size="15" font-weight="800" ' +
      'fill="#fff" font-family="Inter,sans-serif">' + nbParts(j) + '</text></svg>';
}

function bandeauJoueurs() {
  return '<div class="flex flex-wrap gap-3 justify-center mt-6">' +
    G.joueurs.map(function (j, i) {
      return '<div class="text-center ' + (i === G.i ? '' : 'opacity-45') + '">' +
        svgCamembert(j, 56) +
        '<p class="text-xs mt-1 ' + (i === G.i ? 'text-white font-bold' : 'text-slate-500') + '">' +
        esc(j.nom) + '</p></div>';
    }).join('') + '</div>';
}

/* ============ le tour ============ */
function tour() {
  arreter();
  var j = joueur();
  if (j.finale) return finaleChoix(j);

  $('#camRoot').innerHTML =
    '<div class="text-center">' +
      '<p class="kicker text-q-blue">Au tour de</p>' +
      '<h2 class="font-serif text-4xl font-black text-white mt-2">' + esc(j.nom) + '</h2>' +
      '<div class="mt-6 flex justify-center">' + svgCamembert(j, 150) + '</div>' +
      '<p class="text-sm text-slate-500 mt-3">' + nbParts(j) + ' part' +
        (nbParts(j) > 1 ? 's' : '') + ' sur ' + G.parts.length +
        ' · ' + j.score + ' pts</p>' +
      '<div id="camDe" class="font-serif text-7xl font-black text-white my-8">—</div>' +
      '<button id="camLance" class="btn btn-primary text-base px-10">' +
        '<i class="fa-solid fa-dice"></i>Lancer le dé</button>' +
    '</div>' +
    legende() +
    bandeauJoueurs() +
    '<div class="text-center pb-10 mt-8">' +
      '<button id="camStop" class="btn btn-ghost text-xs">' +
        '<i class="fa-solid fa-flag-checkered"></i>Arrêter et voir le classement</button></div>';

  $('#camStop').onclick  = fin;
  $('#camLance').onclick = lancerDe;
}

function legende() {
  var j = joueur();
  return '<div class="card p-4 mt-7"><table><tbody>' +
    G.parts.map(function (p, i) {
      var ok = !!j.parts[p.key];
      return '<tr><td class="w-8 text-slate-500">' + (i + 1) + '</td>' +
        '<td><i class="' + p.icon + ' mr-2" style="color:' + p.color + '"></i>' +
        '<span class="' + (ok ? 'text-white font-bold' : 'text-slate-400') + '">' +
        esc(p.label) + '</span></td>' +
        '<td class="text-right">' + (ok
          ? '<i class="fa-solid fa-check text-emerald-400"></i>'
          : '<span class="text-slate-600 text-xs">à gagner</span>') + '</td></tr>';
    }).join('') + '</tbody></table></div>';
}

function lancerDe() {
  var j = joueur(), n = G.parts.length;
  $('#camLance').disabled = true;

  var reste = 10;
  var face  = 1;
  tic = setInterval(function () {
    face = 1 + Math.floor(Math.random() * n);
    $('#camDe').textContent = face;
    if (--reste <= 0) {
      arreter();
      var part = G.parts[face - 1];
      setTimeout(function () {
        if (j.parts[part.key]) choisirPart(j, part);
        else poser(j, part);
      }, 450);
    }
  }, 70);
}

function choisirPart(j, tiree) {
  arreter();
  var libres = G.parts.filter(function (p) { return !j.parts[p.key]; });

  $('#camRoot').innerHTML =
    '<div class="text-center mb-6">' +
      '<p class="kicker text-slate-500">Le dé tombe sur ' + esc(tiree.label) + '</p>' +
      '<h2 class="font-serif text-3xl font-black text-white mt-3">Tu l\'as déjà.</h2>' +
      '<p class="text-slate-400 mt-2 text-sm">Choisis la part que tu veux jouer.</p></div>' +
    '<div id="camLibres" class="space-y-3 pb-10"></div>';

  libres.forEach(function (p) {
    var b = el('<button class="prop prop-btn flex items-center gap-3"></button>');
    b.style.borderColor = p.color;
    b.innerHTML = '<i class="' + p.icon + '" style="color:' + p.color + '"></i>' +
      '<span class="font-bold text-white">' + esc(p.label) + '</span>';
    b.onclick = function () { poser(j, p); };
    $('#camLibres').appendChild(b);
  });
}

/* ============ la question ============ */
function poser(j, part, estFinale) {
  arreter();
  var crit = Object.assign({}, A.critereJoueur(j), { categories: [part.key] });
  Q = A.pioche.piocher(crit);

  if (!Q) {
    $('#camRoot').innerHTML =
      '<div class="text-center py-16">' +
        '<p class="text-slate-400">Plus une seule question de ' + esc(part.label) +
          ' à la portée de ' + esc(j.nom) + '.</p>' +
        '<button id="camSkip" class="btn btn-ghost mt-6">Passer la main</button></div>';
    $('#camSkip').onclick = mainSuivante;
    return;
  }

  $('#camRoot').innerHTML =
    '<div class="flex items-center justify-between mb-4">' +
      '<div><p class="kicker" style="color:' + part.color + '">' +
        (estFinale ? 'Question du centre · ' : '') + esc(Q.categorieLabel) + '</p>' +
        '<p class="text-white font-bold mt-1">' + esc(j.nom) + '</p></div>' +
      '<div class="shrink-0">' + svgCamembert(j, 54) + '</div></div>' +

    '<div class="card p-6">' +
      '<p class="text-xs text-slate-500">difficulté ' + Q.difficulty + ' · ' +
        (Q.difficulty * 10) + ' pts' + (Q.type === 'defi' ? ' · défi' : '') + '</p>' +
      '<p class="font-serif text-2xl font-bold text-white mt-3 leading-snug">' + esc(Q.q) + '</p>' +
      '<div id="camZone" class="mt-6 space-y-3"></div>' +
    '</div>' +
    '<div id="camFeed" class="mt-4"></div><div class="pb-10"></div>';

  zoneReponse(j, part, estFinale);
}

function zoneReponse(j, part, estFinale) {
  var z = $('#camZone');
  var repondre = function (v) { verdict(j, part, estFinale, v); };

  if (Q.type === 'qcm') {
    Q.choices.forEach(function (t, i) {
      var b = el('<button class="prop prop-btn"><span class="lettre">' + 'ABCD'[i] + '</span>' + esc(t) + '</button>');
      b.onclick = function () { repondre(i); };
      z.appendChild(b);
    });

  } else if (Q.type === 'vraifaux') {
    [['Vrai', true], ['Faux', false]].forEach(function (p) {
      var b = el('<button class="prop prop-btn text-center font-bold">' + p[0] + '</button>');
      b.onclick = function () { repondre(p[1]); };
      z.appendChild(b);
    });

  } else if (Q.type === 'defi') {
    var d = Q.duration || 30;
    z.innerHTML = '<p class="text-center font-serif text-5xl font-black text-white" id="camD">' + d + '</p>' +
      '<p class="text-center text-xs text-slate-500">' +
        (Q.scoring === 'vote' ? 'La table vote.' : 'La table tranche.') + '</p>' +
      '<div class="flex gap-3 pt-2">' +
        '<button id="camOk" class="btn btn-primary flex-1">Réussi</button>' +
        '<button id="camKo" class="btn btn-ghost flex-1">Raté</button></div>';
    tic = setInterval(function () {
      d--;
      var t = $('#camD'); if (!t) return arreter();
      t.textContent = Math.max(0, d);
      if (d <= 5) t.classList.add('text-q-red');
      if (d <= 0) arreter();
    }, 1000);
    $('#camOk').onclick = function () { arreter(); repondre(true); };
    $('#camKo').onclick = function () { arreter(); repondre(false); };

  } else {
    var est = Q.type === 'estimation';
    z.innerHTML = '<input id="camIn" class="inp text-lg" ' +
      (est ? 'type="number" step="any" inputmode="decimal"' : 'type="text" autocomplete="off"') +
      ' placeholder="' + (est ? 'Ton estimation' + (Q.unit ? ' en ' + esc(Q.unit) : '') : 'Ta réponse') + '">' +
      '<button id="camVal" class="btn btn-primary w-full">Valider</button>';
    $('#camVal').onclick = function () { repondre($('#camIn').value); };
    $('#camIn').addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') repondre($('#camIn').value);
    });
    $('#camIn').focus();
  }
}

/* ============ verdict ============ */
function verdict(j, part, estFinale, valeur) {
  arreter();
  var r   = window.Quiz.verifier(Q, valeur, j.handicap);
  var pts = window.Quiz.points(Q, r.bon);
  appliquer(j, part, estFinale, r, pts, false);
}

function appliquer(j, part, estFinale, r, pts, rattrapage) {
  var nouvelle = false;

  if (!rattrapage) j.posees++;
  if (r.bon) {
    j.bonnes++;
    j.score += pts;
    if (!estFinale && !j.parts[part.key]) { j.parts[part.key] = true; nouvelle = true; }
  }

  $('#camZone').querySelectorAll('button, input').forEach(function (e) { e.disabled = true; });

  var f = $('#camFeed');
  f.innerHTML =
    '<div class="card p-5 ' + (r.bon ? 'verdict-bon' : 'verdict-faux') + '">' +
      '<p class="font-serif text-2xl font-black ' + (r.bon ? 'text-emerald-400' : 'text-q-red') + '">' +
        (r.bon ? (estFinale ? 'Le centre est à toi.' : (nouvelle ? 'Part gagnée !' : '+' + pts + ' pts'))
               : 'Raté') + '</p>' +
      '<p class="text-slate-300 mt-2">Réponse : <strong class="text-white">' + esc(r.attendu) + '</strong></p>' +
      (r.detail ? '<p class="text-xs text-slate-500 mt-1">' + esc(r.detail) + '</p>' : '') +
      (Q.fun ? '<p class="text-sm text-slate-400 mt-3 leading-relaxed"><i class="fa-solid fa-lightbulb text-amber-400 mr-2"></i>' + esc(Q.fun) + '</p>' : '') +
    '</div>' +
    '<div id="camApres" class="flex flex-col sm:flex-row gap-3 mt-4"></div>';

  var apres = $('#camApres');

  // Un verdict humain reste possible sur les réponses libres et les estimations.
  if (!r.bon && !rattrapage && (Q.type === 'libre' || Q.type === 'estimation')) {
    var rat = el('<button class="btn btn-ghost text-xs">' +
      '<i class="fa-solid fa-scale-balanced"></i>La table valide quand même</button>');
    rat.onclick = function () {
      appliquer(j, part, estFinale, { bon: true, attendu: r.attendu, detail: '' },
                window.Quiz.points(Q, true), true);
    };
    apres.appendChild(rat);
  }

  if (r.bon && estFinale) return victoire(j);

  var suite;
  if (r.bon && complet(j)) {
    j.finale = true;
    suite = el('<button class="btn btn-primary flex-1 text-base">' +
      '<i class="fa-solid fa-bullseye"></i>Camembert plein · la question du centre</button>');
    suite.onclick = function () { finaleChoix(j); };
  } else if (r.bon && G.enchaine < 2) {
    G.enchaine++;
    suite = el('<button class="btn btn-primary flex-1 text-base">' +
      '<i class="fa-solid fa-dice"></i>Tu rejoues</button>');
    suite.onclick = tour;
  } else if (r.bon) {
    suite = el('<button class="btn btn-primary flex-1 text-base">' +
      'Trois de suite, on tourne<i class="fa-solid fa-arrow-right"></i></button>');
    suite.onclick = mainSuivante;
  } else {
    suite = el('<button class="btn btn-primary flex-1 text-base">' +
      'Au suivant<i class="fa-solid fa-arrow-right"></i></button>');
    suite.onclick = mainSuivante;
  }
  apres.appendChild(suite);
}

/* ============ la question du centre ============ */
function finaleChoix(j) {
  arreter();
  $('#camRoot').innerHTML =
    '<div class="text-center mb-7">' +
      '<p class="kicker text-q-red">Question du centre</p><span class="kicker-line mx-auto"></span>' +
      '<h2 class="font-serif text-4xl font-black text-white mt-4">' + esc(j.nom) + ' peut gagner</h2>' +
      '<div class="mt-6 flex justify-center">' + svgCamembert(j, 120) + '</div>' +
      '<p class="text-slate-400 mt-4 text-sm">Les autres choisissent la catégorie. ' +
        'Bonne réponse, la partie est finie.</p></div>' +
    '<div id="camFin" class="space-y-3 pb-10"></div>';

  G.parts.forEach(function (p) {
    var b = el('<button class="prop prop-btn flex items-center gap-3"></button>');
    b.style.borderColor = p.color;
    b.innerHTML = '<i class="' + p.icon + '" style="color:' + p.color + '"></i>' +
      '<span class="font-bold text-white">' + esc(p.label) + '</span>';
    b.onclick = function () { poser(j, p, true); };
    $('#camFin').appendChild(b);
  });
}

function victoire(j) {
  arreter();
  G.vainqueur = j;
  setTimeout(fin, 1200);
  $('#camApres').innerHTML =
    '<p class="font-serif text-3xl font-black text-white text-center w-full">' +
      esc(j.nom) + ' remporte la partie.</p>';
}

/* ============ fin ============ */
function fin() {
  arreter();
  var cl = G.joueurs.slice().sort(function (a, b) {
    return (nbParts(b) - nbParts(a)) || (b.score - a.score);
  });

  $('#camRoot').innerHTML =
    '<p class="kicker text-amber-400">Terminé</p><span class="kicker-line"></span>' +
    '<h2 class="font-serif text-4xl font-black text-white mt-4 mb-6">' +
      esc(cl[0].nom) + (G.vainqueur ? ' boucle son camembert' : ' mène au moment où ça s\'arrête') + '</h2>' +

    '<div class="card p-5"><table><tbody>' +
      cl.map(function (j, i) {
        return '<tr><td class="text-xl">' + (['🥇', '🥈', '🥉'][i] || (i + 1)) + '</td>' +
          '<td>' + svgCamembert(j, 40) + '</td>' +
          '<td class="font-bold text-white">' + esc(j.nom) + '</td>' +
          '<td class="font-serif text-2xl font-black text-white">' + j.score + '</td>' +
          '<td class="text-slate-500 text-xs">' + j.bonnes + '/' + j.posees + '</td></tr>';
      }).join('') + '</tbody></table></div>' +

    '<div class="flex flex-col sm:flex-row gap-3 mt-7 pb-10">' +
      '<button id="camEnv" class="btn btn-primary flex-1">' +
        '<i class="fa-solid fa-cloud-arrow-up"></i>Enregistrer les scores</button>' +
      '<button id="camRe" class="btn btn-ghost flex-1">' +
        '<i class="fa-solid fa-rotate-right"></i>Rejouer</button>' +
    '</div><p id="camEtat" class="text-sm text-center pb-10"></p>';

  $('#camRe').onclick  = function () { A.montrer('ecran-config'); };
  $('#camEnv').onclick = async function () {
    this.disabled = true;
    $('#camEtat').textContent = 'Envoi…';
    try {
      await window.Quiz.envoyerScores(G.joueurs.map(function (j) {
        return {
          joueur: j.nom.slice(0, 40), mode: 'camembert',
          score: Math.max(-1000, Math.min(100000, j.score)),
          bonnes: j.bonnes, posees: j.posees
        };
      }));
      $('#camEtat').innerHTML = '<span class="text-emerald-400">Scores enregistrés.</span>';
    } catch (err) {
      $('#camEtat').innerHTML = '<span class="text-q-red">Échec : ' + esc(err.message) +
        '</span><span class="block text-xs text-slate-500">La partie compte quand même.</span>';
      console.error(err);
    }
  };
}

})();

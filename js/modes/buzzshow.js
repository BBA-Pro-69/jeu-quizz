/* =====================================================================
   Quiz Famille · js/modes/buzzshow.js
   Mode « Buzz Show » — la tablette affiche, les téléphones buzzent.

   Deux règles de conception, dictées par les mesures du banc d'essai :

   1. L'équité passe avant la vitesse. Au premier buzz, la tablette se
      tait pendant une fenêtre réglable, ramasse tout ce qui arrive,
      puis classe sur les horodatages corrigés (voir js/transport.js).
      On a mesuré 20 à 40 ms d'écart réel entre deux appuis distincts,
      wifi et 4G mêlés : la fenêtre par défaut de 1200 ms est large.

   2. Celui qui buzze répond sur son téléphone, pas à voix haute. Ça
      supprime l'arbitre, ça supprime la contestation, et ça permet aux
      autres de ne pas entendre la réponse avant d'avoir eu leur tour.

   Les défis sont exclus d'office : mimer une girafe ne se buzze pas.
   ===================================================================== */
(function () {
'use strict';

var A = null, T = null, canal = null, G = null, tic = null;

var $ = function (s) { return document.querySelector(s); };
function el(h) { var d = document.createElement('div'); d.innerHTML = h; return d.firstElementChild; }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}
function arreter() { if (tic) { clearInterval(tic); tic = null; } }
function cle(s) {
  return String(s || '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/* ============ accrochage ============ */
document.addEventListener('quiz:pret', function () {
  A = window.Quiz.app;
  T = window.Quiz.Transport;

  document.body.appendChild(el(
    '<section id="ecran-buzzshow" class="ecran hidden">' +
      '<div id="bzRoot" class="max-w-3xl mx-auto px-5 py-8"></div></section>'
  ));

  var b = el('<button id="btnBuzzshow" class="btn btn-ghost flex-1 text-base">' +
    '<i class="fa-solid fa-bolt"></i>Buzz Show</button>');
  var ancre = $('#btnCamembert') || $('#btnChrono') || $('#btnSolo') || $('#btnJouerPartie');
  ancre.parentNode.insertBefore(b, ancre.nextSibling);

  b.onclick = function () {
    if (!T) { alert('js/transport.js n\'est pas chargé.'); return; }
    ouvrirSalon();
  };
});

/* ============ le salon ============ */
function urlTelephone(code) {
  var base = location.href.replace(/[^/]*$/, '');   // dossier courant
  return base + 'buzz.html?c=' + code;
}

function ouvrirSalon() {
  var code = T.codeSalon(4);
  G = {
    code: code, joueurs: {}, manche: 0, total: 10, fenetre: 1200,
    buzzs: [], file: [], minuteur: null, Q: null, phase: 'salon', posees: 0
  };

  A.montrer('ecran-buzzshow');
  rendreSalon();

  canal = T.creer({
    salon: code, role: 'hote', nom: 'tablette',
    onEtat: function (e, d) {
      var t = { connexion: 'connexion…', ouvert: 'salon ouvert', ferme: 'fermé',
                coupe: 'coupé', erreur: 'erreur : ' + d, relance: 'reconnexion…' }[e] || e;
      var z = $('#bzEtat'); if (z) z.textContent = t;
    }
  });

  canal.sur('hello', function (d) {
    var profil = rapprocher(d.nom);
    G.joueurs[d.de] = G.joueurs[d.de] || {
      de: d.de, nom: d.nom || 'Invité', profil: profil,
      score: 0, bonnes: 0, posees: 0, delai: null
    };
    canal.envoyer('bienvenue', {}, d.de);
    if (G.phase === 'salon') rendreSalon();
  });

  canal.sur('horloge', function (d) {
    var j = G.joueurs[d.de]; if (!j) return;
    j.delai = d.delai; j.offset = d.offset;
    if (G.phase === 'salon') rendreSalon();
  });

  canal.sur('buzz', function (d) { encaisser(d); });
  canal.sur('reponse', function (d) { recevoirReponse(d); });

  canal.connecter().catch(function (e) {
    var z = $('#bzEtat');
    if (z) z.innerHTML = '<span class="text-q-red">' + esc(e.message) + '</span>';
  });
}

/* Un téléphone annonce un prénom. S'il correspond à un joueur de la
   config, on récupère son âge et son handicap ; sinon il joue en
   invité, profil normal, âge du plus jeune configuré. */
function rapprocher(nom) {
  var trouve = (A.cfg.joueurs || []).filter(function (j) { return cle(j.nom) === cle(nom); })[0];
  if (trouve) return { age: trouve.age, handicap: trouve.handicap, connu: true };
  var ages = (A.cfg.joueurs || []).map(function (j) { return j.age; });
  return { age: ages.length ? Math.min.apply(null, ages) : 10, handicap: 'normal', connu: false };
}

function rendreSalon() {
  arreter();
  var l = Object.keys(G.joueurs);

  $('#bzRoot').innerHTML =
    '<p class="kicker text-amber-400">Mode de jeu</p><span class="kicker-line"></span>' +
    '<h2 class="font-serif text-4xl font-black text-white mt-4">Buzz Show</h2>' +
    '<p class="text-sm text-slate-400 mt-3 leading-relaxed">' +
      'La question s\'affiche ici. Le premier qui buzze répond sur son téléphone. ' +
      'Bonne réponse, il empoche ; mauvaise, il perd la moitié des points et la main ' +
      'passe au deuxième du classement.</p>' +

    '<div class="card p-6 mt-6 text-center">' +
      '<p class="kicker text-slate-500">Code du salon</p>' +
      '<p class="font-serif text-6xl font-black text-white tracking-[.2em] my-3">' + G.code + '</p>' +
      '<p class="text-xs text-slate-500 break-all">' + esc(urlTelephone(G.code)) + '</p>' +
      '<p class="text-xs text-slate-600 mt-2">Chaque joueur ouvre cette adresse, ' +
        'ou tape le code sur <strong>buzz.html</strong>.</p>' +
      '<p id="bzEtat" class="text-xs text-slate-500 mt-3"></p>' +
    '</div>' +

    '<div class="card p-5 mt-5">' +
      '<p class="kicker text-slate-500 mb-3">Manettes connectées</p>' +
      (l.length ? '<table class="w-full text-sm"><tbody>' + l.map(function (k) {
        var j = G.joueurs[k];
        var q = j.delai == null
          ? '<span class="text-slate-600">synchro…</span>'
          : '<span class="' + (j.delai < 150 ? 'text-emerald-400' : j.delai < 350 ? 'text-amber-400' : 'text-q-red') +
            '">' + j.delai + ' ms</span>';
        return '<tr><td class="py-1 font-bold text-white">' + esc(j.nom) + '</td>' +
          '<td class="text-xs text-slate-500">' + (j.profil.connu
            ? j.profil.age + ' ans · ' + j.profil.handicap
            : 'invité · profil normal') + '</td>' +
          '<td class="text-right">' + q + '</td></tr>';
      }).join('') + '</tbody></table>'
        : '<p class="text-sm text-slate-500">Personne pour l\'instant.</p>') +
    '</div>' +

    '<div class="card p-5 mt-5">' +
      '<p class="kicker text-slate-500 mb-3">Réglages</p>' +
      '<label class="block text-xs text-slate-500 mb-2">Nombre de questions</label>' +
      '<div id="bzNb" class="flex gap-2 mb-5"></div>' +
      '<label class="block text-xs text-slate-500 mb-2">Fenêtre d\'équité ' +
        '<span id="bzFenV" class="text-white font-bold">' + G.fenetre + ' ms</span></label>' +
      '<input id="bzFen" type="range" min="400" max="3000" step="100" value="' + G.fenetre + '" class="w-full">' +
      '<p class="text-xs text-slate-600 mt-2 leading-relaxed">Délai d\'écoute après le premier buzz. ' +
        'En dessous de 800 ms, un téléphone en 4G peut arriver après la fermeture alors qu\'il ' +
        'a appuyé avant.</p>' +
    '</div>' +

    '<div class="flex flex-col sm:flex-row gap-3 mt-7 pb-10">' +
      '<button id="bzGo" class="btn btn-primary flex-1 text-base">' +
        '<i class="fa-solid fa-play"></i>Lancer la partie</button>' +
      '<button id="bzBack" class="btn btn-ghost"><i class="fa-solid fa-arrow-left"></i>Retour</button>' +
    '</div>';

  [5, 10, 15, 20].forEach(function (n) {
    var b = el('<button class="btn ' + (G.total === n ? 'btn-primary' : 'btn-ghost') + ' flex-1">' + n + '</button>');
    b.onclick = function () { G.total = n; rendreSalon(); };
    $('#bzNb').appendChild(b);
  });

  $('#bzFen').oninput = function () {
    G.fenetre = parseInt(this.value, 10);
    $('#bzFenV').textContent = G.fenetre + ' ms';
  };
  $('#bzGo').disabled = !l.length;
  $('#bzGo').onclick  = demarrer;
  $('#bzBack').onclick = function () {
    if (canal) canal.fermer();
    A.montrer('ecran-config');
  };
}

/* ============ déroulé ============ */
function demarrer() {
  G.manche = 0;
  G.phase = 'jeu';
  Object.keys(G.joueurs).forEach(function (k) {
    G.joueurs[k].score = 0; G.joueurs[k].bonnes = 0; G.joueurs[k].posees = 0;
  });
  mancheSuivante();
}

/* La question doit être à la portée du plus jeune connecté, sinon on
   le met dehors sans le dire. La vérification, elle, applique le
   handicap de celui qui répond. */
function critereGroupe() {
  var ages = Object.keys(G.joueurs).map(function (k) { return G.joueurs[k].profil.age; });
  var plusJeune = ages.length ? Math.min.apply(null, ages) : 10;
  var base = A.critereJoueur({ age: plusJeune, handicap: 'normal' });
  base.types = ['qcm', 'vraifaux', 'libre', 'estimation'];
  return base;
}

function mancheSuivante() {
  arreter();
  if (G.manche >= G.total) return fin();

  G.Q = A.pioche.piocher(critereGroupe());
  if (!G.Q) return fin('Plus de questions à la portée de tout le monde.');

  G.manche++;
  G.buzzs = [];
  G.file = [];
  G.repondeur = null;
  clearTimeout(G.minuteur); G.minuteur = null;

  afficherQuestion();
  G.ouvert = true;
  canal.envoyer('armer', { manche: G.manche });

  /* personne ne buzze : on ne laisse pas le silence s'installer */
  var reste = 15;
  tic = setInterval(function () {
    reste--;
    var z = $('#bzChrono'); if (!z) return arreter();
    z.textContent = reste;
    if (reste <= 5) z.classList.add('text-q-red');
    if (reste <= 0) { arreter(); if (!G.buzzs.length) revealer(null, null); }
  }, 1000);
}

function afficherQuestion() {
  var Q = G.Q;
  $('#bzRoot').innerHTML =
    '<div class="flex items-center justify-between mb-5">' +
      '<p class="kicker text-q-blue">' + esc(Q.categorieLabel) + '</p>' +
      '<p class="text-xs text-slate-500">question ' + G.manche + ' / ' + G.total +
        ' · ' + (Q.difficulty * 10) + ' pts</p>' +
    '</div>' +

    '<div class="card p-8 text-center">' +
      '<p class="font-serif text-3xl sm:text-4xl font-black text-white leading-snug">' + esc(Q.q) + '</p>' +
      (Q.type === 'qcm'
        ? '<div class="grid sm:grid-cols-2 gap-3 mt-7 text-left">' + Q.choices.map(function (c, i) {
            return '<div class="prop"><span class="lettre">' + 'ABCD'[i] + '</span>' + esc(c) + '</div>';
          }).join('') + '</div>'
        : Q.type === 'vraifaux'
          ? '<p class="text-slate-500 mt-6 text-sm">Vrai ou faux ?</p>'
          : Q.type === 'estimation'
            ? '<p class="text-slate-500 mt-6 text-sm">Une estimation' + (Q.unit ? ', en ' + esc(Q.unit) : '') + '.</p>'
            : '<p class="text-slate-500 mt-6 text-sm">Réponse libre.</p>') +
    '</div>' +

    '<div class="text-center mt-8">' +
      '<p class="kicker text-q-red">Buzzers ouverts</p>' +
      '<p id="bzChrono" class="font-serif text-6xl font-black text-white mt-2">15</p>' +
    '</div>' +
    '<div id="bzInfo" class="mt-6"></div>' +
    '<div class="text-center mt-8 pb-10">' +
      '<button id="bzStop" class="btn btn-ghost text-xs">' +
        '<i class="fa-solid fa-flag-checkered"></i>Arrêter la partie</button></div>';

  $('#bzStop').onclick = function () { fin(); };
  tableauScores();
}

function tableauScores() {
  var l = Object.keys(G.joueurs).map(function (k) { return G.joueurs[k]; })
           .sort(function (a, b) { return b.score - a.score; });
  var z = $('#bzInfo'); if (!z) return;
  z.innerHTML = '<div class="flex flex-wrap gap-2 justify-center">' + l.map(function (j) {
    return '<div class="card px-4 py-2 text-center">' +
      '<p class="text-xs text-slate-400">' + esc(j.nom) + '</p>' +
      '<p class="font-serif text-xl font-black text-white">' + j.score + '</p></div>';
  }).join('') + '</div>';
}

/* ============ le buzz ============ */
function encaisser(d) {
  if (G.phase !== 'jeu' || !G.ouvert || d.manche !== G.manche) return;
  if (G.repondeur) return;                                   // trop tard, quelqu'un répond
  if (G.buzzs.some(function (b) { return b.de === d.de; })) return;

  var j = G.joueurs[d.de]; if (!j) return;
  G.buzzs.push({ de: d.de, nom: j.nom, t: d.t, delai: j.delai });

  if (!G.minuteur) {
    arreter();
    var z = $('#bzChrono');
    if (z) { z.textContent = '⚡'; z.classList.remove('text-q-red'); }
    var i = $('#bzInfo');
    if (i) i.innerHTML = '<p class="text-center text-slate-400 text-sm">' +
      'On laisse ' + G.fenetre + ' ms aux autres, puis on tranche.</p>';
    G.minuteur = setTimeout(attribuer, G.fenetre);
  }
}

function attribuer() {
  G.minuteur = null;
  G.ouvert = false;
  G.buzzs.sort(function (a, b) { return a.t - b.t; });
  var t0 = G.buzzs[0].t;

  var classement = G.buzzs.map(function (b, i) {
    return { de: b.de, nom: b.nom, rang: i + 1, ecart: Math.round(b.t - t0) };
  });

  G.file = G.buzzs.map(function (b) { return b.de; });
  canal.envoyer('verdict', {
    manche: G.manche, gagnant: G.file[0],
    gagnantNom: G.joueurs[G.file[0]].nom, classement: classement
  });

  /* si les deux premiers sont dans l'incertitude de mesure, on le dit
     plutôt que de faire semblant d'avoir départagé au millième */
  var flou = classement.length > 1 &&
    classement[1].ecart < ((G.buzzs[0].delai || 0) + (G.buzzs[1].delai || 0)) / 4;

  $('#bzInfo').innerHTML =
    '<div class="card p-5 text-center">' +
      '<p class="font-serif text-3xl font-black text-white">' + esc(classement[0].nom) + ' a buzzé</p>' +
      (classement.length > 1
        ? '<p class="text-sm text-slate-400 mt-2">devant ' + esc(classement[1].nom) +
          ' de ' + classement[1].ecart + ' ms' + (flou ? ' — autant dire rien du tout' : '') + '</p>'
        : '') +
    '</div>';

  passerLaMain();
}

function passerLaMain() {
  var id = G.file.shift();
  if (!id) return revealer(null, null);

  G.repondeur = id;
  var Q = G.Q;
  var secondes = (Q.type === 'qcm' || Q.type === 'vraifaux') ? 15 : 25;

  canal.envoyer('repondre', {
    manche: G.manche, type: Q.type,
    choices: Q.choices || null, unit: Q.unit || null, secondes: secondes
  }, id);

  var reste = secondes;
  arreter();
  var z = $('#bzChrono');
  if (z) z.textContent = reste;
  $('#bzInfo').innerHTML +=
    '<p class="text-center text-slate-400 mt-4">' +
      '<strong class="text-white">' + esc(G.joueurs[id].nom) + '</strong> répond sur son téléphone…</p>';

  tic = setInterval(function () {
    reste--;
    var c = $('#bzChrono'); if (!c) return arreter();
    c.textContent = Math.max(0, reste);
    if (reste <= 0) { arreter(); recevoirReponse({ de: id, manche: G.manche, valeur: null }); }
  }, 1000);
}

function recevoirReponse(d) {
  if (d.manche !== G.manche || d.de !== G.repondeur) return;   // seul celui qui a la main compte
  arreter();
  G.repondeur = null;

  var j = G.joueurs[d.de];
  var r = window.Quiz.verifier(G.Q, d.valeur, j.profil.handicap);
  var pts = window.Quiz.points(G.Q, r.bon);

  j.posees++;
  if (r.bon) {
    j.bonnes++; j.score += pts;
    return revealer(j, r, pts);
  }

  /* raté : la moitié des points en moins, et le suivant peut tenter */
  var malus = Math.round(window.Quiz.points(G.Q, true) / 2);
  j.score -= malus;

  if (G.file.length) {
    $('#bzInfo').innerHTML +=
      '<p class="text-center text-q-red mt-3">' + esc(j.nom) + ' se trompe · −' + malus + ' pts. ' +
      'La main passe à ' + esc(G.joueurs[G.file[0]].nom) + '.</p>';
    setTimeout(passerLaMain, 1600);
  } else {
    revealer(j, r, -malus);
  }
}

function revealer(j, r, pts) {
  arreter();
  /* Si le temps s'est écoulé sans un seul buzz, les téléphones sont
     encore armés : il faut leur dire de se taire, sinon un appui
     tardif ferait démarrer une attribution pendant la révélation. */
  if (G.ouvert) { G.ouvert = false; canal.envoyer('fermer', { manche: G.manche }); }
  var Q = G.Q;
  var attendu = r ? r.attendu : libelleReponse(Q);
  var bon = !!(r && r.bon);

  $('#bzRoot').innerHTML =
    '<div class="card p-7 text-center ' + (bon ? 'verdict-bon' : 'verdict-faux') + '">' +
      '<p class="font-serif text-3xl font-black ' + (bon ? 'text-emerald-400' : 'text-q-red') + '">' +
        (bon ? esc(j.nom) + ' marque ' + pts + ' pts'
             : (j ? 'Raté' : 'Personne n\'a buzzé')) + '</p>' +
      '<p class="text-slate-300 mt-3 text-lg">Réponse : <strong class="text-white">' + esc(attendu) + '</strong></p>' +
      (r && r.detail ? '<p class="text-xs text-slate-500 mt-1">' + esc(r.detail) + '</p>' : '') +
      (Q.fun ? '<p class="text-sm text-slate-400 mt-4 leading-relaxed">' + esc(Q.fun) + '</p>' : '') +
    '</div>' +
    '<div id="bzInfo" class="mt-6"></div>' +
    '<div class="flex flex-col sm:flex-row gap-3 mt-7 pb-10">' +
      '<button id="bzNext" class="btn btn-primary flex-1 text-base">' +
        (G.manche >= G.total ? 'Voir le classement' : 'Question suivante') +
        '<i class="fa-solid fa-arrow-right"></i></button>' +
      '<button id="bzStop2" class="btn btn-ghost">Arrêter</button>' +
    '</div>';

  tableauScores();

  canal.envoyer('resultat', {
    manche: G.manche, bon: bon, attendu: attendu,
    qui: j ? j.de : null, quiNom: j ? j.nom : null,
    scores: Object.keys(G.joueurs).map(function (k) {
      return { de: k, nom: G.joueurs[k].nom, score: G.joueurs[k].score };
    })
  });

  $('#bzNext').onclick  = mancheSuivante;
  $('#bzStop2').onclick = function () { fin(); };
}

function libelleReponse(Q) {
  if (Q.type === 'qcm') return Q.choices[Q.answer];
  if (Q.type === 'vraifaux') return Q.answer ? 'Vrai' : 'Faux';
  if (Q.type === 'estimation') return Q.answer + (Q.unit ? ' ' + Q.unit : '');
  return String(Q.answer);
}

/* ============ fin ============ */
function fin(raison) {
  arreter();
  clearTimeout(G.minuteur); G.minuteur = null;
  G.phase = 'fin';

  var cl = Object.keys(G.joueurs).map(function (k) { return G.joueurs[k]; })
            .sort(function (a, b) { return b.score - a.score; });

  canal.envoyer('fin', {
    classement: cl.map(function (j, i) { return { de: j.de, nom: j.nom, rang: i + 1, score: j.score }; })
  });

  $('#bzRoot').innerHTML =
    '<p class="kicker text-amber-400">Terminé</p><span class="kicker-line"></span>' +
    '<h2 class="font-serif text-4xl font-black text-white mt-4 mb-2">' +
      (cl.length ? esc(cl[0].nom) + ' rafle la mise' : 'Partie terminée') + '</h2>' +
    (raison ? '<p class="text-sm text-slate-500 mb-4">' + esc(raison) + '</p>' : '') +

    '<div class="card p-5 mt-4"><table class="w-full"><tbody>' +
      cl.map(function (j, i) {
        return '<tr class="border-t border-white/5"><td class="py-2 text-xl">' +
          (['🥇', '🥈', '🥉'][i] || (i + 1)) + '</td>' +
          '<td class="font-bold text-white">' + esc(j.nom) + '</td>' +
          '<td class="text-right font-serif text-2xl font-black text-white">' + j.score + '</td>' +
          '<td class="text-right text-xs text-slate-500">' + j.bonnes + '/' + j.posees + '</td></tr>';
      }).join('') + '</tbody></table></div>' +

    '<div class="flex flex-col sm:flex-row gap-3 mt-7 pb-10">' +
      '<button id="bzEnv" class="btn btn-primary flex-1">' +
        '<i class="fa-solid fa-cloud-arrow-up"></i>Enregistrer les scores</button>' +
      '<button id="bzRe" class="btn btn-ghost flex-1">' +
        '<i class="fa-solid fa-rotate-right"></i>Nouvelle partie</button>' +
    '</div><p id="bzEtatEnv" class="text-sm text-center pb-10"></p>';

  $('#bzRe').onclick = function () { G.phase = 'salon'; rendreSalon(); };

  $('#bzEnv').onclick = async function () {
    this.disabled = true;
    $('#bzEtatEnv').textContent = 'Envoi…';
    try {
      await window.Quiz.envoyerScores(cl.map(function (j) {
        return {
          joueur: j.nom.slice(0, 40), mode: 'buzzshow',
          score: Math.max(-1000, Math.min(100000, j.score)),
          bonnes: j.bonnes, posees: j.posees
        };
      }));
      $('#bzEtatEnv').innerHTML = '<span class="text-emerald-400">Scores enregistrés.</span>';
    } catch (err) {
      $('#bzEtatEnv').innerHTML = '<span class="text-q-red">Échec : ' + esc(err.message) +
        '</span><span class="block text-xs text-slate-500">La partie compte quand même.</span>';
      console.error(err);
    }
  };
}

})();

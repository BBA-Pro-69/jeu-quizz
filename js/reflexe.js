/* =====================================================================
   Quiz Famille · js/reflexe.js
   Mode « Réflexe » — chacun sur son téléphone, personne au milieu.

   Trois partis pris, tous issus d'une partie ratée au buzzer :

   1. Tout le monde répond. Un buzzer récompense le pouce le plus
      rapide, pas la connaissance : le premier appuyait avant d'avoir
      lu, et les autres n'avaient même pas le droit d'essayer.

   2. La question s'affiche au même instant partout. On ne diffuse pas
      « affiche maintenant », on diffuse « affiche à telle heure », dans
      le référentiel de l'hôte, grâce à la synchro d'horloge de
      transport.js. Sans ça, le joueur en 4G perdrait 200 ms de réseau.

   3. Le chronomètre de chacun démarre à SON ouverture des réponses.
      Un enfant a droit à plus de temps de lecture sans que ça fausse
      la comparaison : on compare des temps de réaction, pas des heures.

   Le delta est mesuré sur le téléphone, donc falsifiable par qui ouvre
   la console. Aucune parade en tout-statique. On plafonne juste à
   120 ms, en dessous duquel aucun humain ne réagit.
   ===================================================================== */
(function () {
'use strict';

var T = window.Quiz.Transport;

var FENETRE   = 15000;   // temps de réponse, une fois les choix ouverts
var GRACE     = 1200;    // marge réseau avant clôture par l'hôte
var DELTA_MIN = 120;     // plancher de temps de réaction humain
var AMORCE    = 900;     // délai avant l'affichage commun

var $ = function (s) { return document.querySelector(s); };
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
    return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c];
  });
}
function vue(id) {
  ['vAccueil','vSalon','vLecture','vRep','vAttente','vResultat','vFin'].forEach(function (v) {
    $('#' + v).classList.toggle('on', v === id);
  });
  window.scrollTo({ top: 0 });
}
function sec(ms) { return (ms / 1000).toFixed(2).replace('.', ',') + ' s'; }
function vibrer(m) { if (navigator.vibrate) { try { navigator.vibrate(m); } catch (e) {} } }

/* Le handicap se déduit de l'âge : pas d'écran de config ici. */
function handicapPour(age) { return age <= 7 ? 'enfant' : age <= 10 ? 'decouverte' : 'normal'; }
function poids(h) {
  var t = (window.Quiz.handicaps && window.Quiz.handicaps()) || {};
  return (t[h] && t[h].weight) || 1;
}
/* Temps de lecture avant ouverture des choix. Personnel, donc sans
   effet sur l'équité : chacun est chronométré depuis sa propre ouverture. */
function lectureMs(age) { return age <= 8 ? 8000 : age <= 11 ? 6500 : 5000; }

var LS = 'quiz.reflexe.moi';
var moi   = { nom: '', age: 30 };
var canal = null, hote = false;
var pioche = null, cats = [], choisies = [];
var G = null;   // état de l'hôte
var M = null;   // manche en cours, côté local
var tics = [], tic = null, veille = null;

function planifier(fn, ms) { var t = setTimeout(fn, Math.max(0, ms)); tics.push(t); return t; }
function tousStop() { tics.forEach(clearTimeout); tics = []; if (tic) { clearInterval(tic); tic = null; } }

async function garderAllume() {
  try { veille = await navigator.wakeLock.request('screen'); } catch (e) {}
}
document.addEventListener('visibilitychange', function () {
  if (document.visibilityState === 'visible' && !veille) garderAllume();
});

/* ===================================================================
   Accueil
   =================================================================== */
function init() {
  try {
    var m = JSON.parse(localStorage.getItem(LS));
    if (m) { moi.nom = m.nom || ''; moi.age = m.age || 30; }
  } catch (e) {}
  $('#inNom').value = moi.nom;
  $('#inAge').value = moi.age || '';

  var c = (location.search.match(/[?&]c=([A-Za-z0-9]{3,6})/) || [])[1];
  if (c) { $('#inCode').value = c.toUpperCase(); $('#inNom').focus(); }

  $('#bCreer').onclick     = function () { if (lireMoi()) creerPartie(); };
  $('#bRejoindre').onclick = function () { if (lireMoi()) rejoindre($('#inCode').value.trim().toUpperCase()); };
  $('#bQuitter').onclick   = function () { if (canal) canal.fermer(); location.reload(); };
  $('#bInviter').onclick   = inviter;
  $('#bPasse').onclick     = function () { repondre(null); };
}

function lireMoi() {
  var nom = $('#inNom').value.trim();
  var age = parseInt($('#inAge').value, 10);
  if (!nom)                         { $('#erreur').textContent = 'Il me faut ton prénom.'; return false; }
  if (!age || age < 3 || age > 110) { $('#erreur').textContent = 'Et ton âge, en chiffres.'; return false; }
  moi.nom = nom; moi.age = age;
  try { localStorage.setItem(LS, JSON.stringify(moi)); } catch (e) {}
  $('#erreur').textContent = '';
  return true;
}

/* Partage natif : WhatsApp, SMS, ce que le téléphone propose.
   Firefox Android ne connaît pas navigator.share, d'où le repli. */
function inviter() {
  if (!G) return;
  var url   = location.href.replace(/[?#].*$/, '') + '?c=' + G.code;
  var texte = moi.nom + ' t\'invite à une partie de Quiz Famille. Code ' + G.code + '.';
  if (navigator.share) {
    navigator.share({ title: 'Quiz Famille · Réflexe', text: texte, url: url }).catch(function () {});
    return;
  }
  var tout = texte + ' ' + url;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(tout).then(function () {
      $('#sEtat').textContent = 'Invitation copiée, colle-la dans WhatsApp.';
    }, function () { prompt('Copie ce message :', tout); });
  } else prompt('Copie ce message :', tout);
}

function etat(e, d) {
  var t = { connexion:'connexion…', ouvert:'connecté', ferme:'déconnecté',
            coupe:'coupé', erreur:'erreur : ' + d, relance:'reconnexion…' }[e] || e;
  var z = $('#sEtat'); if (z) z.textContent = t;
}
function pepin(e) {
  $('#sEtat').innerHTML = '<span class="text-red-300">' + esc(e.message) + '</span>';
}

/* ===================================================================
   Créer une partie — ce téléphone devient l'hôte, et joue quand même
   =================================================================== */
function creerPartie() {
  hote = true;
  var code = T.codeSalon(4);
  G = { code: code, total: 10, maxDiff: 5, manche: 0, Q: null, joueurs: {}, reps: {}, phase: 'salon' };

  canal = T.creer({ salon: code, role: 'hote', nom: moi.nom, onEtat: function (e, d) {
    etat(e, d);
    /* Je viens de me reconnecter : les bonjours émis pendant que ce
       téléphone dormait sont perdus, un broadcast ne se stocke pas.
       Je redis qui est là ; ceux qui attendent encore crient de leur côté. */
    if (e === 'ouvert' && G) setTimeout(function () { diffuserSalle(); }, 300);
  }});

  canal.sur('hello', function (d) {
    G.joueurs[d.de] = G.joueurs[d.de] ||
      { de: d.de, nom: d.nom || 'Invité', age: d.age || 10, score: 0, bonnes: 0, posees: 0 };
    canal.envoyer('bienvenue', {}, d.de);   // répété tant qu'il insiste, c'est voulu
    diffuserSalle();
    if (G.phase === 'salon') rendreSalon();
  });
  canal.sur('horloge', function (d) {
    var j = G.joueurs[d.de]; if (j) { j.delai = d.delai; if (G.phase === 'salon') rendreSalon(); }
  });
  canal.sur('rep', function (d) { encaisser(d); });

  G.joueurs[canal.id] = { de: canal.id, nom: moi.nom, age: moi.age,
                          score: 0, bonnes: 0, posees: 0, moi: true, delai: 0 };

  $('#sCode').textContent = code;
  $('#bLancer').classList.remove('hidden');
  vue('vSalon'); rendreSalon(); garderAllume();

  canal.connecter().then(chargerBanque).catch(pepin);
}

function chargerBanque() {
  pioche = window.Quiz.creerPioche({ base: 'data/' });
  pioche.charger().then(function (r) {
    cats = r.categories;
    choisies = cats.map(function (c) { return c.key; });
    rendreSalon();
  }).catch(function (e) {
    $('#sEtat').innerHTML = '<span class="text-red-300">Questions illisibles : ' + esc(e.message) + '</span>';
  });
}

function liste() { return Object.keys(G.joueurs).map(function (k) { return G.joueurs[k]; }); }

function diffuserSalle() {
  canal.envoyer('salle', { joueurs: liste().map(function (j) {
    return { de: j.de, nom: j.nom, age: j.age, score: j.score };
  }) });
}

function rendreSalon() {
  var l = liste();
  $('#sJoueurs').innerHTML = l.length
    ? '<table><tbody>' + l.map(function (j) {
        return '<tr><td class="font-bold text-white">' + esc(j.nom) + '</td>' +
               '<td class="text-xs text-slate-500">' + j.age + ' ans · ' +
                 handicapPour(j.age) + '</td>' +
               '<td class="text-right text-xs ' +
                 (j.delai == null ? 'text-slate-600' : j.delai < 200 ? 'text-emerald-400' : 'text-amber-400') +
                 '">' + (j.delai == null ? 'synchro…' : j.delai + ' ms') + '</td></tr>';
      }).join('') + '</tbody></table>'
    : '<p class="text-sm text-slate-500">Personne pour l\'instant.</p>';

  if (!pioche) { $('#sAttente').textContent = 'Chargement des questions…'; return; }

  $('#sReglages').innerHTML =
    '<div class="card p-5">' +
      '<p class="kicker text-slate-500 mb-3">Les catégories</p>' +
      '<div id="sCats"></div>' +
      '<p class="kicker text-slate-500 mt-5 mb-2">Difficulté maximale · ' +
        '<span id="sDiffV" class="text-white">' + G.maxDiff + '</span></p>' +
      '<input id="sDiff" type="range" min="1" max="5" step="1" value="' + G.maxDiff + '">' +
      '<p class="kicker text-slate-500 mt-5 mb-2">Nombre de questions</p>' +
      '<div id="sNb" class="flex gap-2"></div>' +
    '</div>';

  var zc = $('#sCats');
  cats.forEach(function (c) {
    var b = document.createElement('button');
    b.className = 'chip' + (choisies.indexOf(c.key) !== -1 ? ' on' : '');
    b.style.setProperty('--c', c.color);
    b.innerHTML = '<i class="' + c.icon + '"></i>' + esc(c.label);
    b.onclick = function () {
      var i = choisies.indexOf(c.key);
      if (i === -1) choisies.push(c.key); else choisies.splice(i, 1);
      rendreSalon();
    };
    zc.appendChild(b);
  });

  $('#sDiff').oninput = function () {
    G.maxDiff = parseInt(this.value, 10);
    $('#sDiffV').textContent = G.maxDiff;
  };
  [5, 10, 15, 20].forEach(function (n) {
    var b = document.createElement('button');
    b.className = 'btn ' + (G.total === n ? 'btn-primary' : 'btn-ghost') + ' flex-1';
    b.textContent = n;
    b.onclick = function () { G.total = n; rendreSalon(); };
    $('#sNb').appendChild(b);
  });

  var assez = l.length >= 2 && choisies.length > 0;
  $('#bLancer').disabled = !assez;
  $('#bLancer').onclick  = lancer;
  $('#sAttente').textContent = l.length < 2
    ? 'Il faut au moins un deuxième joueur.'
    : (choisies.length ? '' : 'Coche au moins une catégorie.');
}

function rendreSalonInvite(joueurs) {
  $('#sCode').textContent = canal ? canal.salon : '····';
  $('#bInviter').classList.add('hidden');
  $('#sJoueurs').innerHTML = (joueurs && joueurs.length)
    ? '<table><tbody>' + joueurs.map(function (j) {
        return '<tr><td class="font-bold text-white">' + esc(j.nom) + '</td>' +
               '<td class="text-xs text-slate-500 text-right">' + j.age + ' ans</td></tr>';
      }).join('') + '</tbody></table>'
    : '<p class="text-sm text-slate-500">On attend les autres.</p>';
}

/* ===================================================================
   Rejoindre
   =================================================================== */
function rejoindre(code) {
  if (!code || code.length < 3) { $('#erreur').textContent = 'Il manque le code.'; return; }
  hote = false;
  canal = T.creer({ salon: code, role: 'joueur', nom: moi.nom, onEtat: etat });

  var salut = null, tentatives = 0, accueilli = false;

  /* Un broadcast Realtime ne se stocke pas : si l'hôte a son navigateur
     en arrière-plan quand j'arrive — typiquement parce qu'il vient de
     partager le code sur WhatsApp — mon bonjour tombe dans le vide et
     personne ne le saura jamais. Donc je le répète jusqu'à réponse. */
  function crier() {
    tentatives++;
    canal.envoyer('hello', { age: moi.age });
    if (tentatives > 60) {                       // 90 secondes
      clearInterval(salut); salut = null;
      $('#sAttente').innerHTML = '<span class="text-red-300">Personne ne répond sur le code ' +
        esc(code) + '. Vérifie le code, ou demande à l\'hôte de revenir sur sa page.</span>';
      return;
    }
    $('#sAttente').textContent = tentatives < 5
      ? 'On cherche la partie ' + code + '…'
      : 'Toujours rien (' + tentatives + ' essais). L\'hôte doit avoir sa page ouverte à l\'écran.';
  }

  canal.sur('bienvenue', function () {
    if (accueilli) return;                       // l'hôte répond à chaque bonjour
    accueilli = true;
    if (salut) { clearInterval(salut); salut = null; }
    $('#sAttente').textContent = 'Bien arrivé. On cale les horloges…';
    canal.synchroniser(6).then(function (h) {
      canal.envoyer('horloge', { offset: h.offset, delai: h.delai });
      $('#sHorloge').textContent = 'horloge calée · aller-retour ' + h.delai + ' ms';
      $('#sAttente').textContent = 'En attente du lancement.';
    });
  });
  canal.sur('salle',    function (d) { rendreSalonInvite(d.joueurs); });
  canal.sur('question', function (d) { demarrerManche(d); });
  canal.sur('resultat', function (d) { afficherResultat(d); });
  canal.sur('fin',      function (d) { afficherFin(d.classement); });

  vue('vSalon'); rendreSalonInvite([]); garderAllume();

  canal.connecter()
    .then(function () { crier(); salut = setInterval(crier, 1500); })
    .catch(function (e) {
      vue('vAccueil');
      $('#erreur').textContent = 'Connexion impossible. ' + e.message;
    });
}

/* ===================================================================
   Une manche — côté hôte
   =================================================================== */
function lancer() {
  G.manche = 0; G.phase = 'jeu';
  liste().forEach(function (j) { j.score = 0; j.bonnes = 0; j.posees = 0; });
  poser();
}

function poser() {
  if (G.manche >= G.total) return terminer();

  var l = liste();
  var ages   = l.map(function (j) { return j.age; });
  var jeune  = Math.min.apply(null, ages);
  var mineur = ages.some(function (a) { return a < 13; });

  var q = pioche.piocher({
    categories: choisies, age: jeune, maxDifficulty: G.maxDiff,
    excludeTags: mineur ? ['alcool'] : [],
    types: ['qcm', 'vraifaux']       // taper au clavier serait une course de dactylo
  });
  if (!q) return terminer();

  G.Q = q; G.reps = {}; G.manche++;

  /* On ne diffuse ni la bonne réponse ni l'anecdote : elles partiraient
     dans le WebSocket de tout le monde avant qu'on ait répondu. */
  var pub = {
    manche: G.manche, total: G.total, fenetre: FENETRE,
    T0: canal.maintenant() + AMORCE,
    q: { type: q.type, q: q.q, choices: q.choices || null,
         categorieLabel: q.categorieLabel, couleur: q.couleur, difficulty: q.difficulty }
  };
  canal.envoyer('question', pub);
  demarrerManche(pub);

  var maxLecture = Math.max.apply(null, l.map(function (j) { return lectureMs(j.age); }));
  planifier(cloturer, (pub.T0 - canal.maintenant()) + maxLecture + FENETRE + GRACE);
}

function encaisser(d) {
  if (!G || !G.Q || d.manche !== G.manche) return;
  if (G.reps[d.de]) return;
  G.reps[d.de] = d;
  if (Object.keys(G.reps).length >= liste().length) { tousStop(); cloturer(); }
}

function juste(q, choix) {
  if (choix === null || choix === undefined) return false;
  return choix === q.answer;
}
function bonneLisible(q) {
  return q.type === 'vraifaux' ? (q.answer ? 'Vrai' : 'Faux') : String(q.choices[q.answer]);
}

function cloturer() {
  if (!G || !G.Q) return;
  tousStop();
  var q = G.Q, base = (q.difficulty || 1) * 10;

  var lignes = liste().map(function (j) {
    var r = G.reps[j.de];
    var repondu = r && r.choix !== null && r.choix !== undefined;
    var ok = repondu && juste(q, r.choix);
    var pts = 0, dp = null;

    j.posees++;
    if (repondu) {
      /* Temps pondéré par le handicap, comme les estimations au plus
         proche : le petit de 6 ans ne se bat pas à armes égales. */
      dp = Math.max(DELTA_MIN, r.delta || 0) / poids(handicapPour(j.age));
      if (ok) {
        /* Socle garanti à 50 %, prime de vitesse pour l'autre moitié :
           répondre du tac au tac vaut 150 % de la mise, répondre à la
           dernière seconde en vaut encore 50. Juste et lent reste
           toujours meilleur que rapide et faux. */
        var reste = Math.max(0, 1 - dp / FENETRE);
        pts = Math.round(base * (0.5 + reste));
        j.bonnes++;
      } else {
        pts = -Math.round(base / 2);             // − difficulté × 5, vitesse indifférente
      }
    }
    j.score += pts;
    return { de: j.de, nom: j.nom, delta: repondu ? r.delta : null,
             dp: dp, juste: ok, pts: pts, score: j.score };
  });

  lignes.sort(function (a, b) {
    if (a.juste !== b.juste) return a.juste ? -1 : 1;
    if (a.juste) return a.dp - b.dp;
    return b.pts - a.pts;
  });

  var res = { manche: G.manche, total: G.total, bonne: bonneLisible(q),
              fun: q.fun || '', lignes: lignes, dernier: G.manche >= G.total };
  canal.envoyer('resultat', res);
  afficherResultat(res);
  diffuserSalle();
  G.Q = null;
}

function terminer() {
  var classement = liste().map(function (j) {
    return { de: j.de, nom: j.nom, score: j.score, bonnes: j.bonnes, posees: j.posees };
  }).sort(function (a, b) { return b.score - a.score; });
  canal.envoyer('fin', { classement: classement });
  afficherFin(classement);
}

/* ===================================================================
   Une manche — côté joueur, hôte compris
   =================================================================== */
function demarrerManche(p) {
  tousStop();
  M = { manche: p.manche, total: p.total, q: p.q,
        fenetre: p.fenetre || FENETRE, t0: null, envoye: false };

  var attente = p.T0 - canal.maintenant();
  var lect    = lectureMs(moi.age);
  planifier(function () { afficherLecture(lect); }, attente);
  planifier(ouvrirReponses, attente + lect);
}

function afficherLecture(lect) {
  vue('vLecture');
  vibrer(25);
  $('#lManche').textContent = 'Question ' + M.manche + ' / ' + M.total;
  $('#lCat').textContent = M.q.categorieLabel;
  $('#lCat').style.color = M.q.couleur;
  $('#lEnonce').textContent = M.q.q;

  var fin = Date.now() + lect;
  if (tic) clearInterval(tic);
  tic = setInterval(function () {
    var r = Math.max(0, fin - Date.now());
    $('#lCompte').textContent = Math.ceil(r / 1000);
    if (r <= 0) { clearInterval(tic); tic = null; }
  }, 100);
  $('#lCompte').textContent = Math.ceil(lect / 1000);
}

function ouvrirReponses() {
  if (!M) return;
  vue('vRep');
  vibrer([30, 40, 30]);
  M.t0 = performance.now();

  $('#rEnonce').textContent = M.q.q;
  var mise = M.q.difficulty * 10;
  $('#rMeta').textContent = 'de ' + Math.round(mise * 0.5) + ' à ' + Math.round(mise * 1.5) +
    ' pts selon ta vitesse · erreur −' + Math.round(mise / 2);

  var z = $('#rZone');
  z.innerHTML = '';
  if (M.q.type === 'vraifaux') {
    [['Vrai', true], ['Faux', false]].forEach(function (o) {
      var b = document.createElement('button');
      b.className = 'prop';
      b.textContent = o[0];
      b.onclick = function () { repondre(o[1]); };
      z.appendChild(b);
    });
  } else {
    (M.q.choices || []).forEach(function (t, i) {
      var b = document.createElement('button');
      b.className = 'prop';
      b.innerHTML = '<span class="lettre">' + 'ABCD'[i] + '</span>' + esc(t);
      b.onclick = function () { repondre(i); };
      z.appendChild(b);
    });
  }

  var fin = Date.now() + M.fenetre;
  if (tic) clearInterval(tic);
  tic = setInterval(function () {
    var r = Math.max(0, fin - Date.now());
    $('#rChrono').textContent = (r / 1000).toFixed(1).replace('.', ',') + ' s';
    if (r <= 0) { clearInterval(tic); tic = null; if (!M.envoye) repondre(null); }
  }, 100);
}

function repondre(choix) {
  if (!M || M.envoye) return;
  M.envoye = true;
  if (tic) { clearInterval(tic); tic = null; }

  var delta = M.t0 ? Math.max(DELTA_MIN, performance.now() - M.t0) : M.fenetre;

  /* L'écran d'attente AVANT de transmettre, et ce n'est pas cosmétique :
     chez l'hôte, encaisser() clôture la manche en synchrone quand il
     répond en dernier. Dans l'autre ordre, ce vue('vAttente') repassait
     par-dessus l'écran de résultat et figeait la partie pour tout le monde. */
  vue('vAttente');
  if (choix === null || choix === undefined) {
    $('#aTemps').textContent = 'Tu passes.';
    $('#aInfo').textContent  = 'Zéro point, et zéro dégât. Souvent le bon calcul.';
  } else {
    $('#aTemps').textContent = sec(delta);
    $('#aInfo').textContent  = 'Réponse envoyée. On attend les autres.';
  }

  var msg = { manche: M.manche, choix: choix, delta: Math.round(delta) };
  if (hote) encaisser({ de: canal.id, manche: msg.manche, choix: msg.choix, delta: msg.delta });
  else canal.envoyer('rep', msg);
}

function afficherResultat(res) {
  tousStop();
  vue('vResultat');
  if (M) M.envoye = true;          // plus aucune bascule d'écran pour cette manche

  $('#resBonne').textContent = res.bonne;
  $('#resFun').textContent   = res.fun || '';

  $('#resTable').innerHTML =
    '<table><thead><tr><th>Joueur</th><th>Temps</th><th>Manche</th><th>Total</th></tr></thead><tbody>' +
    res.lignes.map(function (g) {
      var couleur = g.pts > 0 ? 'text-emerald-400' : g.pts < 0 ? 'text-red-400' : 'text-slate-500';
      return '<tr><td class="font-bold ' + (g.de === canal.id ? 'text-q-blue' : 'text-white') + '">' +
             esc(g.nom) + '</td>' +
             '<td class="text-xs text-slate-500">' + (g.delta == null ? '—' : sec(g.delta)) + '</td>' +
             '<td class="font-bold ' + couleur + '">' + (g.pts > 0 ? '+' : '') + g.pts + '</td>' +
             '<td class="text-slate-400">' + g.score + '</td></tr>';
    }).join('') + '</tbody></table>';

  if (hote) {
    $('#bSuite').classList.remove('hidden');
    $('#bSuite').textContent = res.dernier ? 'Voir le classement' : 'Question suivante';
    $('#bSuite').onclick = function () {
      $('#bSuite').classList.add('hidden');
      if (res.dernier) terminer(); else poser();
    };
    $('#resAttente').textContent = '';
  } else {
    $('#resAttente').textContent = 'On attend que l\'hôte lance la suite.';
  }
}

function afficherFin(classement) {
  tousStop();
  vue('vFin');
  $('#finTable').innerHTML =
    '<table><thead><tr><th></th><th>Joueur</th><th>Bonnes</th><th>Score</th></tr></thead><tbody>' +
    classement.map(function (g, i) {
      return '<tr><td class="text-slate-500">' + (i + 1) + '</td>' +
             '<td class="font-bold ' + (g.de === canal.id ? 'text-q-blue' : 'text-white') + '">' +
             esc(g.nom) + '</td>' +
             '<td class="text-xs text-slate-500">' + g.bonnes + ' / ' + g.posees + '</td>' +
             '<td class="font-bold text-white">' + g.score + '</td></tr>';
    }).join('') + '</tbody></table>';

  $('#bRejouer').onclick = function () {
    vue('vSalon');
    if (hote) { G.phase = 'salon'; rendreSalon(); }
  };
}

init();
})();

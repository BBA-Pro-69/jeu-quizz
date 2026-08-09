/* =====================================================================
   Quiz Famille · js/transport.js
   La couche réseau temps réel, et rien d'autre.

   Le jeu ne doit jamais savoir qu'il y a une WebSocket derrière. Il
   demande un canal, il envoie des messages nommés, il en reçoit. Le
   jour où on change de fournisseur, seul ce fichier bouge.

   Sous le capot : Supabase Realtime, en WebSocket brute, protocole
   Phoenix Channels. Pas de bibliothèque, pas de CDN supplémentaire.
   Une trame ressemble à ça :

     { "topic": "realtime:quiz-KTRB",
       "event": "broadcast",
       "payload": { "type": "broadcast", "event": "buzz",
                    "payload": { ...ce que le jeu envoie... } },
       "ref": "7" }

   Les deux points délicats sont documentés là où ils se produisent :
   le heartbeat (sans lui, le serveur coupe au bout de 60 s) et la
   synchronisation des horloges (sans elle, comparer les horodatages
   de cinq téléphones ne veut rien dire).
   ===================================================================== */
(function (global) {
'use strict';

var URL_DEFAUT = 'https://kisjanhyyceimvwxcear.supabase.co';
var KEY_DEFAUT = 'sb_publishable_rP2MpD8WYGFDPGOjB7Ybmw_MDOz5QC3';

/* Alphabet sans O/0, I/1, B/8 : un code se lit à voix haute
   à travers une table sans se faire répéter trois fois. */
var ALPHABET = 'ACDEFGHJKLMNPQRSTUVWXYZ2345679';

function codeSalon(n) {
  var s = '';
  for (var i = 0; i < (n || 4); i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

function idAleatoire() {
  return Math.random().toString(36).slice(2, 10);
}

/* ------------------------------------------------------------------ */
function creer(opt) {
  var o     = opt || {};
  var base  = (o.url || URL_DEFAUT).replace(/\/+$/, '');
  var key   = o.key || KEY_DEFAUT;
  var salon = String(o.salon || '').toUpperCase();
  var role  = o.role === 'hote' ? 'hote' : 'joueur';
  var moi   = o.id || idAleatoire();
  var nom   = o.nom || '';

  var topic = 'realtime:quiz-' + salon;
  var wsUrl = base.replace(/^http/, 'ws') +
              '/realtime/v1/websocket?apikey=' + encodeURIComponent(key) + '&vsn=1.0.0';

  var ws = null, ref = 0, joinRef = null;
  var battement = null, relance = null;
  var ferme = false, joint = false;
  var essais = 0;

  var abonnes  = {};                 // event -> [fn]
  var surEtat  = o.onEtat  || function () {};
  var surTrame = o.onTrame || function () {};   // journal brut, pour le banc de test

  /* horloge : décalage estimé entre mon Date.now() et celui de l'hôte */
  var horloge = { offset: 0, delai: null, mesures: [] };

  function log(sens, obj) { try { surTrame(sens, obj); } catch (e) {} }

  function brut(t, ev, payload) {
    if (!ws || ws.readyState !== 1) return false;
    ref++;
    var trame = { topic: t, event: ev, payload: payload || {}, ref: String(ref) };
    if (ev === 'phx_join') { joinRef = String(ref); trame.join_ref = joinRef; }
    else if (joinRef && t === topic) trame.join_ref = joinRef;
    ws.send(JSON.stringify(trame));
    log('→', trame);
    return true;
  }

  /* Envoi applicatif. `dest` limite le message à un destinataire :
     le broadcast arrose tout le salon, le tri se fait à l'arrivée. */
  function envoyer(event, payload, dest) {
    return brut(topic, 'broadcast', {
      type: 'broadcast',
      event: event,
      payload: Object.assign({}, payload || {}, {
        de: moi, nom: nom, pour: dest || null, emis: Date.now()
      })
    });
  }

  function sur(event, fn) {
    (abonnes[event] = abonnes[event] || []).push(fn);
    return function () {
      abonnes[event] = abonnes[event].filter(function (f) { return f !== fn; });
    };
  }

  function diffuser(event, data) {
    (abonnes[event] || []).forEach(function (f) {
      try { f(data); } catch (e) { console.error('[transport] handler', event, e); }
    });
    (abonnes['*'] || []).forEach(function (f) { f(event, data); });
  }

  /* ---------------- connexion ---------------- */
  function connecter() {
    return new Promise(function (resoudre, rejeter) {
      if (!salon) return rejeter(new Error('Pas de code de salon.'));
      ferme = false;
      surEtat('connexion', null);

      try { ws = new WebSocket(wsUrl); }
      catch (e) { return rejeter(e); }

      var regle = false;

      ws.onopen = function () {
        essais = 0;
        brut(topic, 'phx_join', {
          config: {
            broadcast: { self: false, ack: true },
            presence:  { enabled: false },
            postgres_changes: [],
            private: false
          }
        });
      };

      ws.onmessage = function (ev) {
        var m;
        try { m = JSON.parse(ev.data); } catch (e) { return; }
        log('←', m);

        if (m.event === 'phx_reply' && m.topic === topic) {
          if (m.payload && m.payload.status === 'ok') {
            joint = true;
            surEtat('ouvert', null);
            if (!regle) { regle = true; resoudre(api); }
          } else if (m.payload && m.payload.status === 'error') {
            var msg = (m.payload.response && (m.payload.response.reason || m.payload.response.message)) ||
                      'jointure refusée';
            surEtat('erreur', msg);
            if (!regle) { regle = true; rejeter(new Error(msg)); }
          }
          return;
        }

        if (m.event === 'phx_error' || m.event === 'phx_close') {
          joint = false;
          surEtat('coupe', m.event);
          return;
        }

        if (m.event === 'broadcast' && m.payload) {
          var nomEv = m.payload.event;
          var data  = m.payload.payload || {};
          if (data.de === moi) return;                       // ceinture et bretelles
          if (data.pour && data.pour !== moi) return;         // pas pour moi

          /* L'hôte est l'horloge de référence : il répond aux pings
             de synchronisation sans que le jeu ait à s'en occuper. */
          if (nomEv === '__sync' && role === 'hote') {
            envoyer('__sync_ack', { t0: data.t0, t1: Date.now() }, data.de);
            return;
          }
          if (nomEv === '__sync_ack') { encaisserSync(data); return; }

          diffuser(nomEv, data);
        }
      };

      ws.onerror = function () {
        surEtat('erreur', 'websocket');
        if (!regle) { regle = true; rejeter(new Error('Connexion WebSocket impossible.')); }
      };

      ws.onclose = function (e) {
        joint = false;
        arreterBattement();
        surEtat('ferme', e && e.code);
        if (!ferme) reconnecter();
        if (!regle) { regle = true; rejeter(new Error('Fermeture (code ' + (e && e.code) + ')')); }
      };

      /* Sans heartbeat, Realtime ferme la connexion après 60 s de
         silence. 25 s laisse de la marge à un réseau lent. */
      arreterBattement();
      battement = setInterval(function () { brut('phoenix', 'heartbeat', {}); }, 25000);
    });
  }

  function arreterBattement() { if (battement) { clearInterval(battement); battement = null; } }

  function reconnecter() {
    if (relance) return;
    var attente = Math.min(10000, 1000 * Math.pow(2, essais++));
    surEtat('relance', attente);
    relance = setTimeout(function () {
      relance = null;
      connecter().catch(function () {});
    }, attente);
  }

  function fermer() {
    ferme = true;
    arreterBattement();
    if (relance) { clearTimeout(relance); relance = null; }
    if (ws) { try { ws.close(); } catch (e) {} }
  }

  /* ---------------- synchronisation des horloges ----------------
     Aller-retour façon NTP : j'envoie t0, l'hôte me renvoie son t1,
     je note t2 à la réception.

         offset = t1 - (t0 + t2) / 2        décalage de mon horloge
         delai  = t2 - t0                   aller-retour complet

     On garde la mesure de plus court aller-retour : c'est celle où le
     réseau a le moins menti. La méthode suppose un chemin symétrique ;
     sur un wifi domestique l'erreur résiduelle se compte en dizaines
     de millisecondes, et surtout elle ne favorise personne. */
  var attentes = {};

  function encaisserSync(d) {
    var t2 = Date.now();
    var att = attentes[d.t0];
    if (!att) return;
    delete attentes[d.t0];

    var delai  = t2 - d.t0;
    var offset = d.t1 - (d.t0 + t2) / 2;
    horloge.mesures.push({ delai: delai, offset: offset });

    if (horloge.delai === null || delai < horloge.delai) {
      horloge.delai  = delai;
      horloge.offset = offset;
    }
    att(horloge);
  }

  function synchroniser(n) {
    var tours = n || 5;
    return new Promise(function (resoudre) {
      var faits = 0;
      (function tour() {
        var t0 = Date.now();
        attentes[t0] = function () {
          if (++faits >= tours) return resoudre(horloge);
          setTimeout(tour, 120);
        };
        envoyer('__sync', { t0: t0 });
        /* si une réponse se perd, on n'attend pas indéfiniment */
        setTimeout(function () {
          if (attentes[t0]) {
            delete attentes[t0];
            if (++faits >= tours) resoudre(horloge);
            else tour();
          }
        }, 3000);
      })();
    });
  }

  /* L'heure telle que l'hôte la lit, vue depuis ici. C'est cette
     valeur, et elle seule, qu'on horodate dans un buzz. */
  function maintenant() { return Date.now() + horloge.offset; }

  var api = {
    id: moi, salon: salon, role: role, topic: topic,
    connecter: connecter, fermer: fermer,
    envoyer: envoyer, sur: sur,
    synchroniser: synchroniser, maintenant: maintenant,
    horloge: function () { return { offset: horloge.offset, delai: horloge.delai,
                                    mesures: horloge.mesures.slice() }; },
    connecte: function () { return joint; },
    urlWebSocket: wsUrl.replace(key, key.slice(0, 18) + '…')
  };
  return api;
}

/* ------------------------------------------------------------------ */
global.Quiz = global.Quiz || {};
global.Quiz.Transport = {
  creer: creer,
  codeSalon: codeSalon,
  URL_DEFAUT: URL_DEFAUT,
  KEY_DEFAUT: KEY_DEFAUT
};

})(window);

/* =====================================================================
   Quiz Famille · js/api.js
   Le seul endroit du jeu qui parle à Supabase.

   La clé publiable est faite pour vivre dans du code public : c'est le
   RLS qui protège, pas le secret de la clé. La clé secrète (sb_secret_)
   n'a rien à faire ici, jamais.

   Nouveauté : si un joueur est connecté, on envoie SON jeton dans
   Authorization à la place de la clé. C'est ce jeton qui alimente
   auth.uid() côté PostgreSQL, et donc qui décide de ce qu'il peut faire.
   Un jeton dure une heure ; sur un 401 on le renouvelle et on rejoue la
   requête une seule fois.
   ===================================================================== */
(function (global) {
'use strict';

var SUPABASE_URL = 'https://kisjanhyyceimvwxcear.supabase.co';
var SUPABASE_KEY = 'sb_publishable_rP2MpD8WYGFDPGOjB7Ybmw_MDOz5QC3';

global.Quiz = global.Quiz || {};
global.Quiz.config = { url: SUPABASE_URL, cle: SUPABASE_KEY };

function jeton() {
  var A = global.Quiz.Auth;
  var s = A && A.session && A.session();
  return (s && s.access_token) || null;
}

/* Requête brute. `base` vaut '/rest/v1' ou '/auth/v1'.
   Volontairement sans SDK : tu vois exactement ce qui part sur le fil. */
async function requete(base, chemin, options, dejaRejoue) {
  var o = options || {};
  var url = SUPABASE_URL.replace(/\/+$/, '') + base + chemin;

  var t = o.sansJeton ? null : jeton();
  var headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + (t || SUPABASE_KEY),
    'Content-Type': 'application/json'
  };
  if (o.prefer) headers['Prefer'] = o.prefer;
  if (o.headers) Object.keys(o.headers).forEach(function (k) { headers[k] = o.headers[k]; });

  var res = await fetch(url, {
    method: o.method || 'GET',
    headers: headers,
    body: o.body !== undefined ? JSON.stringify(o.body) : undefined
  });

  var texte = await res.text();
  var data = null;
  try { data = texte ? JSON.parse(texte) : null; } catch (e) { data = texte; }

  /* 401 avec un jeton utilisateur = jeton périmé. On le renouvelle et on
     rejoue UNE fois. Sans ce garde-fou, une partie qui dure plus d'une
     heure échouerait à l'enregistrement, sans que personne comprenne. */
  if (res.status === 401 && t && !dejaRejoue && global.Quiz.Auth && global.Quiz.Auth.rafraichir) {
    try {
      await global.Quiz.Auth.rafraichir();
      return requete(base, chemin, options, true);
    } catch (e) { /* on tombe dans l'erreur normale juste en dessous */ }
  }

  if (!res.ok) {
    var err = new Error(
      (data && (data.message || data.error_description || data.msg || data.error)) ||
      ('HTTP ' + res.status)
    );
    err.status = res.status;
    err.corps = data;
    throw err;
  }
  return data;
}

function api(chemin, options) { return requete('/rest/v1', chemin, options); }
function rpc(nom, corps)      { return api('/rpc/' + nom, { method: 'POST', body: corps || {} }); }

global.Quiz.api     = api;
global.Quiz.rpc     = rpc;
global.Quiz.requete = requete;

})(window);

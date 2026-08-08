/* =====================================================================
   Quiz Famille · js/api.js
   Tout l'accès réseau passe par ici. Rien d'autre ne parle à Supabase.

   La clé est publiable : elle est faite pour vivre dans du code public.
   C'est le RLS, côté base, qui décide ce qu'on a le droit de faire.
   La clé secrète (sb_secret_...) n'a rien à faire ici, jamais.
   ===================================================================== */
(function (global) {
'use strict';

var SUPABASE_URL = 'https://kisjanhyyceimvwxcear.supabase.co';
var SUPABASE_KEY = 'sb_publishable_rP2MpD8WYGFDPGOjB7Ybmw_MDOz5QC3';

/* Un seul point de passage HTTP.
   `path` commence par un / et s'ajoute après /rest/v1 */
async function api(path, options) {
  var o = options || {};
  var url = SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1' + path;

  var headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json'
  };
  if (o.prefer) headers['Prefer'] = o.prefer;

  var res = await fetch(url, {
    method: o.method || 'GET',
    headers: headers,
    body: o.body ? JSON.stringify(o.body) : undefined
  });

  var texte = await res.text();
  var data = null;
  try { data = texte ? JSON.parse(texte) : null; } catch (e) { data = texte; }

  if (!res.ok) {
    var e2 = new Error((data && data.message) || ('HTTP ' + res.status));
    e2.status = res.status;
    e2.corps = data;
    throw e2;
  }
  return data;
}

/* Envoi des résultats d'une partie : une seule requête pour tous les joueurs.
   Le jeu ne dépend jamais de son succès — en cas d'échec, la partie a
   quand même eu lieu, et les scores sont affichés à l'écran. */
async function envoyerScores(lignes) {
  return api('/scores', {
    method: 'POST',
    body: lignes,
    prefer: 'return=representation'
  });
}

global.Quiz = global.Quiz || {};
global.Quiz.api = api;
global.Quiz.envoyerScores = envoyerScores;

})(window);

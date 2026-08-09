/* =====================================================================
   Quiz Famille · js/auth.js
   Compte joueur : email + mot de passe, via l'API Auth de Supabase.

   Pourquoi un vrai compte et pas un surnom : sans mot de passe, il
   suffit de connaître le surnom de quelqu'un pour jouer à sa place et
   pourrir ses statistiques. Un email vérifié règle la question.

   L'API tient en quatre requêtes HTTP brutes :
     POST /auth/v1/signup                       -> créer un compte
     POST /auth/v1/token?grant_type=password    -> se connecter
     POST /auth/v1/token?grant_type=refresh_token -> prolonger la session
     POST /auth/v1/logout                       -> se déconnecter

   La session est gardée en localStorage. L'access_token dure une heure,
   le refresh_token bien plus longtemps : c'est lui qui évite de retaper
   son mot de passe à chaque partie.
   ===================================================================== */
(function (global) {
'use strict';

var LS = 'quiz.session.v1';
var S  = null;   // session en mémoire

function lire() {
  if (S) return S;
  try { S = JSON.parse(localStorage.getItem(LS)); } catch (e) { S = null; }
  return S;
}
function garder(s) {
  S = s;
  try { s ? localStorage.setItem(LS, JSON.stringify(s)) : localStorage.removeItem(LS); }
  catch (e) {}
  document.dispatchEvent(new CustomEvent('quiz:session', { detail: s || null }));
}

function auth(chemin, corps) {
  return global.Quiz.requete('/auth/v1', chemin, {
    method: 'POST', body: corps, sansJeton: true
  });
}

/* Créer un compte. Avec « Confirm email » activé côté Supabase, la
   réponse ne contient PAS de session : il faut d'abord cliquer le lien
   reçu par mail. C'est normal, et c'est le cas qu'il faut expliquer au
   joueur plutôt que de lui afficher une erreur. */
async function inscription(email, motdepasse) {
  var r = await auth('/signup', {
    email: email, password: motdepasse,
    options: { emailRedirectTo: location.origin + location.pathname }
  });
  if (r && r.access_token) { garder(r); return { session: r, confirmer: false }; }
  return { session: null, confirmer: true };
}

async function connexion(email, motdepasse) {
  var r = await auth('/token?grant_type=password', { email: email, password: motdepasse });
  garder(r);
  return r;
}

async function rafraichir() {
  var s = lire();
  if (!s || !s.refresh_token) throw new Error('non_connecte');
  var r = await auth('/token?grant_type=refresh_token', { refresh_token: s.refresh_token });
  garder(r);
  return r;
}

async function deconnexion() {
  var s = lire();
  if (s && s.access_token) {
    try {
      await global.Quiz.requete('/auth/v1', '/logout', {
        method: 'POST', body: {},
        headers: { 'Authorization': 'Bearer ' + s.access_token }
      });
    } catch (e) { /* si le serveur refuse, on oublie quand même localement */ }
  }
  garder(null);
}

async function motDePasseOublie(email) {
  return auth('/recover', {
    email: email,
    options: { redirectTo: location.origin + location.pathname }
  });
}

function connecte() { var s = lire(); return !!(s && s.access_token); }

/* Traduction des messages de l'API, qui sont en anglais et parfois
   franchement obscurs. */
function dire(e) {
  var m = String((e && e.message) || '');
  if (/Invalid login credentials/i.test(m))      return 'Email ou mot de passe incorrect.';
  if (/Email not confirmed/i.test(m))            return 'Il faut d\'abord cliquer le lien reçu par mail.';
  if (/User already registered/i.test(m))        return 'Un compte existe déjà avec cet email. Connecte-toi.';
  if (/Password should be at least/i.test(m))    return 'Mot de passe trop court : 6 caractères minimum.';
  if (/Unable to validate email/i.test(m))       return 'Cette adresse email n\'a pas l\'air valide.';
  if (/rate limit|too many/i.test(m))            return 'Trop de tentatives. Attends une minute.';
  if (/Failed to fetch/i.test(m))                return 'Pas de réseau. Le jeu marche quand même, sans historique.';
  if (/non_connecte/.test(m))                    return 'Session expirée, reconnecte-toi.';
  return m || 'Erreur inconnue.';
}

/* Au retour du lien de confirmation, Supabase renvoie la session dans le
   FRAGMENT de l'URL (#access_token=...), jamais dans la query string :
   un fragment n'est pas envoyé au serveur. On la ramasse et on nettoie
   la barre d'adresse, sinon le jeton reste dans l'historique. */
(function ramasser() {
  if (!location.hash || location.hash.indexOf('access_token') < 0) return;
  var p = new URLSearchParams(location.hash.slice(1));
  var s = {
    access_token:  p.get('access_token'),
    refresh_token: p.get('refresh_token'),
    token_type:    p.get('token_type'),
    expires_in:    Number(p.get('expires_in') || 3600)
  };
  if (s.access_token) {
    garder(s);
    history.replaceState(null, '', location.pathname + location.search);
  }
})();

global.Quiz = global.Quiz || {};
global.Quiz.Auth = {
  session: lire, connecte: connecte, dire: dire,
  inscription: inscription, connexion: connexion,
  rafraichir: rafraichir, deconnexion: deconnexion,
  motDePasseOublie: motDePasseOublie
};

})(window);

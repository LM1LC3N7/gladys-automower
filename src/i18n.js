// -----------------------------------------------------------------------------
// Runtime texts shown in Gladys (connection status, button and action
// results, text states, widget). The error codes live in automower/codes.js.
// -----------------------------------------------------------------------------

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "14:00 UTC" for an instant, or nothing without one. */
const utc = (iso) => (iso ? `${new Date(iso).toISOString().slice(11, 16)} UTC` : '');

/** The activities of the API (`mower.activity`, lower-cased). */
const ACTIVITY = {
  mowing: { en: 'Mowing', fr: 'Tonte' },
  going_home: { en: 'Going home', fr: 'Retour à la station' },
  charging: { en: 'Charging', fr: 'En charge' },
  leaving: { en: 'Leaving the station', fr: 'Départ de la station' },
  parked_in_cs: { en: 'Parked in the station', fr: 'Garée à la station' },
  stopped_in_garden: { en: 'Stopped in the garden', fr: 'Arrêtée dans le jardin' },
  not_applicable: { en: 'Manual start required', fr: 'Démarrage manuel requis' },
  unknown: { en: 'Unknown', fr: 'Inconnue' },
};

/** The states of the API (`mower.state`, lower-cased). */
const STATE = {
  in_operation: { en: 'In operation', fr: 'En fonctionnement' },
  restricted: { en: 'Restricted', fr: 'En attente' },
  paused: { en: 'Paused', fr: 'En pause' },
  stopped: { en: 'Stopped, manual action needed', fr: 'Arrêtée, action manuelle requise' },
  off: { en: 'Off', fr: 'Éteinte' },
  wait_updating: { en: 'Updating', fr: 'Mise à jour en cours' },
  wait_power_up: { en: 'Powering up', fr: 'Démarrage en cours' },
  error: { en: 'Error', fr: 'Erreur' },
  fatal_error: { en: 'Fatal error', fr: 'Erreur fatale' },
  error_at_power_up: { en: 'Error at power up', fr: 'Erreur au démarrage' },
  not_applicable: { en: 'Not applicable', fr: 'Sans objet' },
  unknown: { en: 'Unknown', fr: 'Inconnu' },
};

/** The modes of the API (`mower.mode`, lower-cased). */
const MODE = {
  main_area: { en: 'Main area', fr: 'Zone principale' },
  secondary_area: { en: 'Secondary area', fr: 'Zone secondaire' },
  home: { en: 'Home (parked until further notice)', fr: "Maison (garée jusqu'à nouvel ordre)" },
  demo: { en: 'Demo', fr: 'Démo' },
  poi: { en: 'Point of interest', fr: "Point d'intérêt" },
  unknown: { en: 'Unknown', fr: 'Inconnu' },
};

/** Why a mower does not mow (`planner.restrictedReason`, lower-cased). */
const RESTRICTED = {
  week_schedule: { en: 'outside the schedule', fr: 'hors planning' },
  park_override: { en: 'parked by a command', fr: 'garée sur commande' },
  sensor: { en: 'grass short enough', fr: 'herbe assez courte' },
  daily_limit: { en: 'daily limit reached', fr: 'limite du jour atteinte' },
  fota: { en: 'firmware update', fr: 'mise à jour' },
  frost: { en: 'frost', fr: 'gel' },
  all_work_areas_completed: { en: 'all work areas done', fr: 'toutes les zones faites' },
  work_area_abandoned: { en: 'work areas not finished', fr: 'zones non terminées' },
  external: { en: 'external restriction', fr: 'restriction externe' },
};

const known = (table, key) => table[key] ?? { en: String(key), fr: String(key) };

export const T = {
  activity: (key) => known(ACTIVITY, key),
  state: (key) => known(STATE, key),
  mode: (key) => known(MODE, key),
  restricted: (key) => RESTRICTED[key],
  none: { en: '—', fr: '—' },

  // --- Connection status ---------------------------------------------------------------
  noCredentials: {
    en: 'No application key or secret: create an application on the Husqvarna Developer Portal and paste its key and secret in the configuration.',
    fr: "Pas de clé ou de secret d'application : créez une application sur le portail développeur Husqvarna et collez sa clé et son secret dans la configuration.",
  },
  refused: {
    en: 'Husqvarna refused the application key or secret: copy them again from the Developer Portal (My applications) and save. Nothing is retried until then (repeated failures lock the account).',
    fr: "Husqvarna a refusé la clé ou le secret de l'application : recopiez-les depuis le portail développeur (My applications) et enregistrez. Rien n'est retenté d'ici là (des échecs répétés bloquent le compte).",
  },
  scope: {
    en: 'The application is not connected to the Automower Connect API: on the Developer Portal, open the application, connect it to the "Automower Connect API" (and the "Authentication API"), then save the configuration again.',
    fr: "L'application n'est pas connectée à l'API Automower Connect : sur le portail développeur, ouvrez l'application, connectez-la à « Automower Connect API » (et « Authentication API »), puis enregistrez à nouveau la configuration.",
  },
  forbidden: (message) => ({
    en: `Husqvarna refused access (${message}): check that the application is connected to the Automower Connect API.`,
    fr: `Husqvarna a refusé l'accès (${message}) : vérifiez que l'application est connectée à l'API Automower Connect.`,
  }),
  rateLimited: (until) => ({
    en: `Husqvarna API limit reached: reading paused until ${utc(until)}.`,
    fr: `Limite de l'API Husqvarna atteinte : lecture suspendue jusqu'à ${utc(until)}.`,
  }),
  unreachable: (message) => ({
    en: `Husqvarna is unreachable: ${message}. Retrying in a few minutes.`,
    fr: `Husqvarna est injoignable : ${message}. Nouvel essai dans quelques minutes.`,
  }),
  badRequest: (message) => ({
    en: `Husqvarna refused the request (${message}). Retrying every 10 minutes; if it goes on, report it on the integration's repository with the Gladys logs.`,
    fr: `Husqvarna a refusé la requête (${message}). Nouvel essai toutes les 10 minutes ; si cela persiste, signalez-le sur le dépôt de l'intégration avec les journaux Gladys.`,
  }),
  noMower: {
    en: 'Connected to Husqvarna, but the account has no mower. The key and secret give access to the mowers of the Husqvarna account that created the application on the Developer Portal: it must be the Automower Connect account where the mower is paired (same e-mail), and the mower must be connected (Automower Connect, not Bluetooth only). Details in the Gladys logs.',
    fr: "Connecté à Husqvarna, mais le compte n'a aucune tondeuse. La clé et le secret donnent accès aux tondeuses du compte Husqvarna qui a créé l'application sur le portail développeur : ce doit être le compte Automower Connect où la tondeuse est associée (même e-mail), et la tondeuse doit être connectée (Automower Connect, pas seulement Bluetooth). Détails dans les journaux Gladys.",
  },
  ok: ({ mowers, live, resyncMinutes }) => {
    const en = {
      on: `live events, full refresh every ${resyncMinutes} min`,
      connecting: 'live events connecting',
      down: 'live link down, refresh every 10 min until it is back',
    };
    const fr = {
      on: `événements en direct, relecture complète toutes les ${resyncMinutes} min`,
      connecting: 'événements en direct en cours de connexion',
      down: "lien en direct coupé, relecture toutes les 10 min jusqu'à son retour",
    };
    return {
      en: `Connected to Husqvarna: ${plural(mowers, 'mower')}, ${en[live]}.`,
      fr: `Connecté à Husqvarna : ${mowers} tondeuse${mowers > 1 ? 's' : ''}, ${fr[live]}.`,
    };
  },

  // --- The "Test" button -----------------------------------------------------------------
  test: ({ mowers, live }) => {
    const en = [];
    const fr = [];
    if (mowers.length === 0) {
      en.push('Husqvarna answers, but the account has no mower.');
      fr.push("Husqvarna répond, mais le compte n'a aucune tondeuse.");
    }
    for (const m of mowers) {
      const battery = m.battery === null ? '?' : `${m.battery} %`;
      en.push(
        `${m.name} (${m.model ?? '?'}): ${T.activity(m.activity).en}, ${T.state(m.state).en.toLowerCase()}, battery ${battery}${m.connected ? '' : ', DISCONNECTED'}.`,
      );
      fr.push(
        `${m.name} (${m.model ?? '?'}) : ${T.activity(m.activity).fr}, ${T.state(m.state).fr.toLowerCase()}, batterie ${battery}${m.connected ? '' : ', DÉCONNECTÉE'}.`,
      );
    }
    en.push(live ? 'Live events: connected.' : 'Live events: not connected (yet).');
    fr.push(
      live ? 'Événements en direct : connectés.' : 'Événements en direct : pas (encore) connectés.',
    );
    return { en: en.join('\n'), fr: fr.join('\n') };
  },

  // --- Commands --------------------------------------------------------------------------
  unknownMower: (value) => ({
    en: `Unknown mower "${value}": pick a mower device.`,
    fr: `Tondeuse inconnue « ${value} » : choisissez un appareil tondeuse.`,
  }),
  noMowerForCommand: {
    en: 'No mower to command: check the configuration.',
    fr: 'Aucune tondeuse à commander : vérifiez la configuration.',
  },
  durationRequired: {
    en: 'A duration in minutes is required to park for a duration.',
    fr: 'Une durée en minutes est requise pour garer pendant une durée.',
  },

  // --- Widget ----------------------------------------------------------------------------
  widget: {
    noMower: {
      en: 'No Husqvarna mower yet: check the application key and secret in the configuration.',
      fr: "Aucune tondeuse Husqvarna : vérifiez la clé et le secret d'application dans la configuration.",
    },
    battery: { en: 'Battery', fr: 'Batterie' },
    nextStart: { en: 'Next start', fr: 'Prochain départ' },
    activity: { en: 'Activity', fr: 'Activité' },
    state: { en: 'State', fr: 'État' },
    mode: { en: 'Mode', fr: 'Mode' },
    error: { en: 'Error', fr: 'Erreur' },
    lastError: { en: 'Last error', fr: 'Dernière erreur' },
    noError: { en: 'None', fr: 'Aucune' },
    connection: { en: 'Connection', fr: 'Connexion' },
    connected: { en: 'Connected', fr: 'Connectée' },
    disconnected: { en: 'Disconnected', fr: 'Déconnectée' },
    start: (minutes) => {
      const text = minutes % 60 === 0 ? `${minutes / 60} h` : `${minutes} min`;
      return { en: `Start ${text}`, fr: `Démarrer ${text}` };
    },
    park: { en: 'Park', fr: 'Garer' },
    pause: { en: 'Pause', fr: 'Pause' },
    resume: { en: 'Resume schedule', fr: 'Reprendre le planning' },
    started: (name, minutes) => ({
      en: `${name}: mowing for ${minutes} min (once charged)`,
      fr: `${name} : tonte pendant ${minutes} min (une fois chargée)`,
    }),
    parked: (name) => ({
      en: `${name}: back to the station until the next schedule`,
      fr: `${name} : retour à la station jusqu'au prochain créneau`,
    }),
    paused: (name) => ({ en: `${name}: paused`, fr: `${name} : en pause` }),
    resumed: (name) => ({
      en: `${name}: back to its schedule`,
      fr: `${name} : retour à son planning`,
    }),
    failed: (message) => ({
      en: `Husqvarna refused: ${message}`.slice(0, 200),
      fr: `Husqvarna a refusé : ${message}`.slice(0, 200),
    }),
  },
};

/** One language of a text: a plain string, or { en, fr } with an English fallback. */
export const pick = (text, language) =>
  typeof text === 'string' ? text : (text?.[language] ?? text?.en ?? '');

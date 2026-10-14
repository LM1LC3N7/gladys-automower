// -----------------------------------------------------------------------------
// The error codes of the Automower Connect API ("Status description and error
// codes" of the Developer Portal, read on 2026-10-14, the same list as
// aioautomower 3.1.0), in English, with a French translation of our own.
// Pure. An unknown code is shown as "Error <code>": Husqvarna adds codes
// (the Vision mowers brought 149 to 166).
// -----------------------------------------------------------------------------

const TEXTS = new Map();

const add = (codes, en, fr) => {
  for (const code of [].concat(codes)) {
    TEXTS.set(code, { en, fr });
  }
};

add(1, 'Outside working area', 'Hors de la zone de travail');
add(2, 'No loop signal', 'Pas de signal de boucle');
add(3, 'Wrong loop signal', 'Mauvais signal de boucle');
add(4, 'Loop sensor problem, front', 'Problème de capteur de boucle, avant');
add(5, 'Loop sensor problem, rear', 'Problème de capteur de boucle, arrière');
add(6, 'Loop sensor problem, left', 'Problème de capteur de boucle, gauche');
add(7, 'Loop sensor problem, right', 'Problème de capteur de boucle, droite');
add(8, 'Wrong PIN code', 'Code PIN erroné');
add(9, 'Trapped', 'Coincée');
add(10, 'Upside down', 'Retournée');
add(11, 'Low battery', 'Batterie faible');
add(12, 'Empty battery', 'Batterie vide');
add(13, 'No drive', 'Pas de traction');
add(14, 'Mower lifted', 'Tondeuse soulevée');
add(15, 'Lifted', 'Soulevée');
add(16, 'Stuck in charging station', 'Bloquée dans la station de charge');
add(17, 'Charging station blocked', 'Station de charge obstruée');
add(18, 'Collision sensor problem, rear', 'Problème de capteur de collision, arrière');
add(19, 'Collision sensor problem, front', 'Problème de capteur de collision, avant');
add(20, 'Wheel motor blocked, right', 'Moteur de roue bloqué, droite');
add(21, 'Wheel motor blocked, left', 'Moteur de roue bloqué, gauche');
add(22, 'Wheel drive problem, right', "Problème d'entraînement de roue, droite");
add(23, 'Wheel drive problem, left', "Problème d'entraînement de roue, gauche");
add([24, 25], 'Cutting system blocked', 'Système de coupe bloqué');
add(26, 'Invalid sub-device combination', 'Combinaison de sous-ensembles invalide');
add(27, 'Settings restored', 'Réglages restaurés');
add(28, 'Memory circuit problem', 'Problème de circuit mémoire');
add(29, 'Slope too steep', 'Pente trop raide');
add([30, 118], 'Charging system problem', 'Problème du système de charge');
add(31, 'STOP button problem', 'Problème du bouton STOP');
add(32, 'Tilt sensor problem', "Problème du capteur d'inclinaison");
add(33, 'Mower tilted', 'Tondeuse inclinée');
add(34, 'Cutting stopped, slope too steep', 'Coupe arrêtée, pente trop raide');
add(35, 'Wheel motor overloaded, right', 'Moteur de roue surchargé, droite');
add(36, 'Wheel motor overloaded, left', 'Moteur de roue surchargé, gauche');
add(37, 'Charging current too high', 'Courant de charge trop élevé');
add(38, 'Electronic problem', 'Problème électronique');
add(39, 'Cutting motor problem', 'Problème du moteur de coupe');
add([40, 42], 'Limited cutting height range', 'Plage de hauteur de coupe limitée');
add(41, 'Unexpected cutting height adjustment', 'Réglage inattendu de la hauteur de coupe');
add(43, 'Cutting height problem, drive', 'Problème de hauteur de coupe, entraînement');
add(44, 'Cutting height problem, current', 'Problème de hauteur de coupe, courant');
add(45, 'Cutting height problem, direction', 'Problème de hauteur de coupe, direction');
add(46, 'Cutting height blocked', 'Hauteur de coupe bloquée');
add(47, 'Cutting height problem', 'Problème de hauteur de coupe');
add(48, 'No response from charger', 'Pas de réponse du chargeur');
add(49, 'Ultrasonic problem', 'Problème des ultrasons');
add(50, 'Guide 1 not found', 'Guide 1 introuvable');
add(51, 'Guide 2 not found', 'Guide 2 introuvable');
add(52, 'Guide 3 not found', 'Guide 3 introuvable');
add(53, 'GPS navigation problem', 'Problème de navigation GPS');
add(54, 'Weak GPS signal', 'Signal GPS faible');
add(55, 'Difficult finding home', 'Difficulté à retrouver la station');
add(56, 'Guide calibration accomplished', 'Calibrage du guide réussi');
add(57, 'Guide calibration failed', 'Échec du calibrage du guide');
add(
  [58, 59, 60, 61, 63, 64, 65, 68],
  'Temporary battery problem',
  'Problème temporaire de batterie',
);
add(
  62,
  'Battery restriction due to ambient temperature',
  'Batterie limitée par la température ambiante',
);
add([66, 67, 127], 'Battery problem', 'Problème de batterie');
add(69, 'Alarm! Mower switched off', 'Alarme ! Tondeuse éteinte');
add(70, 'Alarm! Mower stopped', 'Alarme ! Tondeuse arrêtée');
add(71, 'Alarm! Mower lifted', 'Alarme ! Tondeuse soulevée');
add(72, 'Alarm! Mower tilted', 'Alarme ! Tondeuse inclinée');
add(73, 'Alarm! Mower in motion', 'Alarme ! Tondeuse en mouvement');
add(74, 'Alarm! Outside geofence', 'Alarme ! Hors du périmètre de géorepérage');
add(75, 'Connection changed', 'Connexion modifiée');
add(76, 'Connection not changed', 'Connexion non modifiée');
add(77, 'Communication board not available', 'Carte de communication indisponible');
add(78, 'Slipped, not solved with a moving pattern', 'A glissé, non résolu par une manœuvre');
add(79, 'Invalid battery combination', 'Combinaison de batteries invalide');
add(80, 'Cutting system imbalance', 'Déséquilibre du système de coupe');
add(81, 'Safety function faulty', 'Fonction de sécurité défaillante');
add(82, 'Wheel motor blocked, rear right', 'Moteur de roue bloqué, arrière droite');
add(83, 'Wheel motor blocked, rear left', 'Moteur de roue bloqué, arrière gauche');
add(84, 'Wheel drive problem, rear right', "Problème d'entraînement de roue, arrière droite");
add(85, 'Wheel drive problem, rear left', "Problème d'entraînement de roue, arrière gauche");
add(86, 'Wheel motor overloaded, rear right', 'Moteur de roue surchargé, arrière droite');
add(87, 'Wheel motor overloaded, rear left', 'Moteur de roue surchargé, arrière gauche');
add(88, 'Angular sensor problem', 'Problème du capteur angulaire');
add(89, 'Invalid system configuration', 'Configuration système invalide');
add(90, 'No power in charging station', "Pas d'alimentation dans la station de charge");
add(91, 'Switch cord problem', "Problème du câble de l'interrupteur");
add(92, 'Work area not valid', 'Zone de travail invalide');
add(93, 'No accurate position from satellites', 'Pas de position précise des satellites');
add(
  94,
  'Reference station communication problem',
  'Problème de communication avec la station de référence',
);
add(95, 'Folding sensor activated', 'Capteur de pliage activé');
add(96, 'Right brush motor overloaded', 'Moteur de brosse droit surchargé');
add(97, 'Left brush motor overloaded', 'Moteur de brosse gauche surchargé');
add(98, 'Ultrasonic sensor 1 defect', 'Capteur à ultrasons 1 défectueux');
add(99, 'Ultrasonic sensor 2 defect', 'Capteur à ultrasons 2 défectueux');
add(100, 'Ultrasonic sensor 3 defect', 'Capteur à ultrasons 3 défectueux');
add(101, 'Ultrasonic sensor 4 defect', 'Capteur à ultrasons 4 défectueux');
add(102, 'Cutting drive motor 1 defect', 'Moteur de coupe 1 défectueux');
add(103, 'Cutting drive motor 2 defect', 'Moteur de coupe 2 défectueux');
add(104, 'Cutting drive motor 3 defect', 'Moteur de coupe 3 défectueux');
add(105, 'Lift sensor defect', 'Capteur de soulèvement défectueux');
add(106, 'Collision sensor defect', 'Capteur de collision défectueux');
add(107, 'Docking sensor defect', "Capteur d'arrimage défectueux");
add(108, 'Folding cutting deck sensor defect', 'Capteur du plateau de coupe repliable défectueux');
add(109, 'Loop sensor defect', 'Capteur de boucle défectueux');
add(110, 'Collision sensor error', 'Erreur du capteur de collision');
add(111, 'No confirmed position', 'Pas de position confirmée');
add(112, 'Cutting system major imbalance', 'Déséquilibre important du système de coupe');
add(113, 'Complex working area', 'Zone de travail complexe');
add(114, 'Too high discharge current', 'Courant de décharge trop élevé');
add(115, 'Too high internal current', 'Courant interne trop élevé');
add(116, 'High charging power loss', 'Perte de puissance de charge élevée');
add(117, 'High internal power loss', 'Perte de puissance interne élevée');
add(119, 'Zone generator problem', 'Problème du générateur de zone');
add(120, 'Internal voltage error', 'Erreur de tension interne');
add(121, 'High internal temperature', 'Température interne élevée');
add(122, 'CAN error', 'Erreur CAN');
add(123, 'Destination not reachable', 'Destination inaccessible');
add(124, 'Destination blocked', 'Destination bloquée');
add(125, 'Battery needs replacement', 'Batterie à remplacer');
add(126, 'Battery near end of life', 'Batterie en fin de vie');
add(128, 'Multiple reference stations detected', 'Plusieurs stations de référence détectées');
add(129, 'Auxiliary cutting means blocked', 'Organe de coupe auxiliaire bloqué');
add(130, 'Imbalanced auxiliary cutting disc', 'Disque de coupe auxiliaire déséquilibré');
add(131, 'Lifted in link arm', 'Soulevée au niveau du bras de liaison');
add(132, 'EPOS accessory missing', 'Accessoire EPOS manquant');
add(
  133,
  'Bluetooth communication with the charging station failed',
  'Échec de la communication Bluetooth avec la station de charge',
);
add(134, 'Invalid software configuration', 'Configuration logicielle invalide');
add(135, 'Radar problem', 'Problème de radar');
add(136, 'Work area tampered', 'Zone de travail altérée');
add(137, 'High temperature in cutting motor, right', 'Moteur de coupe trop chaud, droite');
add(138, 'High temperature in cutting motor, center', 'Moteur de coupe trop chaud, centre');
add(139, 'High temperature in cutting motor, left', 'Moteur de coupe trop chaud, gauche');
add(141, 'Wheel brush motor problem', 'Problème du moteur de brosse de roue');
add(142, 'Self diagnostic error', "Erreur d'autodiagnostic");
add(143, 'Accessory power problem', "Problème d'alimentation d'un accessoire");
add(144, 'Boundary wire problem', 'Problème de câble périphérique');
add(145, 'No correction data available', 'Pas de données de correction');
add(147, 'Cutting disc lost', 'Disque de coupe perdu');
add(148, 'Chassis collision', 'Collision du châssis');
add(149, 'Vision system malfunction', 'Dysfonctionnement du système de vision');
add(151, 'Poor vision performance', 'Vision dégradée');
add(152, 'Vision system error', 'Erreur du système de vision');
add(153, 'Charging aborted', 'Charge interrompue');
add(154, 'Water hose found in working area', "Tuyau d'arrosage dans la zone de travail");
add(155, 'PIN code changed', 'Code PIN modifié');
add(156, 'Wi-Fi settings changed', 'Réglages Wi-Fi modifiés');
add(157, 'Bluetooth settings changed', 'Réglages Bluetooth modifiés');
add(158, 'Cellular settings changed', 'Réglages cellulaires modifiés');
add(159, 'Mower installation position changed', "Position d'installation modifiée");
add(160, 'Firmware has been updated', 'Micrologiciel mis à jour');
add(161, 'No charging station signal', 'Pas de signal de la station de charge');
add(162, 'Camera lens wet', 'Objectif de la caméra mouillé');
add(163, 'Camera lens blocked', 'Objectif de la caméra obstrué');
add(165, 'Sitemap changed', 'Plan du terrain modifié');
add(166, 'Partly uncut area', 'Zone en partie non tondue');
add([701, 703, 704, 705, 715, 716], 'Connectivity problem', 'Problème de connectivité');
add(702, 'Connectivity settings restored', 'Réglages de connectivité restaurés');
add(706, 'Poor signal quality', 'Mauvaise qualité du signal');
add(707, 'SIM card requires PIN', 'La carte SIM demande un code PIN');
add([708, 710, 711, 712], 'SIM card locked', 'Carte SIM verrouillée');
add(709, 'SIM card not found', 'Carte SIM introuvable');
add([713, 714], 'Geofence problem', 'Problème de géorepérage');
add(717, 'SMS could not be sent', "Le SMS n'a pas pu être envoyé");
add(
  724,
  'Communication board software must be updated',
  'Le logiciel de la carte de communication doit être mis à jour',
);

/** The known codes (the tests check a few against the documentation). */
export const KNOWN_CODES = [...TEXTS.keys()];

/** { en, fr } of an error code; "Error <code>" for one the table does not know. */
export function errorText(code) {
  const known = TEXTS.get(Number(code));
  if (known) {
    return known;
  }
  return { en: `Error ${code}`, fr: `Erreur ${code}` };
}

# Husqvarna Automower

**Connecteur non officiel, sans lien avec Husqvarna.** Il amène les
tondeuses robots Husqvarna Automower® dans Gladys via l'API officielle
[Automower Connect](https://developer.husqvarnagroup.cloud/apis/automower-connect-api),
avec une application que vous créez vous-même sur le portail développeur
Husqvarna. Automower est une marque de Husqvarna AB.

## Ce que vous obtenez

| Surface                  | Contenu                                                                                                                                                                                |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Un appareil par tondeuse | état de fonctionnement, batterie, activité, mode, code et texte d'erreur, connexion au cloud Husqvarna, prochain départ, un choix **tondre / pause** et un bouton **retour à la base** |
| Déclencheurs de scène    | **erreur**, **activité changée**, **tonte terminée**, **déconnectée**                                                                                                                  |
| Actions de scène         | **démarrer la tonte** (pendant une durée), **garer** (jusqu'au prochain créneau, jusqu'à nouvel ordre ou pendant une durée), **pause**, **reprendre le planning**                      |
| Widget                   | **Tondeuse robot** : batterie, prochain départ, activité, état, mode, erreur, connexion, et les boutons Démarrer / Garer / Pause / Reprendre                                           |
| Écran de configuration   | un bouton **Tester Husqvarna** qui liste vos tondeuses                                                                                                                                 |

## Installation

1. Ouvrez le [portail développeur Husqvarna](https://developer.husqvarnagroup.cloud/)
   et connectez-vous avec votre compte **Automower Connect** (celui de
   l'application mobile, où vos tondeuses sont associées).
2. **Créez une application** : nom libre, et `http://localhost:8080` comme
   URL de redirection (elle ne sert pas).
3. Dans l'application, **connectez-la** à **Authentication API** et à
   **Automower Connect API**. Sans la seconde, Husqvarna refuse toutes les
   requêtes.
4. Copiez la **clé d'application** et le **secret d'application** dans la
   configuration de l'intégration dans Gladys, et enregistrez.
5. Ouvrez **Découverte** et ajoutez vos tondeuses.
6. Placez le widget **Tondeuse robot** sur un tableau de bord.

La clé et le secret sont stockés chiffrés par Gladys et envoyés uniquement à
Husqvarna. Si Husqvarna les refuse, l'intégration cesse d'essayer jusqu'à ce
que vous enregistriez à nouveau la configuration : des connexions échouées
répétées bloquent le compte Husqvarna pendant 30 minutes.

## L'appareil

Gladys n'a pas encore de catégorie tondeuse robot : l'état et les deux
commandes utilisent la catégorie **aspirateur robot**, la seule qui décrit
un robot qui travaille, rentre à sa base et se recharge. La carte de
l'appareil affiche donc :

- **State** (état) : En cours (tonte ou départ de la station), Retour à la base, En
  charge, Sur la base, En pause, Erreur, Arrêté ;
- **Mowing (idle: pause)** : un choix dont « Nettoyer » lance la tonte pour
  la durée configurée (3 heures par défaut) et « Repos » met la tondeuse en
  pause ;
- **Park until the next schedule** : le bouton « Retour à la base », qui
  gare la tondeuse jusqu'au prochain créneau de son planning.

Les autres fonctionnalités sont la batterie (%), l'activité et le mode
(textes dans la langue choisie dans la configuration), le code d'erreur
(0 : aucune) et son texte, la connexion au cloud Husqvarna et le prochain
départ, à l'heure de la tondeuse.

Une commande de démarrage ne fait pas sortir la tondeuse de sa station tout
de suite : selon Husqvarna, elle part une fois **complètement chargée**.

## Scènes

- **Erreur Automower** : une fois par erreur (coincée, soulevée, hors de la
  zone de travail...). Variables : le code, le texte en anglais et en
  français, l'heure, l'état de la tondeuse.
- **Activité Automower changée** : éventuellement pour une activité précise
  (tonte, retour à la station, charge, départ, garée, arrêtée dans le
  jardin...). Variables : la nouvelle et l'ancienne activité, l'état, la
  batterie.
- **Tonte Automower terminée** : la tondeuse a fini une session (garée à sa
  station, arrêtée dans le jardin ou en attente d'un démarrage manuel). Un
  retour à la station pour se recharger en cours de session ne compte pas.
  Variables : où elle s'est arrêtée, la durée de la session en minutes
  (vide si elle a commencé avant que Gladys ne la voie), la batterie, le
  code d'erreur.
- **Automower déconnectée** : la tondeuse a perdu sa connexion au cloud
  Husqvarna. Husqvarna ne l'indique que lors d'une relecture complète :
  jusqu'à 30 minutes de retard par défaut.

Les actions **démarrer la tonte**, **garer**, **pause** et **reprendre le
planning** agissent sur la tondeuse choisie, ou sur toutes quand le champ
est vide. Elles donnent `{{mower_name}}` et `{{count}}` aux actions
suivantes.

## À quel rythme Husqvarna est appelé

Husqvarna autorise 21 000 requêtes par semaine et par application.
L'intégration lit toutes les tondeuses au démarrage, puis les suit grâce aux
événements en direct du websocket Automower Connect. Elle relit tout toutes
les 30 minutes (option **Intervalle de relecture complète**), et toutes les
10 minutes tant que le lien en direct est coupé. Une commande est relue une
fois, 30 secondes après. Une semaine type utilise environ 2 % du quota.

## Dépannage

- **« Husqvarna a refusé la clé ou le secret de l'application »** :
  recopiez-les depuis le portail (My applications), puis enregistrez la
  configuration.
- **« L'application n'est pas connectée à l'API Automower Connect »** :
  connectez-la sur le portail (étape 3), puis enregistrez à nouveau la
  configuration.
- **Pas d'événements en direct** alors que le reste fonctionne : Husqvarna
  conseille de renouveler le secret de l'application sur le portail.
- **Le prochain départ est décalé d'une heure** : la tondeuse envoie son
  heure locale ; l'intégration la lit dans le fuseau horaire de Gladys.
- Journaux : le niveau de log de l'intégration se règle avec la variable
  `LOG_LEVEL`.

## Vie privée

L'intégration n'utilise que l'état de vos tondeuses : les positions GPS
qu'envoie Husqvarna avec les données sont aussitôt écartées, jamais gardées
ni affichées. La clé et le secret d'application ne partent
que chez Husqvarna, et n'apparaissent jamais dans un journal, un statut ou
une scène.

# Handoff Codex — Expérience pédagogique sur les expressions régulières

## Mission

Implémenter un site web statique en français destiné à une séance de 20 minutes en BUT Informatique, semestre 1. L'objectif est de comparer la réussite immédiate avec assistance et la capacité à résoudre seul un problème nouveau, selon trois modalités d'apprentissage. Ne pas présupposer les résultats de l'expérience.

## Architecture

- HTML5, CSS, JavaScript natif, sans framework, dépendance externe, CDN, backend ni API d'IA.
- Site utilisable hors ligne et déployable sur un serveur statique (dont GitHub Pages).
- Fichiers : `index.html`, `teacher.html`, `styles.css`, `app.js`, `exercises.js`, `teacher.js`, `README.md`, et tests de validation.
- Interface responsive, accessible au clavier, adaptée à une projection en amphithéâtre ; style sobre.
- Pas de données nominatives ni de requêtes réseau. Sauvegarde de progression locale dans `localStorage`, réinitialisation explicite, export JSON et CSV des résultats anonymes.
- L'IA est utilisée dans un onglet ou une application externe ; aucune intégration nécessaire.

## Déroulement étudiant

### 0. Accueil

Afficher un identifiant anonyme généré localement, une déclaration de familiarité préalable avec les regex (jamais / quelques notions / utilisation régulière) et l'affectation A, B ou C. L'enseignant peut distribuer les groupes aléatoirement à l'avance ; l'étudiant saisit son groupe. Prévoir une affectation aléatoire locale facultative, qui ne garantit pas l'équilibre des effectifs. Afficher les règles propres au groupe et demander confirmation avant de démarrer.

### 1. Apprentissage — 7 min

Mêmes exercices pour tous. Groupe A : utiliser librement une IA externe pour obtenir les solutions. Groupe B : utiliser uniquement l'aide-mémoire fourni par le site. Groupe C : utiliser une IA externe uniquement comme tuteur, avec le prompt proposé : « Aide-moi à résoudre cet exercice d'expressions régulières. Donne-moi des indices progressifs et explique les concepts nécessaires. Ne donne jamais l'expression complète. »

Pour chaque exercice : énoncé, exemples acceptés/refusés, champ de saisie de regex et bouton Tester. Le retour indique les exemples correctement classés et le résultat global, sans afficher la solution de référence. Enregistrer la dernière réponse, la réussite, le nombre d'essais et le temps passé. Permettre de passer à l'exercice suivant sans réussite. Le chronomètre doit persister en cas de rechargement. À expiration, verrouiller les réponses.

Les regex doivent reconnaître la chaîne entière, comme `re.fullmatch` en Python, mais utiliser le moteur JavaScript et le sous-ensemble commun présenté dans l'aide-mémoire. Les caractères sont ASCII dans les exercices. Saisir uniquement le motif, sans délimiteurs `/.../` ni flags. Tester explicitement la correspondance complète (par exemple `new RegExp('^(?:' + pattern + ')(?![\\s\\S])')`), y compris en présence de sauts de ligne. Ne pas employer `eval`. Une regex invalide doit donner un message lisible. Limiter la longueur des motifs et exécuter les validations dans un Web Worker avec délai maximal et terminaison pour éviter le blocage sur des expressions pathologiques. Documenter les limites du sous-ensemble et du test par exemples.

Aide-mémoire du groupe B : `a` caractère littéral ; `[A-Z]` majuscule ASCII ; `[a-z]` minuscule ASCII ; `[0-9]` chiffre ; `*` zéro ou plus ; `+` un ou plus ; `?` zéro ou un ; `{n}` exactement n ; `{n,m}` entre n et m ; `(abc)` groupe ; `a|b` alternative. Donner des exemples élémentaires qui ne résolvent pas directement les exercices.

| ID | Énoncé | Acceptés | Refusés | Référence interne |
|---|---|---|---|---|
| A1 | Deux majuscules ASCII suivies de trois chiffres | `AB123`, `XY456` | `A123`, `AB1234`, `ab123` | `[A-Z]{2}[0-9]{3}` |
| A2 | INFO ou WARN, un tiret, puis deux à quatre chiffres | `INFO-12`, `WARN-1234` | `ERROR-12`, `INFO-1`, `WARN-12345` | `(INFO\|WARN)-[0-9]{2,4}` |
| A3 | Trois à cinq minuscules ASCII, éventuellement suivies d'un tiret et de deux chiffres | `abc`, `hello-42` | `ab`, `hello-4`, `ABC-42`, `abcdef` | `[a-z]{3,5}(-[0-9]{2})?` |

Dans les références des tableaux Markdown, `\|` représente le caractère `|` non échappé dans le motif réel.

### 2. Autoévaluation — 1 min

Trois réponses obligatoires, entières de 0 à 10, avant de révéler les exercices suivants :

- À quel point estimez-vous avoir compris les expressions régulières ?
- Seriez-vous capable de résoudre un nouvel exercice sans assistance ?
- Seriez-vous capable d'expliquer votre solution à un autre étudiant ?

### 3. Évaluation autonome — 7 min

Afficher les consignes : fermer l'IA et les documents ; ne pas consulter l'aide-mémoire ; travailler seul. Masquer les exercices précédents, les solutions, le bouton Tester et l'aide. Ne donner aucun retour de correction avant la remise. Un site statique ne peut pas empêcher la consultation d'autres onglets : le contrôle relève de l'enseignant. Prévoir un mode papier imprimable facultatif, sans solutions.

- E1 — Production : deux à quatre minuscules ASCII, un tiret, exactement trois chiffres. Acceptés `ab-123`, `abcd-456` ; refusés `a-123`, `abc-12`, `abcde-123`. Référence `[a-z]{2,4}-[0-9]{3}`.
- E2 — Compréhension : pour `[A-Z]{2}(-[0-9]+)?`, classer indépendamment chaque chaîne : `AB` oui ; `AB-123` oui ; `AB-` non ; `ABC-12` non ; `AB123` non ; `XY-0` oui. Aucun choix présélectionné.
- E3 — Correction : le motif `GET|POST-[A-Z]{2}` doit reconnaître GET ou POST suivi d'un tiret et de deux majuscules ASCII. Demander une correction et une explication libre de l'erreur. Référence `(GET|POST)-[A-Z]{2}`. L'alternative s'applique à `GET` seul et à `POST-[A-Z]{2}`, en raison de la priorité de l'opérateur. L'explication est évaluée manuellement.
- E4 — Transfert : TCP ou UDP, tiret, deux à quatre chiffres, éventuellement un tiret et deux majuscules ASCII. Acceptés `TCP-123`, `UDP-42`, `TCP-1234-AB`, `UDP-99-XY` ; refusés `HTTP-123`, `UDP-1`, `TCP-123-ABC`, `UDP-99-`. Référence `(TCP|UDP)-[0-9]{2,4}(-[A-Z]{2})?`.

À expiration ou remise explicite, figer les réponses et calculer les scores. Prévoir des cas de test non affichés dans l'interface incluant chaîne vide, bornes de longueurs, casse incorrecte, alternatives, préfixes et suffixes parasites, chiffres Unicode, saut de ligne final. Accepter les expressions équivalentes selon les cas de test, sans comparaison textuelle à la référence. Le score ne prouve pas l'équivalence de deux langages réguliers ; le préciser.

## Barème proposé

- Apprentissage : 1 point par exercice réussi, total /3.
- Évaluation : E1 /1 ; E2 /1 (proportion de classifications correctes sur six) ; E3 /1 (motif corrigé) ; E4 /1. Total /4. Réponse absente ou invalide : zéro pour la partie concernée.
- Explication E3 : conserver le texte, évaluation manuelle séparée (non évaluée, 0, 0,5 ou 1), sans modifier le total automatique /4.
- Convertir séparément les deux scores en pourcentages. Ne pas interpréter la différence comme une mesure causale directe : les tâches et conditions diffèrent.
- Autoévaluation de l'autonomie : comparer la deuxième note /10 au score autonome ramené à /10, en indiquant que cette comparaison est indicative.
- En fin de parcours, afficher un écran de remise et téléchargement du résultat ; pas de correction détaillée avant la mise en commun. Prévoir une correction consultable après la séance sur action volontaire de l'enseignant depuis `teacher.html`. En statique, les réponses et jeux de test restent inspectables dans le code source ; aucune confidentialité ni protection anti-triche n'est garantie.

## Interface enseignant — 5 min de restitution

`teacher.html` : import local de plusieurs exports JSON (ou d'un fichier regroupé), validation du schéma, détection des doublons par identifiant de tentative, possibilité de retirer une tentative, agrégation par groupe. Les fichiers sont transmis manuellement par les étudiants à l'enseignant (pas de remontée automatique). Ne jamais prétendre que `localStorage` est partagé entre machines.

Afficher un tableau et des graphiques simples : effectif, familiarité préalable, réussite moyenne en apprentissage, réussite autonome moyenne, scores par exercice, autoévaluation moyenne, écart entre autoévaluation et performance ; distinguer les données absentes des zéros. Ajouter un affichage projetable et un export CSV agrégé et individuel. Ne pas produire de résultats fictifs sauf jeu de démonstration explicitement identifié et séparé.

Enseignant : accès aux solutions, aux explications E3, à leur notation manuelle et au déroulé pédagogique. Présenter des résultats descriptifs, sans conclusion prédéterminée. Signaler les biais : connaissances antérieures, taille et équilibre des groupes, respect des consignes, difficulté différente des exercices, rétroaction de la phase 1, absence de mesure de rétention. Suggestion : test différé sans assistance lors du cours suivant.

## Critères d'acceptation

1. Les trois parcours fonctionnent avec les consignes correctes et les mêmes exercices.
2. Le chronométrage et les transitions sont cohérents (7 + 1 + 7 minutes étudiant ; 5 minutes de restitution enseignant). Le rechargement ne redémarre pas le temps ; aucune réponse modifiable après remise.
3. Les corrections de référence passent tous les tests ; les erreurs de groupement, de quantification et d'ancrage typiques sont rejetées. Tester aussi les regex syntaxiquement invalides et les délais du Worker.
4. Aucun feedback de correction n'apparaît en phase autonome. L'interface ne révèle pas involontairement les solutions avant les exercices.
5. Les exports et imports multi-étudiants fonctionnent, sans doublons ni mélange avec les données de démonstration.
6. Les scores et graphiques traitent correctement les groupes vides et réponses manquantes.
7. Aucun appel réseau tiers, aucune dépendance d'exécution à installer. Le site fonctionne avec `python3 -m http.server 8000` depuis la racine.
8. Le README documente l'exécution, le déploiement, le déroulé en classe, la collecte manuelle, le barème, les limites expérimentales et les commandes de test.

## Livraison

Créer effectivement les fichiers dans le dépôt de travail (ne pas se limiter à décrire le site). Exécuter les tests disponibles, vérifier les parcours et les calculs, puis fournir un résumé des fichiers créés, des tests passés et des limitations restantes. En l'absence de navigateur de test disponible, le signaler explicitement. Préférer une implémentation simple, maintenable, sans infrastructure supplémentaire.

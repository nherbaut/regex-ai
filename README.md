# Expérience pédagogique — Expressions régulières (BUT Informatique, S1)

Site statique généré avec **Hugo** (HTML5, CSS et JavaScript natif, sans framework, sans CDN, sans backend ni API d'IA) destiné à une séance de **20 minutes** en BUT Informatique (semestre 1).

L'activité permet de comparer de manière descriptive la réussite immédiate en phase d'apprentissage assisté et la capacité à résoudre seul des exercices nouveaux, selon trois modalités :

- **Groupe A** : utilisation libre d'une IA externe pendant la phase d'apprentissage.
- **Groupe B** : utilisation uniquement de l'aide-mémoire intégré au site.
- **Groupe C** : utilisation d'une IA externe uniquement comme tuteur (indices progressifs, jamais l'expression complète).

Le site ne présuppose aucun résultat et fonctionne entièrement hors ligne.

---

## Architecture du dépôt Hugo

```text
.
├── hugo.toml                     # Configuration du site Hugo (français, URLs relatives)
├── Makefile                      # Commandes locales (serve, build, serve-public, test, check, clean)
├── content/
│   ├── _index.md                 # Page d'accueil étudiant -> public/index.html
│   ├── teacher.md                # Interface enseignant    -> public/teacher.html
│   └── papier.md                 # Feuille imprimable (P3) -> public/papier.html
├── layouts/
│   ├── _default/baseof.html      # Gabarit HTML5 commun, accessible au clavier
│   ├── index.html                # Parcours étudiant (phases 0 à 4)
│   └── page/
│       ├── teacher.html          # Tableau de bord enseignant et restitution
│       └── papier.html           # Version papier sans solutions de la phase 3
├── static/
│   ├── styles.css                # Styles sobres, responsives, mode projection et impression
│   ├── exercises.js              # Énoncés, jeux de tests, moteur fullmatch, barème, agrégation, CSV
│   ├── regex-worker.js           # Web Worker isolé avec délai maximal (protection ReDoS)
│   ├── app.js                    # Logique étudiante, chronomètres persistants, localStorage
│   └── teacher.js                # Import JSON, dédoublonnage, graphiques SVG, notation E3
└── tests/
    └── run-tests.js              # Suite de tests automatisés (Node.js)
```

---

## Prérequis et exécution locale

### Prérequis

- **Hugo** (version standard, pas besoin de Hugo Extended ni de thème externe) pour servir et construire le site.
- **Node.js** (≥ 18) pour exécuter les tests automatisés (`make test`).
- **Python 3** (facultatif) pour servir le dossier statique généré `public/`.

### Commandes `Makefile`

```bash
# Afficher l'aide
make help

# Lancer le serveur local Hugo (http://127.0.0.1:1313)
make serve

# Personnaliser le port ou l'adresse d'écoute (ex. partage réseau local en salle)
make serve HOST=0.0.0.0 PORT=1313

# Générer le site statique dans ./public
make build

# Servir ./public avec Python (http://127.0.0.1:8000)
make serve-public

# Vérifier les outils installés et la syntaxe JS
make check

# Exécuter les tests automatisés
make test

# Supprimer ./public et ./resources
make clean
```

---

## Déploiement sur GitHub Pages

Un workflow GitHub Actions prêt à l'emploi est fourni dans `.github/workflows/hugo-pages.yml` : à chaque push sur `master` (ou déclenchement manuel), il exécute `make check` et `make test`, génère le site avec **Hugo** puis le publie sur GitHub Pages.

### Activation sur GitHub

1. Poussez la branche `master` sur le dépôt GitHub (`nherbaut/regex-ai`).
2. Dans GitHub, ouvrez **Settings → Pages → Build and deployment → Source** et sélectionnez **GitHub Actions**.
3. Le workflow se lance automatiquement (ou depuis l'onglet **Actions → Déploiement Hugo sur GitHub Pages → Run workflow**).
4. Le site est ensuite accessible sur :
   - Parcours étudiant : `https://nherbaut.github.io/regex-ai/`
   - Interface enseignant : `https://nherbaut.github.io/regex-ai/teacher.html`
   - Version papier imprimable : `https://nherbaut.github.io/regex-ai/papier.html`

### Déploiement sur un autre serveur statique

Exécutez `make build` (`hugo --minify --cleanDestinationDir`) puis copiez le contenu du dossier `public/` sur n'importe quel serveur web statique (Apache, Nginx, GitLab Pages, etc.). Tous les liens internes et ressources étant relatifs (`./...`), le site fonctionne aussi bien à la racine que dans un sous-répertoire.

---

## Déroulement en classe (20 minutes)

| Étape | Durée | Contenu |
|---|---|---|
| **0. Accueil** | ~1 min (hors chrono) | Attribution du groupe (A, B ou C, idéalement réparti aléatoirement à l'avance par l'enseignant), déclaration de familiarité préalable, lecture et confirmation des consignes. |
| **1. Apprentissage** | **7 min** | Mêmes 3 exercices (`A1`, `A2`, `A3`) avec bouton **Tester** et retour sur les exemples (sans solution de référence). Aide-mémoire affiché uniquement au groupe B ; prompt tuteur affiché au groupe C. |
| **2. Autoévaluation** | **1 min** | 3 questions obligatoires notées de 0 à 10 avant de révéler la phase 3. |
| **3. Évaluation autonome** | **7 min** | 4 exercices (`E1` production, `E2` compréhension, `E3` correction + explication libre, `E4` transfert), sans IA, sans aide-mémoire, sans bouton Tester et sans retour avant remise. Une version papier imprimable sans solutions est disponible sur `/papier.html`. |
| **4. Remise et restitution** | **5 min** | Verrouillage définitif, téléchargement du fichier JSON anonyme par chaque étudiant, collecte manuelle par l'enseignant, import dans `/teacher.html`, observation descriptive, corrigé volontaire et discussion des biais. |

### Collecte manuelle des résultats

- Aucune donnée ne transite sur le réseau et `localStorage` **n'est jamais partagé entre machines**.
- À la fin de la phase 3, chaque étudiant télécharge son fichier `resultat-<ID>-groupe-<G>.json` et le dépose sur l'espace prévu par l'enseignant (Moodle, dossier partagé, etc.).
- L'enseignant ouvre `teacher.html`, importe tous les fichiers JSON d'un coup (par glisser-déposer ou sélection multiple), vérifie l'absence de doublons (détectés par `attemptId`), peut activer le **Mode projection** et afficher volontairement le **corrigé de référence** après la passation.
- Un **jeu de démonstration fictif** séparé est disponible pour préparer ou présenter l'interface ; il n'est jamais mélangé aux données étudiantes réelles.

---

## Barème et métriques

- **Apprentissage (`/3`)** : 1 point par exercice réussi (`A1`, `A2`, `A3`), converti séparément en pourcentage.
- **Évaluation autonome (`/4`)** :
  - `E1` : `/1` (réussite sur tous les cas de test, visibles et cachés)
  - `E2` : `/1` (proportion de classifications correctes sur les 6 chaînes)
  - `E3` (motif corrigé) : `/1`
  - `E4` : `/1`
  - Réponse absente, invalide ou interrompue par délai : `0` pour la partie concernée.
  - Total converti séparément en pourcentage et ramené sur `/10`.
- **Explication libre `E3`** : conservée dans l'export et notée manuellement à part dans `teacher.html` (`Non évaluée`, `0`, `0,5` ou `1`), **sans modifier le total automatique `/4`**.
- **Autoévaluation de l'autonomie (indicatif)** : la deuxième note sur `/10` est comparée au score autonome ramené sur `/10` (`autoévaluation − score/10`), à titre strictement indicatif.
- Dans tous les tableaux et graphiques, les **données absentes** (groupe vide ou champ non renseigné) sont affichées `—` et distinguées des **zéros** (`0`).

---

## Limites techniques et biais expérimentaux

### Limites du moteur d'expressions régulières

- Les motifs sont exécutés avec le **moteur JavaScript** (`new RegExp('^(?:' + pattern + ')(?![\\s\\S])')`) pour reproduire la sémantique de correspondance complète (`re.fullmatch` en Python), y compris en présence de sauts de ligne.
- La saisie porte uniquement sur le motif (sans `/.../` ni flags), limité à **200 caractères**, sur caractères ASCII dans les exercices.
- L'évaluation est exécutée dans un **Web Worker** interrompu au-delà de **350 ms** afin d'éviter le gel du navigateur sur des motifs pathologiques (retour sur trace catastrophique / ReDoS).
- **Test par exemples** : toute expression équivalente passant l'ensemble des tests visibles et cachés est acceptée sans comparaison textuelle à la référence, mais un jeu fini d'exemples **ne prouve pas formellement l'équivalence de deux langages réguliers**.
- **Site statique** : les énoncés, jeux de tests et corrigés restent inspectables dans les fichiers statiques ; le site n'assure aucune protection anti-triche ni blocage des autres onglets.

### Biais méthodologiques à discuter en restitution

- Différences de **connaissances antérieures** (familiarité préalable) entre étudiants.
- **Effectifs** réduits ou déséquilibrés entre groupes (en particulier si le tirage aléatoire local est utilisé).
- Degré de **respect des consignes** (utilisation réelle du prompt tuteur en groupe C, fermeture effective des onglets en phase 3).
- **Tâches et conditions non comparables directement** entre la phase 1 (3 exercices guidés avec bouton Tester) et la phase 3 (4 tâches dont compréhension, correction et transfert, sans rétroaction).
- **Absence de mesure de rétention** : la séance n'observe qu'une performance immédiate. Il est conseillé de proposer un court test différé sans assistance lors du cours suivant.

---

## Tests de validation

```bash
make check
make test
```

La suite `tests/run-tests.js` vérifie :
- le passage de toutes les solutions de référence et d'expressions équivalentes ;
- le rejet des erreurs classiques (priorité de `|`, quantificateurs, ancrage, casse, saut de ligne final, chiffres Unicode) ;
- la gestion des motifs vides, trop longs ou syntaxiquement invalides ;
- l'interruption par délai du Web Worker (`static/regex-worker.js`) sur un motif pathologique ;
- le calcul des scores (`E2`, `/3`, `/4`, écart d'autoévaluation, isolation de la note manuelle `E3`) ;
- la validation de schéma JSON, le dédoublonnage, la séparation stricte du jeu de démonstration, la gestion des groupes vides et données absentes, et l'export CSV ;
- l'absence de requêtes réseau/CDN ou d'`eval`, la cohérence des identifiants DOM entre templates Hugo et scripts, ainsi que l'absence de solutions dans `papier.html`.

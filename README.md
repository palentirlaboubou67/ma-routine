# Ma routine

Une checklist quotidienne simple et bienveillante, pensée pour le TDAH :
on ouvre, on voit ce qu'il reste à faire, on coche, on voit sa progression.

## En ligne (téléphone et ordinateur)

**https://palentirlaboubou67.github.io/ma-routine/**

- **Android (Chrome)** : ouvrir le lien → menu ⋮ → « Ajouter à l'écran d'accueil » / « Installer l'application ».
- **iPhone (Safari)** : ouvrir le lien → bouton Partager → « Sur l'écran d'accueil ».

Une fois installée, l'app s'ouvre en plein écran et fonctionne hors ligne.
Chaque appareil garde ses propres données (pas de synchronisation) : pour transférer
son historique, Réglages → Exporter sur l'un, puis Restaurer sur l'autre.

Toute modification poussée sur la branche `main` est mise en ligne automatiquement
(GitHub Pages) et récupérée par l'app à sa prochaine ouverture avec du réseau.

## Lancer l'application en local

Double-clique sur **`lancer.bat`**. Le navigateur s'ouvre sur `http://localhost:5317/`.

- Laisse la petite fenêtre noire ouverte pendant l'utilisation.
- **Conseillé :** dans Chrome / Edge / Opera, clique sur l'icône « Installer » dans la
  barre d'adresse. L'app aura sa propre fenêtre et son icône, et fonctionnera ensuite
  **même sans lancer `lancer.bat`** (elle est mise en cache pour un usage hors ligne).
- Garde toujours la même adresse (`localhost:5317`) : les données sont liées à elle.

Prérequis : Python (déjà installé sur ce PC). Aucune autre dépendance.

## Ce que fait l'application

- **Aujourd'hui** : date, message d'accueil, pourcentage, barre de progression, checklist.
  Un toucher coche ou décoche. La prochaine tâche est signalée « À faire ensuite ».
  Une petite célébration apparaît quand tout est fait.
- **Historique** : les journées passées (date, X sur Y, pourcentage, tâches faites ou non).
- **Réglages** (icône en haut à droite) : ajouter, renommer, changer l'icône, réordonner,
  mettre en pause ou supprimer une habitude ; prénom ; exporter / restaurer une sauvegarde.

Une nouvelle journée démarre automatiquement à minuit (heure locale), que l'app soit
restée ouverte ou non. Les journées passées ne sont jamais effacées ni modifiées.

## Données

- Enregistrement automatique à chaque action dans **IndexedDB** (stockage du navigateur,
  sur cet appareil uniquement). Repli sur localStorage si IndexedDB est indisponible.
- Chaque journée garde une copie des intitulés du jour : renommer, mettre en pause
  ou supprimer une habitude ne modifie pas l'historique.
- **Exporte une sauvegarde de temps en temps** (Réglages → Mes données) : vider les
  données du navigateur effacerait aussi celles de l'app.

## Structure du code

```
index.html, styles.css     page et design (variables de couleur en haut du CSS)
src/date.js                dates en heure locale
src/model.js               logique pure : tâches par défaut, moments, progression, journées
src/migrations.js          évolutions de la routine appliquées une fois aux données existantes
src/storage.js             dépôt IndexedDB / localStorage / mémoire (interface unique)
src/store.js               état de l'app + actions + changement de jour
src/ui/*.js                écrans (today, history, settings), icônes, dialogues
sw.js, manifest.webmanifest  installation et usage hors ligne
tests/                     tests : ouvrir http://localhost:5317/tests/
```

Pour ajouter plus tard une synchronisation entre appareils, il suffit d'écrire un
nouveau dépôt avec les mêmes méthodes que ceux de `src/storage.js`
(`loadAll`, `write`, `replaceAll`). Les enregistrements portent déjà un `updatedAt`.

# Consilium

Application web installable (PWA) pour Chrome, puis mobile : agenda, contacts par domaine, objectifs.

## Lancer en local

```bash
python3 -m http.server 8123
```

Puis ouvrir http://localhost:8123 dans Chrome → icône « Installer » dans la barre d’adresse.

## Sur téléphone

Le mode hors ligne et l’installation exigent **HTTPS**. Publiez le dossier tel quel sur un hébergeur statique
(GitHub Pages, Netlify, Cloudflare Pages…), ouvrez l’adresse sur le téléphone, puis « Ajouter à l’écran d’accueil ».

## Données

Stockées dans le navigateur de chaque appareil (localStorage), sans serveur ni compte.
Page **Données** : exporter / restaurer une sauvegarde JSON (aussi pour passer d’un appareil à l’autre).

## Tests

```bash
npm test
```

## Structure

- `js/utils.js` — dates, récurrences, disposition des événements, progression (pur, testé)
- `js/store.js` — stockage local immuable, validation des imports (testé)
- `js/calendar.js`, `js/event-form.js` — agenda Mois / Semaine / Jour / Liste
- `js/contacts.js` — répertoire par domaine d’activité
- `js/goals.js` — objectifs, étapes, mesure chiffrée
- `js/data.js` — sauvegarde, restauration, installation
- `sw.js`, `manifest.webmanifest` — PWA (hors ligne, installable)

# Serveur de rappels Consilium

Cloudflare Worker + base D1. Il ne reçoit que des **heures de rappel** et l’adresse de notification de chaque
appareil ; aucun titre ni lieu. Chaque minute, il envoie une notification vide à l’appareil, qui la complète
avec ses propres données.

## Mise en ligne (une fois)

```bash
npx wrangler@4 login
npx wrangler@4 d1 create consilium-push          # copier l’identifiant affiché dans wrangler.toml (database_id)
npx wrangler@4 d1 execute consilium-push --remote --file=schema.sql
npx wrangler@4 secret put VAPID_PRIVATE_JWK      # coller la valeur de .dev.vars (sans les guillemets simples)
npx wrangler@4 deploy
```

Puis mettre l’adresse du Worker dans `../js/config.js` (`serverUrl`).

## Développement

```bash
npm test                 # tests
npm run dev              # serveur local ; tâche planifiée : /__scheduled?cron=*+*+*+*+*
```

`.dev.vars` contient la clé privée VAPID : ne jamais la publier. Si elle est perdue, générer une nouvelle paire,
mettre à jour `VAPID_PUBLIC_KEY` (wrangler.toml), `vapidPublicKey` (js/config.js) et le secret ; chaque appareil
se réabonne en réactivant les notifications.

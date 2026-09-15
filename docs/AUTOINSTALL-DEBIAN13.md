# Auto-installateur Debian 13

À intégrer à la racine de PCIF Académie v0.3/v0.4.

Avant installation, le `package.json` racine doit contenir :

```json
"type": "module"
```

et :

```json
"start": "node dist/src/server.js"
```

## Installation de production

```bash
chmod +x deploy/install-debian13.sh
sudo ./deploy/install-debian13.sh --environment prod \
  --admin-email admin@eple-tools.fr \
  --admin-name "Administrateur PCIF Académie" \
  --acme-email certificats@eple-tools.fr
```

Le mot de passe initial est demandé deux fois, sans affichage. Aucun mot de
passe par défaut n'est inscrit dans les fichiers ou dans la ligne de commande.

## Installation de démonstration

```bash
sudo ./deploy/install-debian13.sh --environment demo \
  --acme-email certificats@eple-tools.fr
```

Les deux domaines sont fixés par le déploiement :

```bash
- production : `pcif.eple-tools.fr` ;
- démo : `demopcif.eple-tools.fr`.

Caddy utilise explicitement l'émetteur ACME Let's Encrypt et renouvelle les
certificats automatiquement. Les DNS doivent pointer vers le VPS avant le
lancement et les ports TCP 80/443 doivent être ouverts.
```

Le script installe PostgreSQL, Node.js 22 LTS si nécessaire, génère les secrets,
initialise la base, compile API et Web, installe systemd et, avec `--domain`,
installe Caddy et HTTPS.

## Mise à jour

```bash
sudo ./deploy/update-debian13.sh --environment prod
sudo ./deploy/update-debian13.sh --environment demo
```

## Diagnostic

```bash
systemctl status pcif-academie-prod
systemctl status pcif-academie-demo
systemctl list-timers pcif-academie-demo-reset.timer
journalctl -u pcif-academie-demo-reset.service
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3001/health
```

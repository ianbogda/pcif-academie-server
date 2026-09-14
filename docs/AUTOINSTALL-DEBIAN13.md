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

## Installation

```bash
chmod +x deploy/install-debian13.sh
sudo ./deploy/install-debian13.sh --domain pcif.example.fr
```

Sans domaine :

```bash
sudo ./deploy/install-debian13.sh
```

Sans données de démonstration :

```bash
sudo ./deploy/install-debian13.sh --domain pcif.example.fr --no-demo
```

Le script installe PostgreSQL, Node.js 22 LTS si nécessaire, génère les secrets,
initialise la base, compile API et Web, installe systemd et, avec `--domain`,
installe Caddy et HTTPS.

## Mise à jour

```bash
sudo ./deploy/update-debian13.sh
```

## Diagnostic

```bash
systemctl status pcif-academie
journalctl -u pcif-academie -f
curl http://127.0.0.1:3000/health
```

# Evidență API (Oracle)

Mic server HTTP pe VM-ul Oracle: salvează evidența în `evidenta-api/data/evidenta-rulota.json` și servește și site-ul static (același origin, fără mixed content).

**Port implicit: `8787`**

## Endpoints

- `GET /health` → `{ ok: true }`
- `GET /api/evidenta` → documentul JSON curent
- `PUT /api/evidenta` → înlocuiește tot documentul (fără token)
- `GET /` → `index.html` + restul fișierelor din rădăcina repo-ului

## Deploy pe Oracle

```bash
cd /home/ubuntu/RulotaGrim
git pull origin main

cd /home/ubuntu/RulotaGrim/evidenta-api
cp .env.example .env   # opțional; PORT=8787
npm install

cd /home/ubuntu/RulotaGrim
sudo cp evidenta-api/evidenta-api.service /etc/systemd/system/evidenta-api.service
sudo systemctl daemon-reload
sudo systemctl enable --now evidenta-api
sudo systemctl status evidenta-api
```

### Firewall / Security List

Deschide **TCP 8787** în Oracle Cloud (Security List sau Network Security Group) pentru `0.0.0.0/0` (sau restricționează după nevoie). Fără asta, browserul din afară nu ajunge la API.

Verificare locală pe VM:

```bash
curl -s http://127.0.0.1:8787/health
curl -s http://127.0.0.1:8787/api/evidenta
```

### Frontend

Deschide **`http://IP_PUBLIC:8787/`** pentru Evidență (recomandat). Pe același host, `apiBaseUrl` poate rămâne gol (`''`) — cererile merg pe `/api/evidenta`.

Dacă folosești GitHub Pages (`https://…github.io`), setează în `evidenta-config.js`:

```js
window.EVIDENTA_CONFIG = {
  apiBaseUrl: 'http://IP_PUBLIC:8787'
};
```

**Atenție mixed content:** Pages e HTTPS, API-ul e HTTP — browserul blochează salvările. Folosește URL-ul Oracle `http://IP_PUBLIC:8787/` pentru Evidență. Pages rămâne ok pentru Livrare Internă.

## Date

- Fișier: `evidenta-api/data/evidenta-rulota.json` (directorul `data/` e gitignored)
- Fără autentificare — oricine poate citi/scrie, ca înainte
- Scrierile folosesc fișier temporar + rename și o coadă internă ca să nu se corupă la concurență

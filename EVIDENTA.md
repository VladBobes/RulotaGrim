# Evidență Rulotă

Persistența evidenței rulează pe un **API HTTP pe VM-ul Oracle** (`evidenta-api/`), nu pe GitHub Contents API.

Datele stau în `evidenta-api/data/evidenta-rulota.json` pe disc (gitignored). Fișierul `evidenta-rulota.json` din rădăcina repo-ului e doar seed/arhivă și **nu** mai e scris din browser.

## De ce Oracle URL

GitHub Pages e **HTTPS**. API-ul pe Oracle e **HTTP** (`:8787`). Browserul blochează `https://…github.io` → `http://IP:8787` (mixed active content).

**Soluție:** deschide site-ul de pe Oracle — același server servește și staticul și API-ul:

```text
http://IP_PUBLIC:8787/
```

Pe același origin, `apiBaseUrl` poate rămâne `''` (cereri relative la `/api/evidenta`).

## Config frontend

`evidenta-config.js`:

```js
window.EVIDENTA_CONFIG = {
  apiBaseUrl: '' // pe Oracle; pe Pages: 'http://IP_PUBLIC:8787'
};
```

- **Oracle (recomandat pentru Evidență):** `apiBaseUrl: ''`
- **GitHub Pages:** setează `apiBaseUrl` la `http://IP_PUBLIC:8787` — UI-ul arată un avertisment mixed content și te trimite pe URL-ul Oracle. Pages rămâne util pentru **Livrare Internă**.

Nu mai există PAT / token GitHub pentru evidență. Citire și scriere sunt deschise (ca înainte).

## Deploy Oracle (scurt)

1. `git pull origin main`
2. `cd evidenta-api && npm install` (și opțional `cp .env.example .env`)
3. Copiază unitatea systemd, `enable --now evidenta-api`
4. Deschide ingress **TCP 8787** în Security List / NSG (`0.0.0.0/0` sau restriâns)
5. Deschide `http://IP_PUBLIC:8787/` — pe Oracle nu e nevoie să schimbi `apiBaseUrl`

Detalii: `evidenta-api/README.md`.

## Schema date

```json
{
  "version": 1,
  "updatedAt": null,
  "entries": [
    {
      "id": "...",
      "responsabil": "...",
      "cnp": "...",
      "telefon": "...",
      "quantities": {},
      "taxCollected": false,
      "createdAt": "..."
    }
  ]
}
```

- `GET /api/evidenta` — citește
- `PUT /api/evidenta` — înlocuiește tot documentul după fiecare mutație (adăugare, taxă, ștergere, reset)

`quantities` folosește aceleași chei ca Livrare Internă / Grove (`plicCocaina`, `joint`, `tigara`, `redFire`, `greenHaze`, `blueCurrent`). La încărcare, cheile snake_case (ex. `plic_cocaina`) sau numele de afișare sunt mapate pe aceste chei.

**Notă recuperare:** o versiune anterioară a UI-ului ștergea cantitățile la refresh (`normalizeStore` fără catalogul de iteme). Dacă pe disc cantitățile sunt deja `{}` / zero (ex. după toggle taxă pe un store încărcat greșit), trebuie re-adăugate manual — nu se pot reconstrui.

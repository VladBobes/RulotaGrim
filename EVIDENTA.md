# Evidență Rulotă

Persistența evidenței folosește fișierul `evidenta-rulota.json` din acest repo, citit/scris din browser prin **GitHub Contents API** (fără backend / Oracle).

## Configurare PAT

1. Pe GitHub: **Settings → Developer settings → Personal access tokens → Fine-grained tokens**.
2. Creează un token cu acces **doar** la repo-ul `VladBobes/RulotaGrim`.
3. Permisiuni: **Contents: Read and write**.
4. Copiază tokenul în `evidenta-config.js`:

```js
window.EVIDENTA_CONFIG = {
  owner: 'VladBobes',
  repo: 'RulotaGrim',
  branch: 'main',
  path: 'evidenta-rulota.json',
  token: 'github_pat_...' // lipeste PAT-ul aici
};
```

5. Commit + push pe `main`. Dacă site-ul rulează pe **GitHub Pages**, tokenul trebuie să fie prezent în `evidenta-config.js` din branch-ul / build-ul pe care îl servește Pages.

## Atenție securitate

Pe un site Pages **public**, oricine poate vedea `evidenta-config.js` și tokenul. Asta e intenționat pentru modelul „oricine poate adăuga sau șterge”. Folosește un fine-grained PAT limitat la Contents pe acest repo; nu folosi un classic PAT cu acces larg.

Fără token: citirea poate funcționa pe repo public; scrierea (adăugare / ștergere / taxă încasată) nu.

## Fișier date

Structură inițială în `evidenta-rulota.json`:

```json
{ "version": 1, "updatedAt": null, "entries": [] }
```

Salvările folosesc optimistic concurrency (`sha` din GET, trimis la PUT; la 409 se reîncearcă o dată).

# Bot acțiuni — Rulota Grim

Al doilea bot Discord din același repo. Rulează ca un proces Node separat, pe același VM Oracle ca botul de livrare (`bot/`). Nu reutiliza tokenul de la botul de predare.

## Aplicație Discord separată

Creează o **a doua** aplicație în [Discord Developer Portal](https://discord.com/developers/applications). Tokenul, Client ID-ul și invitația sunt ale acestui bot, nu ale celui de livrare.

Invită botul pe server cu scope-urile `bot` și `applications.commands`.

Permisiuni necesare:

- View Channel
- Send Messages
- Embed Links
- Mention Everyone (`/planifica` începe mesajul cu `@everyone`)

Pe rolul botului trebuie bifat **Mention Everyone**. Fără asta, `@everyone` apare în chat dar nu anunță pe nimeni.

## Configurare

```bash
cp bot-actiuni/.env.example bot-actiuni/.env
```

Completează `DISCORD_TOKEN`, `DISCORD_CLIENT_ID` și `DISCORD_GUILD_ID` (ID-ul serverului) din a doua aplicație. Copiază `STAFF_ROLE_IDS` din `bot/.env` — aceleași ID-uri de rol, separate prin virgulă. Acest bot nu folosește `PREDARE_ROLE_IDS`.

Datele stau în `bot-actiuni/data/` (nu se comite). Tokenul stă doar în `bot-actiuni/.env` (nu se comite).

## Comenzi (pe server, dacă `DISCORD_GUILD_ID` este setat)

- `/planifica` — anunță o acțiune, menționează `@everyone` și deschide butonul Prezent.
- `/absent` — mută un membru din prezenți în absenți.
- `/lista_actiuni` — prezența de la ultimul reset.
- `/reset_actiuni` — șterge istoricul; butoanele vechi nu mai funcționează.

Butonul **Prezent** nu cere rol de staff. O înscriere pe utilizator, fără retragere.

## Instalare pe VM (al doilea proces)

Repo-ul e deja clonat lângă botul de livrare. Nu este nevoie de un al doilea VM.

```bash
cd /home/ubuntu/RulotaGrim
git pull origin main
cd /home/ubuntu/RulotaGrim/bot-actiuni
npm install
node register-commands.js
cd /home/ubuntu/RulotaGrim
sudo cp bot-actiuni/actiuni-bot.service /etc/systemd/system/actiuni-bot.service
sudo systemctl daemon-reload
sudo systemctl enable --now actiuni-bot
sudo systemctl status actiuni-bot
```

Dacă `rulota-actiuni` era deja instalat pe VM, oprește și dezactivează unitatea veche ca să nu ruleze două procese:

```bash
sudo systemctl disable --now rulota-actiuni
sudo rm -f /etc/systemd/system/rulota-actiuni.service
```

Loguri: `journalctl -u actiuni-bot -f`.

Botul de livrare (`rulota-bot`) rămâne neschimbat. Pornește doar unitatea nouă `actiuni-bot`; nu reporni `rulota-bot` decât dacă actualizezi și acel bot.

# Bot Discord — Rulota Grim

Pagina de pe GitHub Pages rămâne calculatorul static și merge în paralel cu botul. Botul este un proces Node separat: aceleași reguli de alocare, aceleași prețuri, același text de export.

Comenzi, pe server (dacă `DISCORD_GUILD_ID` este setat):

- `/predare` — cantități și CNP (1–5 cifre). Numele vine din numele afișat pe Discord. O predare nouă de la același utilizator o înlocuiește pe cea veche.
- `/calculeaza` — Grove, Vespucci, Mirror, Sandy sau Custom. La Custom, capacitățile lipsă pornesc de la valorile Grove.
- `/lista` — predările curente.
- `/reset` — golește predările pentru livrarea următoare.

Predările stau în `bot/data/submissions.json` (nu se comite). Tokenul stă doar în `bot/.env` (nu se comite).

## Oracle Cloud Always Free

Din mediul de dezvoltare nu există CLI sau credențiale Oracle, deci VM-ul se creează manual. Pași scurți pe un cont Oracle Cloud:

1. Creează o instanță **VM.Standard.A1.Flex** (Ampere, Always Free), imagine **Ubuntu 24.04** sau 22.04. 1 OCPU și 6 GB RAM sunt de ajuns. Lasă SSH (port 22) deschis în security list / NSG.
2. Conectează-te prin SSH, apoi instalează Node.js 22:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git
node -v
```

3. Clonează repo-ul (după merge, `main` e suficient):

```bash
git clone https://github.com/VladBobes/RulotaGrim.git /home/ubuntu/RulotaGrim
cd /home/ubuntu/RulotaGrim
```

4. În [Discord Developer Portal](https://discord.com/developers/applications) creează aplicația, adaugă un bot și invită-l pe server cu scope-urile `bot` și `applications.commands`.
5. Creează `bot/.env` din exemplu și completează valorile:

```bash
cp bot/.env.example bot/.env
```

`DISCORD_TOKEN`, `DISCORD_CLIENT_ID` și `DISCORD_GUILD_ID` (ID-ul serverului). Cu guild id setat, comenzile apar imediat pe acel server. `PREDARE_ROLE_IDS` limitează `/predare`, iar `STAFF_ROLE_IDS` limitează `/calculeaza`, `/lista` și `/reset` (ID-uri de rol, separate prin virgulă).

6. Instalează dependențele și înregistrează comenzile:

```bash
cd /home/ubuntu/RulotaGrim/bot
npm install
node register-commands.js
```

7. Instalează unitatea systemd. Dacă repo-ul sau `node` nu sunt la căile din fișier, editează `User`, `WorkingDirectory`, `EnvironmentFile` și `ExecStart` (`command -v node`).

```bash
sudo cp /home/ubuntu/RulotaGrim/bot/rulota-bot.service /etc/systemd/system/rulota-bot.service
sudo systemctl daemon-reload
sudo systemctl enable --now rulota-bot
sudo systemctl status rulota-bot
```

`Restart=always` ține procesul pornit după reboot sau după o eroare. Loguri: `journalctl -u rulota-bot -f`.

Pagina GitHub Pages nu trece prin acest VM. Rămâne site-ul static (`index.html` și `allocation.js`) și poate fi folosită în continuare fără bot.

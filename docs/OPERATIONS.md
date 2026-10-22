# Rõuge CrossFit – hoolduse ja taastamise juhend

See dokument kirjeldab **ohutut tööjärjekorda**. Rõuge CrossFit kasutab Supabase'i
projekti koos teise rakendusega; andmebaasi täielik eksport hõlmab mõlemat.
Ühtegi allolevat tootmisandmete muudatust ei käivitata automaatselt.

## 1. Muudatuste avaldamise järjekord (tasuta lahendus)

1. Testi Node.js regressioonitestidega ning GitHub Actionsi Chromiumi ja WebKiti
   testidega. Need ei saada päris Supabase'i andmeid.
2. **Tasuta eraldatud PostgreSQL** töötab GitHub Actionsi ajutises Docker-konteineris.
   Failides `tests/sql/001_cancel_fixture.sql` ja `002_cancel_rls_assertions.sql`
   kontrollitakse serveri krediiditagastuse funktsiooni ja RLS-poliitikate koopiat.
   Testandmed on sünteetilised; tootmiskontot või tasulist Supabase'i testprojekti ei looda.
3. Kontrolli eraldi lugemispäringuga tegeliku Supabase'i RLS-i ja andmete terviklust.
   Ära tee päris klientidega testregistreeringuid ega testkrediiditehinguid.
4. Kontrolli GitHubi `RCF kvaliteedikontroll`, `CrossFit smoke checks` ja
   `RCF avaliku äpi toimivus` töövooge enne ja pärast väljalaset.
5. Hoia olemasolevate kliendiandmete varukoopia ja WOD-pildid eraldi.
6. Väljalaske järel kontrolli avaliku rakenduse versiooni, PWA vahemälu ning
   sisselogimist, teavitusi ja treeningutele registreerimist päris telefonidel.

**22.10.2026:** `public.wod_cancel_training(bigint)` funktsiooni teavituse SELECT
kasutas sama `r` tähist PL/pgSQL `record` muutujana ja SQL-tabeli aliasena.
Parandati tabeli alias nimeks `participant`, jättes krediidi tagastamise ja
tehinguloogika muutmata. Paranduse test tehti enne tootmisandmebaasi muudatust.
Selle funktsiooni SQL-koopia on versioonihalduses `tests/sql/001_cancel_fixture.sql`.

## 2. Andmebaasi turvalisus

- RLS peab olema lubatud kõikidel \`public.wod_*\` tabelitel.
- Aktiivse konto ja anonüümse sisselogimise piirang peab olema **RESTRICTIVE**,
  sest PERMISSIVE-poliitikad liidetakse loogilise VÕI-ga.
- Konto enda profiili UPDATE peab olema veergudega piiratud: klient ei tohi
  muuta \`role\`, \`user_id\` ega krediidisaldot.
- Eelista krediidi muutmist läbi autentitud ja rolli kontrolliva RPC-funktsiooni.
- Ära avalda andmebaasi \`service_role\` või secret key väärtusi GitHubis ega PWA-s.
- Supabase'i Security Advisor ei asenda RLS-i tegelikku negatiivset testi kahe
  sünteetilise kasutajakontoga.
- Piiravaid turvapoliitikaid ei tohi pimesi lisada enne testkeskkonda;
  isegi näiliselt rangem poliitika võib katkestada sisselogimise.

## 3. Krediitide kontrollitavad stsenaariumid (tasuta CI ja füüsilise testi eristus)

1. Kliendi krediit 2 → treeningu kinnitatud koht → krediit 1.
2. Õigeaegne kliendipoolne tühistamine → krediit taastub 2.
3. Hiline kliendipoolne tühistamine → krediit jääb 1.
4. Treener tühistab *kogu treeningu* pärast hilist tühistust →
   krediit taastub 2.
5. Treener vajutab tühistamist teist korda → täiendavat krediiti ei lisandu.
6. Ootenimekirja lisamine → krediiti ei vähendata enne vabanenud kohta.
7. Samaaegsed registreerimised viimasele kohale ei tohi ületada mahtu.
8. Treeningu ajalukku eemaldamine ei kustuta arvestustehinguid.
9. Keelatud kontoga klient ei saa krediiti ega registreeringuid muuta.

## 4. Varukoopiad

**Hoiatus:** Supabase'i Postgresi varukoopia ei sisalda Storage'i pildifailide
tegelikke baite. Varunda **eraldi** andmebaas ja \`wod-bank\` objektid.

Käivita käsud ainult usaldatud arvutis (mitte GitHub Actionsis ega brauseris).
Hoia varukoopia väljaspool GitHubi kataloogi, ligipääsupiirangutega ja võimalusel
krüpteeritud eemaldataval andmekandjal või turvalises pilves.

\`\`\`bash
umask 077
mkdir -p "/turvaline/varukoopiad/rcf"
export RCF_BACKUP_DIR="/turvaline/varukoopiad/rcf"
export SUPABASE_URL="https://<supabase-projekti-ref>.supabase.co"
# Teenuse võti ja DATABASE_URL: sisesta turvaliselt keskkonnamuutujatesse.
# Ära kirjuta neid lähtekoodifaili, terminali ajalooga käskudesse või dokumentatsiooni.

pg_dump --format=custom --no-owner --no-privileges \
  --dbname="$DATABASE_URL" --file="$RCF_BACKUP_DIR/full-db.dump"
pg_restore --list "$RCF_BACKUP_DIR/full-db.dump" >/dev/null
node scripts/backup-wod-storage.cjs
node -e "require('./scripts/backup-wod-storage.cjs').verifyWodBackup(process.argv[1]).then(console.log).catch(e=>{console.error(e.message);process.exitCode=1})" "$RCF_BACKUP_DIR"
\`\`\`

\`DATABASE_URL\` ja \`SUPABASE_SERVICE_ROLE_KEY\` peavad olemas olema
**ainult lokaalses serverikeskkonnas**. Kui \`pg_dump\` tööriist puudub, paigalda
sobiv PostgreSQL kliendiversioon enne varundamist.

WOD-varundaja loob \`wod-bank/\` pildifailid ja faili
\`wod-bank-manifest.json\`, kus on iga faili SHA-256 kontrollsumma.
Kui midagi ei saa alla laadida, on varundus **ebaõnnestunud** — osalist
koopiat ei tohi pidada täielikuks. Kontrolli edukal käivitusel andmebaasi
loendiga, kas kõik vajalikud fotod on kaasas.

## 5. Taastamise kontroll

Ära tee taastamisproovi ühiskasutuses olevasse Futboli tootmisandmebaasi.
Kasuta eraldatud ajutist Postgresi/Supabase'i keskkonda. Kontrolli kontode,
rollide, registreeringute, krediiditehingute ja \`wod-bank\` failide
terviklust ning testi enne päris taastamist edukaid ja keelatud tegevusi.

## 6. Vigade jälgimine

- GitHub Actions kontrollib avaliku rakenduse ressursse.
- Brauseri automaattestid peavad läbima nii Chromiumi kui WebKiti.
- Kõige põhjalikum seadme veaseire nõuab eraldi teenust nagu Sentry/PostHog,
  teenuseühendust, andmekaitse reegleid ja teavituste adressaati.
  Ära logi sinna \`access_token\`, \`refresh_token\`, kliendi e-posti,
  terviseandmeid ega WOD fotode privaatseid URL-e.

## 7. Kontroll füüsilistel telefonidel

Android Chrome'is ja iPhone Safaris kontrolli: paigaldamine avakuvale,
sisselogimine ja sessiooni taastamine, treeningule registreerimine,
õigeaegne/hiline tühistamine, push-loa küsimine ja teavituse avamine,
offline avamine ning äpi uue versiooni jõudmine vahemällu.

**Praegused Playwrighti testid ei asenda füüsilise seadme testi.**

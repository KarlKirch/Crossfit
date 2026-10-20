# CrossFit – väljalaske kontroll (samm 18, 20.10.2026)

## Automaatne kontroll

- Käivitamine: `node tests/smoke.cjs` (Node.js 22, ilma väliste sõltuvusteta).
- GitHub Actions: `.github/workflows/smoke.yml` kontrollib muudatusi pärast `main` harusse salvestamist ja pull request'idel.
- Testib JS-moodulite laadimist ja süntaksit, manifesti ja teenustöötaja viiteid, treeneri/treenija vaateid, WOD-panka, treeninguvorme ja teavitusi.
- Testid ei muuda päris Supabase'i kasutajate ega treeningute andmeid.

## Kinnitatud kontrollid

- [x] Olemasolevad 18 rakendusmoodulit laadisid koos simulatsioonis ilma veata (39 mooduli-/vaatekontrolli).
- [x] Supabase'is olid alles treeningud, registreeringud, profiilid ja 348 WOD-kirjet.
- [x] Teavituste ajastatud töö `wod-push-notifications` oli aktiivne.
- [x] Peamised kasutajaõiguste poliitikad on piiravad; kasutaja rolli ei saa oma profiili kaudu muuta.
- [x] Profiilipildi `avatar_path` välja uuendamise õigus parandatud (`authenticated` ainult `display_name` ja `avatar_path`).
- [x] GitHubi salvestatud korduv suitsutestide komplekt ja automaatkontrolli töövoog.

## Telefoni testid – vajavad päris seadmes kinnitust

Kasuta võimalusel **testkasutajat ja testtreeningut**, mitte klientide aktiivseid broneeringuid. Ära kinnita, et kõik testid on läbitud, kuni need on päriselt tehtud.

- [ ] Androidi Chrome / Samsung Internet: ava `https://karlkirch.github.io/Crossfit/`, vaata 360–430 px laiusel ning kontrolli, et puudub külgsuunas kerimine.
- [ ] iPhone'i Safari: ava sama aadress; kontrolli põhinavigatsiooni ja modaalakende sulgemist.
- [ ] Lisa rakendus avakuvale; värskenda, taaskäivita ja veendu, et uus versioon tuleb ette.
- [ ] Logi sisse meilingi / kuuekohalise koodi abil ning kontrolli väljalogimist.
- [ ] Testkontol lisa krediiti ja registreeru vabale kohale: krediiti kulub üks kord ning nimi/pilt ilmub nimekirja.
- [ ] Täis treeningu korral liitu ootenimekirjaga: krediiti ei võeta enne koha kinnitamist.
- [ ] Vabasta koht: ootenimekirjast koha saanud kasutajale tuleb teade ja krediit arvestatakse täpselt üks kord.
- [ ] Tühista enne ja pärast tasuta tühistamise piiri: kontrolli vastavat krediiditagastuse reeglit.
- [ ] Treeneri vaates loo üks 90-minutiline treening; kontrolli nädalast kordamist ning eeltäidetud WOD-i.
- [ ] Vaata WOD-pangas fotot, kuupäeva, tekstiridu, lehekülgede vahetust ja tühja automaatpealkirja; kontrolli originaalfoto säilimist.
- [ ] Laadi üles ja kärbi prooviprofiilipilt; kontrolli muutmist ja kustutamist.
- [ ] Luba telefonis push; testi päris teavituse saabumine, avamine ja treeningu link.
- [ ] Katkesta internet: kontrolli, et rakenduse kest ja olemasolevad varad laadivad; broneerimine vajab internetti.

## Teadaolevad piirangud

- Selles tööseansis ei saanud GitHub Pagesi avaldatud rakendust veebibrauseris ega päris mobiilseadmes avada.
- Automaattesti koodi salvestamine ei tõenda iseenesest GitHub Actionsi jooksu edukust; selle staatus tuleb vaadata Actionsi lehelt.
- Tõuketeadete reeglid ja ajastamine on olemas, kuid tegelikku kohaletoimetamist seadmele ei ole siin kontrollitud.
- Registreerimine kasutab serveripoolset treeningkrediiti; pangakaardi või muu rakendusesisese makselüüsi toimimist pole võimalik kinnitada, kuna senine süsteem lisab krediiti treeneri kaudu.
- Teenustöötaja salvestab rakenduse failid kasutuseks ilma võrguta, kuid andmeid vajavad toimingud eeldavad Supabase'i ühendust.

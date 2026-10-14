# Hanna HQ

GhoulHouse Oy:n sisäinen operatiivinen web-sovellus Hannalle.

## V1

- kirjautuminen sähköpostilla ja salasanalla
- Tänään / Seuraavaksi
- follow-upit: myöhässä, tänään, myöhemmin
- asiakkaat + asiakasnäkymä
- hallinnon avoimet tehtävät
- työvuoron aloitus/lopetus ja automaattinen tuntien laskenta
- viikon numerot
- Notion-integraation placeholder (`Not connected`)
- mobiili- ja desktop-navigaatio

## Käynnistys

```bash
npm install
cp .env.example .env.local
npm run dev
```

Aseta `.env.local`-tiedostoon:

```bash
VITE_SUPABASE_URL=<project url>
VITE_SUPABASE_ANON_KEY=<publishable/anon key>
```

Älä commitoi `.env`- tai `.env.local`-tiedostoja.

## Build

```bash
npm run build
```

GitHub Actions ajaa saman build-tarkistuksen pull requesteille.

## Tietokantaoletus

Sovellus odottaa Lovable-vaiheessa määriteltyjä tauluja:

- `profiles`
- `user_roles`
- `shifts`
- `opportunities`
- `projects`
- `admin_tasks`
- `weekly_metrics`
- `activities`

Sovellus käyttää Supabasea operatiivisen datan source of truthina. Notion-synkronointi ei kuulu v1:een.

## Tietoturva

Hanna HQ on sisäiseen käyttöön. Pidä RLS käytössä kaikissa tauluissa, älä käytä service-role-avainta selaimessa ja pidä tuotantorepository yksityisenä ennen oikean asiakasdatan käyttöönottoa.

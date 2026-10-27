# Kiki & Marty Party app

Een persoonlijke agenda voor twee gelijkwaardige beheerders. React, TypeScript,
Vite en Supabase. Het oude vriendenproject wordt niet gebruikt als live backend.

## Lokaal bekijken

Vereist: Node.js 22.13 of hoger en pnpm 11.25.0.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open `http://127.0.0.1:5173/`. De fictieve voorbeeldagenda staat op
`http://127.0.0.1:5173/?demo=1`. De demo verstuurt geen inlogverzoeken en bewaart
wijzigingen uitsluitend in het geheugen. Herladen wist die wijzigingen.

```sh
pnpm test
pnpm build
pnpm preview
```

De publieke Supabase URL en publishable key staan in de clientconfiguratie. Je
kunt ze lokaal overschrijven met `.env.local`, op basis van `.env.example`.
Dit zijn openbare clientgegevens. Service role keys, databasewachtwoorden en
SMTP-wachtwoorden horen uitsluitend in Supabase serversecrets.

## Opgenomen functionaliteit

- Maandkalender met dagselectie, maandnavigatie en vandaagknop.
- Activiteiten toevoegen, bewerken en verwijderen met plaats en omschrijving.
- Dagelijkse, wekelijkse en jaarlijkse reeksen in Europe/Amsterdam.
- Jaarlijkse verjaardagen na het afronden en goedkeuren van een account.
- Aanwezigheid per datum of voor een volledige reeks, met uitzonderingen per datum.
- Kiki is paars, Marty is oranje. Wanneer beiden aanwezig zijn, krijgt de
  activiteit beide kleuren. De maker blijft onveranderd bij bewerkingen.
- Inloggen met e-mail; nieuwe accounts gebruiken een bevestigingscode.
- Twee vooraf uitgenodigde e-mailadressen met gelijke beheerrechten. Het eerste
  account wordt alleen via een serveruitnodiging toegelaten; het tweede wacht
  op goedkeuring. De client kan geen leden of rollen toekennen.
- Export voor Apple/Samsung/andere agenda's als .ics; Google via ingevulde link.
- Na aanmelden wordt een exportkeuze aangeboden, voor één datum of de hele reeks.
- Import van maximaal 200 afspraken/1 MB met voorbeeld en deduplicatie.
- Google Maps zoeklink, donker/licht thema en installeerbare PWA.
- Serverwachtrij en worker voor nieuwe activiteiten, aanvragen en goedkeuringen.
  Meerdere klaarstaande activiteiten voor dezelfde ontvanger worden gebundeld.

## Gedrag en beperkingen

Exports zijn eenmalige imports. De gebruiker bevestigt het toevoegen in de eigen
agenda-app. Wijzigen of afmelden in deze app wijzigt eerder geïmporteerde afspraken
niet. Automatische Apple Agenda-synchronisatie is geen onderdeel van deze versie.
De daadwerkelijke import en installatie moeten nog op fysieke iPhones worden getest.

Herhaalreeksen hebben geen einddatum. Bewerken en verwijderen gelden voor de hele
reeks; gewijzigde tijden of herhaling wissen aanwezigheidskeuzes. Aanmelden voor
de hele reeks vervangt eerdere uitzonderingen; daarna kun je per datum afwijken.
29 februari valt in andere jaren op 28 februari. Bij een dubbel voorkomende lokale
tijd tijdens wintertijd kiezen frontend en database de latere tijd.

Import slaat externe herhaalreeksen, geannuleerde en ongeldige items over. Hele
dagen blijven hele dagen. Afspraken zonder eindtijd duren één uur; een hele dag
eindigt op de volgende lokale middernacht. Bestaande import-UIDs worden overgeslagen,
niet bijgewerkt. De import is atomair en een volledige herimport maakt geen dubbelen.

De service worker cachet alleen appbestanden, geen Supabase-responses of agenda's.
De app kan offline openen maar heeft internet nodig om persoonlijke plannen op te
halen of te wijzigen. Er wordt geen offline bewerkingswachtrij bijgehouden.
De inlogsessie wordt, zoals gebruikelijk voor deze browserapp, lokaal bewaard.

## Supabase-inrichting en status

Het aparte project `dpjhusoezovklfbzxfrc` is ingericht. De SQL-bestanden zijn als
remote migraties toegepast, in deze volgorde: `schema.sql`, `notifications.sql`,
`schedule.sql`, `mail-indexes.sql`. Voer deze niet opnieuw uit op hetzelfde project.
Persoonlijke uitnodigingen zijn uitsluitend in de private database opgeslagen.
Alle tabellen hebben RLS. Alleen ingelogde, bevestigde en goedgekeurde leden kunnen
de gedeelde gegevens lezen. Beide leden mogen alle activiteiten wijzigen.

`security-test.sql` is een integratietest voor een **lege ontwikkelomgeving**.
De test maakt fixtures en voert onboarding, toegangscontroles, import en
aanwezigheid uit binnen één transactie; alle wijzigingen worden teruggedraaid.
Voer de test niet uit op een omgeving waar de twee echte leden al bestaan.

### Nog in te stellen voor echte e-mail

Het nieuwe project neemt SMTP-instellingen en serversecrets niet over van de oude
agenda. Mailverzending is daarom nog niet geactiveerd en niet end-to-end getest.

1. Stel bij Authentication → Emails → SMTP Settings een eigen mailprovider in.
2. Gebruik voor Confirm sign up het sjabloon uit `signup-email.html`. Magic link
   or OTP blijft `{{ .ConfirmationURL }}` gebruiken voor bestaande accounts.
3. De notify-worker is gedeployd met JWT-controle. Zet in Edge Functions → Secrets:
   `AGENDA_SMTP_USER`, `AGENDA_SMTP_PASSWORD`, `AGENDA_SITE_URL` (de definitieve HTTPS
   app-URL). Optioneel: `AGENDA_SMTP_HOST` (standaard smtp.gmail.com) en
   `AGENDA_SMTP_PORT` (standaard 465). Gebruik een appwachtwoord bij Gmail.
4. Test een mail met een gecontroleerde fixture en activeer daarna
   `duo_private.delivery_settings.enabled`. De Cron-taak loopt elke minuut;
   zolang deze vlag false is, worden geen netwerkverzoeken verstuurd.

De database bepaalt ontvangers en inhoud. De worker accepteert geen adressen of
mailinhoud van de aanroeper. Mailtaken proberen maximaal vijf keer; fouten worden
na oplopende wachttijd opnieuw geprobeerd. Dagbudget: maximaal 100 claims.
Mails gaan alleen over nieuwe activiteiten, aanvragen en goedkeuringen; wijzigingen,
afgelastingen en herinneringen sturen in deze versie geen aparte mail.

### Hosting

De repository blijft privé. GitHub Pages is bij het huidige abonnement alleen
beschikbaar na openbaar maken van de repository of een betaald GitHub-abonnement.
Publiceer daarom pas nadat de gebruiker een hostingkeuze heeft gemaakt.
`pages.yml` bevat een handmatig te starten publicatieworkflow, met het juiste
repositorypad. `ci.yml` controleert tests en build op pushes en pull requests.

De Site URL staat voor lokale ontwikkeling op `http://127.0.0.1:5173/`.
Stel bij publicatie de definitieve HTTPS-URL in als Supabase Site URL én Redirect
URL, met repositorypad en afsluitende slash. Alleen daarna kloppen de inloglinks.

Op iPhone: open de HTTPS-app in Safari → Deel → Zet op beginscherm.

## Controles

- TypeScript en productiebuild, inclusief manifest en service worker.
- Tests voor wintertijd, dubbele lokale tijden, schrikkeldag, aanwezigheid per
  reeks met uitzonderingen, .ics import/export en escaping in meldingsmails.
- Transactionele databasetests voor uitnodigingen, goedkeuring, gelijke rechten,
  onveranderlijke maker, verjaardagen, onbevoegde accounts, importdeduplicatie en
  de mailwachtrij.
- Browsercontrole van toevoegen, aanwezigheid voor een reeks, exportkeuze en kleuren.
- Supabase Security Advisor: geen meldingen bij controle op 27 oktober 2026.

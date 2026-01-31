# Overzicht Achtergrondtaken (Background Functions)

Dit document beschrijft de automatische taken die draaien in de applicatie.

## 1. Algemene Planning
De taken worden getriggerd door Netlify Scheduled Functions (Cron). De frequentie is ingesteld in `netlify.toml`.

| Functie | Schema (Cron) | Tijdstip | Beschrijving |
| :--- | :--- | :--- | :--- |
| `scheduled-email` | `0 * * * *` | xx:00 | Verstuurt geplande e-mails (Baro Weerman). |
| `scheduled-your-day` | `12 * * * *` | xx:12 | Verstuurt "Jouw Dag" updates voor evenementen. |
| `scheduled-activity-planner` | `24 * * * *` | xx:24 | Verstuurt advies voor geplande activiteiten (bijv. Wandelen). |
| `scheduled-push` | `36 * * * *` | xx:36 | Verstuurt push notificaties. |
| `daily-cycling-report` | `48 * * * *` | xx:48 | Haalt koersdata uit Notion en stuurt updates. |

> **Let op:** De taken draaien elk uur, maar voeren vaak checks uit (tijdzone, planning) om te bepalen of er daadwerkelijk iets verstuurd moet worden.

---

## 2. Detailoverzicht Functies

### A. Activity Planner (`scheduled-activity-planner.js`)
*   **Doel:** Gebruikers adviseren of hun geplande activiteit (bijv. Wandelen, Fietsen) morgen door kan gaan.
*   **Trigger:** Elk uur op minuut 24.
*   **Logica:**
    1.  Checkt of het voor de gebruiker lokaal tussen **04:00 en 06:00** 's ochtends is.
    2.  Checkt of de dag van morgen is aangevinkt in de instellingen.
    3.  Haalt weerdata op voor de activiteit-locatie.
    4.  Berekent een **Score (1-10)** op basis van weerregels (regen, wind, kou).
    5.  Als Score < Minimaal Cijfer: Slaat over.
    6.  Als Credits op zijn: Slaat over.
    7.  **Actie:** Genereert een AI-bericht (Gemini) en stuurt dit via **Telegram**.
*   **Gemini Gebruik:** 1 call per bericht.
*   **Testen:** Kan handmatig getest worden met `?test=true` (slaat tijd- en datumcheck over).

### B. Daily Cycling Report (`daily-cycling-report.ts`)
*   **Doel:** Wielerfans informeren over de koersen van vandaag.
*   **Trigger:** Elk uur op minuut 48.
*   **Logica:**
    1.  Haalt koersen op uit **Notion** database voor vandaag.
    2.  **Rate Limiting:** Wacht 5 seconden tussen elke koers om Gemini niet te overbelasten.
    3.  Voor elke koers:
        *   Bepaalt locatie (soms via Gemini).
        *   Haalt weerbericht op.
        *   Genereert tekst via Gemini (per taal).
    4.  Verstuurt e-mail of Telegram naar gebruikers die dit aan hebben staan.
    5.  Verstuurt alleen tussen **07:00 en 10:00** lokale tijd gebruiker.
*   **Gemini Gebruik:** Intensief. (Aantal koersen x Aantal talen).
*   **Recent Aangepast:** Extra vertragingen toegevoegd om 'Too Many Requests' te voorkomen.

### C. Scheduled Email (`scheduled-email.js`)
*   **Doel:** Persoonlijk weerbericht per e-mail.
*   **Trigger:** Elk uur op minuut 0.
*   **Logica:**
    1.  Checkt lokale tijd gebruiker (vaak rond 07:00).
    2.  Genereert weerbericht via Gemini.
    3.  Verstuurt via Brevo (e-mail).

### D. Your Day (`scheduled-your-day.js`)
*   **Doel:** Aftellen naar specifieke events (bijv. Vakantie).
*   **Trigger:** Elk uur op minuut 12.
*   **Logica:**
    1.  Kijkt naar events in `your_day_events` collectie.
    2.  Stuurt updates op specifieke dagen voor het event (10, 7, 3, 1 dag van tevoren).

### E. Scheduled Push (`scheduled-push.js`)
*   **Doel:** Korte push notificatie op telefoon.
*   **Trigger:** Elk uur op minuut 36.
*   **Logica:**
    1.  Checkt voorkeurstijdstippen (Ontbijt, Lunch, Diner).
    2.  Genereert korte tekst via Gemini.
    3.  Verstuurt via Firebase Cloud Messaging.

---

## 3. Gemini AI Gebruik & Limieten
We gebruiken het `gemini-1.5-flash` (of vergelijkbaar) model.
*   **Rate Limits:** Er is een limiet op het aantal calls per minuut.
*   **Maatregelen:**
    *   In alle scripts is een vertraging (`setTimeout`) ingebouwd van 12 seconden (max 5 calls/minuut per script).
    *   Bij de Cycling Report is extra vertraging toegevoegd tussen de koersen.
*   **Kosten:** Elke call kost credits (intern systeem) of geld (Google Cloud indien buiten free tier).

## 4. Probleemoplossing
*   **"Ik krijg geen bericht":**
    *   Check of je **Baro Credits** hebt.
    *   Check je **Tijdzone** instelling.
    *   Check of je **Telegram ID** gekoppeld is.
    *   Voor Activity Planner: Check of de berekende score hoog genoeg is (test door drempel op 1 te zetten).
    *   **Test Modus:** Vraag de developer om een test-run te doen met `?test=true`.

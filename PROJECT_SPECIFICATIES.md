# Functionele Specificaties & Documentatie Bron - Weer Applicatie

Dit document dient als de definitieve bron voor de functionaliteiten, technische architectuur, weergaven, filters en logica van de "Edwin Weer" applicatie.

---

## 1. Inleiding
De applicatie is een geavanceerd weerplatform dat verder gaat dan standaard weersverwachtingen. Het biedt diepgaande klimatologische analyses, ensemble modelvergelijkingen, vakantieplanning op basis van historische data en gespecialiseerde rapportages (zoals Strava-integratie en Vakantie Rapporten). De applicatie is gebouwd voor zowel de casual gebruiker als de weer-enthousiasteling die ruwe modeldata wil analyseren.

---

## 2. Technische Architectuur

### Core Stack
-   **Framework:** React 19
-   **Build Tool:** Vite 6.2.0
-   **Styling:** TailwindCSS 4 (met PostCSS)
-   **Taal:** TypeScript 5.8.2

### Belangrijke Libraries
-   **Routing:** Custom implementatie via `useState` en `currentView` in `App.tsx` (Single Page Application zonder React Router).
-   **Kaarten:** `leaflet` & `react-leaflet` (Interactieve kaarten).
-   **Grafieken:** `recharts` (Geavanceerde lijngrafieken, staafdiagrammen, ensemble spaghetti-plots).
-   **Data Fetching:** Native `fetch` API via services.
-   **State Management:** React Context (`AuthContext`) en lokale state/storage services.
-   **Backend/Auth:** Firebase (versie 12.6.0).

---

## 3. Databronnen & API Integraties

De applicatie leunt zwaar op de **Open-Meteo API** familie. Er wordt geen gebruik gemaakt van mock-data; alle data is real-time of historisch accuraat.

### Endpoints
1.  **Forecast API:** `https://api.open-meteo.com/v1/forecast`
    *   Gebruikt voor: Huidig weer, uurlijkse/dagelijkse voorspellingen.
2.  **Archive API:** `https://archive-api.open-meteo.com/v1/archive`
    *   Gebruikt voor: Historische data, records, klimatologische analyses.
3.  **Ensemble API:** `https://ensemble-api.open-meteo.com/v1/ensemble`
    *   Gebruikt voor: Ensemble modellen (GFS, ECMWF, ICON, etc.) en onzekerheidsanalyses.
4.  **Seasonal API:** `https://seasonal-api.open-meteo.com/v1/seasonal`
    *   Gebruikt voor: Lange termijn seizoensverwachtingen (Vakantie view).
5.  **Gemini Service:**
    *   Gebruikt voor: AI-features zoals "Lucky City" (waarschijnlijk via een Google Gemini integratie).

### Limieten & Monitoring
-   Er is een ingebouwd monitoringssysteem (`usageService`) dat API-calls telt per minuut, uur, dag en maand.
-   **Waarschuwingen:** De gebruiker krijgt een visuele waarschuwing (gele banner) als 80% van de API-limiet is bereikt.

---

## 4. Navigatie & Hoofdstructuur

De navigatie is verdeeld in een **Bottom Navigation Bar** voor de meest gebruikte functies, een **Extra Menu** overlay voor specifieke tools, en een **Hoofdmenu** (hamburger) voor instellingen en accountbeheer.

### Views (Schermen)
1.  **Huidig (Current):** Dashboard met actuele situatie.
2.  **Vooruitzicht (Forecast):** Meerdaagse verwachting.
3.  **Ensemble:** Professionele modelvergelijkingen.
4.  **Records:** Klimatologische statistieken en extremen.
5.  **Historisch:** Terugkijken in het verleden.
6.  **Vakantie:** Planningstool o.b.v. klimaatdata.
7.  **Kaart (Map):** Geografische weergave.
8.  **Overige:** Strava, Share, Vakantie Rapport, Team, Pricing, Info, Model Info.

---

## 5. Gedetailleerde Functionaliteiten per View

### A. Huidig Weer (`CurrentWeatherView`)
Het startscherm van de applicatie.
*   **Locatie:** Toont huidige stad + land. Klikken opent een zoekfunctie (met reverse geocoding).
*   **Header Data:**
    *   Temperatuur (groot weergegeven).
    *   Weericoon (dynamisch o.b.v. WMO codes).
    *   Gevoelstemperatuur / Heat Index.
    *   Min/Max temperatuur van de dag.
*   **Grid Details:**
    *   Wind: Snelheid (km/u, m/s, bft, mph, knots) + Richting (pijl rotatie).
    *   Neerslag: Hoeveelheid (mm/inch) + Kans (%).
    *   Luchtdruk: hPa/inHg.
    *   Zon & Maan: Zonsopkomst/ondergang tijden + Maanfase (tekst & icoon).
*   **Waarschuwingen:**
    *   *Vorstwaarschuwing:* Indien temp < 0°C in de komende 48u.
    *   *Regenwaarschuwing:* "Regen verwacht over X uur (Y mm)".
*   **Grafiek:** Een `AreaChart` die het temperatuurverloop van de komende uren toont.
*   **Lokale Tijd:** Toont de tijd op de gezochte locatie (houdt rekening met tijdzones).

### B. Vooruitzicht (`ForecastWeatherView`)
Detailpagina voor de komende dagen.
*   **Bereik:** Standaard 3 dagen, uitbreidbaar (via "Laad meer" of scroll) tot 7-14 dagen.
*   **Weergave Modi (`viewMode`):**
    *   *Graph:* Grafische weergave van temperatuur en neerslag.
    *   *Expanded:* Uitgeklapte kaarten per dag met gedetailleerde metrics.
    *   *Compact:* Lijstweergave voor snel overzicht.
*   **Activiteiten (`activitiesMode`):**
    *   Toont iconen of kleuren (groen/oranje/rood) die aangeven of het weer geschikt is voor specifieke activiteiten (BBQ, Fietsen, Hardlopen, etc.).
    *   Filter: 'none', 'positive' (alleen goede dagen), 'all'.
*   **Trend Pijlen:** Visuele indicatie of de temperatuur stijgt of daalt t.o.v. de vorige dag.

### C. Records & Statistieken (`RecordsWeatherView`)
Een krachtige analysetool voor klimatologische data van de locatie.
*   **Data:** Haalt historische data op (sinds 1940 of beschikbaarheid).
*   **Jaarstatistieken (Tellers):**
    *   Warme dagen (>20°C), Zomerse dagen (>25°C), Tropische dagen (>30°C).
    *   Vorstdagen (<0°C min), IJsdagen (<0°C max).
    *   Droge dagen, Regendagen (>1mm), Zware regen (>10mm).
    *   Zonnige dagen, Sombere dagen.
*   **Reeksen (Streaks):**
    *   Langste hittegolf, langste droge periode, langste periode met regen.
    *   "Nice streak": Aaneengesloten dagen met 'mooi weer'.
*   **Extremen:**
    *   Grootste temperatuurstijging in 24 uur.
    *   Grootste temperatuurdaling in 24 uur.
*   **Maandoverzicht:** Tabel/Grid met records per maand (Natste januari ooit, Warmste juli ooit, etc.).

### D. Ensemble Modellen (`EnsembleWeatherView`)
Voor de professionele gebruiker die onzekerheid in verwachtingen wil zien.
*   **Model Selectie:** Ondersteunt ~14 modellen waaronder:
    *   ICON (Seamless, Global, EU, D2, CH1)
    *   GFS (Seamless, 0.25, 0.5)
    *   ECMWF (IFS 0.25, AIFS 0.25)
    *   GEM Global, BOM ACCESS, UK MetOffice.
*   **Weergave Modi:**
    *   *Spaghetti Plot (All):* Toont alle 20-50 lijnen (members) van het ensemble.
    *   *Main/Control:* Toont alleen de hoofdrun.
    *   *Avg/Spread:* Toont gemiddelde lijn met een schaduwgebied voor de standaarddeviatie (onzekerheid).
    *   *Density:* Waarschijnlijkheidsverdeling.
*   **Vergelijking (Comparison Mode):** Mogelijkheid om meerdere modellen (bijv. GFS vs ECMWF) over elkaar te leggen in één grafiek.
*   **Variabelen:** Wisselen tussen Temperatuur (2m), Neerslag, Wind, Luchtdruk, etc.
*   **Pro Mode:** Ontsluit extra variabelen en instellingen.

### E. Vakantie Weer (`HolidayWeatherView`)
Helpt bij het plannen van een vakantie op basis van historische waarschijnlijkheid.
*   **Selectie:** Gebruiker kiest een weeknummer.
*   **Logica:**
    *   *Korte termijn:* Gebruikt actuele voorspelling (Forecast API).
    *   *Lange termijn:* Gebruikt `Seasonal API` en `Historical API` om een statistische verwachting te genereren.
*   **Output:**
    *   Gemiddelde maximum/minimum temperatuur voor die week (gebaseerd op afgelopen 30 jaar).
    *   Neerslagkans en gemiddelde hoeveelheid.
    *   Zonuren per dag.
    *   "Is dit een goede week?" advies.
*   **Grafieken:** Vergelijking van deze week over de afgelopen jaren.

### F. Overige Views
*   **Kaart (`MapView`):** Interactieve kaartlagen (Temperatuur, Neerslag, Wolken, Wind).
*   **Strava (`StravaWeatherView`):** Specifieke weeranalyse voor hardlopers/fietsers (wind mee/tegen, gevoelstemperatuur tijdens inspanning).
*   **Share (`ShareWeatherView`):** Genereert een deelbaar plaatje van het huidige weer (overlay op foto).
*   **Holiday Report:** Uitgebreid PDF-achtig rapport van de gekozen vakantieperiode.
*   **Historisch (`HistoricalWeatherView`):** Kalenderselectie om het weer van een specifieke dag in het verleden te bekijken.

---

## 6. Instellingen & Personalisatie

De applicatie slaat voorkeuren lokaal op (`localStorage`).

*   **Taal:** Nederlands (NL) en Engels (EN).
*   **Thema:** Light Mode, Dark Mode, of Systeem voorkeur.
*   **Eenheden:**
    *   Temperatuur: Celsius (°C), Fahrenheit (°F).
    *   Wind: km/u, m/s, Beaufort (bft), mph, knopen.
    *   Neerslag: Millimeter (mm), Inch.
    *   Luchtdruk: hPa, inHg.
    *   Tijdformaat: 12u / 24u.
*   **Locatie:** Laatst gekozen locatie wordt onthouden.

---

## 7. Logica & Algoritmes

*   **Maanstand:** Wordt berekend o.b.v. de datum via een astronomische formule (geen API call).
*   **Activiteitsscores:** Een algoritme bepaalt of weer geschikt is voor een activiteit.
    *   *Voorbeeld BBQ:* Temp > 18°C, Neerslag < 0.5mm, Wind < 4 Bft.
*   **Beaufort Conversie:** Formule om windsnelheid (km/u) om te rekenen naar Bft schaal (0-12).
*   **Moon Phase Icon:** Mapt de berekende fase (0-1) naar specifieke iconen (new moon, waxing crescent, full moon, etc.).
*   **WMO Codes:** Uitgebreide mapping van WMO weercodes (0-99) naar tekst (NL/EN) en weer-iconen (sunny, cloudy, rainy, snow, thunderstorm).

---

## 8. UX & Design Details

*   **Animaties:** Subtiele transities bij navigeren.
*   **Loading States:** Spinners en skeleton loaders bij data ophalen.
*   **Error Handling:** Duidelijke foutmeldingen ("Kan weerdata niet ophalen") i.p.v. crashende schermen.
*   **Responsive:** Volledig geoptimaliseerd voor mobiel gebruik, maar schaalt mee naar desktop (sidebar/menu gedrag).
*   **Touch:** Swipe gestures in grafieken en carousels.

---

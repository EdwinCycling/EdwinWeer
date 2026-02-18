# Beat Baro - Technical Documentation

## 1. Introductie
"Beat Baro" is een weervoorspellingsspel binnen de Baro-applicatie. Gebruikers (spelers) proberen de weersvoorspelling van "Baro" (de AI) te verslaan door de maximum- en minimumtemperatuur voor een specifieke stad op een specifieke zondag nauwkeuriger te voorspellen.

## 2. Spelmechanisme
- **Rondes:** Het spel werkt in rondes. Elke ronde is gekoppeld aan een specifieke stad en een datum (altijd een zondag).
- **Voorspellingen:** Spelers doen een voorspelling (bet) voor de `max` en `min` temperatuur.
- **Baro's Rol:** Baro doet ook een voorspelling (`baroPrediction`).
- **Puntentelling:** Na afloop worden de voorspellingen vergeleken met de werkelijke weerdata (`actualResult`). De score wordt berekend op basis van de afwijking (deviatie). Er zijn leaderboards voor totaal, jaar, kwartaal en maand.

## 3. Database Structuur (Firestore)

De data is opgeslagen in Google Firestore. Hieronder volgen de belangrijkste collecties en hun schema's.

### 3.1 Collectie: `game_rounds`
Deze collectie bevat alle speelrondes.

**Document ID:** `roundId` (automatisch gegenereerd)

**Velden:**
| Veld | Type | Beschrijving |
|---|---|---|
| `id` | String | De unieke ID van de ronde. |
| `status` | String | Status van de ronde: `'open'`, `'locked'`, `'completed'`, `'scheduled'`. |
| `city` | Object | Locatiegegevens van de stad. |
| `city.name` | String | Naam van de stad (bijv. "Parijs"). |
| `city.lat` | Number | Breedtegraad. |
| `city.lon` | Number | Lengtegraad. |
| `city.country` | String | Landcode/naam. |
| `targetDate` | String | ISO datum string van de zondag waarvoor voorspeld wordt (bijv. "2023-10-29"). |
| `baroPrediction` | Object | De voorspelling van Baro. |
| `baroPrediction.max` | Number | Baro's max temperatuur. |
| `baroPrediction.min` | Number | Baro's min temperatuur. |
| `actualResult` | Object | (Alleen bij status 'completed') Het werkelijke weer. |
| `actualResult.max` | Number | Werkelijke max temperatuur. |
| `actualResult.min` | Number | Werkelijke min temperatuur. |
| `resultsProcessed` | Boolean | `true` als de punten zijn berekend en toegekend. |
| `createdAt` | Timestamp | Aanmaakdatum van de ronde. |

### 3.2 Sub-collectie: `bets`
Elk document in `game_rounds` heeft een sub-collectie `bets` met de voorspellingen van gebruikers.

**Pad:** `game_rounds/{roundId}/bets/{userId}`
**Document ID:** `userId` (De UID van de gebruiker)

**Velden:**
| Veld | Type | Beschrijving |
|---|---|---|
| `userId` | String | De unieke ID van de gebruiker. |
| `userName` | String | De gekozen spelersnaam van de gebruiker. |
| `prediction` | Object | De voorspelling van de gebruiker. |
| `prediction.max` | Number | Voorspelde max temperatuur. |
| `prediction.min` | Number | Voorspelde min temperatuur. |
| `timestamp` | Number | Tijdstip van indienen (epoch ms). |

### 3.3 Collectie: `leaderboards`
Houdt de scores bij. Er zijn verschillende documenten voor verschillende periodes.

**Document IDs:**
- `all_time`: Totaalscore.
- `YYYY`: Jaarscore (bijv. `2024`).
- `YYYY_QX`: Kwartaalscore (bijv. `2024_Q1`).
- `YYYY_MM`: Maandscore (bijv. `2024_01`).

**Sub-collectie: `entries`**
Elk leaderboard document heeft een sub-collectie `entries`.

**Pad:** `leaderboards/{periodId}/entries/{userId}`

**Velden:**
| Veld | Type | Beschrijving |
|---|---|---|
| `userId` | String | De UID van de gebruiker. |
| `name` | String | De spelersnaam. |
| `score` | Number | Totaal aantal punten in deze periode. |

## 4. Game Lifecycle (Workflow)

1.  **Aanmaken (Scheduled/Open):**
    - Een admin (of automatisch script) maakt een nieuwe ronde aan in `game_rounds`.
    - `status` wordt gezet op `'open'`.
    - `city` en `targetDate` worden gekozen.
    - `baroPrediction` wordt berekend en opgeslagen.

2.  **Spelen (Open):**
    - Gebruikers kunnen voorspellingen doen via de app.
    - Voorspellingen worden opgeslagen in de `bets` sub-collectie.

3.  **Sluiten (Locked):**
    - Op een bepaald moment (meestal maandagochtend voor de volgende zondag) sluit de inschrijving.
    - `status` verandert naar `'locked'`.
    - Gebruikers kunnen niet meer inzenden of wijzigen.

4.  **Afronden (Completed):**
    - Na de zondag (bijv. maandagochtend) wordt het werkelijke weer opgehaald.
    - Het veld `actualResult` wordt gevuld in de ronde.
    - `status` verandert naar `'completed'`.
    - Een script berekent de scores voor alle `bets` in deze ronde en update de `leaderboards`.
    - `resultsProcessed` wordt op `true` gezet.

## 5. Admin Module Functionaliteiten
Voor de Admin Module die je wilt bouwen, zijn dit de kernfuncties die nodig zijn:

1.  **Rondes Beheren:**
    - **Lijstweergave:** Zie alle rondes gesorteerd op datum.
    - **Aanmaken:** Handmatig een nieuwe ronde toevoegen (Stad kiezen, Datum kiezen, Baro voorspelling invullen).
    - **Bewerken:** Een foutje in een ronde corrigeren (bijv. datum of stad).
    - **Verwijderen:** Een ronde verwijderen (pas op met bestaande bets!).

2.  **Wedstrijdbeheer (Lifecycle):**
    - **Lock Round:** Handmatig een ronde sluiten als de automatische job faalt.
    - **Complete Round:** Handmatig de uitslag (`actualResult`) invoeren als de API faalt.

3.  **Spelersbeheer:**
    - **Bets inzien:** Zien wie er op een ronde heeft gewed.
    - **Username moderatie:** Ongepaste namen wijzigen of verwijderen (via `users` collectie en `usernames` collectie).

4.  **Resultaten Verwerken:**
    - Een knop om de puntentelling (her)uit te voeren voor een afgeronde ronde (nuttig bij correcties).

## 6. Validatie & Regels
Bij het bouwen van de admin module, houd rekening met de volgende regels die in de huidige app gelden:

- **Gebruikersnamen:**
  - Minimaal 5 tekens, maximaal 25.
  - Alleen letters en cijfers (en spaties/sterretjes voor anonimisering).
  - Geen scheldwoorden (profanity filter).
  - Mag niet het woord "Baro" bevatten.
  - Uniek (gecontroleerd via `usernames` collectie).

- **Puntentelling (Deviatie):**
  - De score wordt bepaald door de afwijking: `abs(voorspeld.max - werkelijk.max) + abs(voorspeld.min - werkelijk.min)`.
  - Hoe lager de score, hoe beter.
  - Bij gelijke stand telt eerst de laagste `max` afwijking, dan de `min` afwijking.


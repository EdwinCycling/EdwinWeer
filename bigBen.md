# Specificatie: Big Ben SVG Klok (Elizabeth Tower)

Dit document dient als blauwdruk voor het bouwen van een historisch accurate SVG-reproductie van de wijzerplaat van de Elizabeth Tower (Big Ben), inclusief functionele wijzers die de huidige tijd weergeven.

## 1. Algemene Architectuur
*   **Framework:** React (Functionele componenten).
*   **Styling:** Tailwind CSS voor de wrapper, Inline SVG attributen voor de grafische elementen.
*   **Rendering:** Alle elementen moeten vector-gebaseerd zijn (SVG) voor scherpte op elke resolutie.
*   **Lettertypes:**
    *   Cijfers: 'Cinzel' of een vergelijkbaar serif font met klassieke Romeinse uitstraling.
    *   Inscriptie: 'UnifrakturMaguntia' of een zwaar Gotisch lettertype.

## 2. Visuele Opbouw (Achtergrond & Frame)
De klok moet opgebouwd zijn uit lagen (z-index via SVG volgorde):

1.  **Achtergrond Toren:** Kalksteen textuur (gradients van `#E6D6AA` naar `#C4A968`).
2.  **Omlijsting:**
    *   Gotische ornamenten in de hoeken (goudkleurig filigraanwerk).
    *   Een zwaar, vierkant gietijzeren frame (Zwart/Donkergrijs).
    *   Verticale vergulde strips aan de flanken.
3.  **De Wijzerplaat (Dial):**
    *   **Buitenrand:** Dikke vergulde ringen.
    *   **Cijferring:** Wit opaalglas effect.
    *   **Cijfers:** Romeinse cijfers (I t/m XII). *Let op: De IV moet als 'IV' geschreven worden, niet als 'IIII', en alle cijfers staan rechtop of radiaal georiënteerd volgens de Big Ben conventie.*
    *   **Centrum:** Een "Rose Window" patroon. Een complex geometrisch raster van goud op een iets donkerdere achtergrond.
4.  **Inscriptie:** Onder de klok moet de tekst staan: *DOMINE SALVAM FAC REGINAM NOSTRAM VICTORIAM PRIMAM* (Goud op zwart).

## 3. Specificatie van de Wijzers (The Clock Hands)

Dit is het meest kritieke detail voor realisme. De wijzers van de Big Ben zijn uniek in ontwerp.

### 3.1 Het Uiterlijk (Visual Design)
De wijzers zijn **niet** simpele rechthoeken. Ze moeten de Victoriaanse neogotische stijl volgen.

*   **Kleurstelling:** De wijzers zijn origineel "Prussian Blue" (vrijwel zwart/donkerblauw) met vergulde accenten.
*   **De Uurwijzer (Korte wijzer):**
    *   **Vorm:** Breed en zeer decoratief. Het lijkt op een Gotisch venster of trellis-werk.
    *   **Detail:** De basis is breed en versmalt naar een punt die lijkt op een schoppenaas (hartvormig met punt). Het binnenwerk is open (skeletachtig) met gouden randen.
    *   **Lengte:** Reikt net tot aan de binnenkant van de Romeinse cijfers.
*   **De Minuutwijzer (Lange wijzer):**
    *   **Vorm:** Slank en taps toelopend.
    *   **Detail:** Heeft een duidelijke bolvormige verdikking (contragewicht) vlakbij de as, en loopt dan zeer dun uit naar de tip. De tip zelf is vaak verguld.
    *   **Lengte:** Reikt exact tot over de minuutmarkeringen aan de buitenste rand.
    *   **Staart:** De minuutwijzer heeft een korte decoratieve "staart" die voorbij het middelpunt steekt (contragewicht).

### 3.2 Positionering & Logica (Logic)
De wijzers moeten in het exacte midden van de SVG cirkel geplaatst worden (coördinaten `cx`, `cy`).

*   **Rotatie Origin:** Het draaipunt (`transform-origin`) moet exact in het midden van de 'as' van de wijzer liggen.
*   **Berekening:**
    *   Haal de lokale tijd op (`new Date()`).
    *   **Uurwijzer Rotatie:** `(uren % 12 + minuten / 60) * 30` graden. (De wijzer moet vloeiend tussen de uren bewegen).
    *   **Minuutwijzer Rotatie:** `minuten * 6` graden. (Seconden kunnen genegeerd worden of optioneel toegevoegd voor vloeiende beweging).
*   **Implementatie:** Gebruik SVG `transform="rotate(DEGREES cx cy)"`.

## 4. Kleurenpalet (Referentie)

*   `stoneLight`: #E6D6AA
*   `stoneDark`: #C4A968
*   `gold`: #E5C100 (Accent)
*   `goldDark`: #B8860B (Schaduw/Rand)
*   `handBlue`: #0f172a (Donkerblauw/Zwart metaal voor de wijzers)
*   `black`: #111111

## 5. Technische Eisen
*   Gebruik `useEffect` om de tijd elke seconde (of minuut) bij te werken.
*   Zorg dat de SVG responsive is (`viewBox="0 0 500 800"`).
*   Voeg een subtiele `drop-shadow` toe aan de wijzers zodat ze optisch "boven" de wijzerplaat zweven.

## 6. Weerdata & Leesbaarheid
*   **Locatie:** De weerinformatie (icoon + temperatuur) wordt weergegeven op de dikke gouden buitenrand van de klok.
*   **Uurvakken:** Voor elk uur (1 t/m 12) wordt de data getoond die overeenkomt met dat uur in het huidige dagdeel (AM/PM).
*   **Oriëntatie:** De weericonen en de temperatuurtekst moeten **altijd horizontaal** weergegeven worden (rechtopstaand). Ze mogen **niet** met de klok mee roteren. Dit is cruciaal voor de leesbaarheid.
*   **Interactie:** De elementen moeten klikbaar zijn voor meer details.

## 7. Geluid & Audio (Chimes)
*   **Trigger:** Op het moment dat de minuten op `00` springen (het hele uur), moet het geluid van de Big Ben (Westminster Chimes) afspelen.
*   **Bron:** Gebruik een authentiek geluidsbestand (bijv. via Wikimedia Commons OGG/MP3) van de 12 slagen.
*   **Browser Policy:** Omdat browsers autoplay met geluid vaak blokkeren, moet er een **Mute/Unmute knop** in de interface aanwezig zijn (bijvoorbeeld in de hoek van de SVG). Standaard staat het geluid 'uit' (muted) of moet de gebruiker eerst klikken om te activeren.
*   **Logica:** Zorg dat het geluid maar één keer per uur wordt getriggerd en niet in een loop blijft hangen zolang de minuut op 0 staat.

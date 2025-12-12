
import { WeatherData, ActivityType } from "../types";

export interface ActivityScore {
    score10: number; // 1-10
    stars: number;   // 0.5-5
    text: string;    // Main reason for penalty
    reasons: string[]; // All reasons
}

export interface ActivityWeatherData {
    tempFeelsLike: number; // Celsius
    windKmh: number;       // km/h
    precipMm: number;      // mm
    precipProb: number;    // %
    gustsKmh: number;      // km/h
    weatherCode: number;   // WMO code
    sunChance: number;     // % (0-100)
    cloudCover: number;    // % (0-100)
    visibility: number;    // meters
    kpIndex?: number;      // 0-9
    moonPhaseText?: string; // e.g. 'Nieuwe Maan'
    humidity?: number;     // %
    precip24h?: number;    // mm (past 24h)
}

export const calculateActivityScore = (w: ActivityWeatherData, activity: ActivityType): ActivityScore => {
    let score = 10;
    let reasons: string[] = [];

    const penalize = (points: number, reason: string) => {
        if (points > 0) {
            score -= points;
            reasons.push(reason);
        }
    };

    switch (activity) {
        case 'bbq':
            // BBQ / Terrasje (Focus: Temperatuur & Droog)
            // 1. Neerslag
            if (w.precipProb > 30) penalize(5, "Te veel kans op regen");
            if (w.precipMm > 0.1) penalize(8, "Regen");

            // 2. Temperatuur (Gevoel)
            if (w.tempFeelsLike < 0) penalize(10, "Vrieskou");
            else if (w.tempFeelsLike < 5) penalize(9, "Veel te koud");
            else if (w.tempFeelsLike < 10) penalize(8, "Te koud");
            else if (w.tempFeelsLike < 15) penalize(5, "Jas nodig");
            else if (w.tempFeelsLike < 19) penalize(2, "Frisjes");
            else if (w.tempFeelsLike > 35) penalize(4, "Veel te heet");
            else if (w.tempFeelsLike > 30) penalize(2, "Te heet");
            
            // 3. Wind
            if (w.windKmh > 49) penalize(6, "Stormachtig");
            else if (w.windKmh > 38) penalize(4, "Harde wind");
            else if (w.windKmh > 28) penalize(2, "Hinderlijke wind");
            else if (w.windKmh > 19) penalize(1, "Matige wind");
            break;

        case 'cycling':
            // Fietsen (Focus: Wind & Droog)
            // 1. Wind
            if (w.windKmh > 49) penalize(9, "Stormachtig");
            else if (w.windKmh > 39) penalize(8, "Te harde wind");
            else if (w.windKmh > 29) penalize(4, "Zware tegenwind");
            else if (w.windKmh > 19) penalize(2, "Merkbare wind");
            
            if (w.gustsKmh > 75) penalize(5, "Gevaarlijke windstoten");
            else if (w.gustsKmh > 60) penalize(3, "Harde windstoten");

            // 2. Neerslag
            if (w.precipMm > 0.1) {
                // Veel strengere straf voor neerslag bij fietsen
                const rainPenalty = Math.min(9, Math.ceil(w.precipMm * 2) + 2);
                penalize(rainPenalty, "Kans op regen");
            }

            // 3. Temperatuur (Gevoel)
            if (w.tempFeelsLike < 0) penalize(7, "Extreem koud");
            else if (w.tempFeelsLike < 5) penalize(5, "Erg koud");
            else if (w.tempFeelsLike < 10) penalize(2, "Koud");
            
            if (w.tempFeelsLike > 32) penalize(5, "Veel te warm voor inspanning");
            else if (w.tempFeelsLike > 28) penalize(3, "Te warm voor inspanning");
            break;

        case 'walking':
            // Wandelen (Focus: Droog)
            // 1. Neerslag
            if (w.precipProb > 40) penalize(4, "Kans op regen");
            if (w.precipMm > 0.5) penalize(6, "Regenachtig");

            // 2. Wind
            if (w.windKmh > 75) penalize(10, "Storm"); // > 9 Bft
            else if (w.windKmh > 61) penalize(8, "Gevaarlijke wind"); // > 7 Bft
            else if (w.windKmh > 49) penalize(5, "Zeer harde wind"); // > 6 Bft
            else if (w.windKmh > 38) penalize(2, "Harde wind"); // > 5 Bft

            // 3. Temperatuur (Gevoel)
            if (w.tempFeelsLike < 0) penalize(5, "Vrieskou");
            else if (w.tempFeelsLike < 5) penalize(3, "Erg koud");
            else if (w.tempFeelsLike < 10) penalize(1, "Fris");
            
            if (w.tempFeelsLike > 32) penalize(5, "Veel te warm");
            else if (w.tempFeelsLike > 28) penalize(3, "Te warm");

            // 4. Zon
            if (w.sunChance < 20) penalize(2, "Te weinig zon");
            else if (w.sunChance > 60 && score < 10) {
                 // Bonus voor lekker weer (als er niet al te veel strafpunten zijn)
                 score += 1;
            }
            break;

        case 'sailing':
            // Zeilen / Watersport (Focus: Wind & Zicht)
            // 1. Wind
            if (w.windKmh < 6) penalize(6, "Te weinig wind"); // 0-1 Bft
            else if (w.windKmh < 12) penalize(2, "Weinig wind"); // 2 Bft
            // 3-4 Bft (12-28) is ideal -> 0 penalty
            else if (w.windKmh >= 29 && w.windKmh <= 38) penalize(1, "Stevige wind"); // 5 Bft
            else if (w.windKmh >= 39 && w.windKmh <= 49) penalize(4, "Zware wind"); // 6 Bft
            else if (w.windKmh > 49) penalize(9, "Storm op water"); // > 7 Bft

            // 2. Gevaar (Onweer)
            const isThunderstorm = [95, 96, 99].includes(w.weatherCode);
            if (isThunderstorm) {
                score = 1;
                reasons.push("Gevaar: Onweer");
            }

            // 3. Temperatuur
            if (w.tempFeelsLike < 0) penalize(10, "Water bevroren / Vrieskou");
            else if (w.tempFeelsLike < 5) penalize(7, "Erg koud op water");
            else if (w.tempFeelsLike < 10) penalize(4, "Koud op water");
            else if (w.tempFeelsLike < 12) penalize(3, "Fris op water");
            break;

        case 'running':
            // Hardlopen 🏃
            // Focus: Thermoregulatie.
            // 1. Temperatuur
            if (w.tempFeelsLike > 30) penalize(8, "Gevaarlijke hitte");
            else if (w.tempFeelsLike > 25) penalize(6, "Hittestress risico");
            else if (w.tempFeelsLike > 20) penalize(3, "Eigenlijk te warm");
            else if (w.tempFeelsLike > 15) penalize(1, "Iets te warm");
            
            if (w.tempFeelsLike < 0) penalize(4, "Koud aan longen / gladheid");
            else if (w.tempFeelsLike < 5) penalize(2, "Erg koud");
            else if (w.tempFeelsLike < 10) penalize(1, "Koud");

            // 2. Luchtvochtigheid
            if (w.humidity && w.humidity > 85 && w.tempFeelsLike > 20) {
                 penalize(2, "Benauwd, zweet verdampt niet");
            }

            // 3. Wind
            if (w.windKmh > 61) penalize(7, "Takken op de weg / Gevaarlijk"); // > 7 Bft
            else if (w.windKmh > 49) penalize(5, "Harde tegenwind"); // > 6 Bft
            else if (w.windKmh > 29) penalize(3, "Zwaar ploegen"); // > 5 Bft

            // 4. Neerslag
            if (w.precipMm > 3.0) penalize(5, "Doorweekt");
            else if (w.precipMm > 1.0) penalize(2, "Natte schoenen / schuren");
            break;

        case 'beach':
            // Strand & Zonnen 🏖️
            // Focus: Comfort in rust.
            // 1. Temperatuur
            if (w.tempFeelsLike < 10) penalize(10, "Veel te koud");
            else if (w.tempFeelsLike < 15) penalize(9, "Te koud voor strand");
            else if (w.tempFeelsLike < 18) penalize(7, "Nog te fris");
            else if (w.tempFeelsLike < 22) penalize(4, "Frisjes");
            else if (w.tempFeelsLike < 25) penalize(1, "Prima");

            // 2. Bewolking (Cloud Cover)
            if (w.cloudCover > 80) penalize(8, "Geen zon = niet zonnen");
            else if (w.cloudCover > 40) penalize(4, "Te vaak wolk voor de zon");

            // 3. Wind
            if (w.windKmh > 38) penalize(7, "Zandstormpje");
            else if (w.windKmh > 28) penalize(5, "Zandhappen"); // > 4 Bft
            else if (w.windKmh > 19) penalize(2, "Fris als je uit zee komt"); // > 3 Bft

            // 4. Neerslag
            if (w.precipProb > 30) penalize(6, "Risico dat je spullen nat worden");
            break;

        case 'gardening':
            // Tuinieren 🌻
            // Focus: Werkbaarheid.
            // 1. Neerslag
            if (w.precipMm > 0.5) penalize(8, "In de regen werken is niks");
            if (w.precip24h && w.precip24h > 10) penalize(3, "Bodem is modderig/zwaar");

            // 2. Temperatuur
            if (w.tempFeelsLike < 0) penalize(9, "Grond is te hard/bevroren");
            else if (w.tempFeelsLike < 5) penalize(6, "Te koud voor tuinieren");
            else if (w.tempFeelsLike < 8) penalize(3, "Koud aan de handen");
            else if (w.tempFeelsLike < 10) penalize(1, "Fris");
            
            if (w.tempFeelsLike > 32) penalize(6, "Veel te heet");
            else if (w.tempFeelsLike > 28) penalize(4, "Te heet voor fysiek werk");

            // 3. Wind
            if (w.windKmh > 49) penalize(6, "Schade aan planten");
            else if (w.windKmh > 38) penalize(4, "Harde wind");
            else if (w.windKmh > 29) penalize(3, "Hoge planten waaien kapot"); // > 5 Bft
            break;

        case 'stargazing':
            // Sterrenkijken 🔭
            // Focus: Zichtbaarheid.
            // 1. Bewolking
            if (w.cloudCover > 75) penalize(9, "Je ziet niets");
            else if (w.cloudCover > 25) penalize(6, "Te veel storing");
            else if (w.cloudCover > 10) penalize(2, "Af en toe een wolk");
            
            // 2. Zicht (Visibility)
            if (w.visibility < 5000) penalize(8, "Atmosfeer is niet transparant");

            // 3. Neerslag
            if (w.precipMm > 0) penalize(10, "Telescoop mag niet nat worden");

            // 4. Temperatuur
            if (w.tempFeelsLike < 0) penalize(4, "Koud om stil te staan");
            else if (w.tempFeelsLike < 5) penalize(2, "Erg fris");
            else if (w.tempFeelsLike < 10) penalize(1, "Jas aan");

            // 5. Wind
            if (w.windKmh > 29) penalize(5, "Telescoop trilt");
            else if (w.windKmh > 19) penalize(3, "Beeld onrustig");

            // Bonus: Maan
            if (w.moonPhaseText === 'Nieuwe Maan' || w.moonPhaseText === 'New Moon') {
                score += 1;
            }
            break;

        case 'golf':
            // Golf ⛳
            // Focus: Balvlucht en Baanconditie.
            // 1. Wind
            if (w.windKmh > 49) penalize(8, "Onspeelbaar"); // > 6 Bft
            else if (w.windKmh > 29) penalize(5, "Moeilijk spelen"); // > 5 Bft
            else if (w.windKmh > 19) penalize(2, "Invloed op de bal"); // > 3 Bft

            // 2. Neerslag
            if (w.precipMm > 0.2) penalize(4, "Natte grips, bal rolt niet");
            
            // 3. Onweer
            if ([95, 96, 99].includes(w.weatherCode) || w.precipProb > 15) { // "Onweerskans" often correlates with high precipProb + code, using simplified check
                // If strictly lightning code:
                 if ([95, 96, 99].includes(w.weatherCode)) {
                    score = 1;
                    reasons.push("Levensgevaarlijk (onweer)");
                 }
            }

            // 4. Temperatuur
            if (w.tempFeelsLike < 0) penalize(6, "Baan bevroren");
            else if (w.tempFeelsLike < 5) penalize(3, "Bal is hard, handen koud");
            else if (w.tempFeelsLike < 10) penalize(1, "Fris");
            
            if (w.tempFeelsLike > 30) penalize(2, "Warm om 18 holes te lopen");
            break;

        case 'drone':
            // Drone Vliegen 🚁
            // Focus: Apparatuur Veiligheid.
            // 1. Neerslag
            if (w.precipMm > 0) {
                score = 1; // "Instant Kill" roughly translates to lowest score
                reasons.push("Elektronica kan niet tegen water");
            }

            // 2. Windstoten
            if (w.gustsKmh > 60) penalize(9, "Crash garantie");
            else if (w.gustsKmh > 45) penalize(7, "Hoog risico op Fly-away");
            else if (w.gustsKmh > 30) penalize(3, "Drone wordt instabiel");

            // 3. Zicht
            if (w.visibility < 2000) penalize(6, "Geen Line of Sight");

            // 4. Temperatuur
            if (w.tempFeelsLike < 0) penalize(4, "LiPo accu's lopen zeer snel leeg");
            else if (w.tempFeelsLike < 5) penalize(2, "Accu prestaties minder");

            // 5. Kp-index
            if (w.kpIndex && w.kpIndex > 5) penalize(2, "Geomagnetische storm (GPS storing)");
            break;
    }

    score = Math.max(1, Math.min(10, score));

    return {
        score10: score,
        stars: score / 2,
        text: reasons.length > 0 ? reasons[0] : "Perfecte omstandigheden!",
        reasons
    };
};

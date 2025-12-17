
import { WeatherData, ActivityType, AppLanguage } from "../types";
import { getTranslation } from "./translations";

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

export const calculateActivityScore = (w: ActivityWeatherData, activity: ActivityType, lang: AppLanguage = 'nl'): ActivityScore => {
    let score = 10;
    let reasons: string[] = [];

    const penalize = (points: number, reasonKey: string) => {
        if (points > 0) {
            score -= points;
            reasons.push(getTranslation(reasonKey, lang));
        }
    };

    switch (activity) {
        case 'bbq':
            // BBQ / Terrasje (Focus: Temperatuur & Droog)
            // 1. Neerslag
            if (w.precipMm > 0.1 || w.precipProb > 30) penalize(8, 'reason.rain');

            // 2. Temperatuur (Gevoel)
            if (w.tempFeelsLike < 10) penalize(8, 'reason.too_cold');
            else if (w.tempFeelsLike < 15) penalize(5, 'reason.coat_needed');
            else if (w.tempFeelsLike < 20) penalize(2, 'reason.chilly');
            
            if (w.tempFeelsLike > 30) penalize(2, 'reason.too_hot');
            
            // 3. Wind
            if (w.windKmh > 38) penalize(6, 'reason.strong_wind');
            else if (w.windKmh > 28) penalize(3, 'reason.annoying_wind');
            else if (w.windKmh > 19) penalize(1, 'reason.moderate_wind');
            break;

        case 'cycling':
            // Fietsen (Focus: Wind & Droog)
            // 1. Wind
            if (w.windKmh > 49) penalize(9, 'reason.stormy');
            else if (w.windKmh > 39) penalize(8, 'reason.too_much_wind');
            else if (w.windKmh > 29) penalize(4, 'reason.heavy_headwind');
            else if (w.windKmh > 19) penalize(2, 'reason.noticeable_wind');
            
            if (w.gustsKmh > 75) penalize(5, 'reason.dangerous_gusts');
            else if (w.gustsKmh > 60) penalize(3, 'reason.strong_gusts');

            // 2. Neerslag
            if (w.precipMm > 0.1) {
                // Veel strengere straf voor neerslag bij fietsen
                const rainPenalty = Math.min(9, Math.ceil(w.precipMm * 2) + 2);
                penalize(rainPenalty, 'reason.rain_chance');
            }

            // 3. Temperatuur (Gevoel)
            if (w.tempFeelsLike < 0) penalize(7, 'reason.extremely_cold');
            else if (w.tempFeelsLike < 5) penalize(5, 'reason.very_cold');
            else if (w.tempFeelsLike < 10) penalize(2, 'reason.cold');
            
            if (w.tempFeelsLike > 32) penalize(5, 'reason.way_too_hot_effort');
            else if (w.tempFeelsLike > 28) penalize(3, 'reason.too_hot_effort');
            break;

        case 'walking':
            // Wandelen (Focus: Droog)
            // 1. Neerslag
            if (w.precipProb > 40) penalize(4, 'reason.rain_chance');
            if (w.precipMm > 0.5) penalize(6, 'reason.rainy');

            // 2. Wind
            if (w.windKmh > 75) penalize(10, 'reason.storm'); // > 9 Bft
            else if (w.windKmh > 61) penalize(8, 'reason.dangerous_wind'); // > 7 Bft
            else if (w.windKmh > 49) penalize(5, 'reason.very_strong_wind'); // > 6 Bft
            else if (w.windKmh > 38) penalize(2, 'reason.strong_wind'); // > 5 Bft

            // 3. Temperatuur (Gevoel)
            if (w.tempFeelsLike < 0) penalize(5, 'reason.freezing');
            else if (w.tempFeelsLike < 5) penalize(3, 'reason.very_cold');
            else if (w.tempFeelsLike < 10) penalize(1, 'reason.chilly');
            
            if (w.tempFeelsLike > 32) penalize(5, 'reason.way_too_hot');
            else if (w.tempFeelsLike > 28) penalize(3, 'reason.too_hot');

            // 4. Zon
            if (w.sunChance < 20) penalize(2, 'reason.too_little_sun');
            else if (w.sunChance > 60 && score < 10) {
                 // Bonus voor lekker weer (als er niet al te veel strafpunten zijn)
                 score += 1;
            }
            break;

        case 'sailing':
            // Zeilen / Watersport (Focus: Wind & Zicht)
            // 1. Wind
            if (w.windKmh < 6) penalize(6, 'reason.too_little_wind'); // 0-1 Bft
            else if (w.windKmh < 12) penalize(2, 'reason.little_wind'); // 2 Bft
            // 3-4 Bft (12-28) is ideal -> 0 penalty
            else if (w.windKmh >= 29 && w.windKmh <= 38) penalize(1, 'reason.stiff_wind'); // 5 Bft
            else if (w.windKmh >= 39 && w.windKmh <= 49) penalize(4, 'reason.strong_wind'); // 6 Bft
            else if (w.windKmh > 49) penalize(9, 'reason.storm_water'); // > 7 Bft

            // 2. Gevaar (Onweer)
            const isThunderstorm = [95, 96, 99].includes(w.weatherCode);
            if (isThunderstorm) {
                score = 1;
                reasons.push(getTranslation('reason.danger_thunder', lang));
            }

            // 3. Temperatuur
            if (w.tempFeelsLike < 0) penalize(10, 'reason.water_frozen');
            else if (w.tempFeelsLike < 5) penalize(7, 'reason.very_cold_water');
            else if (w.tempFeelsLike < 10) penalize(4, 'reason.cold_water');
            else if (w.tempFeelsLike < 12) penalize(3, 'reason.chilly_water');
            break;

        case 'running':
            // Hardlopen 🏃
            // Focus: Thermoregulatie.
            // 1. Temperatuur
            if (w.tempFeelsLike > 25) penalize(6, 'reason.heat_stress');
            else if (w.tempFeelsLike > 20) penalize(3, 'reason.actually_too_warm');
            
            if (w.tempFeelsLike < 0) penalize(4, 'reason.cold_lungs');
            else if (w.tempFeelsLike < 5) penalize(2, 'reason.very_cold');

            // 2. Luchtvochtigheid
            if (w.humidity && w.humidity > 85 && w.tempFeelsLike > 20) {
                 penalize(4, 'reason.muggy');
            }

            // 3. Wind
            if (w.windKmh > 29) penalize(4, 'reason.heavy_ploughing');

            // 4. Neerslag (Existing logic kept as not explicitly changed but good to have)
            if (w.precipMm > 3.0) penalize(5, 'reason.soaked');
            else if (w.precipMm > 1.0) penalize(2, 'reason.wet_shoes');
            break;

        case 'beach':
            // Strand & Zonnen 🏖️
            // Focus: Comfort in rust.
            // 1. Temperatuur
            if (w.tempFeelsLike < 15) penalize(9, 'reason.too_cold');
            else if (w.tempFeelsLike < 20) penalize(7, 'reason.too_cold_beach');
            else if (w.tempFeelsLike < 22) penalize(3, 'reason.chilly');

            // 2. Bewolking (Cloud Cover)
            if (w.cloudCover > 80) penalize(8, 'reason.no_sun');
            else if (w.cloudCover > 40) penalize(4, 'reason.too_many_clouds');

            // 3. Wind
            if (w.windKmh > 28) penalize(5, 'reason.eating_sand');

            // 4. Neerslag
            if (w.precipProb > 30) penalize(6, 'reason.risk_wet_gear');
            break;

        case 'gardening':
            // Tuinieren 🌻
            // Focus: Werkbaarheid.
            // 1. Neerslag
            if (w.precipMm > 0.5) penalize(8, 'reason.working_rain');
            if (w.precip24h && w.precip24h > 10) penalize(3, 'reason.muddy_soil');

            // 2. Temperatuur
            if (w.tempFeelsLike < 0) penalize(9, 'reason.ground_frozen');
            else if (w.tempFeelsLike < 5) penalize(6, 'reason.too_cold_garden');
            else if (w.tempFeelsLike < 8) penalize(3, 'reason.cold_hands');
            else if (w.tempFeelsLike < 10) penalize(1, 'reason.chilly');
            
            if (w.tempFeelsLike > 32) penalize(6, 'reason.way_too_hot');
            else if (w.tempFeelsLike > 28) penalize(4, 'reason.too_hot_physical');

            // 3. Wind
            if (w.windKmh > 49) penalize(6, 'reason.plant_damage');
            else if (w.windKmh > 38) penalize(4, 'reason.strong_wind');
            else if (w.windKmh > 29) penalize(3, 'reason.tall_plants_break'); // > 5 Bft
            break;

        case 'stargazing':
            // Sterrenkijken 🔭
            // Focus: Zichtbaarheid.
            // 1. Bewolking
            if (w.cloudCover > 75) penalize(9, 'reason.cant_see_anything');
            else if (w.cloudCover > 25) penalize(6, 'reason.too_much_interference');
            else if (w.cloudCover > 10) penalize(2, 'reason.occasional_cloud');
            
            // 2. Zicht (Visibility)
            if (w.visibility < 5000) penalize(8, 'reason.atmosphere_opaque');

            // 3. Neerslag
            if (w.precipMm > 0) penalize(10, 'reason.telescope_wet');

            // 4. Temperatuur
            if (w.tempFeelsLike < 0) penalize(4, 'reason.cold_standing');
            else if (w.tempFeelsLike < 5) penalize(2, 'reason.very_chilly');
            else if (w.tempFeelsLike < 10) penalize(1, 'reason.coat_needed');

            // 5. Wind
            if (w.windKmh > 29) penalize(5, 'reason.telescope_shake');
            else if (w.windKmh > 19) penalize(3, 'reason.image_unstable');

            // Bonus: Maan
            if (w.moonPhaseText === 'Nieuwe Maan' || w.moonPhaseText === 'New Moon') {
                score += 1;
            }
            break;

        case 'golf':
            // Golf ⛳
            // Focus: Balvlucht en Baanconditie.
            // 1. Wind
            if (w.windKmh > 49) penalize(9, 'reason.unplayable');
            else if (w.windKmh > 19) penalize(4, 'reason.ball_influence');

            // 2. Neerslag
            if (w.precipMm > 0.2) penalize(4, 'reason.wet_grips');
            
            // 3. Onweer
            if ([95, 96, 99].includes(w.weatherCode)) {
                score = 1;
                reasons.push(getTranslation('reason.life_danger_thunder', lang));
            }

            // 4. Temperatuur
            if (w.tempFeelsLike < 0) penalize(10, 'reason.course_frozen');
            else if (w.tempFeelsLike < 5) penalize(6, 'reason.ball_hard');
            else if (w.tempFeelsLike < 10) penalize(2, 'reason.chilly');
            break;

        case 'drone':
            // Drone Vliegen 🚁
            // Focus: Apparatuur Veiligheid.
            // 1. Neerslag
            if (w.precipMm > 0) {
                score = 1; // "Instant Kill" roughly translates to lowest score
                reasons.push(getTranslation('reason.electronics_water', lang));
            }

            // 2. Windstoten
            if (w.gustsKmh > 60) penalize(9, 'reason.crash_guarantee');
            else if (w.gustsKmh > 45) penalize(7, 'reason.fly_away_risk');
            else if (w.gustsKmh > 30) penalize(3, 'reason.drone_unstable');

            // 3. Zicht
            if (w.visibility < 2000) penalize(6, 'reason.no_los');

            // 4. Temperatuur
            if (w.tempFeelsLike < 0) penalize(4, 'reason.lipo_drain');
            else if (w.tempFeelsLike < 5) penalize(2, 'reason.battery_perf');

            // 5. Kp-index
            if (w.kpIndex && w.kpIndex > 5) penalize(2, 'reason.geomag_storm');
            break;
    }

    // BONUS: Sunshine during rain (Global Rule)
    // If rain is expected (precip or prob > 30) AND there is significant sunshine
    const isRainy = w.precipMm > 0.1 || w.precipProb > 30;
    if (isRainy && w.sunChance > 20) {
        // Bonus depends on sun chance (percentage of sun hours)
        // Max bonus 5 points for 100% sun
        const bonus = Math.floor(w.sunChance / 20); 
        if (bonus > 0) {
            score += bonus;
            reasons.unshift(`${getTranslation('bonus.sunshine', lang)} (+${bonus})`);
        }
    }

    score = Math.max(1, Math.min(10, score));
    return { score10: score, stars: score / 2, text: reasons[0] || getTranslation('reason.perfect', lang), reasons };
};

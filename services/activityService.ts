
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
            if (w.precipProb > 40) penalize(2, 'reason.rain_chance');
            if (w.precipMm > 0.5) penalize(3, 'reason.rainy');

            // 2. Wind
            if (w.windKmh > 75) penalize(8, 'reason.storm'); // > 9 Bft
            else if (w.windKmh > 61) penalize(6, 'reason.dangerous_wind'); // > 7 Bft
            else if (w.windKmh > 49) penalize(3, 'reason.very_strong_wind'); // > 6 Bft
            else if (w.windKmh > 38) penalize(1, 'reason.strong_wind'); // > 5 Bft

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
            // Hardlopen
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
            // Strand & Zonnen
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
            // Tuinieren
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
            // Sterrenkijken
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
            // Golf
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

        case 'padel':
            // Padel (Outdoor)
            // 1. Temperatuur
            if (w.tempFeelsLike > 30) penalize(5, 'reason.too_hot');
            else if (w.tempFeelsLike > 25) penalize(2, 'reason.warm');

            if (w.tempFeelsLike < 0) penalize(10, 'reason.frozen_court');
            else if (w.tempFeelsLike < 5) penalize(5, 'reason.very_cold');
            else if (w.tempFeelsLike < 10) penalize(2, 'reason.chilly');

            // 2. Neerslag
            if (w.precipMm === 0 && w.precipProb < 10) {
                score += 1; // Droog bonus
            } else if (w.precipMm > 2) {
                penalize(8, 'reason.wet_court');
            } else if (w.precipMm > 0 || w.precipProb > 30) {
                penalize(3, 'reason.damp_court');
            }

            // 3. Wind
            if (w.windKmh > 49) penalize(6, 'reason.strong_wind'); // > 6 Bft
            break;

        case 'field_sports':
            // Veld Sport (Voetbal, Hockey, Rugby)
            // 1. Temperatuur
            if (w.tempFeelsLike > 30) penalize(8, 'reason.too_hot_physical');
            else if (w.tempFeelsLike > 25) penalize(5, 'reason.too_hot');
            else if (w.tempFeelsLike > 20) penalize(2, 'reason.warm');

            if (w.tempFeelsLike < 0) penalize(8, 'reason.ground_frozen');
            else if (w.tempFeelsLike < 5) penalize(5, 'reason.very_cold');
            else if (w.tempFeelsLike < 10) penalize(2, 'reason.chilly');

            // 2. Neerslag
            if (w.precipMm === 0 && w.precipProb < 10) {
                score += 1; // Droog bonus
            } else if (w.precipMm > 5) {
                penalize(9, 'reason.field_unplayable');
            } else if (w.precipMm > 2) {
                penalize(5, 'reason.wet_field');
            } else if (w.precipMm > 0 || w.precipProb > 30) {
                penalize(3, 'reason.damp_field');
            }

            // 3. Wind
            if (w.windKmh > 49) penalize(8, 'reason.storm_game'); // > 6 Bft
            else if (w.windKmh > 28) penalize(3, 'reason.ball_control'); // > 4 Bft
            break;

        case 'tennis':
            // Tennis
            // 1. Temperatuur
            if (w.tempFeelsLike > 30) penalize(5, 'reason.too_hot');
            else if (w.tempFeelsLike > 25) penalize(2, 'reason.warm');

            if (w.tempFeelsLike < 0) penalize(8, 'reason.frozen_court');
            else if (w.tempFeelsLike < 5) penalize(5, 'reason.very_cold');
            else if (w.tempFeelsLike < 10) penalize(2, 'reason.chilly');

            // 2. Neerslag
            if (w.precipMm === 0 && w.precipProb < 10) {
                score += 1; // Droog bonus
            } else if (w.precipMm > 2) {
                penalize(9, 'reason.court_unplayable');
            } else if (w.precipMm > 0 || w.precipProb > 30) {
                penalize(5, 'reason.wet_lines');
            }

            // 3. Wind
            if (w.windKmh < 12) score += 1; // Bonus 1-2 Bft

            if (w.windKmh > 38) penalize(8, 'reason.unplayable_wind'); // > 5 Bft
            else if (w.windKmh > 28) penalize(5, 'reason.ball_drift'); // > 4 Bft
            else if (w.windKmh >= 12) penalize(2, 'reason.noticeable_wind'); // 3 Bft (approx 12-19)
            break;

        case 'home':
        case 'work':
            // Basic comfort check for indoor/commute
            if (w.precipMm > 2) penalize(2, 'reason.rain_commute');
            if (w.windKmh > 50) penalize(2, 'reason.stormy_commute');
            break;
    }

    // BONUS: Sunshine during rain (Global Rule)
    // If rain is expected (precip or prob > 40) AND there is significant sunshine
    const isRainy = w.precipMm > 0.5 || w.precipProb > 40;
    if (isRainy && w.sunChance > 20) {
        // Bonus depends on sun chance (percentage of sun hours)
        // User request: "hoe meer percetange zonneuren tov max ure zon, hoe meer bonuspunten."
        // We give a significant bonus if there is sun during a rainy day.
        
        let bonus = 0;
        if (w.sunChance > 75) bonus = 3;      // Mostly sunny despite rain
        else if (w.sunChance > 50) bonus = 2; // Half sunny
        else if (w.sunChance > 25) bonus = 1; // Some sun

        // Skip for indoor activities where outside weather matters less for "sunshine bonus"
        if (['home', 'work', 'gym'].includes(activity)) {
            bonus = 0;
        }

        if (bonus > 0) {
            score += bonus;
            // Use push instead of unshift to make it secondary to the main penalty reason
            reasons.push(`${getTranslation('bonus.sunshine', lang)}`);
        }
    }

    // User request: Extra penalty for sub-zero feels-like temperature for all activities except stargazing and those with specific low temp logic
    if (w.tempFeelsLike < 0 && !['stargazing', 'padel', 'field_sports', 'tennis'].includes(activity)) {
        penalize(2, 'reason.feels_like_subzero');
    }

    score = Math.max(1, Math.min(10, score));
    return { score10: score, stars: score / 2, text: reasons[0] || getTranslation('reason.perfect', lang), reasons };
};

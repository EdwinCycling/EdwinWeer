import * as Astronomy from "astronomy-engine";
import { OpenMeteoResponse } from "../types";

export interface VisiblePlanet {
    name: string; // 'Mercury', 'Venus', etc.
    nameNl: string;
    altitude: number;
    azimuth: number;
    direction: string;
    bestTime: string; // HH:MM
    status: 'visible' | 'cloudy' | 'below_horizon';
    magnitude: number;
    conjunction?: string;
    icon: string;
    visible: boolean; // Kept for compatibility
}

const PLANETS = [
    { name: "Mercury", nameNl: "Mercurius", icon: "☿️" },
    { name: "Venus", nameNl: "Venus", icon: "♀️" },
    { name: "Mars", nameNl: "Mars", icon: "♂️" },
    { name: "Jupiter", nameNl: "Jupiter", icon: "♃" },
    { name: "Saturn", nameNl: "Saturnus", icon: "♄" }
];

const getDirection = (azimuth: number): string => {
    const directions = ['N', 'NO', 'O', 'ZO', 'Z', 'ZW', 'W', 'NW'];
    const index = Math.round(azimuth / 45) % 8;
    return directions[index];
};

export const getVisiblePlanets = (date: Date, lat: number, lon: number, weatherData?: OpenMeteoResponse): VisiblePlanet[] => {
    const observer = new Astronomy.Observer(lat, lon, 0);
    const results: VisiblePlanet[] = [];
    
    // Scan window: From NOW until next morning (max 24h)
    // We want to find the best viewing time during the "Coming Night" or "Rest of Tonight".
    
    const now = date;
    const oneDayLater = new Date(now.getTime() + 24 * 3600 * 1000);
    
    const getCloudCover = (t: Date): number => {
        if (!weatherData || !weatherData.hourly) return 0; // Assume clear if no data
        
        // Find closest hour in weather data
        // Weather data time is ISO string (local or UTC depending on how it was parsed, but OpenMeteo usually returns ISO)
        // Let's assume weatherData.hourly.time are ISO strings matching the timezone or UTC.
        // We need to match robustly.
        // Best approach: Convert t to ISO string prefix (YYYY-MM-DDTHH) and find match.
        // Note: 't' is local browser time (Date object). 
        // We need to be careful with timezones if weatherData is not aligned.
        // However, usually we can find the closest time by timestamp comparison if we parse the weather strings.
        
        // Simplest: Find index where time is closest
        const tTime = t.getTime();
        let closestIdx = -1;
        let minDiff = Infinity;
        
        // Optimization: limit search to indices around current hour
        // But for safety, we can scan or just use string matching if formatted correctly.
        // Let's use string matching for YYYY-MM-DDTHH
        
        // If weatherData.hourly.time contains local times (as strings), we need to ensure t is formatted same.
        // But often Date.toISOString() is UTC.
        // OpenMeteo response depends on 'timezone' param. In App it's usually 'auto'.
        
        // Fallback: Use simple index offset if we know the start time.
        // But let's try to match by string (assuming the weather data has correct offsets or is local).
        
        // Better: Convert weather strings to timestamps once? Too expensive here.
        // Let's use string matching of the hour.
        
        // Construct YYYY-MM-DDTHH:MM
        // This depends on how the Date object prints vs how the API returned it.
        // If the API returned local time strings, and Date is local, we might mismatch if we use toISOString (UTC).
        
        // Let's try to find by timestamp comparison, parsing the weather strings.
        // We only check a few slots.
        
        for (let i = 0; i < weatherData.hourly.time.length; i++) {
             const wTime = new Date(weatherData.hourly.time[i]).getTime();
             const diff = Math.abs(wTime - tTime);
             if (diff < minDiff) {
                 minDiff = diff;
                 closestIdx = i;
             }
             // If we are within 30 mins, good enough
             if (diff < 30 * 60 * 1000) break;
        }
        
        if (closestIdx !== -1) {
            return weatherData.hourly.cloud_cover[closestIdx];
        }
        return 0;
    };

    PLANETS.forEach(planetDef => {
        const body = Astronomy.Body[planetDef.name as keyof typeof Astronomy.Body];
        
        let bestAltitude = -999;
        let bestTime: Date | null = null;
        let bestAzimuth = 0;
        let isVisibleWeather = false;
        let foundPass = false;
        
        // Scan in 30 min steps
        for (let t = now.getTime(); t < oneDayLater.getTime(); t += 30 * 60 * 1000) {
            const time = new Date(t);
            
            // 1. Check Sun (must be down, altitude < -6 for Civil Twilight)
            const sunEq = Astronomy.Equator(Astronomy.Body.Sun, time, observer, true, true);
            const sunHor = Astronomy.Horizon(time, observer, sunEq.ra, sunEq.dec, "normal");
            
            if (sunHor.altitude > -6) continue; 
            
            // 2. Check Planet
            const pEq = Astronomy.Equator(body, time, observer, true, true);
            const pHor = Astronomy.Horizon(time, observer, pEq.ra, pEq.dec, "normal");
            
            if (pHor.altitude > 5) {
                foundPass = true;
                
                // Check weather
                const clouds = getCloudCover(time);
                if (clouds < 25) {
                    isVisibleWeather = true; // At least one clear moment
                }
                
                // We want the BEST time (highest altitude)
                // But maybe prefer clear weather?
                // User said: "Stap D: Selecteer het beste moment Kies het tijdstip waarop de planeet het hoogst staat"
                // So purely max altitude.
                
                if (pHor.altitude > bestAltitude) {
                    bestAltitude = pHor.altitude;
                    bestTime = time;
                    bestAzimuth = pHor.azimuth;
                }
            }
        }
        
        if (foundPass && bestTime && bestAltitude > 5) {
            // Determine status
            // If weather data is missing, we assume visible.
            // If we have data, we use the boolean we calculated (true if ANY moment was clear? Or should we check the BEST moment?)
            // User said: "Stap C: Weer Filter Voeg een boolean isVisibleWeather toe. True als cloudCover < 25%."
            // But logic says: "Stap D: Selecteer beste moment".
            // It implies we show the planet if it's visible astronomically, and mark it 'cloudy' if weather is bad.
            // But do we check weather at the PEAK or just generally?
            // "True als cloudCover < 25%" - implies a single boolean for the item.
            // Let's check weather at the *bestTime* for accuracy.
            
            const cloudAtBestTime = getCloudCover(bestTime);
            const status = (weatherData && cloudAtBestTime >= 25) ? 'cloudy' : 'visible';
            
            // Conjunction Check
            const moonEq = Astronomy.Equator(Astronomy.Body.Moon, bestTime, observer, true, true);
            const planetEq = Astronomy.Equator(body, bestTime, observer, true, true);
            const angle = Astronomy.AngleBetween(moonEq.vec, planetEq.vec);
            const conjunction = angle < 6 ? `Speciaal: Maan dichtbij ${planetDef.nameNl}!` : undefined;
            
            // Magnitude
            const illum = Astronomy.Illumination(body, bestTime);
            
            results.push({
                name: planetDef.name,
                nameNl: planetDef.nameNl,
                icon: planetDef.icon,
                altitude: Math.round(bestAltitude),
                azimuth: Math.round(bestAzimuth),
                direction: getDirection(bestAzimuth),
                bestTime: bestTime.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }),
                status: status,
                magnitude: parseFloat(illum.mag.toFixed(1)),
                conjunction: conjunction,
                visible: true
            });
        }
    });
    
    return results.sort((a, b) => a.bestTime.localeCompare(b.bestTime));
};

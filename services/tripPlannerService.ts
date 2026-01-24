import { OpenMeteoResponse, TripPlannerSettings, AppLanguage } from '../types';
import { getWindDirection } from './weatherService';

export interface TripOption {
    startTime: string; // ISO string or just HH:mm
    endTime: string;
    score: number; // 1-10
    avgTemp: number;
    maxWind: number;
    minWind: number;
    maxRain: number; // Probability
    avgSunChance: number; // Percentage
    windDirection: number; // degrees
    windDirectionText: string;
    windVariation: boolean;
    windVariationText?: string;
    weatherCode: number;
    summary: string;
    details: string[];
    isBest: boolean;
    startHour: number; // 0-23
    day: 'today' | 'tomorrow';
    isTargetTime: boolean;
    
    // Daylight info
    sunriseTime?: string;
    sunsetTime?: string;
    isDark?: boolean;
    isTwilight?: boolean;
    daylightWarning?: string;
}

export const calculateTripOptions = (
    forecast: OpenMeteoResponse, 
    settings: TripPlannerSettings,
    targetDay: 'today' | 'tomorrow' = 'today',
    lang: AppLanguage = 'nl'
): TripOption[] => {
    if (!forecast || !forecast.hourly) return [];

    const options: TripOption[] = [];
    const hourly = forecast.hourly;
    const isNl = lang === 'nl';
    
    // Parse start time (e.g. "10:00")
    const [startH, startM] = settings.startTime.split(':').map(Number);
    const duration = settings.duration;

    // Define search window with split margins
    const minStartHour = Math.max(0, startH - (settings.marginBefore || 0));
    const maxStartHour = Math.min(23, startH + (settings.marginAfter || 0));

    // Determine day index offset
    const now = new Date();
    // Reset time to avoid confusion
    now.setHours(0,0,0,0);
    
    const targetDate = new Date(now);
    if (targetDay === 'tomorrow') {
        targetDate.setDate(targetDate.getDate() + 1);
    }
    
    const targetDateStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;

    // Find the first index that matches the target date string in ISO format
    let baseIndex = hourly.time.findIndex(t => t.startsWith(targetDateStr));
    
    if (baseIndex === -1) {
        // Fallback: Use 0 for Today, 24 for Tomorrow if not found
        // This handles cases where timezone=auto makes local string not match API string exactly
        baseIndex = targetDay === 'today' ? 0 : 24;
    }

    for (let h = minStartHour; h <= maxStartHour; h++) {
        // Calculate start index
        const startIndex = baseIndex + h;
        
        // Check if we have enough data for the duration
        if (startIndex + duration >= hourly.time.length) continue;

        // Create Window
        const windowIndices: number[] = [];
        for (let i = 0; i < duration; i++) {
            windowIndices.push(startIndex + i);
        }

        // Analyze Window
        let sumTemp = 0;
        let maxWind = 0;
        let minWind = 999;
        let maxRainProb = 0;
        let sumSunChance = 0;
        let windDirs: number[] = [];
        let weatherCodes: number[] = [];

        windowIndices.forEach(idx => {
            sumTemp += hourly.temperature_2m[idx];
            const wind = hourly.wind_speed_10m[idx];
            maxWind = Math.max(maxWind, wind);
            minWind = Math.min(minWind, wind);
            maxRainProb = Math.max(maxRainProb, hourly.precipitation_probability[idx]);
            
            // Sun calculation
            const sunSeconds = hourly.sunshine_duration ? hourly.sunshine_duration[idx] : 0;
            const sunChance = Math.min(100, (sunSeconds / 3600) * 100);
            sumSunChance += sunChance;

            windDirs.push(hourly.wind_direction_10m[idx]);
            weatherCodes.push(hourly.weather_code[idx]);
        });
        
        if (minWind === 999) minWind = 0;

        const avgTemp = sumTemp / duration;
        const avgSunChance = sumSunChance / duration;
        const dominantWeatherCode = weatherCodes[0]; 
        
        // Wind Analysis
        // Better variation check
        let maxDiff = 0;
        let startDir = windDirs[0];
        let endDir = windDirs[windDirs.length - 1];
        
        for (let i = 0; i < windDirs.length; i++) {
            for (let j = i + 1; j < windDirs.length; j++) {
                let d1 = windDirs[i];
                let d2 = windDirs[j];
                let diff = Math.abs(d1 - d2);
                if (diff > 180) diff = 360 - diff;
                maxDiff = Math.max(maxDiff, diff);
            }
        }
        
        const windVariation = maxDiff > 45;
        const windDirText = getWindDirection(startDir, lang);
        const windEndText = getWindDirection(endDir, lang);

        // Daylight Analysis
        let sunriseTime: string | undefined;
        let sunsetTime: string | undefined;
        let isDark = false;
        let isTwilight = false;
        let daylightWarning: string | undefined;

        if (forecast.daily && forecast.daily.sunrise && forecast.daily.sunset) {
            // Find correct daily index
            // We use targetDateStr calculated earlier to match daily.time
            const dailyIdx = forecast.daily.time.findIndex(t => t === targetDateStr);
            
            if (dailyIdx !== -1) {
                const sunrise = new Date(forecast.daily.sunrise[dailyIdx]);
                const sunset = new Date(forecast.daily.sunset[dailyIdx]);
                
                sunriseTime = sunrise.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                sunsetTime = sunset.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                // Calculate trip start and end Date objects
                const tripStart = new Date(hourly.time[startIndex]);
                const tripEnd = new Date(tripStart.getTime() + duration * 60 * 60 * 1000);

                const TWILIGHT_MS = 30 * 60 * 1000; // 30 mins

                // Check Start
                if (tripStart < new Date(sunrise.getTime() - TWILIGHT_MS)) {
                    isDark = true;
                    daylightWarning = isNl ? 'Start in donker' : 'Start in dark';
                } else if (tripStart < sunrise) {
                    isTwilight = true;
                    daylightWarning = isNl ? 'Start in schemer' : 'Start in twilight';
                }

                // Check End
                if (tripEnd > new Date(sunset.getTime() + TWILIGHT_MS)) {
                    if (isDark) {
                        daylightWarning += isNl ? ' & Finish in donker' : ' & Finish in dark';
                    } else {
                        isDark = true;
                        daylightWarning = isNl ? 'Finish in donker' : 'Finish in dark';
                    }
                } else if (tripEnd > sunset) {
                     if (!isDark && !isTwilight) {
                        isTwilight = true;
                        daylightWarning = isNl ? 'Finish in schemer' : 'Finish in twilight';
                     } else if (daylightWarning) {
                        daylightWarning += isNl ? ' & Finish in schemer' : ' & Finish in twilight';
                     }
                }
            }
        }

        // Scoring Logic (1-10)
        let score = 10;
        const details: string[] = [];

        // Daylight Penalty
        if (isDark) {
            score -= 2;
            if (daylightWarning) details.push(daylightWarning);
        } else if (isTwilight) {
            score -= 0.5;
            if (daylightWarning) details.push(daylightWarning);
        }

        // 1. Rain Penalty (Heavy)
        if (maxRainProb > 10) {
            score -= (maxRainProb / 10); 
            details.push(isNl ? `Kans op regen: ${maxRainProb}%` : `Rain chance: ${maxRainProb}%`);
        }
        
        // 2. Wind Penalty
        const isCycling = settings.activity === 'cycling';
        const windLimit = isCycling ? 25 : 40; 
        
        if (maxWind > windLimit) {
            const penalty = isCycling ? 2 : 1;
            score -= penalty;
            details.push(isNl ? `Harde wind (${Math.round(maxWind)} km/u)` : `Strong wind (${Math.round(maxWind)} km/h)`);
        }
        if (maxWind > windLimit + 15) {
             score -= 3; 
        }

        // 3. Temperature Penalty
        if (avgTemp < 5) {
            score -= 1;
            details.push(isNl ? 'Erg koud' : 'Very cold');
        } else if (avgTemp > 30) {
            score -= 2;
            details.push(isNl ? 'Erg warm' : 'Very hot');
        }
        
        // 4. Sun Bonus (optional, but nice)
        if (avgSunChance > 50) {
            // score += 0.5; // Maybe not increase > 10
        }

        // Clamp score
        score = Math.max(1, Math.min(10, Math.round(score * 10) / 10));

        // Format times
        const startTimeStr = hourly.time[startIndex].split('T')[1].substring(0, 5);
        
        // Calculate end time properly supporting float duration
        const startDate = new Date(hourly.time[startIndex]);
        const endDate = new Date(startDate.getTime() + duration * 60 * 60 * 1000);
        const endTimeStr = endDate.toISOString().split('T')[1].substring(0, 5);

        options.push({
            startTime: startTimeStr,
            endTime: endTimeStr,
            score,
            avgTemp,
            maxWind,
            minWind,
            maxRain: maxRainProb,
            avgSunChance,
            windDirection: startDir,
            windDirectionText: windDirText,
            windVariation,
            windVariationText: windVariation ? (isNl ? `${windDirText} -> ${windEndText}` : `${windDirText} -> ${windEndText}`) : undefined,
            weatherCode: dominantWeatherCode,
            summary: createSummary(maxRainProb, avgTemp, maxWind, windDirText, lang),
            details,
            isBest: false,
            startHour: h,
            day: targetDay,
            isTargetTime: h === startH,
            sunriseTime,
            sunsetTime,
            isDark,
            isTwilight,
            daylightWarning
        });
    }

    // Mark Best
    if (options.length > 0) {
        const maxScore = Math.max(...options.map(o => o.score));
        // Only mark best if there is actual variation, otherwise handled by UI "All Good" message
        // But we still need the boolean for sorting/logic
        options.forEach(o => {
            if (o.score === maxScore) o.isBest = true;
        });
        
        // Sort: Best Score first, then closest to target time
        options.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            // If scores equal, prefer target time (closest to startH)
            const diffA = Math.abs(a.startHour - startH);
            const diffB = Math.abs(b.startHour - startH);
            return diffA - diffB;
        });
    }

    return options;
};

const createSummary = (rain: number, temp: number, wind: number, dir: string, lang: AppLanguage): string => {
    const isNl = lang === 'nl';
    const rainText = rain < 10 ? (isNl ? 'Droog' : 'Dry') : `${rain}% ${isNl ? 'Regen' : 'Rain'}`;
    return `${rainText}, ${Math.round(temp)}°C, Wind ${dir} ${Math.round(wind)}`;
};

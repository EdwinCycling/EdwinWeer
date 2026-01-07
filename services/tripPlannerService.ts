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

        // Scoring Logic (1-10)
        let score = 10;
        const details: string[] = [];

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
            isTargetTime: h === startH
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

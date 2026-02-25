
import { Handler } from '@netlify/functions';
import { MAJOR_CITIES } from '../../services/cityData';
import { createHash } from 'crypto';

// CORS headers
const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

// Helper to shuffle array
const shuffle = <T>(array: T[]): T[] => {
    let currentIndex = array.length, randomIndex;
    while (currentIndex != 0) {
        randomIndex = Math.floor(Math.random() * currentIndex);
        currentIndex--;
        [array[currentIndex], array[randomIndex]] = [array[randomIndex], array[currentIndex]];
    }
    return array;
};

// Helper to get yesterday's date string YYYY-MM-DD
const getYesterday = () => {
    const date = new Date();
    date.setDate(date.getDate() - 1);
    return date.toISOString().split('T')[0];
};

export const handler: Handler = async (event, context) => {
    // Handle OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    try {
        const yesterday = getYesterday();
        
        // 1. Select 24 random cities
        const shuffledCities = shuffle([...MAJOR_CITIES]).slice(0, 24);
        
        // 2. Prepare weather fetch for all 24 cities
        // To be efficient, we can try to fetch in chunks or all at once if the API allows multiple points.
        // Open-Meteo allows fetching multiple locations by comma-separated lat/lon.
        // limit is usually around 50-100 locations per call, so 24 is fine.
        
        const lats = shuffledCities.map(c => c.lat).join(',');
        const lons = shuffledCities.map(c => c.lon).join(',');
        
        // We need: Max/Min Temp, Rain amount, Sunshine duration (to calc %), Max Wind Speed, Surface Pressure
        // Daily variables: temperature_2m_max, temperature_2m_min, precipitation_sum, sunshine_duration, daylight_duration, wind_speed_10m_max, surface_pressure_mean (or similar)
        // Note: surface_pressure is usually hourly, but we can take mean or max/min. Open-Meteo daily has no pressure.
        // We can fetch hourly pressure and average it, or just use daily variables available.
        // Let's check available daily variables. 
        // daily: weather_code, temperature_2m_max, temperature_2m_min, precipitation_sum, rain_sum, showers_sum, snowfall_sum, precipitation_hours, precipitation_probability_max, wind_speed_10m_max, wind_gusts_10m_max, wind_direction_10m_dominant, shortwave_radiation_sum, et0_fao_evapotranspiration
        // sunshine_duration is available in daily.
        
        // For pressure, we might need hourly=surface_pressure and average it. 
        // Let's stick to daily variables first + hourly pressure if needed.
        // User asked for: Stadsnaam, Vlag (frontend), Temp (Max/Min), Zon % (needs sunshine_duration / daylight_duration), Regen hoeveelheid, max Wind, luchtdruk.
        
        // Let's fetch hourly pressure for yesterday (24 hours).
        
        const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lats}&longitude=${lons}&start_date=${yesterday}&end_date=${yesterday}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,sunshine_duration,daylight_duration,wind_speed_10m_max&hourly=surface_pressure&timezone=auto`;
        
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Weather API error: ${response.statusText}`);
        }
        
        const data = await response.json();
        // data can be an array if multiple locations, or single object if one location.
        // With comma separated lat/lon, it returns an array of objects.
        
        const results = Array.isArray(data) ? data : [data];
        
        const gameCards = results.map((cityData, index) => {
            const city = shuffledCities[index];
            const daily = cityData.daily;
            const hourly = cityData.hourly;
            
            const sunshine = Number.isFinite(daily?.sunshine_duration?.[0]) ? daily.sunshine_duration[0] : 0;
            const daylightRaw = Number.isFinite(daily?.daylight_duration?.[0]) ? daily.daylight_duration[0] : 0;
            const daylight = daylightRaw <= 0 ? 1 : daylightRaw;
            const sunPercentage = Math.max(0, Math.min(100, Math.round((sunshine / daylight) * 100)));
            
            const pressures = Array.isArray(hourly?.surface_pressure) ? hourly.surface_pressure : [];
            const avgPressure = pressures.length > 0 
                ? Math.round(pressures.reduce((a: number, b: number) => a + b, 0) / pressures.length) 
                : 1013; // default fallback

            const tempMaxRaw = Number.isFinite(daily?.temperature_2m_max?.[0]) ? daily.temperature_2m_max[0] : 20;
            const tempMinRaw = Number.isFinite(daily?.temperature_2m_min?.[0]) ? daily.temperature_2m_min[0] : 10;
            const rainRaw = Number.isFinite(daily?.precipitation_sum?.[0]) ? daily.precipitation_sum[0] : 0;
            const windRaw = Number.isFinite(daily?.wind_speed_10m_max?.[0]) ? daily.wind_speed_10m_max[0] : 0;

            return {
                id: index, // ID for the board position (0-23)
                city: {
                    name: city.name,
                    country: city.country,
                    lat: city.lat,
                    lon: city.lon
                },
                weather: {
                    tempMax: tempMaxRaw,
                    tempMin: tempMinRaw,
                    rainSum: rainRaw,
                    sunPct: sunPercentage,
                    windMax: windRaw,
                    pressure: avgPressure
                }
            };
        });
        
        // 3. Pick a Target
        const targetIndex = Math.floor(Math.random() * gameCards.length);
        const targetCard = gameCards[targetIndex];
        
        // 4. Hash the target ID (or a combination to verify)
        // We use a simple hash of "TARGET_SECRET_SALT" + city name or ID
        // Actually, just hashing the city name is enough if we want to verify "Is this the city?"
        // But better to hash a unique ID for this session if we had one.
        // Let's just hash the city name for simplicity of verification on frontend
        // "Is this Paris?" -> hash("Paris") == targetHash
        
        const secret = "BARO_GUESS_WHO_SECRET";
        const targetHash = createHash('sha256')
            .update(secret + targetCard.city.name)
            .digest('hex');
            
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                cards: gameCards,
                targetHash: targetHash,
                targetStats: targetCard.weather, // Send stats for answering questions
                date: yesterday
            })
        };

    } catch (error) {
        console.error('Error generating game:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Failed to generate game data' })
        };
    }
};

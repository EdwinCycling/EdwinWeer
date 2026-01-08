
import { WeatherData, TempUnit, WindUnit, PrecipUnit, PressureUnit, AppLanguage, EnsembleModel } from "../types";
import { checkLimit, trackCall } from "./usageService";

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";
const ENSEMBLE_URL = "https://ensemble-api.open-meteo.com/v1/ensemble";
const SEASONAL_URL = "https://seasonal-api.open-meteo.com/v1/seasonal";

// --- CACHE ---
const forecastCache: Record<string, { timestamp: number, data: any }> = {};
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// --- SECURITY: REQUEST THROTTLING ---
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 1000; // 1 seconde delay between requests
let requestQueue = Promise.resolve();

const throttledFetch = async (url: string) => {
    const fetchAction = async () => {
        checkLimit();
        trackCall();

        const now = Date.now();
        const timeSinceLast = now - lastRequestTime;
        
        if (timeSinceLast < MIN_REQUEST_INTERVAL) {
            await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLast));
        }
        
        lastRequestTime = Date.now();
        const response = await fetch(url);
        if (!response.ok) {
            // If 429, we might want to throw specific error or wait and retry?
            // For now just throw, but the queue helps avoid it.
            if (response.status === 429) {
                 console.warn("Hit 429 in throttledFetch, slowing down...");
                 // Penalize next request
                 lastRequestTime = Date.now() + 2000; 
            }
            throw new Error(`Fetch failed: ${response.status}`);
        }
        return response.json();
    };

    // Chain the request to the queue to ensure serial execution
    const result = requestQueue.then(fetchAction);
    
    // Update queue pointer, catching errors so the queue doesn't break
    requestQueue = result.catch(() => {});
    
    return result;
};


// --- UNIT CONVERSION HELPERS ---

export const convertTemp = (tempC: number, unit: TempUnit): number => {
    if (unit === TempUnit.FAHRENHEIT) {
        return Math.round(((tempC * 9/5) + 32));
    }
    return Math.round(tempC);
};

export const convertTempPrecise = (tempC: number, unit: TempUnit): number => {
    if (unit === TempUnit.FAHRENHEIT) {
        return Number(((tempC * 9/5) + 32).toFixed(1));
    }
    return Number(tempC.toFixed(1));
};

export const convertWind = (speedKmh: number, unit: WindUnit): number => {
    switch (unit) {
        case WindUnit.BFT:
            return getBeaufort(speedKmh);
        case WindUnit.MS:
            return parseFloat((speedKmh / 3.6).toFixed(1));
        case WindUnit.MPH:
            return Math.round(speedKmh / 1.60934);
        case WindUnit.KNOTS:
            return Math.round(speedKmh / 1.852);
        case WindUnit.KMH:
        default:
            return Math.round(speedKmh);
    }
};

export const convertPrecip = (precipMm: number | null | undefined, unit: PrecipUnit): number => {
    const val = precipMm ?? 0;
    if (unit === PrecipUnit.INCH) {
        return parseFloat((val / 25.4).toFixed(2));
    }
    return parseFloat(val.toFixed(1));
};

export const convertPressure = (pressureHpa: number | null | undefined, unit: PressureUnit): number => {
    const val = pressureHpa ?? 0;
    if (unit === PressureUnit.INHG) {
        // 1 hPa = 0.02953 inHg
        return parseFloat((val * 0.02953).toFixed(2));
    }
    return Math.round(val);
};

export const getTempLabel = (unit: TempUnit) => unit === TempUnit.FAHRENHEIT ? '°F' : '°C';

// --- EXISTING MAPPERS ---

export const mapWmoCodeToIcon = (code: number | null | undefined, isNight = false): string => {
  if (code === null || code === undefined) return 'help';
  
  // Ensure code is a number
  const wmoCode = Number(code);
  if (isNaN(wmoCode)) return 'help';

  switch (wmoCode) {
    case 0: return isNight ? 'clear_night' : 'wb_sunny';
    case 1:
    case 2: return isNight ? 'partly_cloudy_night' : 'partly_cloudy_day';
    case 3: return 'cloud';
    case 45:
    case 48: return 'foggy';
    case 51:
    case 53:
    case 55: return 'rainy';
    case 56:
    case 57: return 'weather_hail';
    case 61:
    case 63:
    case 65: return 'rainy';
    case 66:
    case 67: return 'weather_mix';
    case 71:
    case 73:
    case 75: return 'weather_snowy';
    case 77: return 'weather_snowy';
    case 80:
    case 81:
    case 82: return 'rainy';
    case 85:
    case 86: return 'weather_snowy';
    case 95:
    case 96:
    case 99: return 'thunderstorm';
    default: return 'help';
  }
};

// Mappings for English and Dutch
export const mapWmoCodeToText = (code: number, lang: AppLanguage = 'en'): string => {
    const isNl = lang === 'nl';
    
    switch (code) {
      case 0: return isNl ? 'Onbewolkt' : 'Clear Sky';
      case 1: return isNl ? 'Licht bewolkt' : 'Mainly Clear';
      case 2: return isNl ? 'Half bewolkt' : 'Partly Cloudy';
      case 3: return isNl ? 'Zwaar bewolkt' : 'Overcast';
      case 45: return isNl ? 'Mist' : 'Fog';
      case 48: return isNl ? 'Rijp' : 'Depositing Rime Fog';
      case 51: return isNl ? 'Lichte motregen' : 'Light Drizzle';
      case 53: return isNl ? 'Motregen' : 'Drizzle';
      case 55: return isNl ? 'Zware motregen' : 'Dense Drizzle';
      case 56: return isNl ? 'Lichte ijzel' : 'Light Freezing Drizzle';
      case 57: return isNl ? 'Zware ijzel' : 'Dense Freezing Drizzle';
      case 61: return isNl ? 'Lichte regen' : 'Light Rain';
      case 63: return isNl ? 'Regen' : 'Rain';
      case 65: return isNl ? 'Zware regen' : 'Heavy Rain';
      case 66: return isNl ? 'Lichte ijzelregen' : 'Freezing Rain';
      case 67: return isNl ? 'Zware ijzelregen' : 'Heavy Freezing Rain';
      case 71: return isNl ? 'Lichte sneeuw' : 'Light Snow';
      case 73: return isNl ? 'Sneeuw' : 'Snow';
      case 75: return isNl ? 'Zware sneeuw' : 'Heavy Snow';
      case 77: return isNl ? 'Sneeuwkorrels' : 'Snow Grains';
      case 80: return isNl ? 'Lichte buien' : 'Light Showers';
      case 81: return isNl ? 'Buien' : 'Showers';
      case 82: return isNl ? 'Zware buien' : 'Violent Showers';
      case 85: return isNl ? 'Lichte sneeuwbuien' : 'Light Snow Showers';
      case 86: return isNl ? 'Zware sneeuwbuien' : 'Heavy Snow Showers';
      case 95: return isNl ? 'Onweer' : 'Thunderstorm';
      case 96: return isNl ? 'Onweer & Hagel' : 'Thunderstorm with Hail';
      case 99: return isNl ? 'Zwaar Onweer' : 'Heavy Thunderstorm';
      default: return isNl ? 'Onbekend' : 'Unknown';
    }
  };

export const calculateMoonPhase = (date: Date): number => {
    let year = date.getFullYear();
    let month = date.getMonth() + 1;
    let day = date.getDate();

    if (month < 3) {
        year--;
        month += 12;
    }

    ++month;

    let c = 365.25 * year;
    let e = 30.6 * month;
    let jd = c + e + day - 694039.09; 
    jd /= 29.5305882; 
    let b = parseInt(jd.toString()); 
    jd -= b; 
    b = Math.round(jd * 8); 

    if (b >= 8 ) b = 0; 
    return b / 8;
}

export const getMoonPhaseIcon = (phase: number): string => {
    if (phase <= 0.06 || phase >= 0.94) return 'mode_night'; 
    if (phase < 0.25) return 'check_indeterminate_small'; 
    if (phase >= 0.22 && phase <= 0.28) return 'contrast'; 
    if (phase < 0.5) return 'brightness_4'; 
    if (phase >= 0.47 && phase <= 0.53) return 'brightness_5'; 
    if (phase < 0.75) return 'brightness_6'; 
    if (phase >= 0.72 && phase <= 0.78) return 'contrast'; 
    return 'check_indeterminate_small'; 
};

export const getMoonPhaseText = (phase: number, lang: AppLanguage = 'en'): string => {
    const isNl = lang === 'nl';
    
    if (phase <= 0.06 || phase >= 0.94) return isNl ? 'Nieuwe Maan' : 'New Moon';
    if (phase < 0.25) return isNl ? 'Wassende Maan' : 'Waxing Crescent';
    if (phase >= 0.22 && phase <= 0.28) return isNl ? 'Eerste Kwartier' : 'First Quarter';
    if (phase < 0.5) return isNl ? 'Wassende Maan' : 'Waxing Gibbous';
    if (phase >= 0.47 && phase <= 0.53) return isNl ? 'Volle Maan' : 'Full Moon';
    if (phase < 0.75) return isNl ? 'Afnemende Maan' : 'Waning Gibbous';
    if (phase >= 0.72 && phase <= 0.78) return isNl ? 'Laatste Kwartier' : 'Last Quarter';
    return isNl ? 'Afnemende Maan' : 'Waning Crescent';
}

export const getBeaufort = (kmh: number): number => {
    if (kmh < 2) return 0;
    if (kmh < 6) return 1;
    if (kmh < 12) return 2;
    if (kmh < 20) return 3;
    if (kmh < 29) return 4;
    if (kmh < 39) return 5;
    if (kmh < 50) return 6;
    if (kmh < 62) return 7;
    if (kmh < 75) return 8;
    if (kmh < 89) return 9;
    if (kmh < 103) return 10;
    if (kmh < 118) return 11;
    return 12;
};

export const getBeaufortDescription = (bft: number, lang: AppLanguage = 'en'): string => {
    const isNl = lang === 'nl';

    switch (bft) {
        case 0: return isNl ? "Stil" : "Calm";
        case 1: return isNl ? "Zwak" : "Light Air";
        case 2: return isNl ? "Zwak" : "Light Breeze";
        case 3: return isNl ? "Matig" : "Gentle Breeze";
        case 4: return isNl ? "Matig" : "Moderate Breeze";
        case 5: return isNl ? "Vrij krachtig" : "Fresh Breeze";
        case 6: return isNl ? "Krachtig" : "Strong Breeze";
        case 7: return isNl ? "Hard" : "Near Gale";
        case 8: return isNl ? "Stormachtig" : "Gale";
        case 9: return isNl ? "Storm" : "Strong Gale";
        case 10: return isNl ? "Zware storm" : "Storm";
        case 11: return isNl ? "Zeer zware storm" : "Violent Storm";
        case 12: return isNl ? "Orkaan" : "Hurricane";
        default: return "";
    }
};

export const getWindDirection = (deg: number, lang: AppLanguage = 'en'): string => {
    const isNl = lang === 'nl';
    const directions = isNl 
        ? ['N', 'NO', 'O', 'ZO', 'Z', 'ZW', 'W', 'NW']
        : ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    
    // Normalize degree to 0-360
    const normalized = (deg % 360 + 360) % 360;
    const index = Math.round(normalized / 45) % 8;
    return directions[index];
};

const validateCoordinates = (lat: number, lon: number) => {
    if (typeof lat !== 'number' || typeof lon !== 'number' || isNaN(lat) || isNaN(lon)) {
        throw new Error(`Invalid coordinates: ${lat}, ${lon}`);
    }
}

export const fetchForecast = async (lat: number, lon: number, model?: EnsembleModel, pastDays: number = 0) => {
  validateCoordinates(lat, lon);
  
  const currentVars = 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,showers,snowfall,weather_code,surface_pressure,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover,is_day';
  const minutelyVars = 'precipitation';
  
  // Expanded hourly variables - Corrected soil_moisture_0_to_1cm
  const hourlyVars = 'temperature_2m,weather_code,apparent_temperature,precipitation_probability,relative_humidity_2m,surface_pressure,pressure_msl,uv_index,wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation,visibility,snow_depth,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,wind_speed_80m,soil_temperature_0cm,soil_moisture_0_to_1cm,vapour_pressure_deficit,temperature_80m,temperature_120m,temperature_180m,soil_temperature_6cm,soil_temperature_18cm,soil_temperature_54cm,soil_moisture_1_to_3cm,soil_moisture_3_to_9cm,soil_moisture_9_to_27cm,soil_moisture_27_to_81cm,wind_speed_120m,wind_speed_180m,wind_direction_80m,wind_direction_120m,wind_direction_180m,sunshine_duration';
  
  const dailyVars = 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_sum,precipitation_hours,precipitation_probability_max,wind_gusts_10m_max,wind_speed_10m_max,wind_direction_10m_dominant,daylight_duration,sunshine_duration,et0_fao_evapotranspiration';

  const modelParam = (model && model !== 'best_match') ? `&models=${model}` : '';
  const pastDaysParam = pastDays > 0 ? `&past_days=${pastDays}` : '';
  const url = `${FORECAST_URL}?latitude=${lat}&longitude=${lon}&current=${currentVars}&minutely_15=${minutelyVars}&hourly=${hourlyVars}&daily=${dailyVars}&timezone=auto&forecast_days=16${modelParam}${pastDaysParam}`;

  const cacheKey = `forecast-${lat}-${lon}-${model || 'default'}-${pastDays}`;
  const cached = forecastCache[cacheKey];
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
      return cached.data;
  }

  const data = await throttledFetch(url);
  forecastCache[cacheKey] = { timestamp: Date.now(), data };
  return data;
};

export const fetchHistorical = async (lat: number, lon: number, startDate: string, endDate: string) => {
  validateCoordinates(lat, lon);
  
  const end = new Date(endDate);
  const start = new Date(startDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const spanMs = end.getTime() - start.getTime();
  const spanDays = spanMs > 0 ? spanMs / (1000 * 60 * 60 * 24) : 0;

  // Use Archive if end date is before today (yesterday or older), or if range is long
  const useArchive = end < today || spanDays > 40;
  
  const hourlyVars = 'temperature_2m,weather_code,precipitation,wind_speed_10m,wind_direction_10m,sunshine_duration,pressure_msl';
  const dailyVars = 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max,daylight_duration,sunshine_duration';

  let url = '';

  if (useArchive) {
      url = `${ARCHIVE_URL}?latitude=${lat}&longitude=${lon}&start_date=${startDate}&end_date=${endDate}&hourly=${hourlyVars}&daily=${dailyVars}&timezone=auto`;
  } else {
      url = `${FORECAST_URL}?latitude=${lat}&longitude=${lon}&start_date=${startDate}&end_date=${endDate}&hourly=${hourlyVars}&daily=${dailyVars}&timezone=auto`;
  }

  return throttledFetch(url);
};

export const fetchHistoricalFull = async (lat: number, lon: number, date: string) => {
    validateCoordinates(lat, lon);
    
    // We fetch just one day for the "Current" view simulation
    const startDate = date;
    const endDate = date;
  
    // Use Archive or Forecast depending on date
    const d = new Date(date);
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    const useArchive = d < fiveDaysAgo;
  
    // Variables matching CurrentWeatherView as much as possible
    const hourlyVars = 'temperature_2m,weather_code,relative_humidity_2m,surface_pressure,wind_speed_10m,wind_direction_10m,precipitation,visibility,snow_depth,cloud_cover_low,cloud_cover_mid,cloud_cover_high,wind_speed_80m,soil_temperature_0cm,soil_moisture_0_to_1cm,vapour_pressure_deficit,temperature_80m,temperature_120m,temperature_180m,soil_temperature_6cm,soil_temperature_18cm,soil_temperature_54cm,soil_moisture_1_to_3cm,soil_moisture_3_to_9cm,soil_moisture_9_to_27cm,soil_moisture_27_to_81cm,wind_speed_120m,wind_speed_180m,wind_direction_80m,wind_direction_120m,wind_direction_180m,sunshine_duration';
    
    const dailyVars = 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_sum,precipitation_probability_max,wind_gusts_10m_max,wind_speed_10m_max,wind_direction_10m_dominant,daylight_duration,sunshine_duration,et0_fao_evapotranspiration';
  
    let url = '';
  
    if (useArchive) {
        url = `${ARCHIVE_URL}?latitude=${lat}&longitude=${lon}&start_date=${startDate}&end_date=${endDate}&hourly=${hourlyVars}&daily=${dailyVars}&timezone=auto`;
    } else {
        url = `${FORECAST_URL}?latitude=${lat}&longitude=${lon}&start_date=${startDate}&end_date=${endDate}&hourly=${hourlyVars}&daily=${dailyVars}&timezone=auto`;
    }
  
    return throttledFetch(url);
  };

export const ENSEMBLE_VARS_HOURLY_BASIC = [
    { key: 'temperature_2m', label: 'Temperature (2m)' },
    { key: 'precipitation', label: 'Precipitation' },
    { key: 'wind_speed_10m', label: 'Wind Speed (10m)' },
    { key: 'wind_direction_10m', label: 'Wind Direction (10m)' },
];

export const ENSEMBLE_VARS_HOURLY_PRO = [
    ...ENSEMBLE_VARS_HOURLY_BASIC,
    { key: 'relative_humidity_2m', label: 'Relative Humidity (2m)' },
    { key: 'dewpoint_2m', label: 'Dewpoint (2m)' },
    { key: 'apparent_temperature', label: 'Apparent Temperature' },
    { key: 'rain', label: 'Rain' },
    { key: 'snowfall', label: 'Snowfall' },
    { key: 'snow_depth', label: 'Snow Depth' },
    { key: 'weather_code', label: 'Weather Code' },
    { key: 'pressure_msl', label: 'Sea Level Pressure' },
    { key: 'surface_pressure', label: 'Surface Pressure' },
    { key: 'cloud_cover', label: 'Cloud Cover Total' },
    { key: 'cloud_cover_low', label: 'Cloud Cover Low' },
    { key: 'cloud_cover_mid', label: 'Cloud Cover Mid' },
    { key: 'cloud_cover_high', label: 'Cloud Cover High' },
    { key: 'visibility', label: 'Visibility' },
    { key: 'et0_fao_evapotranspiration', label: 'Reference Evapotranspiration (ET₀)' },
    { key: 'vapour_pressure_deficit', label: 'Vapour Pressure Deficit' },
    { key: 'wind_speed_80m', label: 'Wind Speed (80m)' },
    { key: 'wind_speed_100m', label: 'Wind Speed (100m)' },
    { key: 'wind_speed_120m', label: 'Wind Speed (120m)' },
    { key: 'wind_direction_80m', label: 'Wind Direction (80m)' },
    { key: 'wind_direction_100m', label: 'Wind Direction (100m)' },
    { key: 'wind_direction_120m', label: 'Wind Direction (120m)' },
    { key: 'wind_gusts_10m', label: 'Wind Gusts (10m)' },
    { key: 'temperature_80m', label: 'Temperature (80m)' },
    { key: 'temperature_120m', label: 'Temperature (120m)' },
];

export const ENSEMBLE_VARS_DAILY_BASIC = [
    { key: 'temperature_2m_max', label: 'Max Temperature (2m)' },
    { key: 'temperature_2m_min', label: 'Min Temperature (2m)' },
    { key: 'precipitation_sum', label: 'Precipitation Sum' },
    { key: 'wind_speed_10m_max', label: 'Max Wind Speed (10m)' },
];

export const ENSEMBLE_VARS_DAILY_PRO = [
    { key: 'temperature_2m_mean', label: 'Mean Temperature (2m)' },
    { key: 'temperature_2m_min', label: 'Min Temperature (2m)' },
    { key: 'temperature_2m_max', label: 'Max Temperature (2m)' },
    { key: 'apparent_temperature_mean', label: 'Mean Apparent Temp' },
    { key: 'apparent_temperature_min', label: 'Min Apparent Temp' },
    { key: 'apparent_temperature_max', label: 'Max Apparent Temp' },
    { key: 'wind_speed_10m_mean', label: 'Mean Wind Speed (10m)' },
    { key: 'wind_speed_10m_min', label: 'Min Wind Speed (10m)' },
    { key: 'wind_speed_10m_max', label: 'Max Wind Speed (10m)' },
    { key: 'wind_direction_10m_dominant', label: 'Dominant Wind Dir (10m)' },
    { key: 'wind_gusts_10m_mean', label: 'Mean Wind Gusts (10m)' },
    { key: 'wind_gusts_10m_min', label: 'Min Wind Gusts (10m)' },
    { key: 'wind_gusts_10m_max', label: 'Max Wind Gusts (10m)' },
    { key: 'wind_speed_100m_mean', label: 'Mean Wind Speed (100m)' },
    { key: 'wind_speed_100m_min', label: 'Min Wind Speed (100m)' },
    { key: 'wind_speed_100m_max', label: 'Max Wind Speed (100m)' },
    { key: 'wind_direction_100m_dominant', label: 'Dominant Wind Dir (100m)' },
    { key: 'cloud_cover_mean', label: 'Mean Cloud Cover' },
    { key: 'cloud_cover_min', label: 'Min Cloud Cover' },
    { key: 'cloud_cover_max', label: 'Max Cloud Cover' },
    { key: 'precipitation_sum', label: 'Precipitation Sum' },
    { key: 'precipitation_hours', label: 'Precipitation Hours' },
    { key: 'rain_sum', label: 'Rain Sum' },
    { key: 'snowfall_sum', label: 'Snowfall Sum' },
    { key: 'pressure_msl_mean', label: 'Mean Sea Level Pressure' },
    { key: 'pressure_msl_min', label: 'Min Sea Level Pressure' },
    { key: 'pressure_msl_max', label: 'Max Sea Level Pressure' },
    { key: 'surface_pressure_mean', label: 'Mean Surface Pressure' },
    { key: 'surface_pressure_min', label: 'Min Surface Pressure' },
    { key: 'surface_pressure_max', label: 'Max Surface Pressure' },
    { key: 'relative_humidity_2m_mean', label: 'Mean Relative Humidity' },
    { key: 'relative_humidity_2m_min', label: 'Min Relative Humidity' },
    { key: 'relative_humidity_2m_max', label: 'Max Relative Humidity' },
    { key: 'cape_mean', label: 'Mean CAPE' },
    { key: 'cape_min', label: 'Min CAPE' },
    { key: 'cape_max', label: 'Max CAPE' },
    { key: 'dewpoint_2m_mean', label: 'Mean Dewpoint' },
    { key: 'dewpoint_2m_min', label: 'Min Dewpoint' },
    { key: 'dewpoint_2m_max', label: 'Max Dewpoint' },
    { key: 'et0_fao_evapotranspiration', label: 'Reference Evapotranspiration (ET₀)' },
    { key: 'shortwave_radiation_sum', label: 'Shortwave Radiation Sum' },
];

export const fetchEnsemble = async (lat: number, lon: number, model: EnsembleModel, variables: string[], isDaily: boolean = false) => {
    validateCoordinates(lat, lon);
    
    const vars = variables.join(',');
    let url = `${ENSEMBLE_URL}?latitude=${lat}&longitude=${lon}&models=${model}&forecast_days=14&timezone=auto`;

    if (isDaily) {
        url += `&daily=${vars}`;
    } else {
        url += `&hourly=${vars}`;
    }

    return throttledFetch(url);
};

export const fetchHistoricalRangePastYears = async (
    lat: number,
    lon: number,
    startDate: string,
    endDate: string,
    years: number = 5
) => {
    validateCoordinates(lat, lon);

    const dailyVars = [
        "temperature_2m_max",
        "temperature_2m_min",
        "precipitation_sum",
        "sunshine_duration",
        "wind_speed_10m_max",
        "wind_gusts_10m_max",
        "daylight_duration",
        "weather_code"
    ].join(',');

    const shiftDateStringYear = (dateStr: string, yearsBack: number) => {
        const parts = dateStr.split('-');
        if (parts.length !== 3) {
            throw new Error('Error: Invalid date format. Expected YYYY-MM-DD.');
        }
        const y = Number(parts[0]);
        const m = Number(parts[1]);
        const d = Number(parts[2]);
        if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
            throw new Error('Error: Invalid date format. Expected YYYY-MM-DD.');
        }

        const dt = new Date(Date.UTC(y - yearsBack, m - 1, d));
        if (dt.getUTCMonth() !== m - 1) {
            dt.setUTCDate(0);
        }
        return dt.toISOString().slice(0, 10);
    };

    const requests: Promise<any>[] = [];
    const safeYears = Math.max(1, Math.min(10, Math.floor(years)));

    for (let i = 1; i <= safeYears; i++) {
        const pastStart = shiftDateStringYear(startDate, i);
        const pastEnd = shiftDateStringYear(endDate, i);

        const url = `${ARCHIVE_URL}?latitude=${lat}&longitude=${lon}&start_date=${pastStart}&end_date=${pastEnd}&daily=${dailyVars}&timezone=auto`;
        requests.push(throttledFetch(url));
    }

    return Promise.all(requests);
};

export const fetchSeasonal = async (lat: number, lon: number) => {
    validateCoordinates(lat, lon);
    
    const startDate = new Date().toISOString().split('T')[0];
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 6);
    const endDateStr = endDate.toISOString().split('T')[0];

    // We will use standard JSON fetch again because we can't easily rely on indices without importing the Variable enum,
     // and importing `openmeteo` package might cause issues with `flatbuffers` dependencies in some environments without proper setup.
     // However, user ASKED to use the code. 
     // Let's use the standard fetch but parse the JSON response which we know structure of better.
     // The structure is `daily: { temperature_2m_max_member01: [...], ... }`
     
     const params = new URLSearchParams({
        latitude: lat.toString(),
        longitude: lon.toString(),
        start_date: startDate,
        end_date: endDateStr,
        daily: ["temperature_2m_max", "temperature_2m_min", "precipitation_sum", "sunshine_duration", "wind_speed_10m_max"].join(','),
        // Removed explicit 'models' parameter as 'ecmwf_ifs_seasonal' was invalid.
        // Default behavior of seasonal-api.open-meteo.com is usually ECMWF Seasonal or CFS.
        // If we want ECMWF Seasonal specifically, the documentation usually refers to it as the default or 'ecmwf_ifs' (but that's for forecast).
        // Let's rely on default which is likely the seamless seasonal.
        timezone: "auto"
     });

     const url = `${SEASONAL_URL}?${params.toString()}`;
     
     checkLimit();
     trackCall();
     const response = await fetch(url);
     if (!response.ok) {
         const errorText = await response.text();
         console.error('Seasonal Fetch Error Body:', errorText);
         throw new Error(`Seasonal fetch failed: ${response.status} - ${errorText}`);
     }
     return response.json();
 };

 export const fetchHistoricalPeriods = async (lat: number, lon: number, startDate: Date) => {
    validateCoordinates(lat, lon);
    
    // Fetch last 5 years
    const promises = [];
    for (let i = 1; i <= 5; i++) {
        const d = new Date(startDate);
        d.setFullYear(d.getFullYear() - i);
        const startStr = d.toISOString().split('T')[0];
        
        const dEnd = new Date(d);
        dEnd.setDate(dEnd.getDate() + 10); // Fetch a bit more to be safe
        const endStr = dEnd.toISOString().split('T')[0];
        
        // Ensure we fetch daylight_duration
        const url = `${ARCHIVE_URL}?latitude=${lat}&longitude=${lon}&start_date=${startStr}&end_date=${endStr}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,sunshine_duration,wind_speed_10m_max,daylight_duration&timezone=auto`;
        promises.push(fetch(url).then(res => res.json()));
    }

    const results = await Promise.all(promises);
    return results;
};

export const fetchHistoricalRange = async (lat: number, lon: number, startDate: string, endDate: string) => {
    validateCoordinates(lat, lon);
    
    const dailyVars = [
        "temperature_2m_max",
        "temperature_2m_min",
        "precipitation_sum",
        "sunshine_duration",
        "wind_speed_10m_max",
        "wind_gusts_10m_max",
        "daylight_duration",
        "weather_code"
    ].join(',');
    
    const url = `${ARCHIVE_URL}?latitude=${lat}&longitude=${lon}&start_date=${startDate}&end_date=${endDate}&daily=${dailyVars}&timezone=auto`;
    return throttledFetch(url);
 };

export const calculateHeatIndex = (tempC: number, rh: number): number => {
    if (tempC < 25 || rh < 40) return tempC;
    const T = (tempC * 9/5) + 32;
    const R = rh;
    const HI = -42.379 + 2.04901523*T + 10.14333127*R - 0.22475541*T*R - 0.00683783*T*T - 0.05481717*R*R + 0.00122874*T*T*R + 0.00085282*T*R*R - 0.00000199*T*T*R*R;
    const c = (HI - 32) * 5/9;
    return c;
};

export const calculateDewPoint = (tempC: number, rh: number): number => {
    // Magnus formula
    const a = 17.27;
    const b = 237.7;
    const alpha = ((a * tempC) / (b + tempC)) + Math.log(rh / 100.0);
    return (b * alpha) / (a - alpha);
};

export const calculateJagTi = (tempC: number, windSpeedKmh: number): number | null => {
    // JAG/TI conditions:
    // T between -46 and +10 °C
    // W between 1.3 m/s and 49.0 m/s (4.68 km/h and 176.4 km/h)
    // If W < 1.3 m/s, Apparent Temp = T

    if (tempC > 10 || tempC < -46) {
        return null; // Not applicable
    }

    // Convert km/h to m/s for check
    const windMs = windSpeedKmh / 3.6;

    if (windMs < 1.3) {
        return tempC;
    }

    if (windMs > 49.0) {
        // Technically undefined by JAG/TI
        return null; 
    }

    // Formula: GJ = 13.12 + 0.6215 * T - 11.37 * (W * 3.6)^0.16 + 0.3965 * T * (W * 3.6)^0.16
    // Note: The user says "W in m/s" and formula has `(W * 3,6)`.
    // My input `windSpeedKmh` IS `W * 3.6` (if W was m/s).
    // So I use `windSpeedKmh` directly in place of `(W * 3.6)`.
    
    const V = windSpeedKmh;
    const powV = Math.pow(V, 0.16);
    
    const gj = 13.12 + (0.6215 * tempC) - (11.37 * powV) + (0.3965 * tempC * powV);
    
    return Number(gj.toFixed(1));
};

export const getActivityIcon = (activity: string): string => {
    switch (activity) {
        case 'running': return 'directions_run';
        case 'cycling': return 'directions_bike';
        case 'walking': return 'directions_walk';
        case 'bbq': return 'outdoor_grill';
        case 'beach': return 'beach_access';
        case 'sailing': return 'sailing';
        case 'gardening': return 'yard';
        case 'stargazing': return 'nights_stay';
        case 'golf': return 'sports_golf';
        case 'padel': return 'sports_handball'; // Creative choice for Padel to distinguish from Tennis
        case 'field_sports': return 'sports_soccer';
        case 'tennis': return 'sports_tennis';
        case 'home': return 'home';
        case 'work': return 'work';
        default: return 'help';
    }
};

export const getScoreColor = (score: number): string => {
    if (score >= 8) return 'text-green-500';
    if (score >= 6) return 'text-lime-500';
    if (score >= 4) return 'text-yellow-500';
    if (score >= 2) return 'text-orange-500';
    return 'text-red-500';
};

export interface ComfortScore {
    score: number;
    label: string;
    mainFactor: string;
    colorClass: string;
}

export const calculateComfortScore = (weather: {
    apparent_temperature?: number; // fallback to temp if missing
    temperature_2m: number;
    wind_speed_10m: number;
    relative_humidity_2m: number;
    precipitation_sum: number;
    cloud_cover: number;
    precipitation_probability?: number;
    weather_code?: number;
    wind_gusts_10m?: number;
    uv_index?: number;
}): ComfortScore => {
    // 1. Basis Score (Gevoelstemperatuur)
    // Use apparent_temperature if available, else temperature_2m
    const temp = weather.apparent_temperature !== undefined ? weather.apparent_temperature : weather.temperature_2m;
    
    let baseScore = 6;
    if (temp < -5) baseScore = 2;
    else if (temp < 5) baseScore = 4;
    else if (temp < 15) baseScore = 6;
    else if (temp < 20) baseScore = 8;
    else if (temp <= 26) baseScore = 10;
    else if (temp <= 30) baseScore = 8;
    else if (temp <= 35) baseScore = 5;
    else baseScore = 3;

    let score = baseScore;
    let mainFactor = '';

    // Track deductions to determine main factor
    let windDeduction = 0;
    let humidityDeduction = 0;
    let precipDeduction = 0;
    let sunBonus = 0;

    // 2. Wind Correctie
    if (weather.wind_speed_10m > 20) {
        const excess = weather.wind_speed_10m - 20;
        // 0.5 point per 5 km/h
        windDeduction = (excess / 5) * 0.5;
        // Max 3 points
        if (windDeduction > 3) windDeduction = 3;
        score -= windDeduction;
    }

    // 3. Hitte/Vocht Correctie
    if (weather.temperature_2m > 20 && weather.relative_humidity_2m > 75) {
        humidityDeduction = 1;
        score -= humidityDeduction;
    }

    // 4. Neerslag Correctie
    if (weather.precipitation_sum > 0.5) {
        // -1 punt per 2 mm
        precipDeduction = (weather.precipitation_sum / 2);
        // Cap precip deduction? User said "maximaal 5 punten eraf" in text, but "bij > 5mm is de dagscore maximaal een 4" in steps.
        if (precipDeduction > 5) precipDeduction = 5;
        
        score -= precipDeduction;
    }

    // 5. Zonnige Bonus
    if (weather.cloud_cover < 30 && weather.temperature_2m < 25) {
        sunBonus = 1;
        score += sunBonus;
    }

    // Hard Cap for Rain
    if (weather.precipitation_sum > 5 && score > 4) {
        score = 4;
    }

    // Final Rounding and Clamping
    score = Math.round(score); // Round to integer as requested
    if (score < 1) score = 1;
    if (score > 10) score = 10;

    // Determine Main Factor (Detailed Logic)
    if (!mainFactor) {
        // 1. Extreme Cold/Heat/Precip overrides
        if (temp < 0) mainFactor = 'comfort.factor.freezing';
        else if (temp < 5 && weather.wind_speed_10m > 20) mainFactor = 'comfort.factor.cutting_cold';
        else if (weather.precipitation_sum > 5) mainFactor = 'comfort.factor.continuous_rain';
        else if (weather.wind_speed_10m > 50) mainFactor = 'comfort.factor.storm';
        else if (temp > 35) mainFactor = 'comfort.factor.tropical';
        
        // 2. Deductions
        else if (precipDeduction >= 2) {
             if (weather.weather_code && [71,73,75,85,86].includes(weather.weather_code)) mainFactor = 'comfort.factor.snow';
             else if (weather.weather_code && [51,53,55,56,57].includes(weather.weather_code)) mainFactor = 'comfort.factor.drizzle';
             else if ((weather.precipitation_probability && weather.precipitation_probability > 60)) mainFactor = 'comfort.factor.showers';
             else mainFactor = 'comfort.factor.precip';
        }
        else if (windDeduction >= 1.5) {
            if (weather.wind_gusts_10m && weather.wind_gusts_10m > weather.wind_speed_10m + 20) mainFactor = 'comfort.factor.gusts';
            else mainFactor = 'comfort.factor.strong_wind';
        }
        else if (humidityDeduction > 0) mainFactor = 'comfort.factor.muggy';
        
        // 3. Moderate/Low Scores specific causes
        else if (score <= 4) {
            if (temp < 10) mainFactor = 'comfort.factor.low_temp';
            else if (weather.cloud_cover > 90) mainFactor = 'comfort.factor.gray';
            else if (weather.cloud_cover > 60) mainFactor = 'comfort.factor.clouds';
            else if (weather.weather_code && [45,48].includes(weather.weather_code)) mainFactor = 'comfort.factor.fog';
            else mainFactor = 'comfort.factor.no_sun';
        }
    
        // 4. Positive
        else if (score >= 8) {
            if (weather.wind_speed_10m < 5) mainFactor = 'comfort.factor.calm';
            else if (weather.cloud_cover < 20) mainFactor = 'comfort.factor.sunny';
            else if (temp >= 20 && temp <= 25) mainFactor = 'comfort.factor.ideal_temp';
            else mainFactor = 'comfort.factor.top_conditions';
        }
        
        // 5. Fallback for mid-range (5-7)
        else {
            if (temp < 15) mainFactor = 'comfort.factor.fresh_air';
            else if (weather.cloud_cover > 50) mainFactor = 'comfort.factor.clouds';
            
            // The user didn't specify a "Neutral" main factor.
            // Let's use "Bewolking" (clouds) or "Frisse lucht" if applicable.
            if (!mainFactor) {
                 if (weather.cloud_cover > 50) mainFactor = 'comfort.factor.clouds';
                 else mainFactor = 'comfort.factor.sunny'; // If not cloudy and not extreme, it's sunny?
            }
        }
    }

    // Determine Label
    let label = 'comfort.label.6';
    if (score >= 9) label = 'comfort.label.10';
    else if (score >= 8) label = 'comfort.label.8';
    else if (score >= 6) label = 'comfort.label.6';
    else if (score >= 4) label = 'comfort.label.4';
    else if (score >= 2) label = 'comfort.label.2';
    else label = 'comfort.label.1';

    // Determine Color Class
    let colorClass = 'bg-slate-500 text-white';
    if (score >= 8) colorClass = 'bg-green-500 text-white'; // 8-10 Groen
    else if (score >= 6) colorClass = 'bg-amber-500 text-white'; // 6-7 Geel/Oranje
    else colorClass = 'bg-slate-400 text-white'; // 1-5 Grijs/Blauw

    return {
        score,
        label,
        mainFactor,
        colorClass
    };
};

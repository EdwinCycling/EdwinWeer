
import { WeatherData, TempUnit, WindUnit, PrecipUnit, AppLanguage } from "../types";

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive";

// --- UNIT CONVERSION HELPERS ---

export const convertTemp = (tempC: number, unit: TempUnit): number => {
    if (unit === TempUnit.FAHRENHEIT) {
        return Math.round(((tempC * 9/5) + 32));
    }
    return Math.round(tempC);
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

export const convertPrecip = (precipMm: number, unit: PrecipUnit): number => {
    if (unit === PrecipUnit.INCH) {
        return parseFloat((precipMm / 25.4).toFixed(2));
    }
    return parseFloat(precipMm.toFixed(1));
};

export const getTempLabel = (unit: TempUnit) => unit === TempUnit.FAHRENHEIT ? '°F' : '°C';

// --- EXISTING MAPPERS ---

export const mapWmoCodeToIcon = (code: number, isNight = false): string => {
  switch (code) {
    case 0: return isNight ? 'clear_night' : 'sunny';
    case 1:
    case 2: return isNight ? 'partly_cloudy_night' : 'partly_cloudy_day';
    case 3: return 'cloud';
    case 45:
    case 48: return 'foggy';
    case 51:
    case 53:
    case 55: return 'rainy_light';
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

const validateCoordinates = (lat: number, lon: number) => {
    if (typeof lat !== 'number' || typeof lon !== 'number' || isNaN(lat) || isNaN(lon)) {
        throw new Error(`Invalid coordinates: ${lat}, ${lon}`);
    }
}

export const fetchForecast = async (lat: number, lon: number) => {
  validateCoordinates(lat, lon);
  
  const currentVars = 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,showers,snowfall,weather_code,surface_pressure,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover,is_day';
  const minutelyVars = 'precipitation';
  
  // Expanded hourly variables - Corrected soil_moisture_0_to_1cm
  const hourlyVars = 'temperature_2m,weather_code,relative_humidity_2m,surface_pressure,uv_index,wind_speed_10m,wind_direction_10m,precipitation,visibility,snow_depth,cloud_cover_low,cloud_cover_mid,cloud_cover_high,wind_speed_80m,soil_temperature_0cm,soil_moisture_0_to_1cm,vapour_pressure_deficit,temperature_80m,temperature_120m,temperature_180m,soil_temperature_6cm,soil_temperature_18cm,soil_temperature_54cm,soil_moisture_1_to_3cm,soil_moisture_3_to_9cm,soil_moisture_9_to_27cm,soil_moisture_27_to_81cm,wind_speed_120m,wind_speed_180m,wind_direction_80m,wind_direction_120m,wind_direction_180m';
  
  const dailyVars = 'weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_sum,precipitation_probability_max,wind_gusts_10m_max,daylight_duration,sunshine_duration,et0_fao_evapotranspiration';

  const url = `${FORECAST_URL}?latitude=${lat}&longitude=${lon}&current=${currentVars}&minutely_15=${minutelyVars}&hourly=${hourlyVars}&daily=${dailyVars}&timezone=auto&forecast_days=16`;

  const response = await fetch(url);
  if (!response.ok) {
      throw new Error(`Weather fetch failed: ${response.status}`);
  }
  return response.json();
};

export const fetchHistorical = async (lat: number, lon: number, startDate: string, endDate: string) => {
  validateCoordinates(lat, lon);
  
  const end = new Date(endDate);
  const fiveDaysAgo = new Date();
  fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

  const useArchive = end < fiveDaysAgo;
  
  const hourlyVars = 'temperature_2m,weather_code,precipitation,wind_speed_10m,wind_direction_10m,sunshine_duration';
  const dailyVars = 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max';

  let url = '';

  if (useArchive) {
      url = `${ARCHIVE_URL}?latitude=${lat}&longitude=${lon}&start_date=${startDate}&end_date=${endDate}&hourly=${hourlyVars}&daily=${dailyVars}&timezone=auto`;
  } else {
      url = `${FORECAST_URL}?latitude=${lat}&longitude=${lon}&start_date=${startDate}&end_date=${endDate}&hourly=${hourlyVars}&daily=${dailyVars}&timezone=auto`;
  }

  const response = await fetch(url);
  if (!response.ok) {
      throw new Error(`Historical fetch failed: ${response.status}`);
  }
  return response.json();
};


export interface WeatherData {
  time: string;
  temp: number;
  condition: string;
  icon: string;
}

export interface Location {
  name: string;
  country: string;
  lat: number;
  lon: number;
}

export enum ComparisonType {
  YESTERDAY = 'Yesterday',
  LAST_WEEK = 'Last Week',
  LAST_MONTH = 'Last Month',
  LAST_YEAR = 'Last Year'
}

export interface RideData {
  id: string;
  name: string;
  date: string;
  distance: number;
  time: string;
  elevation: number;
  avgSpeed: number;
  mapUrl: string;
  weather: {
    temp: number;
    wind: number;
    precip: number;
  }
}

// Simple types for API responses to avoid 'any'
export interface OpenMeteoCurrent {
    temperature_2m: number;
    relative_humidity_2m: number;
    apparent_temperature: number;
    precipitation: number;
    weather_code: number;
    surface_pressure: number;
    pressure_msl: number; // Mean Sea Level
    wind_speed_10m: number;
    wind_direction_10m: number;
    wind_gusts_10m: number;
    cloud_cover: number;
    is_day: number;
}

export interface OpenMeteoResponse {
    utc_offset_seconds: number;
    current: OpenMeteoCurrent;
    minutely_15: {
        time: string[];
        precipitation: number[];
    };
    hourly: {
        time: string[];
        temperature_2m: number[];
        weather_code: number[];
        relative_humidity_2m: number[];
        surface_pressure: number[];
        uv_index: number[];
        wind_speed_10m: number[];
        wind_direction_10m: number[];
        precipitation: number[];
        // New detailed fields
        visibility: number[];
        snow_depth: number[];
        cloud_cover_low: number[];
        cloud_cover_mid: number[];
        cloud_cover_high: number[];
        vapour_pressure_deficit: number[];
        
        // Extended Wind & Temp
        wind_speed_80m: number[];
        wind_speed_120m: number[];
        wind_speed_180m: number[];
        wind_direction_80m: number[];
        wind_direction_120m: number[];
        wind_direction_180m: number[];
        temperature_80m: number[];
        temperature_120m: number[];
        temperature_180m: number[];

        // Extended Soil
        soil_temperature_0cm: number[];
        soil_temperature_6cm: number[];
        soil_temperature_18cm: number[];
        soil_temperature_54cm: number[];
        soil_moisture_0_to_1cm: number[];
        soil_moisture_1_to_3cm: number[];
        soil_moisture_3_to_9cm: number[];
        soil_moisture_9_to_27cm: number[];
        soil_moisture_27_to_81cm: number[];
    };
    daily: {
        time: string[];
        weather_code: number[];
        temperature_2m_max: number[];
        temperature_2m_min: number[];
        sunrise: string[];
        sunset: string[];
        uv_index_max: number[];
        precipitation_sum: number[];
        precipitation_probability_max: number[];
        wind_gusts_10m_max: number[];
        daylight_duration: number[];
        sunshine_duration: number[];
        et0_fao_evapotranspiration: number[];
    }
}

// --- NEW SETTINGS TYPES ---

export enum TempUnit {
    CELSIUS = 'C',
    FAHRENHEIT = 'F'
}

export enum WindUnit {
    KMH = 'km/h',
    BFT = 'Bft',
    MS = 'm/s',
    MPH = 'mph',
    KNOTS = 'kn'
}

export enum PrecipUnit {
    MM = 'mm',
    INCH = 'inch'
}

export type AppTheme = 'dark' | 'light';
export type AppLanguage = 'en' | 'nl';

export interface AppSettings {
    tempUnit: TempUnit;
    windUnit: WindUnit;
    precipUnit: PrecipUnit;
    favorites: Location[];
    theme: AppTheme;
    language: AppLanguage;
}

export enum ViewState {
  CURRENT = 'CURRENT',
  MAP = 'MAP',
  HISTORICAL = 'HISTORICAL',
  STRAVA = 'STRAVA',
  HOURLY_DETAIL = 'HOURLY_DETAIL',
  SETTINGS = 'SETTINGS'
}

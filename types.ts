
export type Dictionary = Record<string, string>;

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
  isCurrentLocation?: boolean;
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
    time: string;
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
        apparent_temperature: number[];
        precipitation_probability: number[];
        weather_code: number[];
        relative_humidity_2m: number[];
        surface_pressure: number[];
        pressure_msl: number[];
        uv_index: number[];
        wind_speed_10m: number[];
        wind_direction_10m: number[];
        wind_gusts_10m: number[];
        precipitation: number[];
        // New detailed fields
        visibility: number[];
        snow_depth: number[];
        cloud_cover: number[];
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
        sunshine_duration: number[];

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
        moonrise: string[];
        moonset: string[];
        uv_index_max: number[];
        precipitation_sum: number[];
        precipitation_probability_max: number[];
        wind_gusts_10m_max: number[];
        wind_speed_10m_max: number[];
        wind_direction_10m_dominant: number[];
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

export enum PressureUnit {
    HPA = 'hPa',
    INHG = 'inHg'
}

export type AppTheme = 'dark' | 'light' | 'neuro' | 'iceland' | 'retro';
export type AppLanguage = 'en' | 'nl' | 'fr' | 'de' | 'es';
export type TimeFormat = '12h' | '24h';
export type MapBaseLayer = 'light' | 'dark' | 'satellite';

export interface HeatwaveSettings {
    minLength: number;
    lowerThreshold: number;
    heatThreshold: number;
    minHeatDays: number;
}

export interface RecordThresholds {
    summerStreakTemp: number; // default 25
    niceStreakTemp: number;   // default 20
    coldStreakTemp: number;   // default 5
    iceStreakTemp: number;    // default 0
}

export interface CalendarSettings {
    showHeatmap: boolean;
    showDetails: boolean;
}

export interface AppSettings {
    tempUnit: TempUnit;
    windUnit: WindUnit;
    precipUnit: PrecipUnit;
    pressureUnit: PressureUnit;
    favorites: Location[];
    theme: AppTheme;
    language: AppLanguage;
    timeFormat: TimeFormat;
    enabledActivities: Record<ActivityType, boolean>;
    heatwave: HeatwaveSettings;
    recordThresholds: RecordThresholds;
    historicalMode?: 'single' | 'compare';
    mapBaseLayer?: MapBaseLayer;
    weekStartDay?: 'monday' | 'sunday' | 'saturday';
    timezone?: string;
    calendar?: CalendarSettings;
    climatePeriodType?: '30year' | 'decade';
    yr_map?: {
        type: 'vind' | 'radar' | 'temperatur';
        zoom: number;
        speed: number;
    };
    baroProfile?: BaroProfile;
    baroProfiles?: BaroProfile[]; // Saved profiles
    trip_planner?: TripPlannerSettings;
    cycling_updates?: {
        enabled: boolean;
        channel: 'email' | 'telegram';
    };
}

export interface TripPlannerSettings {
    activity: 'cycling' | 'walking';
    startTime: string; // "10:00"
    marginBefore: number; // 0-4
    marginAfter: number; // 0-4
    duration: number; // 1-8
    speed?: number; // km/h
    useGpxSpeed?: boolean;
}

export interface BaroWeermanSettings {
    enabled: boolean;
    channel: 'email' | 'telegram';
    days: string[];
    trip_settings: TripPlannerSettings;
    location: Location;
}

export interface BaroProfile {
    id?: string;
    name?: string;
    activities: string | ActivityType[]; // comma separated or free text OR array of types
    location: string;
    timeOfDay: string[]; // ['morning', 'afternoon', 'evening', 'night', 'combo']
    transport: string[]; // ['walk', 'bike', 'motorcycle', 'car', 'combo', 'none']
    hobbies?: string;
    otherInstructions?: string;
    daysAhead: number; // 1, 2, 3, 7, 14
    reportStyle: string[]; // ['business', 'readable', 'humor', etc]
    reportLength?: 'factual' | 'standard' | 'extended';
    isGeneralReport?: boolean;
    hayFever?: boolean;
    emailSchedule?: EmailSchedule;
    messengerSchedule?: EmailSchedule; // Reusing EmailSchedule structure for simplicity as it has days/slots
    activity_settings?: ActivityPlannerSettings;
}

export interface ActivityPlannerSettings {
    [key: string]: { // ActivityType as key
        enabled: boolean;
        min_score: number;
        days: number[]; // 0-6
        channels: {
            telegram: boolean;
            email: boolean;
        };
    };
}

export interface EmailSchedule {
    enabled: boolean;
    days: EmailScheduleDay[];
}

export interface EmailScheduleDay {
    day: string; // 'monday', 'tuesday', etc.
    breakfast: boolean;
    lunch: boolean;
    dinner: boolean;
}

export enum ViewState {
  CURRENT = 'CURRENT',
  MAP = 'MAP',
  HISTORICAL = 'HISTORICAL',
  STRAVA = 'STRAVA',
  HOURLY_DETAIL = 'HOURLY_DETAIL',
  ENSEMBLE = 'ENSEMBLE',
  HOLIDAY = 'HOLIDAY',
  HOLIDAY_REPORT = 'HOLIDAY_REPORT',
  RECORDS = 'RECORDS',
  SETTINGS = 'SETTINGS',
  TEAM = 'TEAM',
  PRICING = 'PRICING',
  INFO = 'INFO',
  MODEL_INFO = 'MODEL_INFO',
  FORECAST = 'FORECAST',
  COUNTRY_MAP = 'COUNTRY_MAP',
  USER_ACCOUNT = 'USER_ACCOUNT',
  FAQ = 'FAQ',
  SHARE = 'SHARE',
  BAROMETER = 'BAROMETER',
  CLIMATE_CHANGE = 'CLIMATE_CHANGE',
  THIS_DAY = 'THIS_DAY',
  MESSENGER = 'MESSENGER',
  NOTIFICATIONS = 'NOTIFICATIONS',
  PROFILES = 'PROFILES',
  YOUR_DAY = 'YOUR_DAY',
  EMAIL_SETTINGS = 'EMAIL_SETTINGS',
  ACTIVITY_PLANNER = 'ACTIVITY_PLANNER',
  CYCLING = 'CYCLING',
  BARO_WEERMAN = 'BARO_WEERMAN',
  WEATHER_FINDER = 'WEATHER_FINDER',
  TRIP_PLANNER = 'TRIP_PLANNER',
  BARO_TIME_MACHINE = 'BARO_TIME_MACHINE',
  BARO_STORYTELLER = 'BARO_STORYTELLER',
  SONG_WRITER = 'SONG_WRITER'
}

export interface CustomEvent {
    id: string;
    name: string;
    date: string; // MM-DD
    endDate?: string; // MM-DD
    duration?: number; // 1-14 days
    profileId?: string;
    location: Location;
    active: boolean;
    recurring?: boolean;
    year?: number;
}

export type ActivityType = 'running' | 'cycling' | 'walking' | 'bbq' | 'beach' | 'sailing' | 'gardening' | 'stargazing' | 'golf' | 'padel' | 'field_sports' | 'tennis' | 'home' | 'work';

export type EnsembleModel = 
    'icon_seamless' | 
    'icon_global' | 
    'icon_eu' | 
    'icon_d2' | 
    'gfs_seamless' | 
    'gfs025' | 
    'gfs05' | 
    'ecmwf_ifs025' | 
    'ecmwf_aifs025' |
    'gem_global' | 
    'bom_access_global' | 
    'metoffice_global' | 
    'metoffice_uk' | 
    'icon_ch1_eps' |
    'best_match';

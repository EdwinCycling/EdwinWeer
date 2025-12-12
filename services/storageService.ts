
import { Location, ComparisonType, AppSettings, TempUnit, WindUnit, PrecipUnit, PressureUnit, AppTheme, AppLanguage, EnsembleModel, ActivityType } from "../types";

const KEY_CURRENT_LOC = "weather_app_current_location";
const KEY_HISTORICAL_LOC = "weather_app_historical_location";
const KEY_COMPARISON_TYPE = "weather_app_comparison_type";
const KEY_APP_SETTINGS = "weather_app_settings";
const KEY_ENSEMBLE_MODEL = "weather_app_ensemble_model";
const KEY_ENSEMBLE_VIEW_MODE = "weather_app_ensemble_view_mode";
const KEY_ENSEMBLE_TIME_STEP = "weather_app_ensemble_time_step";
const KEY_ENSEMBLE_PRO_MODE = "weather_app_ensemble_pro_mode";

const DEFAULT_LOCATION: Location = { 
  name: "Amsterdam", 
  country: "NL", 
  lat: 52.3676, 
  lon: 4.9041 
};

const DEFAULT_FAVORITES: Location[] = [
    {name: "Amsterdam", country: "NL", lat: 52.3676, lon: 4.9041},
    {name: "Tokyo", country: "Japan", lat: 35.6762, lon: 139.6503},
    {name: "New York", country: "USA", lat: 40.7128, lon: -74.0060},
    {name: "London", country: "UK", lat: 51.5074, lon: -0.1278},
    {name: "Paris", country: "FR", lat: 48.8566, lon: 2.3522},
];

const DEFAULT_ENABLED_ACTIVITIES: Record<ActivityType, boolean> = {
    bbq: true,
    cycling: true,
    walking: true,
    sailing: true,
    running: true,
    beach: true,
    gardening: true,
    stargazing: true,
    golf: true,
    drone: true
};

export const DEFAULT_SETTINGS: AppSettings = {
    tempUnit: TempUnit.CELSIUS,
    windUnit: WindUnit.KMH,
    precipUnit: PrecipUnit.MM,
    pressureUnit: PressureUnit.HPA,
    favorites: DEFAULT_FAVORITES,
    theme: 'dark',
    language: 'en',
    timeFormat: '24h',
    enabledActivities: DEFAULT_ENABLED_ACTIVITIES
};

export const saveCurrentLocation = (loc: Location) => {
  if (typeof window !== "undefined") {
    localStorage.setItem(KEY_CURRENT_LOC, JSON.stringify(loc));
  }
};

export const loadCurrentLocation = (): Location => {
  if (typeof window === "undefined") return DEFAULT_LOCATION;
  const stored = localStorage.getItem(KEY_CURRENT_LOC);
  return stored ? JSON.parse(stored) : DEFAULT_LOCATION;
};

export const saveHistoricalLocation = (loc: Location) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(KEY_HISTORICAL_LOC, JSON.stringify(loc));
    }
};
  
export const loadHistoricalLocation = (): Location => {
    if (typeof window === "undefined") return loadCurrentLocation();
    const stored = localStorage.getItem(KEY_HISTORICAL_LOC);
    return stored ? JSON.parse(stored) : loadCurrentLocation();
};

export const saveComparisonType = (type: ComparisonType) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(KEY_COMPARISON_TYPE, type);
    }
};

export const loadComparisonType = (): ComparisonType => {
    if (typeof window === "undefined") return ComparisonType.YESTERDAY;
    return (localStorage.getItem(KEY_COMPARISON_TYPE) as ComparisonType) || ComparisonType.YESTERDAY;
};

export const saveSettings = (settings: AppSettings) => {
    if (typeof window !== "undefined") {
        localStorage.setItem(KEY_APP_SETTINGS, JSON.stringify(settings));
    }
};

export const loadSettings = (): AppSettings => {
    if (typeof window === "undefined") return DEFAULT_SETTINGS;
    const stored = localStorage.getItem(KEY_APP_SETTINGS);
    if (!stored) return DEFAULT_SETTINGS;
    
    // Merge with default to ensure new fields (theme, language) exist if old storage
    const parsed = JSON.parse(stored);
    return { ...DEFAULT_SETTINGS, ...parsed };
};

export const saveEnsembleModel = (model: EnsembleModel) => {
    if (typeof window !== "undefined") {
        localStorage.setItem(KEY_ENSEMBLE_MODEL, model);
    }
};

export const loadEnsembleModel = (): EnsembleModel => {
    if (typeof window === "undefined") return 'gfs_seamless';
    return (localStorage.getItem(KEY_ENSEMBLE_MODEL) as EnsembleModel) || 'gfs_seamless';
};

export const saveEnsembleViewMode = (mode: string) => {
    if (typeof window !== "undefined") {
        localStorage.setItem(KEY_ENSEMBLE_VIEW_MODE, mode);
    }
};

export const loadEnsembleViewMode = (): string => {
    if (typeof window === "undefined") return 'all';
    return localStorage.getItem(KEY_ENSEMBLE_VIEW_MODE) || 'all';
};

export const saveEnsembleTimeStep = (step: 'hourly' | 'daily') => {
    if (typeof window !== "undefined") {
        localStorage.setItem(KEY_ENSEMBLE_TIME_STEP, step);
    }
};

export const loadEnsembleTimeStep = (): 'hourly' | 'daily' => {
    if (typeof window === "undefined") return 'hourly';
    return (localStorage.getItem(KEY_ENSEMBLE_TIME_STEP) as 'hourly' | 'daily') || 'hourly';
};

export const saveEnsembleProMode = (enabled: boolean) => {
    if (typeof window !== "undefined") {
        localStorage.setItem(KEY_ENSEMBLE_PRO_MODE, String(enabled));
    }
};

export const loadEnsembleProMode = (): boolean => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(KEY_ENSEMBLE_PRO_MODE) === 'true';
};

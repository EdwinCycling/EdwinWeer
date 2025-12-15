import { Location, ComparisonType, AppSettings, TempUnit, WindUnit, PrecipUnit, PressureUnit, AppTheme, AppLanguage, EnsembleModel, ActivityType } from "../types";
import { db } from "./firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

const KEY_CURRENT_LOC = "weather_app_current_location";
const KEY_HISTORICAL_LOC = "weather_app_historical_location";
const KEY_COMPARISON_TYPE = "weather_app_comparison_type";
const KEY_APP_SETTINGS = "weather_app_settings";
const KEY_ENSEMBLE_MODEL = "weather_app_ensemble_model";
const KEY_ENSEMBLE_VIEW_MODE = "weather_app_ensemble_view_mode";
const KEY_ENSEMBLE_TIME_STEP = "weather_app_ensemble_time_step";
const KEY_ENSEMBLE_PRO_MODE = "weather_app_ensemble_pro_mode";
const KEY_FORECAST_ACTIVITIES_MODE = "weather_app_forecast_activities_mode";
const KEY_FORECAST_VIEW_MODE = "weather_app_forecast_view_mode"; // Replaces expanded_mode
const KEY_FORECAST_TREND_ARROWS_MODE = "weather_app_forecast_trend_arrows_mode";

let currentUserId: string | null = null;

export const setStorageUserId = (uid: string | null) => {
    currentUserId = uid;
};

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
    enabledActivities: DEFAULT_ENABLED_ACTIVITIES,
    heatwave: {
        minLength: 5,
        lowerThreshold: 25,
        heatThreshold: 30,
        minHeatDays: 3
    },
    recordThresholds: {
        summerStreakTemp: 25,
        niceStreakTemp: 20,
        coldStreakTemp: 5,
        iceStreakTemp: 0
    },
    weekStartDay: 'monday',
    calendar: {
        showHeatmap: true,
        showDetails: true
    }
};

// --- Remote Sync Helpers ---

const syncSettingsToRemote = async (settings: AppSettings) => {
    if (!currentUserId || !db) {
        console.log("Skipping sync: No User ID or DB", { currentUserId, hasDb: !!db });
        return;
    }
    try {
        console.log("Syncing settings to Firestore for user:", currentUserId);
        // Exclude theme from sync (per user request)
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { theme, ...settingsToSync } = settings;
        
        const userRef = doc(db, 'users', currentUserId);
        await setDoc(userRef, { settings: settingsToSync }, { merge: true });
        console.log("Settings synced successfully");
    } catch (e) {
        console.error("Error syncing settings:", e);
    }
};

const syncEnsembleToRemote = async () => {
    if (!currentUserId || !db) return;
    try {
        const preferences = {
            ensembleModel: loadEnsembleModel(),
            ensembleViewMode: loadEnsembleViewMode(),
            ensembleTimeStep: loadEnsembleTimeStep(),
            ensembleProMode: loadEnsembleProMode()
        };
        const userRef = doc(db, 'users', currentUserId);
        await setDoc(userRef, { ensemble: preferences }, { merge: true });
    } catch (e) {
        console.error("Error syncing ensemble prefs:", e);
    }
};

const syncForecastToRemote = async () => {
    if (!currentUserId || !db) return;
    try {
        const preferences = {
            activitiesMode: loadForecastActivitiesMode(),
            viewMode: loadForecastViewMode(),
            trendArrows: loadForecastTrendArrowsMode()
        };
        const userRef = doc(db, 'users', currentUserId);
        await setDoc(userRef, { forecastView: preferences }, { merge: true });
    } catch (e) {
        console.error("Error syncing forecast view:", e);
    }
};

export const loadRemoteData = async (uid: string) => {
    if (!db) return;
    try {
        const userRef = doc(db, 'users', uid);
        const snap = await getDoc(userRef);
        if (snap.exists()) {
            const data = snap.data();
            if (data.settings) {
                // Update local storage for settings
                // We don't want to trigger sync back immediately, so we just write to local storage
                if (typeof window !== "undefined") {
                    localStorage.setItem(KEY_APP_SETTINGS, JSON.stringify(data.settings));
                }
            }
            if (data.ensemble) {
                if (data.ensemble.ensembleModel && typeof window !== "undefined") localStorage.setItem(KEY_ENSEMBLE_MODEL, data.ensemble.ensembleModel);
                if (data.ensemble.ensembleViewMode && typeof window !== "undefined") localStorage.setItem(KEY_ENSEMBLE_VIEW_MODE, data.ensemble.ensembleViewMode);
                if (data.ensemble.ensembleTimeStep && typeof window !== "undefined") localStorage.setItem(KEY_ENSEMBLE_TIME_STEP, data.ensemble.ensembleTimeStep);
                if (data.ensemble.ensembleProMode !== undefined && typeof window !== "undefined") localStorage.setItem(KEY_ENSEMBLE_PRO_MODE, String(data.ensemble.ensembleProMode));
            }
            if (data.forecastView) {
                if (data.forecastView.activitiesMode && typeof window !== "undefined") localStorage.setItem(KEY_FORECAST_ACTIVITIES_MODE, data.forecastView.activitiesMode);
                if (data.forecastView.viewMode && typeof window !== "undefined") localStorage.setItem(KEY_FORECAST_VIEW_MODE, data.forecastView.viewMode);
                if (data.forecastView.trendArrows !== undefined && typeof window !== "undefined") localStorage.setItem(KEY_FORECAST_TREND_ARROWS_MODE, String(data.forecastView.trendArrows));
            }
        }
    } catch (e) {
        console.error("Error loading remote data:", e);
    }
};

export const saveCurrentLocation = (location: Location) => {
    if (typeof window !== "undefined") {
        localStorage.setItem(KEY_CURRENT_LOC, JSON.stringify(location));
    }
};

export const loadCurrentLocation = (): Location => {
    if (typeof window === "undefined") return DEFAULT_LOCATION;
    const stored = localStorage.getItem(KEY_CURRENT_LOC);
    if (!stored) return DEFAULT_LOCATION;
    try {
        return JSON.parse(stored);
    } catch {
        return DEFAULT_LOCATION;
    }
};

export const saveHistoricalLocation = (location: Location) => {
    if (typeof window !== "undefined") {
        localStorage.setItem(KEY_HISTORICAL_LOC, JSON.stringify(location));
    }
};

export const loadHistoricalLocation = (): Location => {
    if (typeof window === "undefined") return DEFAULT_LOCATION;
    const stored = localStorage.getItem(KEY_HISTORICAL_LOC);
    if (!stored) return DEFAULT_LOCATION;
    try {
        return JSON.parse(stored);
    } catch {
        return DEFAULT_LOCATION;
    }
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
    // Sync to firestore if logged in
    syncSettingsToRemote(settings);
};

export const loadSettings = (): AppSettings => {
    if (typeof window === "undefined") return DEFAULT_SETTINGS;
    const stored = localStorage.getItem(KEY_APP_SETTINGS);
    if (!stored) return DEFAULT_SETTINGS;
    
    // Merge with default to ensure new fields (theme, language) exist if old storage
    const parsed = JSON.parse(stored);
    return { 
        ...DEFAULT_SETTINGS, 
        ...parsed,
        // Ensure nested objects are merged correctly so new fields (like minHeatDays) are picked up
        heatwave: {
            ...DEFAULT_SETTINGS.heatwave,
            ...(parsed.heatwave || {})
        },
        recordThresholds: {
            ...DEFAULT_SETTINGS.recordThresholds,
            ...(parsed.recordThresholds || {})
        },
        enabledActivities: {
            ...DEFAULT_SETTINGS.enabledActivities,
            ...(parsed.enabledActivities || {})
        }
    };
};

export const saveEnsembleModel = (model: EnsembleModel) => {
    if (typeof window !== "undefined") {
        localStorage.setItem(KEY_ENSEMBLE_MODEL, model);
    }
    syncEnsembleToRemote();
};

export const loadEnsembleModel = (): EnsembleModel => {
    if (typeof window === "undefined") return 'gfs_seamless';
    const stored = localStorage.getItem(KEY_ENSEMBLE_MODEL);
    // Fallback for deprecated models
    if (stored === 'icon_ch2_eps') return 'gfs_seamless';
    return (stored as EnsembleModel) || 'gfs_seamless';
};

export const saveEnsembleViewMode = (mode: string) => {
    if (typeof window !== "undefined") {
        localStorage.setItem(KEY_ENSEMBLE_VIEW_MODE, mode);
    }
    syncEnsembleToRemote();
};

export const loadEnsembleViewMode = (): string => {
    if (typeof window === "undefined") return 'all';
    return localStorage.getItem(KEY_ENSEMBLE_VIEW_MODE) || 'all';
};

export const saveEnsembleTimeStep = (step: 'hourly' | 'daily') => {
    if (typeof window !== "undefined") {
        localStorage.setItem(KEY_ENSEMBLE_TIME_STEP, step);
    }
    syncEnsembleToRemote();
};

export const loadEnsembleTimeStep = (): 'hourly' | 'daily' => {
    if (typeof window === "undefined") return 'hourly';
    return (localStorage.getItem(KEY_ENSEMBLE_TIME_STEP) as 'hourly' | 'daily') || 'hourly';
};

export const saveEnsembleProMode = (enabled: boolean) => {
    if (typeof window !== "undefined") {
        localStorage.setItem(KEY_ENSEMBLE_PRO_MODE, String(enabled));
    }
    syncEnsembleToRemote();
};

export const loadEnsembleProMode = (): boolean => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(KEY_ENSEMBLE_PRO_MODE) === 'true';
};

export const saveForecastActivitiesMode = (mode: 'none' | 'positive' | 'all') => {
    if (typeof window !== "undefined") {
        localStorage.setItem(KEY_FORECAST_ACTIVITIES_MODE, mode);
    }
    syncForecastToRemote();
};

export const loadForecastActivitiesMode = (): 'none' | 'positive' | 'all' => {
    if (typeof window === "undefined") return 'all';
    return (localStorage.getItem(KEY_FORECAST_ACTIVITIES_MODE) as 'none' | 'positive' | 'all') || 'all';
};

export type ForecastViewMode = 'compact' | 'expanded' | 'graph';

export const saveForecastViewMode = (mode: ForecastViewMode) => {
    if (typeof window !== "undefined") {
        localStorage.setItem(KEY_FORECAST_VIEW_MODE, mode);
    }
    syncForecastToRemote();
};

export const loadForecastViewMode = (): ForecastViewMode => {
    if (typeof window === "undefined") return 'compact';
    const stored = localStorage.getItem(KEY_FORECAST_VIEW_MODE);
    if (stored) return stored as ForecastViewMode;
    
    // Fallback to legacy expanded mode if exists
    const legacyExpanded = localStorage.getItem("weather_app_forecast_expanded_mode");
    if (legacyExpanded === 'true') return 'expanded';
    
    return 'compact';
};

export const saveForecastTrendArrowsMode = (enabled: boolean) => {
    if (typeof window !== "undefined") {
        localStorage.setItem(KEY_FORECAST_TREND_ARROWS_MODE, String(enabled));
    }
    syncForecastToRemote();
};

export const loadForecastTrendArrowsMode = (): boolean => {
    if (typeof window === "undefined") return true;
    const stored = localStorage.getItem(KEY_FORECAST_TREND_ARROWS_MODE);
    return stored === null ? true : stored === 'true';
};

// DEPRECATED: Use loadForecastViewMode instead
export const saveForecastExpandedMode = (expanded: boolean) => {
    saveForecastViewMode(expanded ? 'expanded' : 'compact');
};

export const loadForecastExpandedMode = (): boolean => {
    return loadForecastViewMode() === 'expanded';
};

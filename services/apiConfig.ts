
export const API_LIMITS = {
    MINUTE: 50,
    HOUR: 500,
    DAY: 200, // Reduced from 1500 for free tier
    MONTH: 5000
};

export const STORAGE_KEY = 'weather_app_usage_v2'; // Bump version to force reset/migration if needed

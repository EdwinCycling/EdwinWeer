
import { API_LIMITS, STORAGE_KEY } from './apiConfig';

export interface UsageStats {
    totalCalls: number;
    
    // Minute
    minuteCount: number;
    minuteStart: number; // timestamp

    // Hour
    hourCount: number;
    hourStart: number; // timestamp

    // Day
    dayCount: number;
    dayStart: string; // YYYY-MM-DD

    // Month
    monthCount: number;
    monthStart: string; // YYYY-MM
}

const DEFAULT_STATS: UsageStats = {
    totalCalls: 0,
    
    minuteCount: 0,
    minuteStart: Date.now(),
    
    hourCount: 0,
    hourStart: Date.now(),
    
    dayCount: 0,
    dayStart: new Date().toISOString().split('T')[0],
    
    monthCount: 0,
    monthStart: new Date().toISOString().slice(0, 7)
};

export const getUsage = (): UsageStats => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return DEFAULT_STATS;
        const parsed = JSON.parse(stored);
        
        // Merge with defaults to ensure all fields exist (migration)
        return { ...DEFAULT_STATS, ...parsed };
    } catch (e) {
        return DEFAULT_STATS;
    }
};

const saveUsage = (stats: UsageStats) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
    } catch (e) {
        console.error('Failed to save usage stats', e);
    }
};

export const checkLimit = (): void => {
    const stats = getUsage();
    const now = Date.now();
    const today = new Date().toISOString().split('T')[0];
    const thisMonth = new Date().toISOString().slice(0, 7);

    // Check Minute Limit
    if (now - stats.minuteStart < 60000) {
        if (stats.minuteCount >= API_LIMITS.MINUTE) {
            throw new Error(`API limit exceeded: ${API_LIMITS.MINUTE} calls per minute.`);
        }
    }

    // Check Hour Limit
    if (now - stats.hourStart < 3600000) {
        if (stats.hourCount >= API_LIMITS.HOUR) {
             throw new Error(`API limit exceeded: ${API_LIMITS.HOUR} calls per hour.`);
        }
    }

    // Check Day Limit
    if (stats.dayStart === today) {
        if (stats.dayCount >= API_LIMITS.DAY) {
            throw new Error(`Daily API limit exceeded (${API_LIMITS.DAY} calls). Please try again tomorrow.`);
        }
    }

    // Check Month Limit
    if (stats.monthStart === thisMonth) {
        if (stats.monthCount >= API_LIMITS.MONTH) {
            throw new Error(`Monthly API limit exceeded (${API_LIMITS.MONTH} calls).`);
        }
    }
};

export const trackCall = () => {
    const stats = getUsage();
    const now = Date.now();
    const today = new Date().toISOString().split('T')[0];
    const thisMonth = new Date().toISOString().slice(0, 7);

    // Update Minute
    if (now - stats.minuteStart >= 60000) {
        stats.minuteCount = 0;
        stats.minuteStart = now;
    }
    stats.minuteCount++;

    // Update Hour
    if (now - stats.hourStart >= 3600000) {
        stats.hourCount = 0;
        stats.hourStart = now;
    }
    stats.hourCount++;

    // Update Day
    if (stats.dayStart !== today) {
        stats.dayCount = 0;
        stats.dayStart = today;
    }
    stats.dayCount++;

    // Update Month
    if (stats.monthStart !== thisMonth) {
        stats.monthCount = 0;
        stats.monthStart = thisMonth;
    }
    stats.monthCount++;

    stats.totalCalls++;
    saveUsage(stats);
};

export const getLimit = () => API_LIMITS.DAY; // Default to daily for UI for now


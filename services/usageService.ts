
import { API_LIMITS, STORAGE_KEY } from './apiConfig';
import { db } from "./firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

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

let currentUserId: string | null = null;

export const setUsageUserId = (uid: string | null) => {
    currentUserId = uid;
};

export const loadRemoteUsage = async (uid: string) => {
    if (!db) return;
    try {
        const userRef = doc(db, 'users', uid);
        const snapshot = await getDoc(userRef);
        
        if (snapshot.exists()) {
            const data = snapshot.data();
            if (data.usage) {
                const remoteUsage = data.usage as UsageStats;
                const localUsage = getUsage();

                // Logic to merge Remote into Local intelligently
                // We want to enforce limits, so we take the "worst case" (highest usage) 
                // if the time windows match.
                
                const mergedUsage = { ...DEFAULT_STATS, ...localUsage };

                // 1. Total Calls: Always take max (or remote if we trust it more, but max is safe)
                mergedUsage.totalCalls = Math.max(localUsage.totalCalls, remoteUsage.totalCalls || 0);

                // 2. Month: If same month, take max
                if (remoteUsage.monthStart === localUsage.monthStart) {
                    mergedUsage.monthCount = Math.max(localUsage.monthCount, remoteUsage.monthCount);
                } else if (remoteUsage.monthStart > localUsage.monthStart) {
                    // Remote is newer (we might have stale local time?)
                    mergedUsage.monthStart = remoteUsage.monthStart;
                    mergedUsage.monthCount = remoteUsage.monthCount;
                }

                // 3. Day: If same day, take max
                if (remoteUsage.dayStart === localUsage.dayStart) {
                    mergedUsage.dayCount = Math.max(localUsage.dayCount, remoteUsage.dayCount);
                } else if (remoteUsage.dayStart > localUsage.dayStart) {
                    mergedUsage.dayStart = remoteUsage.dayStart;
                    mergedUsage.dayCount = remoteUsage.dayCount;
                }

                // 4. Hour: Check timestamp diff (roughly same hour window)
                // Hour start is a timestamp. 
                const isSameHour = Math.abs(remoteUsage.hourStart - localUsage.hourStart) < 1000 * 60; // tolerance
                // Actually, just check if remote is "fresher" or "same block"
                // If remote hourStart is within the last hour relative to NOW, it's relevant.
                
                // Simpler: If remote.hourStart > local.hourStart, take remote.
                if (remoteUsage.hourStart > localUsage.hourStart) {
                    mergedUsage.hourStart = remoteUsage.hourStart;
                    mergedUsage.hourCount = remoteUsage.hourCount;
                } else if (Math.abs(remoteUsage.hourStart - localUsage.hourStart) < 60000) {
                    // Same hour block
                    mergedUsage.hourCount = Math.max(localUsage.hourCount, remoteUsage.hourCount);
                }

                // Update local storage
                if (typeof window !== "undefined") {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(mergedUsage));
                }
            }
        }
    } catch (e) {
        console.error("Error loading remote usage:", e);
    }
};

const syncUsageToRemote = async (stats: UsageStats) => {
    if (!currentUserId || !db) return;
    try {
        const userRef = doc(db, 'users', currentUserId);
        await setDoc(userRef, { usage: stats }, { merge: true });
    } catch (e) {
        console.error("Error syncing usage:", e);
    }
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
    syncUsageToRemote(stats);
};

type UsageScope = 'minute' | 'hour' | 'day' | 'month';

let warnedMinute = false;
let warnedHour = false;
let warnedDay = false;
let warnedMonth = false;

const emitUsageWarning = (scope: UsageScope, stats: UsageStats) => {
    if (typeof window === 'undefined') return;
    const detail = { scope, stats, limits: API_LIMITS };
    const event = new CustomEvent('usage:warning', { detail });
    window.dispatchEvent(event);
};

const emitLimitReached = (scope: UsageScope, limit: number) => {
    if (typeof window === 'undefined') return;
    const detail = { scope, limit };
    const event = new CustomEvent('usage:limit_reached', { detail });
    window.dispatchEvent(event);
};

export const checkLimit = (): void => {
    const stats = getUsage();
    const now = Date.now();
    const today = new Date().toISOString().split('T')[0];
    const thisMonth = new Date().toISOString().slice(0, 7);

    // Check Minute Limit
    if (now - stats.minuteStart < 60000) {
        if (stats.minuteCount >= API_LIMITS.MINUTE) {
            emitLimitReached('minute', API_LIMITS.MINUTE);
            throw new Error(`API limit exceeded: ${API_LIMITS.MINUTE} calls per minute.`);
        }
    }

    // Check Hour Limit
    if (now - stats.hourStart < 3600000) {
        if (stats.hourCount >= API_LIMITS.HOUR) {
             emitLimitReached('hour', API_LIMITS.HOUR);
             throw new Error(`API limit exceeded: ${API_LIMITS.HOUR} calls per hour.`);
        }
    }

    // Check Day Limit
    if (stats.dayStart === today) {
        if (stats.dayCount >= API_LIMITS.DAY) {
            emitLimitReached('day', API_LIMITS.DAY);
            throw new Error(`Daily API limit exceeded (${API_LIMITS.DAY} calls). Please try again tomorrow.`);
        }
    }

    // Check Month Limit
    if (stats.monthStart === thisMonth) {
        if (stats.monthCount >= API_LIMITS.MONTH) {
            emitLimitReached('month', API_LIMITS.MONTH);
            throw new Error(`Monthly API limit exceeded (${API_LIMITS.MONTH} calls).`);
        }
    }
};

export const trackCall = () => {
    const stats = getUsage();
    const now = Date.now();

    // Update counters
    stats.totalCalls++;

    // Minute
    if (now - stats.minuteStart < 60000) {
        stats.minuteCount++;
    } else {
        stats.minuteCount = 1;
        stats.minuteStart = now;
    }

    // Hour
    if (now - stats.hourStart < 3600000) {
        stats.hourCount++;
    } else {
        stats.hourCount = 1;
        stats.hourStart = now;
    }

    // Day
    const today = new Date().toISOString().split('T')[0];
    if (stats.dayStart === today) {
        stats.dayCount++;
    } else {
        stats.dayCount = 1;
        stats.dayStart = today;
    }

    // Month
    const thisMonth = new Date().toISOString().slice(0, 7);
    if (stats.monthStart === thisMonth) {
        stats.monthCount++;
    } else {
        stats.monthCount = 1;
        stats.monthStart = thisMonth;
    }

    if (now - stats.minuteStart < 60000) {
        const minuteRatio = stats.minuteCount / API_LIMITS.MINUTE;
        if (!warnedMinute && minuteRatio >= 0.8) {
            warnedMinute = true;
            emitUsageWarning('minute', stats);
        }
    }

    if (now - stats.hourStart < 3600000) {
        const hourRatio = stats.hourCount / API_LIMITS.HOUR;
        if (!warnedHour && hourRatio >= 0.8) {
            warnedHour = true;
            emitUsageWarning('hour', stats);
        }
    }

    if (stats.dayStart === today) {
        const dayRatio = stats.dayCount / API_LIMITS.DAY;
        if (!warnedDay && dayRatio >= 0.8) {
            warnedDay = true;
            emitUsageWarning('day', stats);
        }
    }

    if (stats.monthStart === thisMonth) {
        const monthRatio = stats.monthCount / API_LIMITS.MONTH;
        if (!warnedMonth && monthRatio >= 0.8) {
            warnedMonth = true;
            emitUsageWarning('month', stats);
        }
    }

    saveUsage(stats);
};

export const getLimit = () => API_LIMITS.DAY;

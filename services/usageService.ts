import { API_LIMITS, STORAGE_KEY } from './apiConfig';
export { API_LIMITS };
import { db } from "./firebase";
import { doc, getDoc, setDoc, updateDoc, increment } from "firebase/firestore";

export interface DailyUsage {
    date: string;
    count: number;
}

export interface UsageStats {
    totalCalls: number;
    aiCalls: number;
    aiCallsDayStart?: string; // Track which day aiCalls refers to
    
    weatherCredits: number; // Pro Bundle
    baroCredits: number;    // Baro Bundle

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

    // Alerts state
    alerts: {
        day80: boolean;
        day100: boolean;
        month80: boolean;
        month100: boolean;
        creditsLow: boolean;
    };
}

const DEFAULT_STATS: UsageStats = {
    totalCalls: 0,
    aiCalls: 0,
    aiCallsDayStart: new Date().toISOString().split('T')[0],
    
    weatherCredits: 0,
    baroCredits: 0,

    minuteCount: 0,
    minuteStart: Date.now(),
    
    hourCount: 0,
    hourStart: Date.now(),
    
    dayCount: 0,
    dayStart: new Date().toISOString().split('T')[0],
    
    monthCount: 0,
    monthStart: new Date().toISOString().slice(0, 7),

    alerts: {
        day80: false,
        day100: false,
        month80: false,
        month100: false,
        creditsLow: false
    }
};

let currentUserId: string | null = null;
let currentUserEmail: string | null = null;

export const setUsageUserId = (uid: string | null, email: string | null = null) => {
    currentUserId = uid;
    currentUserEmail = email;
};

// Internal: Send alert email via Netlify Function
// Removed as per user request (only in-app alerts)
const sendAlert = async (type: string, current: number, limit: number) => {
    // Disabled
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
                const mergedUsage = { ...DEFAULT_STATS, ...localUsage };

                // 1. Total Calls & AI Calls
                mergedUsage.totalCalls = Math.max(localUsage.totalCalls, remoteUsage.totalCalls || 0);
                
                if (remoteUsage.aiCallsDayStart === localUsage.aiCallsDayStart) {
                    // Trust remote if it's explicitly set (allows admin reset)
                    // If remote is significantly lower, assume reset. Otherwise max.
                    if (remoteUsage.aiCalls !== undefined) {
                         mergedUsage.aiCalls = remoteUsage.aiCalls;
                    } else {
                         mergedUsage.aiCalls = Math.max(localUsage.aiCalls || 0, remoteUsage.aiCalls || 0);
                    }
                } else if ((remoteUsage.aiCallsDayStart || '') > (localUsage.aiCallsDayStart || '')) {
                    mergedUsage.aiCallsDayStart = remoteUsage.aiCallsDayStart;
                    mergedUsage.aiCalls = remoteUsage.aiCalls;
                }

                // Credits
                if (remoteUsage.weatherCredits !== undefined) mergedUsage.weatherCredits = remoteUsage.weatherCredits;
                if (remoteUsage.baroCredits !== undefined) mergedUsage.baroCredits = remoteUsage.baroCredits;
                
                // 2. Month
                if (remoteUsage.monthStart === localUsage.monthStart) {
                    // Trust remote if defined (allows admin reset)
                    if (remoteUsage.monthCount !== undefined) {
                        mergedUsage.monthCount = remoteUsage.monthCount;
                    } else {
                        mergedUsage.monthCount = Math.max(localUsage.monthCount, remoteUsage.monthCount);
                    }
                } else if (remoteUsage.monthStart > localUsage.monthStart) {
                    mergedUsage.monthStart = remoteUsage.monthStart;
                    mergedUsage.monthCount = remoteUsage.monthCount;
                }

                // 3. Day
                if (remoteUsage.dayStart === localUsage.dayStart) {
                    // Trust remote if defined (allows admin reset)
                    if (remoteUsage.dayCount !== undefined) {
                        mergedUsage.dayCount = remoteUsage.dayCount;
                    } else {
                        mergedUsage.dayCount = Math.max(localUsage.dayCount, remoteUsage.dayCount);
                    }
                } else if (remoteUsage.dayStart > localUsage.dayStart) {
                    mergedUsage.dayStart = remoteUsage.dayStart;
                    mergedUsage.dayCount = remoteUsage.dayCount;
                }

                // 4. Hour
                if (remoteUsage.hourStart > localUsage.hourStart) {
                    mergedUsage.hourStart = remoteUsage.hourStart;
                    mergedUsage.hourCount = remoteUsage.hourCount;
                } else if (Math.abs(remoteUsage.hourStart - localUsage.hourStart) < 60000) {
                    mergedUsage.hourCount = Math.max(localUsage.hourCount, remoteUsage.hourCount);
                }

                // 5. Alerts
                if (remoteUsage.alerts) {
                    mergedUsage.alerts = { ...mergedUsage.alerts, ...remoteUsage.alerts };
                }

                if (typeof window !== "undefined") {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(mergedUsage));
                }
            }
        }
    } catch (e) {
        console.error("Error loading remote usage:", e);
    }
};

export const syncUsageToRemote = async (stats: UsageStats) => {
    if (!currentUserId || !db) return;
    try {
        const userRef = doc(db, 'users', currentUserId);
        
        // CRITICAL: Never overwrite credits from client side state!
        // Credits should only be modified via atomic increment/decrement (consumeCredit) or via webhooks.
        // We create a copy and remove credit fields before syncing.
        const { weatherCredits, baroCredits, ...safeStats } = stats;
        
        await setDoc(userRef, { usage: safeStats }, { merge: true });
    } catch (e) {
        console.error("Error syncing usage:", e);
    }
};

export const getUsage = (): UsageStats => {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) return DEFAULT_STATS;
        const parsed = JSON.parse(stored);
        // Ensure alerts object exists if loading old data
        if (!parsed.alerts) parsed.alerts = { ...DEFAULT_STATS.alerts };
        return { ...DEFAULT_STATS, ...parsed };
    } catch (e) {
        return DEFAULT_STATS;
    }
};

const saveUsage = (stats: UsageStats) => {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('usage:updated'));
        }
    } catch (e) {
        console.error('Failed to save usage stats', e);
    }
    syncUsageToRemote(stats);
};

type UsageScope = 'minute' | 'hour' | 'day' | 'month';

// Transient warnings for UI toast (not persisted)
let warnedMinute = false;
let warnedHour = false;

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

    const isPro = stats.weatherCredits > 0;
    const limits = isPro ? API_LIMITS.PRO : API_LIMITS.FREE;

    if (now - stats.minuteStart < 60000) {
        if (stats.minuteCount >= API_LIMITS.MINUTE) {
            emitLimitReached('minute', API_LIMITS.MINUTE);
            throw new Error(`API limit exceeded: ${API_LIMITS.MINUTE} calls per minute.`);
        }
    }

    if (now - stats.hourStart < 3600000) {
        if (stats.hourCount >= API_LIMITS.HOUR) {
             emitLimitReached('hour', API_LIMITS.HOUR);
             throw new Error(`API limit exceeded: ${API_LIMITS.HOUR} calls per hour.`);
        }
    }

    if (stats.dayStart === today) {
        if (stats.dayCount >= limits.DAY) {
            emitLimitReached('day', limits.DAY);
            throw new Error(`Daily API limit exceeded (${limits.DAY} calls). ${!isPro ? 'Upgrade to Pro for more.' : ''}`);
        }
    }

    if (stats.monthStart === thisMonth) {
        if (stats.monthCount >= limits.MONTH) {
            emitLimitReached('month', limits.MONTH);
            throw new Error(`Monthly API limit exceeded (${limits.MONTH} calls).`);
        }
    }
};

/**
 * Checks and resets daily credits if a new day has started.
 * Ensures user has at least FREE_DAILY credits.
 */
export const checkAndResetDailyCredits = async (currentStats: UsageStats, uid: string) => {
    const today = new Date().toISOString().split('T')[0];
    
    // If it's a new day
    if (currentStats.dayStart !== today) {
        console.log(`New day detected (Old: ${currentStats.dayStart}, New: ${today}). Checking credits...`);
        
        // 1. Reset counters
        currentStats.dayCount = 0;
        currentStats.dayStart = today;
        currentStats.alerts.day80 = false;
        currentStats.alerts.day100 = false;
        
        // 2. Check Credits Top-up
        const freeDaily = API_LIMITS.CREDITS?.FREE_DAILY || 10;
        
        // Ensure we handle undefined or missing weatherCredits gracefully
        if (currentStats.weatherCredits === undefined) currentStats.weatherCredits = 0;
        const currentCredits = currentStats.weatherCredits;
        
        if (currentCredits < freeDaily) {
            const topUp = freeDaily - currentCredits;
            console.log(`Topping up credits by ${topUp} to reach ${freeDaily}`);
            
            // Apply locally
            currentStats.weatherCredits = freeDaily;
            
            // Apply remotely (negative consumption = addition)
            if (db && uid) {
                try {
                    const userRef = doc(db, 'users', uid);
                    // Use increment to be safe with concurrent updates, but we want to reach exactly freeDaily.
                    // However, we only do this if we are the first to switch the day.
                    // A cleaner way is to just set it if it's low, but increment is safer for concurrent usage.
                    // But we already calculated topUp.
                    await updateDoc(userRef, {
                        'usage.weatherCredits': increment(topUp)
                    });
                } catch (e) {
                    console.error("Error topping up credits:", e);
                }
            }
        }
        
        // Save the new dayStart to prevent re-run
        saveUsage(currentStats);
    }
};

/**
 * Force check credits (e.g. on login) even if dayStart matches, 
 * to handle cases where local storage might be out of sync or fresh login on new device.
 */
export const ensureDailyCredits = async (uid: string) => {
    const stats = getUsage();
    const today = new Date().toISOString().split('T')[0];
    const freeDaily = API_LIMITS.CREDITS?.FREE_DAILY || 10;

    // If dayStart is not today, checkAndResetDailyCredits will handle it.
    // But if dayStart IS today, but credits < 10 (and user expects reset? No, only once per day).
    // The requirement is: "you get 10 weathercredits again, but only if it's the first time that day."
    // So if I used 10 credits today, logged out, logged in -> I should NOT get more.
    // So checkAndResetDailyCredits is correct.
    
    // However, for a NEW user, dayStart might be empty or old.
    // Or if local storage was cleared.
    await checkAndResetDailyCredits(stats, uid);
};

export const consumeCredit = async (type: 'weather' | 'baro', amount: number = 1) => {
    if (!currentUserId || !db) return;
    try {
        const userRef = doc(db, 'users', currentUserId);
        const field = type === 'weather' ? 'usage.weatherCredits' : 'usage.baroCredits';
        await updateDoc(userRef, {
            [field]: increment(-amount)
        });
    } catch (err) {
        console.error("Error consuming credit:", err);
    }
};

export const decrementLocalBaroCredit = (): boolean => {
    const stats = getUsage();
    if (stats.baroCredits > 0) {
        stats.baroCredits--;
        
        // Low credits check
        if (stats.baroCredits < 10 && !stats.alerts.creditsLow) {
            stats.alerts.creditsLow = true;
        }
        
        saveUsage(stats);
        return true;
    }
    return false;
};

export const deductBaroCredit = (): boolean => {
    const stats = getUsage();
    if (stats.baroCredits > 0) {
        stats.baroCredits--;
        saveUsage(stats);
        consumeCredit('baro', 1);
        return true;
    }
    return false;
};

export const trackCall = async () => {
    const stats = getUsage();
    const now = Date.now();
    const today = new Date().toISOString().split('T')[0];

    // Ensure we are on the correct day (Top-up check)
    if (currentUserId && stats.dayStart !== today) {
        await checkAndResetDailyCredits(stats, currentUserId);
    }

    const limits = stats.weatherCredits > 0 ? API_LIMITS.PRO : API_LIMITS.FREE;
    
    stats.totalCalls++;

    // Decrement Credits (Atomic decrement on server)
    if (stats.weatherCredits > 0) {
        stats.weatherCredits--;
        consumeCredit('weather', 1);
    } else {
        console.warn("Call tracked with 0 credits!");
    }

    // Minute
    if (now - stats.minuteStart < 60000) {
        stats.minuteCount++;
    } else {
        stats.minuteCount = 1;
        stats.minuteStart = now;
        warnedMinute = false;
    }

    // Hour
    if (now - stats.hourStart < 3600000) {
        stats.hourCount++;
    } else {
        stats.hourCount = 1;
        stats.hourStart = now;
        warnedHour = false;
    }

    // Day
    if (stats.dayStart === today) {
        stats.dayCount++;
    } else {
        stats.dayCount = 1;
        stats.dayStart = today;
        stats.alerts.day80 = false;
        stats.alerts.day100 = false;
    }

    // Month
    const thisMonth = new Date().toISOString().slice(0, 7);
    if (stats.monthStart === thisMonth) {
        stats.monthCount++;
    } else {
        stats.monthCount = 1;
        stats.monthStart = thisMonth;
        stats.alerts.month80 = false;
        stats.alerts.month100 = false;
    }

    // --- WARNINGS & ALERTS ---

    // 1. Minute (Transient)
    if (now - stats.minuteStart < 60000) {
        const minuteRatio = stats.minuteCount / API_LIMITS.MINUTE;
        if (!warnedMinute && minuteRatio >= 0.8) {
            warnedMinute = true;
            emitUsageWarning('minute', stats);
        }
    }

    // 2. Hour (Transient)
    if (now - stats.hourStart < 3600000) {
        const hourRatio = stats.hourCount / API_LIMITS.HOUR;
        if (!warnedHour && hourRatio >= 0.8) {
            warnedHour = true;
            emitUsageWarning('hour', stats);
        }
    }

    // 3. Day (Persistent Alert)
    if (stats.dayStart === today) {
        const dayRatio = stats.dayCount / limits.DAY;
        
        // 80% Alert
        if (dayRatio >= 0.8 && dayRatio < 1.0 && !stats.alerts.day80) {
            stats.alerts.day80 = true;
            emitUsageWarning('day', stats);
            // sendAlert('day_80', stats.dayCount, limits.DAY);
        }

        // 100% Alert
        if (dayRatio >= 1.0 && !stats.alerts.day100) {
            stats.alerts.day100 = true;
            emitUsageWarning('day', stats); 
            // sendAlert('day_100', stats.dayCount, limits.DAY);
        }
    }

    // 4. Month (Persistent Alert)
    if (stats.monthStart === thisMonth) {
        const monthRatio = stats.monthCount / limits.MONTH;

        // 80% Alert
        if (monthRatio >= 0.8 && monthRatio < 1.0 && !stats.alerts.month80) {
            stats.alerts.month80 = true;
            emitUsageWarning('month', stats);
            // sendAlert('month_80', stats.monthCount, limits.MONTH);
        }

        // 100% Alert
        if (monthRatio >= 1.0 && !stats.alerts.month100) {
            stats.alerts.month100 = true;
            emitUsageWarning('month', stats);
            // sendAlert('month_100', stats.monthCount, limits.MONTH);
        }
    }

    saveUsage(stats);
};

export const hasBaroCredits = (): boolean => {
    const stats = getUsage();
    return stats.baroCredits > 0;
};

export const trackBaroCall = (): boolean => {
    const stats = getUsage();
    if (stats.baroCredits > 0) {
        // Low credits check (e.g. < 10)
        if (stats.baroCredits < 10 && !stats.alerts.creditsLow) {
            stats.alerts.creditsLow = true;
            // sendAlert('credits_low', stats.baroCredits, 0);
        }

        stats.baroCredits--;
        saveUsage(stats);
        consumeCredit('baro', 1);
        return true;
    }
    return false;
};

export const trackAiCall = () => {
    const stats = getUsage();
    const today = new Date().toISOString().split('T')[0];
    
    if (stats.aiCallsDayStart !== today) {
        stats.aiCallsDayStart = today;
        stats.aiCalls = 1;
    } else {
        stats.aiCalls = (stats.aiCalls || 0) + 1;
    }
    
    saveUsage(stats);
    
    // Increment AI calls in Firestore (atomic)
    if (currentUserId && db) {
        const userRef = doc(db, 'users', currentUserId);
        updateDoc(userRef, {
            'usage.aiCalls': increment(1),
            'usage.aiCallsDayStart': today
        }).catch(err => console.error("Error updating AI calls in Firestore:", err));
    }
};

export const getLimit = () => {
    const stats = getUsage();
    return stats.weatherCredits > 0 ? API_LIMITS.PRO.DAY : API_LIMITS.FREE.DAY;
};

export const resetDailyUsage = async (uid: string) => {
    const stats = getUsage();
    stats.dayCount = 0;
    stats.aiCalls = 0;
    stats.aiCallsDayStart = new Date().toISOString().split('T')[0];
    stats.minuteCount = 0;
    stats.hourCount = 0;
    // Reset daily alerts
    stats.alerts.day80 = false;
    stats.alerts.day100 = false;
    
    // Save locally without triggering full sync (which might overwrite credits)
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
    } catch (e) {
        console.error('Failed to save usage stats locally', e);
    }
    
    if (db && uid) {
        try {
            const userRef = doc(db, 'users', uid);
            // Only update counters, DO NOT overwrite usage object (preserves credits)
            await updateDoc(userRef, {
                'usage.dayCount': 0,
                'usage.aiCalls': 0,
                'usage.aiCallsDayStart': stats.aiCallsDayStart,
                'usage.minuteCount': 0,
                'usage.hourCount': 0,
                'usage.alerts.day80': false,
                'usage.alerts.day100': false
            });
        } catch (e) {
            console.error("Failed to reset remote usage", e);
        }
    }
    window.location.reload();
};

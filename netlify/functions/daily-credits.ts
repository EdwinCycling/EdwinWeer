import { Handler } from '@netlify/functions';
import { initFirebase, admin } from './config/firebaseAdmin.js';
import { API_LIMITS } from '../../services/apiConfig';

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-App-Source',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

export const handler: Handler = async (event) => {
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers: CORS_HEADERS, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers: CORS_HEADERS, body: 'Method Not Allowed' };
    }

    const appSource = event.headers['x-app-source'] || event.headers['X-App-Source'];
    if (appSource !== 'BaroWeatherApp') {
        return {
            statusCode: 403,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: 'Unauthorized source' })
        };
    }

    const authHeader = event.headers.authorization || event.headers.Authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return {
            statusCode: 401,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: 'Missing authentication' })
        };
    }

    const token = authHeader.split('Bearer ')[1];

    try {
        const db = initFirebase();
        if (!db) {
            return {
                statusCode: 500,
                headers: CORS_HEADERS,
                body: JSON.stringify({ error: 'Database configuration error' })
            };
        }

        const decodedToken = await admin.auth().verifyIdToken(token);
        const uid = decodedToken.uid;
        const today = new Date().toISOString().split('T')[0];

        const result = await db.runTransaction(async (t) => {
            const userRef = db.collection('users').doc(uid);
            const snapshot = await t.get(userRef);

            if (!snapshot.exists) {
                t.set(userRef, {
                    usage: {
                        dayStart: today,
                        dayCount: 0
                    }
                }, { merge: true });

                return {
                    dayStart: today,
                    dayCount: 0,
                    weatherCredits: 0,
                    toppedUp: false
                };
            }

            const data = snapshot.data() || {};
            const usage = data.usage || {};
            const dayStart = usage.dayStart || data.dayStart || '';
            const dayCount = typeof usage.dayCount === 'number' ? usage.dayCount : (data.dayCount || 0);
            const currentCredits = typeof usage.weatherCredits === 'number'
                ? usage.weatherCredits
                : (typeof data.weatherCredits === 'number' ? data.weatherCredits : 0);

            if (dayStart === today) {
                return {
                    dayStart,
                    dayCount,
                    weatherCredits: currentCredits,
                    toppedUp: false
                };
            }

            const isFirstTimeEver = !dayStart;
            const targetCredits = isFirstTimeEver
                ? (API_LIMITS.CREDITS?.NEW_USER_BONUS || 50)
                : (API_LIMITS.CREDITS?.FREE_DAILY || 20);

            const topUp = Math.max(0, targetCredits - currentCredits);

            const updates: Record<string, any> = {
                'usage.dayStart': today,
                'usage.dayCount': 0,
                'usage.alerts.day80': false,
                'usage.alerts.day100': false
            };

            if (topUp > 0) {
                updates['usage.weatherCredits'] = admin.firestore.FieldValue.increment(topUp);
            }

            t.set(userRef, updates, { merge: true });

            return {
                dayStart: today,
                dayCount: 0,
                weatherCredits: currentCredits + topUp,
                toppedUp: topUp > 0
            };
        });

        return {
            statusCode: 200,
            headers: CORS_HEADERS,
            body: JSON.stringify(result)
        };
    } catch (error) {
        console.error('Daily credits error:', error);
        return {
            statusCode: 500,
            headers: CORS_HEADERS,
            body: JSON.stringify({ error: 'Failed to update daily credits' })
        };
    }
};

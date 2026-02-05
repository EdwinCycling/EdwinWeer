
import { Handler } from '@netlify/functions';
import admin from 'firebase-admin';
import { callAI, extractJSON } from './config/ai.js';

// Initialize Firebase Admin
if (!admin.apps.length) {
    try {
        let serviceAccount;
        if (process.env.FIREBASE_SERVICE_ACCOUNT) {
            serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        } else if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PROJECT_ID) {
            serviceAccount = {
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                // Handle newlines in private key
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            };
        }

        if (serviceAccount) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
        }
    } catch (e) {
        console.error("Error initializing Firebase Admin:", e);
    }
}

let db: admin.firestore.Firestore;
try {
    if (admin.apps.length) {
        db = admin.firestore();
    }
} catch (e) {
    console.error("Error getting Firestore instance:", e);
}

const WEATHER_CODES: Record<number, { en: string, nl: string }> = {
    0: { en: 'Clear sky', nl: 'Onbewolkt' },
    1: { en: 'Mainly clear', nl: 'Licht bewolkt' },
    2: { en: 'Partly cloudy', nl: 'Half bewolkt' },
    3: { en: 'Overcast', nl: 'Zwaar bewolkt' },
    45: { en: 'Fog', nl: 'Mist' },
    48: { en: 'Depositing rime fog', nl: 'Rijp' },
    51: { en: 'Light drizzle', nl: 'Lichte motregen' },
    53: { en: 'Moderate drizzle', nl: 'Matige motregen' },
    55: { en: 'Dense drizzle', nl: 'Zware motregen' },
    61: { en: 'Slight rain', nl: 'Lichte regen' },
    63: { en: 'Moderate rain', nl: 'Matige regen' },
    65: { en: 'Heavy rain', nl: 'Zware regen' },
    71: { en: 'Slight snow', nl: 'Lichte sneeuw' },
    73: { en: 'Moderate snow', nl: 'Matige sneeuw' },
    75: { en: 'Heavy snow', nl: 'Zware sneeuw' },
    77: { en: 'Snow grains', nl: 'Sneeuwkorrels' },
    80: { en: 'Slight rain showers', nl: 'Lichte regenbuien' },
    81: { en: 'Moderate rain showers', nl: 'Matige regenbuien' },
    82: { en: 'Violent rain showers', nl: 'Zware regenbuien' },
    85: { en: 'Slight snow showers', nl: 'Lichte sneeuwbuien' },
    86: { en: 'Heavy snow showers', nl: 'Zware sneeuwbuien' },
    95: { en: 'Thunderstorm', nl: 'Onweer' },
    96: { en: 'Thunderstorm with slight hail', nl: 'Onweer met lichte hagel' },
    99: { en: 'Thunderstorm with heavy hail', nl: 'Onweer met zware hagel' }
};

const getWeatherText = (code: number, lang: 'en' | 'nl' = 'nl') => {
    return WEATHER_CODES[code]?.[lang] || (lang === 'nl' ? 'Onbekend' : 'Unknown');
};

const getPartDayData = (hourly: any, startHour: number, endHour: number) => {
    const indices = hourly.time.map((t: string, i: number) => {
        const hour = new Date(t).getHours();
        return (hour >= startHour && hour < endHour) ? i : -1;
    }).filter((i: number) => i !== -1);

    if (indices.length === 0) return null;

    const temps = indices.map((i: number) => hourly.temperature_2m[i]);
    const avgTemp = temps.reduce((a: number, b: number) => a + b, 0) / temps.length;
    
    // Most frequent weather code
    const codes = indices.map((i: number) => hourly.weather_code[i]);
    const modeCode = codes.sort((a: number, b: number) =>
        codes.filter((v: number) => v === a).length - codes.filter((v: number) => v === b).length
    ).pop();

    return {
        temp: Math.round(avgTemp),
        code: modeCode,
        text_nl: getWeatherText(modeCode, 'nl'),
        text_en: getWeatherText(modeCode, 'en')
    };
};

export const handler: Handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-App-Source',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: 'Method Not Allowed' };
    }

    if (!db) {
        try {
             if (admin.apps.length) db = admin.firestore();
        } catch (e) {
             console.error("Lazy DB init error:", e);
        }
        if (!db) {
             return { statusCode: 500, headers, body: JSON.stringify({ error: "Database configuration error" }) };
        }
    }

    // 1. Auth & Initial Credit Check (Don't deduct yet)
    let uid;
    try {
        const authHeader = event.headers['authorization'] || event.headers['Authorization'];
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return { statusCode: 401, headers, body: JSON.stringify({ error: 'Missing authentication' }) };
        }
        const idToken = authHeader.split('Bearer ')[1];
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        uid = decodedToken.uid;

        const userDoc = await db.collection('users').doc(uid).get();
        if (!userDoc.exists) {
            return { statusCode: 404, headers, body: JSON.stringify({ error: 'User profile not found' }) };
        }
        
        const userData = userDoc.data();

        if (userData?.isBanned === true) {
            return { statusCode: 403, headers, body: JSON.stringify({ error: 'User is banned' }) };
        }

        const baroCredits = userData?.usage?.baroCredits !== undefined 
            ? userData.usage.baroCredits 
            : (userData?.baroCredits || 0);

        if (baroCredits < 1) {
            return { statusCode: 402, headers, body: JSON.stringify({ error: 'Insufficient Baro Credits' }) };
        }

    } catch (error: any) {
        console.error("Auth Check Error:", error);
        return {
            statusCode: 403,
            headers,
            body: JSON.stringify({ error: 'Authentication failed' })
        };
    }

    // 2. Parse Body & Validation
    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
    }

    const { date, location, event: eventType, protagonist, tone, length, language = 'nl' } = body;

    if (!date || !location || !eventType || !protagonist) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing required fields' }) };
    }

    try {
        // 3. Fetch Weather Data (Archive)
        const lat = location.lat;
        const lon = location.lon;
        
        // Helper to fetch weather with fallback
        const fetchWeather = async () => {
             const params = `latitude=${lat}&longitude=${lon}&start_date=${date}&end_date=${date}&hourly=temperature_2m,weather_code,wind_speed_10m,precipitation&timezone=auto`;
             
             // Try Archive API first (Best for history)
             const archiveUrl = `https://archive-api.open-meteo.com/v1/archive?${params}`;
             console.log(`Fetching weather from Archive: ${archiveUrl}`);
             
             const archiveRes = await fetch(archiveUrl);
             if (archiveRes.ok) {
                 return await archiveRes.json();
             }
             
             console.warn(`Archive API failed (${archiveRes.status}), trying Forecast API...`);
             
             // Try Forecast API (Best for recent past, up to 90 days)
             const forecastUrl = `https://api.open-meteo.com/v1/forecast?${params}`;
             console.log(`Fetching weather from Forecast: ${forecastUrl}`);
             
             const forecastRes = await fetch(forecastUrl);
             if (forecastRes.ok) {
                 return await forecastRes.json();
             }
             
             const errText = await forecastRes.text();
             throw new Error(`Weather API failed (Archive & Forecast): ${errText}`);
        };

        const weatherData: any = await fetchWeather();

        // 4. Aggregate Data
        const hourly = weatherData.hourly;
        const morning = getPartDayData(hourly, 6, 12);
        const afternoon = getPartDayData(hourly, 12, 18);
        const evening = getPartDayData(hourly, 18, 24);

        if (!morning || !afternoon || !evening) {
             throw new Error('Incomplete weather data for this date');
        }

        // 5. Generate Story with AI
        
        const weatherContext = `
        Ochtend: ${morning.temp}°C, ${language === 'nl' ? morning.text_nl : morning.text_en}.
        Middag: ${afternoon.temp}°C, ${language === 'nl' ? afternoon.text_nl : afternoon.text_en}.
        Avond: ${evening.temp}°C, ${language === 'nl' ? evening.text_nl : evening.text_en}.
        `;

        const langMap: Record<string, string> = {
            nl: 'Nederlands',
            en: 'Engels',
            de: 'Duits',
            fr: 'Frans',
            es: 'Spaans'
        };
        const targetLang = langMap[language] || 'Nederlands';

        const prompt = `
        Je bent een meesterlijke verhalenverteller. Schrijf een ${tone} verhaal (ong. ${length === 'short' ? '200' : length === 'medium' ? '400' : '600'} woorden) voor ${protagonist} over hun ${eventType} op ${date} in ${location.name}.
        
        De sfeer van de dag (Weercontext):
        ${weatherContext}
        
        Opdracht: Schrijf in de taal ${targetLang}. 
        Verweef de weersomstandigheden subtiel in het verhaal als sfeerbepaler (bijv. 'De zon brak door tijdens de ceremonie' of 'De regen tikte zachtjes tegen het raam'). 
        Geef het verhaal een pakkende titel. GEBRUIK GEEN CAMELCASE in de titel (dus niet: 'DeRegenachtigeDag', maar: 'De regenachtige dag').
        Gebruik alineas en witregels voor leesbaarheid.

        Genereer ook een korte, zakelijke weersamenvatting van de dag (max 1 zin) gebaseerd op de weercontext, bijvoorbeeld: "Een bewolkte dag met kans op regen in de middag en temperaturen rond 18 graden."

        Geef het resultaat in JSON formaat: { "title": "...", "story": "...", "weather_summary": "..." }
        `;

        let storyData;

        try {
            console.log(`Attempting generation with AI...`);
            const responseText = await callAI(prompt, { jsonMode: true, temperature: 0.7 });
            storyData = extractJSON(responseText);
            
            if (storyData && storyData.title && storyData.story) {
                console.log(`Success with AI`);
            }
        } catch (err: any) {
            console.warn(`Error with AI:`, err.message);
            throw err;
        }

        // 6. Deduct Credit ONLY after successful generation
        try {
            await db.runTransaction(async (t) => {
                const userRef = db.collection('users').doc(uid);
                const doc = await t.get(userRef);
                const data = doc.data();
                const usage = data?.usage || {};
                const currentCredits = usage.baroCredits !== undefined ? usage.baroCredits : (data?.baroCredits || 0);

                if (currentCredits < 1) throw new Error('Insufficient credits at final check');

                t.set(userRef, {
                    usage: {
                        baroCredits: admin.firestore.FieldValue.increment(-1),
                        storytellerCalls: admin.firestore.FieldValue.increment(1)
                    }
                }, { merge: true });
            });
        } catch (creditError) {
            console.error("Credit deduction failed after story generation:", creditError);
            // We still return the story because we already generated it, 
            // but this is a rare edge case where they might get it for free once.
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ 
                story: storyData,
                weather: { morning, afternoon, evening }
            })
        };

    } catch (error: any) {
        console.error("Gemini Error:", error);
        const statusCode = error.status || 500;
        return {
            statusCode,
            headers,
            body: JSON.stringify({ 
                error: error.message || "Failed to generate story",
                details: error.errorDetails || null,
                status: statusCode
            })
        };
    }
};

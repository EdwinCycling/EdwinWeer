
import { Handler } from '@netlify/functions';
import admin from 'firebase-admin';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GEMINI_MODEL } from './config/ai.js';

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

        const baroCredits = userData?.usage?.baroCredits || 0;

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

    const { date, location, event: eventType, protagonist, language = 'nl', weatherRole, tone, rhymeScheme = 'aabb' } = body;

    if (!date || !location || !eventType || !protagonist) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing required fields' }) };
    }

    try {
        // 3. Fetch Weather Data (Archive)
        const lat = location.lat;
        const lon = location.lon;
        const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${date}&end_date=${date}&hourly=temperature_2m,weather_code,wind_speed_10m,precipitation&timezone=auto`;

        const weatherRes = await fetch(url);
        if (!weatherRes.ok) throw new Error('Failed to fetch historical weather');
        const weatherData: any = await weatherRes.json();

        // 4. Aggregate Data
        const hourly = weatherData.hourly;
        const morning = getPartDayData(hourly, 6, 12);
        const afternoon = getPartDayData(hourly, 12, 18);
        const evening = getPartDayData(hourly, 18, 24);

        if (!morning || !afternoon || !evening) {
             throw new Error('Incomplete weather data for this date');
        }

        // 5. Generate Song with Gemini (with Fallback & Retry)
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error("Missing GEMINI_API_KEY");
        
        const genAI = new GoogleGenerativeAI(apiKey);
        
        const weatherContext = `
        Ochtend (06-12): ${morning.text_nl}, ${morning.temp}°C
        Middag (12-18): ${afternoon.text_nl}, ${afternoon.temp}°C
        Avond (18-24): ${evening.text_nl}, ${evening.temp}°C
        `;

        const langMap: Record<string, string> = {
            nl: 'Nederlands',
            en: 'Engels',
            de: 'Duits',
            fr: 'Frans',
            es: 'Spaans'
        };
        const targetLang = langMap[language] || 'Nederlands';

        const rhymeSchemeDesc: Record<string, string> = {
            'aabb': 'AABB (Meezinger - de eerste twee regels rijmen op elkaar, de laatste twee regels rijmen op elkaar)',
            'abab': 'ABAB (Pop Song - de regels rijmen om en om)',
            'abcb': 'ABCB (Verhalend - alleen de tweede en vierde regel rijmen op elkaar)',
            'freestyle': 'Vrije vorm (Geen vast rijmschema, focus op flow en ritme)'
        };
        const selectedRhymeScheme = rhymeSchemeDesc[rhymeScheme] || rhymeSchemeDesc['aabb'];

        const prompt = `
        Je bent een professionele songwriter die bekend staat om zijn perfecte rijmschema's en diepe teksten. 
        Schrijf een liedtekst voor ${protagonist} ter gelegenheid van ${eventType} op ${date} in ${location.name}.
        
        STRIKTE EIS: Het rijmschema MOET ${selectedRhymeScheme} zijn.
        STRIKTE EIS: Woorden MOETEN perfect rijmen volgens dit schema. Geen half-rijm of "bijna" rijm.
        
        De Weersomstandigheden (Verwerk dit chronologisch in het lied):
        Verse 1 (Ochtend): ${morning.text_nl}, ${morning.temp}°C
        Verse 2 (Middag): ${afternoon.text_nl}, ${afternoon.temp}°C
        Verse 3 (Avond): ${evening.text_nl}, ${evening.temp}°C

        Specifieke Instructies:
        - Weer Rol: ${weatherRole || 'Gebruik het weer als metafoor voor de gebeurtenis.'}
        - Toon / Stijl: ${tone || 'Passend bij de gelegenheid.'}

        Kwaliteitseisen voor de tekst:
        - Schrijf in vloeiend, natuurlijk Nederlands met correcte grammatica.
        - De tekst moet een verhalend karakter hebben (storytelling).
        - Gebruik betekenisvolle woorden en zinnen die echt ergens over gaan.
        - Zorg dat de zinnen logisch op elkaar aansluiten en een mooi verhaal vormen.
        - Vermijd kromme zinnen of letterlijke vertalingen die niet natuurlijk klinken.
        - ELKE regel moet bijdragen aan het ritme van het gekozen rijmschema.

        Stijlregels:
        Maatsoort: 3/4 maat (Wals-ritme). Zorg voor een ritmische cadans die perfect past bij de tekst.
        Rijmschema: ${selectedRhymeScheme}. Wees hier extreem streng in.
        Structuur: [Verse 1] - [Chorus] - [Verse 2] - [Chorus] - [Bridge] - [Verse 3] - [Outro].
        Taal: ${targetLang}.

        Geef het resultaat in JSON formaat: { "title": "...", "lyrics": "...", "weather_summary": "..." }
        Zorg dat de "lyrics" string newlines bevat (\n) voor de opmaak.
        `;

        let songData;
        let lastError;

        try {
            console.log(`Attempting generation with ${GEMINI_MODEL}...`);
            const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });
            const result = await model.generateContent(prompt);
            const responseText = result.response.text();
            
            // Clean markdown code blocks if present
            const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
            songData = JSON.parse(cleanJson);
            
            if (songData && songData.title && songData.lyrics) {
                console.log(`Success with ${GEMINI_MODEL}`);
            }
        } catch (err: any) {
            lastError = err;
            console.warn(`Error with ${GEMINI_MODEL}:`, err.message);
        }

        if (!songData) {
            throw new Error(lastError?.message || 'Failed to generate song with configured model');
        }

        // 6. Deduct Credit ONLY after successful generation
        try {
            await db.runTransaction(async (t) => {
                const userRef = db.collection('users').doc(uid);
                const doc = await t.get(userRef);
                const data = doc.data();
                const currentCredits = data?.usage?.baroCredits || 0;

                if (currentCredits < 1) throw new Error('Insufficient credits at final check');

                t.update(userRef, {
                    'usage.baroCredits': admin.firestore.FieldValue.increment(-1),
                    'usage.songWriterCalls': admin.firestore.FieldValue.increment(1)
                });
            });
        } catch (creditError) {
            console.error("Credit deduction failed after song generation:", creditError);
        }

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ 
                song: songData,
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
                error: error.message || "Failed to generate song",
                details: error.errorDetails || null,
                status: statusCode
            })
        };
    }
};

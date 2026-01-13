import admin from 'firebase-admin';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fetch from 'node-fetch';
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
                // Handle newlines in private key which are often escaped in env vars
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            };
        }

        if (serviceAccount) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
        } else {
            console.error("Missing Firebase Admin credentials");
        }
    } catch (e) {
        console.error("Error initializing Firebase Admin:", e);
    }
}

const db = admin.apps.length ? admin.firestore() : null;

// Helper: Escape HTML
function escapeHTML(text) {
    if (!text) return "";
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Helper: Fetch Weather
async function fetchWeatherData(lat, lon) {
    try {
        // Fetch forecast for tomorrow (we need hourly for precision)
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,apparent_temperature,precipitation_probability,precipitation,rain,showers,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover,visibility,uv_index&daily=temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,sunshine_duration&timezone=auto`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Weather API error: ${response.status}`);
        return await response.json();
    } catch (e) {
        console.error("Error fetching weather:", e);
        return null;
    }
}

// Helper: Send Telegram
async function sendTelegramNotification(chatId, text) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return;

    try {
        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: text,
                parse_mode: 'HTML'
            })
        });
    } catch (e) {
        console.error('Error sending Telegram:', e);
    }
}

// Helper: Get Hourly Average
function getHourlyAverage(hourlyData, startHour, endHour) {
    if (!hourlyData || !Array.isArray(hourlyData)) return null;
    
    // Tomorrow is index 24 to 47
    const startIndex = 24 + startHour;
    const endIndex = 24 + endHour;
    
    const slice = hourlyData.slice(startIndex, endIndex + 1);
    if (slice.length === 0) return null;
    
    const sum = slice.reduce((a, b) => a + b, 0);
    return sum / slice.length;
}

// Helper: Get Hourly Max
function getHourlyMax(hourlyData, startHour, endHour) {
    if (!hourlyData || !Array.isArray(hourlyData)) return null;
    const startIndex = 24 + startHour;
    const endIndex = 24 + endHour;
    const slice = hourlyData.slice(startIndex, endIndex + 1);
    if (slice.length === 0) return null;
    return Math.max(...slice);
}

// Helper: Calculate Score (Matches frontend activityService.ts logic)
function calculateScore(weather, activity) {
    // Get tomorrow's data (index 1)
    const i = 1; 
    const day = weather.daily;
    const hourly = weather.hourly;
    
    // Basic metrics for tomorrow
    const tempMax = day.temperature_2m_max[i];
    const tempMin = day.temperature_2m_min[i];
    const tempFeelsLike = (tempMax + tempMin) / 2; // Approximation
    
    const precipSum = day.precipitation_sum[i];
    const precipProb = day.precipitation_probability_max[i];
    const windMax = day.wind_speed_10m_max[i];
    const windGusts = day.wind_gusts_10m_max[i];
    const sunshine = day.sunshine_duration ? day.sunshine_duration[i] / 3600 : 0; // hours
    const weatherCode = day.weather_code[i];
    
    // Approximations for missing daily fields
    const sunChance = (sunshine / 12) * 100; // Rough estimate %
    const cloudCover = 100 - sunChance; // Rough estimate
    const visibility = 10000; // Default good visibility
    const humidity = 80; // Default

    let score = 10;
    let reasons = [];

    const penalize = (points, reason) => {
        if (points > 0) {
            score -= points;
            reasons.push(reason);
        }
    };

    switch (activity) {
        case 'bbq':
            // BBQ / Terrasje - Focus on evening (17:00 - 22:00)
            const bbqTemp = getHourlyAverage(hourly.apparent_temperature, 17, 22) ?? tempFeelsLike;
            const bbqRain = getHourlyMax(hourly.precipitation, 17, 22) ?? precipSum;

            if (bbqRain > 0.1 || precipProb > 30) penalize(8, "Regen");
            if (bbqTemp < 10) penalize(8, "Te koud");
            else if (bbqTemp < 15) penalize(5, "Jas nodig");
            else if (bbqTemp < 20) penalize(2, "Frisjes");
            
            if (bbqTemp > 30) penalize(2, "Te heet");
            
            if (windMax > 38) penalize(6, "Harde wind");
            else if (windMax > 28) penalize(3, "Hinderlijke wind");
            else if (windMax > 19) penalize(1, "Matige wind");
            break;

        case 'cycling':
            // Fietsen
            if (windMax > 49) penalize(9, "Stormachtig");
            else if (windMax > 39) penalize(8, "Te harde wind");
            else if (windMax > 29) penalize(4, "Zware tegenwind");
            else if (windMax > 19) penalize(2, "Merkbare wind");
            
            if (windGusts > 75) penalize(5, "Gevaarlijke windstoten");
            else if (windGusts > 60) penalize(3, "Harde windstoten");

            if (precipSum > 0.1) {
                const rainPenalty = Math.min(9, Math.ceil(precipSum * 2) + 2);
                penalize(rainPenalty, "Kans op regen");
            }

            if (tempFeelsLike < 0) penalize(7, "Extreem koud");
            else if (tempFeelsLike < 5) penalize(5, "Erg koud");
            else if (tempFeelsLike < 10) penalize(2, "Koud");
            
            if (tempFeelsLike > 32) penalize(5, "Veel te warm voor inspanning");
            else if (tempFeelsLike > 28) penalize(3, "Te warm voor inspanning");
            break;

        case 'walking':
            // Wandelen
            if (precipProb > 40) penalize(2, "Kans op regen");
            if (precipSum > 0.5) penalize(3, "Regenachtig");

            if (windMax > 75) penalize(8, "Storm");
            else if (windMax > 61) penalize(6, "Gevaarlijke wind");
            else if (windMax > 49) penalize(3, "Zeer harde wind");
            else if (windMax > 38) penalize(1, "Harde wind");

            if (tempFeelsLike < 0) penalize(5, "Vrieskou");
            else if (tempFeelsLike < 5) penalize(3, "Erg koud");
            else if (tempFeelsLike < 10) penalize(1, "Frisjes");
            
            if (tempFeelsLike > 32) penalize(5, "Veel te heet");
            else if (tempFeelsLike > 28) penalize(3, "Te heet");

            if (sunChance < 20) penalize(2, "Te weinig zon");
            else if (sunChance > 60 && score < 10) score += 1;
            break;

        case 'sailing':
            // Zeilen
            if (windMax < 6) penalize(6, "Te weinig wind");
            else if (windMax < 12) penalize(2, "Weinig wind");
            else if (windMax >= 29 && windMax <= 38) penalize(1, "Stevige wind");
            else if (windMax >= 39 && windMax <= 49) penalize(4, "Harde wind");
            else if (windMax > 49) penalize(9, "Storm op water");

            if ([95, 96, 99].includes(weatherCode)) {
                score = 1;
                reasons.push("Gevaar: Onweer");
            }

            if (tempFeelsLike < 0) penalize(10, "Water bevroren");
            else if (tempFeelsLike < 5) penalize(7, "Erg koud op water");
            else if (tempFeelsLike < 10) penalize(4, "Koud op water");
            else if (tempFeelsLike < 12) penalize(3, "Fris op water");
            break;

        case 'running':
            // Hardlopen
            if (tempFeelsLike > 25) penalize(6, "Hittestress risico");
            else if (tempFeelsLike > 20) penalize(3, "Eigenlijk te warm");
            
            if (tempFeelsLike < 0) penalize(4, "Koude lucht");
            else if (tempFeelsLike < 5) penalize(2, "Erg koud");

            if (humidity > 85 && tempFeelsLike > 20) penalize(4, "Benauwd");

            if (windMax > 29) penalize(4, "Zwaar ploegen");

            if (precipSum > 3.0) penalize(5, "Doorweekt");
            else if (precipSum > 1.0) penalize(2, "Natte schoenen");
            break;

        case 'beach':
            // Strand
            if (tempFeelsLike < 15) penalize(9, "Te koud");
            else if (tempFeelsLike < 20) penalize(7, "Te koud voor strand");
            else if (tempFeelsLike < 22) penalize(3, "Frisjes");

            if (cloudCover > 80) penalize(8, "Geen zon");
            else if (cloudCover > 40) penalize(4, "Te veel bewolking");

            if (windMax > 28) penalize(5, "Zandhappen");

            if (precipProb > 30) penalize(6, "Risico op natte spullen");
            break;

        case 'gardening':
            // Tuinieren
            if (precipSum > 0.5) penalize(8, "In de regen werken is niks");
            // No precip24h available easily here, skipping muddy soil check based on past rain
            
            if (tempFeelsLike < 0) penalize(9, "Grond bevroren");
            else if (tempFeelsLike < 5) penalize(6, "Te koud voor tuinieren");
            else if (tempFeelsLike < 8) penalize(3, "Koude handen");
            else if (tempFeelsLike < 10) penalize(1, "Frisjes");
            
            if (tempFeelsLike > 32) penalize(6, "Veel te heet");
            else if (tempFeelsLike > 28) penalize(4, "Te heet voor fysiek werk");

            if (windMax > 49) penalize(6, "Schade aan planten");
            else if (windMax > 38) penalize(4, "Harde wind");
            else if (windMax > 29) penalize(3, "Hoge planten waaien kapot");
            break;

        case 'stargazing':
            // Sterrenkijken - Focus on night (22:00 - 04:00)
            const nightCloudCover = getHourlyAverage(hourly.cloud_cover, 22, 28) ?? cloudCover;
            const nightRain = getHourlyMax(hourly.precipitation, 22, 28) ?? precipSum;

            if (nightCloudCover > 75) penalize(9, "Je ziet niets (bewolking)");
            else if (nightCloudCover > 25) penalize(6, "Te veel storing (bewolking)");
            else if (nightCloudCover > 10) penalize(2, "Af en toe een wolk");
            
            if (visibility < 5000) penalize(8, "Atmosfeer niet transparant");

            if (nightRain > 0) penalize(10, "Telescoop mag niet nat worden (regen)");

            if (tempFeelsLike < 0) penalize(4, "Koud om stil te staan");
            else if (tempFeelsLike < 5) penalize(2, "Erg fris");
            else if (tempFeelsLike < 10) penalize(1, "Jas nodig");

            if (windMax > 29) penalize(5, "Telescoop trilt");
            else if (windMax > 19) penalize(3, "Beeld onrustig");
            break;

        case 'golf':
            // Golf
            if (windMax > 49) penalize(9, "Onspeelbaar");
            else if (windMax > 19) penalize(4, "Invloed op de bal");

            if (precipSum > 0.2) penalize(4, "Natte grips");
            
            if ([95, 96, 99].includes(weatherCode)) {
                score = 1;
                reasons.push("Levensgevaarlijk (onweer)");
            }

            if (tempFeelsLike < 0) penalize(10, "Baan bevroren");
            else if (tempFeelsLike < 5) penalize(6, "Bal is hard");
            else if (tempFeelsLike < 10) penalize(2, "Frisjes");
            break;

        case 'padel':
            // Padel
            if (tempFeelsLike > 30) penalize(5, "Te heet");
            else if (tempFeelsLike > 25) penalize(2, "Warm");

            if (tempFeelsLike < 0) penalize(10, "Baan bevroren");
            else if (tempFeelsLike < 5) penalize(5, "Erg koud");
            else if (tempFeelsLike < 10) penalize(2, "Frisjes");

            if (precipSum === 0 && precipProb < 10) score += 1;
            else if (precipSum > 2) penalize(8, "Baan kletsnat");
            else if (precipSum > 0 || precipProb > 30) penalize(3, "Baan vochtig");

            if (windMax > 49) penalize(6, "Harde wind");
            break;

        case 'field_sports':
            // Veld Sport
            if (tempFeelsLike > 30) penalize(8, "Te heet voor fysiek werk");
            else if (tempFeelsLike > 25) penalize(5, "Te heet");
            else if (tempFeelsLike > 20) penalize(2, "Warm");

            if (tempFeelsLike < 0) penalize(9, "Ondergrond bevroren");
            else if (tempFeelsLike < 5) penalize(6, "Erg koud");
            else if (tempFeelsLike < 10) penalize(3, "Frisjes");

            if (precipSum === 0 && precipProb < 10) score += 1;
            else if (precipSum > 5) penalize(9, "Veld onbespeelbaar");
            else if (precipSum > 2) penalize(5, "Nat veld");
            else if (precipSum > 0 || precipProb > 30) penalize(3, "Vochtig veld");

            if (windMax > 49) penalize(8, "Stormachtig");
            else if (windMax > 28) penalize(3, "Lastig voor balcontrole");
            break;

        case 'tennis':
            // Tennis
            if (tempFeelsLike > 30) penalize(5, "Te heet");
            else if (tempFeelsLike > 25) penalize(2, "Warm");

            if (tempFeelsLike < 0) penalize(10, "Baan bevroren");
            else if (tempFeelsLike < 5) penalize(7, "Erg koud");
            else if (tempFeelsLike < 10) penalize(4, "Frisjes");

            if (precipSum === 0 && precipProb < 10) score += 1;
            else if (precipSum > 2) penalize(10, "Baan onbespeelbaar");
            else if (precipSum > 0.5) penalize(8, "Baan kletsnat");
            else if (precipSum > 0 || precipProb > 30) penalize(5, "Natte lijnen/baan");

            if (windMax < 12) score += 1;

            if (windMax > 38) penalize(9, "Onspeelbare wind");
            else if (windMax > 28) penalize(5, "Veel windinvloed");
            else if (windMax > 19) penalize(2, "Merkbare wind");
            // 3 Bft has no penalty anymore
            break;
    }

    // BONUS: Sunshine during rain
    const isRainy = precipSum > 0.1 || precipProb > 30;
    if (isRainy && sunChance > 10) {
        let bonus = 0;
        if (sunChance > 75) bonus = 3;
        else if (sunChance > 50) bonus = 2;
        else if (sunChance > 20) bonus = 1;

        if (bonus > 0) {
            score += bonus;
            reasons.unshift(`Afwisselend zon en regen (+${bonus})`);
        }
    }

    // Sub-zero penalty generic
    if (tempFeelsLike < 0 && !['stargazing', 'padel', 'field_sports', 'tennis', 'sailing'].includes(activity)) {
        penalize(2, "Gevoelstemperatuur onder nul");
    }

    return {
        score: Math.max(1, Math.min(10, score)),
        reasons: reasons
    };
}

// Activity Dutch Names
const activityNames = {
    'bbq': 'BBQ & terras',
    'cycling': 'Fietsen',
    'walking': 'Wandelen',
    'sailing': 'Watersport',
    'running': 'Hardlopen',
    'beach': 'Strand & zonnen',
    'gardening': 'Tuinieren',
    'stargazing': 'Sterrenkijken',
    'golf': 'Golf',
    'padel': 'Padel (outdoor)',
    'field_sports': 'Veldsport (voetbal/hockey)',
    'tennis': 'Tennis'
};

// Helper: Generate AI Text
async function generateAIContent(weather, activity, scoreData, userName) {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

        const activityName = activityNames[activity] || activity;

        // Mapping focus points
        const focusPoints = {
            'bbq': "Focus op avondtemperatuur en droogte en ook windsnelheid",
            'cycling': "Focus op windkracht/richting en gladheid, temperatuur, gevoels temperatuur (onder de 5) en neerslag kansen en neerslag hoeveelheid.",
            'running': "Focus op hitte/benauwdheid en op gevoels temperatuur (onder 5) en neerslag kansen en neerslag hoeveelheid en temperatuur en hitte index (boven 25).",
            'sailing': "Focus op windvlagen en op windkracht/richting en zicht en neerslag kansen en neerslag hoeveelheid.",
            'walking': "Focus op neerslag en kou en wind en gevoels temperatuur (onder de 10)",
            'beach': "Focus op zonuren en bewolking en wind kracht en wind richting.",
            'gardening': "Focus op temepratuur en neerslag en gevoelstemperatuur (onder 10) en hitte index",
            'stargazing': "Focus op bewolkingsgraad 's nachts en neerslag.",
            'golf': "Focus op wind en neerslag.",
            'padel': "Focus op neerslag, wind en temperatuur (te koud/heet).",
            'field_sports': "Focus op neerslag (velden), temperatuur en wind.",
            'tennis': "Focus op wind, neerslag en temperatuur."
        };

        const focus = focusPoints[activity] || "Focus op algemene geschiktheid.";

        // Prepare data for tomorrow (index 1)
        const i = 1;
        const dataSummary = {
            date: weather.daily.time[i],
            temp_max: weather.daily.temperature_2m_max[i],
            temp_min: weather.daily.temperature_2m_min[i],
            precip_prob: weather.daily.precipitation_probability_max[i],
            wind_max: weather.daily.wind_speed_10m_max[i],
            score: scoreData.score,
            reasons: scoreData.reasons.join(", ")
        };

        const prompt = `
Je bent Baro, de persoonlijke weerman.
Schrijf een kort, enthousiast bericht voor ${userName} over de activiteit: ${activityName.toUpperCase()} voor MORGEN.

CONTEXT:
- Activiteit: ${activityName}
- Score: ${scoreData.score}/10
- Redenen score: ${dataSummary.reasons}
- Focuspunten: ${focus}

WEERDATA MORGEN:
${JSON.stringify(dataSummary)}

OPDRACHT:
Schrijf een bericht van max 3-4 zinnen.
1. Begin met de conclusie (Doen of niet doen? Baseer dit STRIKT op de score: ${scoreData.score}/10).
2. Geef de belangrijkste weerdetails relevant voor ${activityName} en benoem specifiek waarom de score zo is (rekening houdend met de redenen: ${dataSummary.reasons}).
3. Eindig met een korte tip.
Gebruik GEEN markdown. Gebruik wel emojis.
Taal: Nederlands.
`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();

    } catch (e) {
        console.error("AI Error:", e);
        return `Error: ${e.message || `Morgen is de score voor ${activity} een ${scoreData.score}/10! ${scoreData.reasons.join(", ")}.`}`;
    }
}

export const handler = async (event, context) => {
    if (!db) return { statusCode: 500, body: "Database error" };

    const now = new Date();
    // Round to hour to match scheduling
    const currentHour = now.getUTCHours(); 
    // Wait, users are in different timezones. We need to check USER local time.
    // The scheduler runs hourly. We iterate all users and check if their local time is approx 04:00.
    
    console.log(`Activity Planner run at ${now.toISOString()}`);

    try {
        const usersRef = db.collection('users');
        const snapshot = await usersRef.get(); // Fetch all users (optimize later with where clauses if possible)
        // Since activity_settings is a map, we can't easily query "activity_settings != null".
        // We'll filter in memory.

        const results = [];

        for (const doc of snapshot.docs) {
            const userData = doc.data();
            const userId = doc.id;
            const settings = userData.activity_settings;
            
            if (!settings) continue;

            // Check Telegram connection
            if (!userData.telegramChatId) continue;

            // Find enabled activity
            const activityKey = Object.keys(settings).find(key => settings[key].enabled);
            if (!activityKey) continue;

            const config = settings[activityKey];

            // Determine User Local Time
            const userTimezone = userData.settings?.timezone || 'Europe/Amsterdam';
            const userTimeStr = now.toLocaleString('en-US', { timeZone: userTimezone });
            const userTime = new Date(userTimeStr);
            const userHour = userTime.getHours();

            // Check if it's 04:00 (allow 04:00-06:59 window for uitloop)
            if (userHour < 4 || userHour > 6) continue;

            // Check Day (Tomorrow)
            // Notification is sent TODAY (at 04:00) for TOMORROW.
            // So we check if TOMORROW is in the enabled days.
            const tomorrow = new Date(userTime);
            tomorrow.setDate(tomorrow.getDate() + 1);
            const tomorrowDay = tomorrow.getDay(); // 0=Sun, 1=Mon...

            if (!config.days.includes(tomorrowDay)) continue;

            // Prevent duplicate sending for this day/activity
            const dateStr = tomorrow.toISOString().split('T')[0]; // Target date
            const auditKey = `planner_${userId}_${activityKey}_${dateStr}`;
            const auditRef = db.collection('audit_logs').doc(auditKey); // or specific collection
            const auditDoc = await auditRef.get();

            if (auditDoc.exists) {
                console.log(`Skipping ${userId}: already sent for ${dateStr}`);
                continue;
            }

            // Get Location
            let lat = 52.09;
            let lon = 5.12;
            let locationName = "Utrecht";

            // Priority 1: Activity Specific Location
            if (userData.activity_location) {
                lat = userData.activity_location.lat;
                lon = userData.activity_location.lon;
                locationName = userData.activity_location.name;
            } 
            // Priority 2: Favorites
            else if (userData.settings?.favorites?.length > 0) {
                lat = userData.settings.favorites[0].lat;
                lon = userData.settings.favorites[0].lon;
                locationName = userData.settings.favorites[0].name;
            }

            // Fetch Weather
            const weather = await fetchWeatherData(lat, lon);
            if (!weather) continue;

            // Calculate Score
            const scoreData = calculateScore(weather, activityKey);
            
            // Filter by Min Score
            if (scoreData.score < config.min_score) {
                console.log(`Skipping ${userId}: Score ${scoreData.score} < ${config.min_score}`);
                continue;
            }

            // Check Credits
            const baroCredits = userData.usage?.baroCredits || 0;
            if (baroCredits <= 0) {
                console.log(`Skipping ${userId}: No Baro credits`);
                continue;
            }

            // Generate Content
            const userName = userData.displayName || "Sportieveling";
            const aiText = await generateAIContent(weather, activityKey, scoreData, userName);
            const safeAiText = escapeHTML(aiText);

            // Send Telegram
            const activityName = activityNames[activityKey] || activityKey;
            const message = `
<b>📅 Planner: ${activityName} (Morgen)</b>

${safeAiText}

<b>Score: ${scoreData.score}/10</b>
<i>Instelling: Minimaal ${config.min_score}</i>

<a href="https://askbaro.com">Open App</a>
            `;

            await sendTelegramNotification(userData.telegramChatId, message);

            // Deduct Credit
            await usersRef.doc(userId).update({
                'usage.baroCredits': admin.firestore.FieldValue.increment(-1),
                'usage.aiCalls': admin.firestore.FieldValue.increment(1)
            });

            // Log
            await auditRef.set({
                userId,
                activity: activityKey,
                targetDate: dateStr,
                sentAt: admin.firestore.FieldValue.serverTimestamp(),
                score: scoreData.score
            });

            results.push({ userId, activity: activityKey, status: 'sent' });
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ message: "Planner run complete", results })
        };

    } catch (e) {
        console.error("Planner Error:", e);
        return { statusCode: 500, body: e.message };
    }
};

export const config = {
    schedule: "@hourly"
};

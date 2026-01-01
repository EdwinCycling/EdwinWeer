import admin from 'firebase-admin';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fetch from 'node-fetch';

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

// Helper: Calculate Score (Simplified logic for Node)
function calculateScore(weather, activity) {
    // Get tomorrow's data (index 1)
    const i = 1; 
    const day = weather.daily;
    const hourly = weather.hourly;
    
    // Basic metrics for tomorrow
    const tempMax = day.temperature_2m_max[i];
    const precipSum = day.precipitation_sum[i];
    const precipProb = day.precipitation_probability_max[i];
    const windMax = day.wind_speed_10m_max[i];
    const windGusts = day.wind_gusts_10m_max[i];
    const sunshine = day.sunshine_duration[i] / 3600; // hours

    let score = 10;
    let reasons = [];

    // Generic penalties
    if (precipSum > 5) { score -= 3; reasons.push("Veel regen"); }
    else if (precipSum > 1) { score -= 1; reasons.push("Beetje regen"); }

    if (windMax > 40) { score -= 3; reasons.push("Harde wind"); }
    else if (windMax > 25) { score -= 1; reasons.push("Waaierig"); }

    // Specific logic
    switch (activity) {
        case 'bbq':
            if (tempMax < 15) { score -= 3; reasons.push("Te koud"); }
            if (tempMax < 10) { score -= 5; reasons.push("Veel te koud"); }
            if (precipProb > 40) { score -= 4; reasons.push("Regenkans"); }
            break;
        case 'cycling':
            if (windMax > 30) { score -= 2; reasons.push("Harde wind"); }
            if (precipProb > 50) { score -= 3; reasons.push("Regenkans"); }
            if (tempMax < 5) { score -= 2; reasons.push("Koud"); }
            break;
        case 'running':
            if (tempMax > 25) { score -= 3; reasons.push("Te warm"); }
            if (tempMax < 0) { score -= 2; reasons.push("Gladheid risico"); }
            break;
        case 'sailing':
            if (windMax < 10) { score -= 3; reasons.push("Te weinig wind"); }
            if (windGusts > 50) { score -= 4; reasons.push("Gevaarlijke vlagen"); }
            break;
        case 'beach':
            if (tempMax < 20) { score -= 4; reasons.push("Te koud"); }
            if (sunshine < 4) { score -= 3; reasons.push("Weinig zon"); }
            if (precipProb > 20) { score -= 5; reasons.push("Regen"); }
            break;
        case 'walking':
            if (precipProb > 60) { score -= 4; reasons.push("Regenachtig"); }
            break;
        case 'gardening':
            if (precipSum > 2) { score -= 2; reasons.push("Natte grond"); }
            if (tempMax < 5) { score -= 2; reasons.push("Te koud"); }
            break;
        case 'stargazing':
            // Need cloud cover at night (approx 22:00 - 02:00)
            // Simplified: check daily sunshine inverse? No, check hourly cloud cover night
            // For now use daily assumption or random penalty if simple
            // Let's assume clear night if high pressure? Hard to know without hourly analysis.
            // Using a simple proxy:
            if (precipProb > 30) { score -= 5; reasons.push("Bewolking/Regen"); }
            break;
        case 'golf':
            if (windMax > 30) { score -= 3; reasons.push("Wind"); }
            if (precipSum > 0.5) { score -= 3; reasons.push("Regen"); }
            break;
        case 'drone':
            if (windGusts > 30) { score -= 5; reasons.push("Harde windstoten"); }
            if (precipProb > 10) { score -= 5; reasons.push("Regenrisico"); }
            break;
    }

    return {
        score: Math.max(1, Math.min(10, score)),
        reasons: reasons
    };
}

// Helper: Generate AI Text
async function generateAIContent(weather, activity, scoreData, userName) {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || "gemini-2.5-flash-lite" });

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
            'drone': "Focus op windstoten, windkracht en regenrisico."
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
Schrijf een kort, enthousiast bericht voor ${userName} over de activiteit: ${activity.toUpperCase()} voor MORGEN.

CONTEXT:
- Activiteit: ${activity}
- Score: ${scoreData.score}/10
- Redenen score: ${dataSummary.reasons}
- Focuspunten: ${focus}

WEERDATA MORGEN:
${JSON.stringify(dataSummary)}

OPDRACHT:
Schrijf een bericht van max 3-4 zinnen.
1. Begin met de conclusie (Doen of niet doen?).
2. Geef de belangrijkste weerdetails relevant voor ${activity}.
3. Eindig met een korte tip.
Gebruik GEEN markdown. Gebruik wel emojis.
Taal: Nederlands.
`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();

    } catch (e) {
        console.error("AI Error:", e);
        return `Morgen is de score voor ${activity} een ${scoreData.score}/10! ${scoreData.reasons.join(", ")}.`;
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

            // Generate Content
            const userName = userData.displayName || "Sportieveling";
            const aiText = await generateAIContent(weather, activityKey, scoreData, userName);

            // Send Telegram
            const message = `
<b>📅 Activiteiten Planner: Morgen</b>

${aiText}

<b>Score: ${scoreData.score}/10</b>
<i>Instelling: Minimaal ${config.min_score}</i>

<a href="https://askbaro.com">Open App</a>
            `;

            await sendTelegramNotification(userData.telegramChatId, message);

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

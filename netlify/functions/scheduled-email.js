import admin from 'firebase-admin';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as Brevo from '@getbrevo/brevo';
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
            console.error("Missing Firebase Admin credentials (FIREBASE_SERVICE_ACCOUNT or individual keys)");
        }
    } catch (e) {
        console.error("Error initializing Firebase Admin:", e);
    }
}

const db = admin.apps.length ? admin.firestore() : null;

// Initialize Brevo
const apiInstance = new Brevo.TransactionalEmailsApi();
const apiKey = process.env.BREVO_API_KEY || 'dummy_key';
// Set API key using the correct method for v3
if (apiInstance.setApiKey) {
    apiInstance.setApiKey(Brevo.TransactionalEmailsApiApiKeys.apiKey, apiKey);
} else {
    // Fallback if setApiKey is missing (unlikely based on debug)
    if (!apiInstance.authentications['apiKey']) {
        apiInstance.authentications['apiKey'] = {};
    }
    apiInstance.authentications['apiKey'].apiKey = apiKey;
}

// Constants
const SLOTS = {
    breakfast: [6, 7, 8, 9], // 06:00 - 09:59
    lunch: [11, 12, 13],    // 11:00 - 13:59
    dinner: [17, 18, 19]    // 17:00 - 19:00 (Uitloop)
};

// Helper: Get weather data (similar to client side but using node-fetch)
async function fetchWeatherData(lat, lon) {
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,snowfall,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m&hourly=temperature_2m,relative_humidity_2m,dew_point_2m,apparent_temperature,precipitation_probability,precipitation,rain,showers,snowfall,weather_code,pressure_msl,surface_pressure,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,visibility,evapotranspiration,et0_fao_evapotranspiration,vapour_pressure_deficit,wind_speed_10m,wind_speed_80m,wind_speed_120m,wind_speed_180m,wind_direction_10m,wind_direction_80m,wind_direction_120m,wind_direction_180m,wind_gusts_10m,temperature_80m,temperature_120m,temperature_180m,soil_temperature_0cm,soil_temperature_6cm,soil_temperature_18cm,soil_temperature_54cm,soil_moisture_0_to_1cm,soil_moisture_1_to_3cm,soil_moisture_3_to_9cm,soil_moisture_9_to_27cm,soil_moisture_27_to_81cm,uv_index,is_day,sunshine_duration&daily=weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,apparent_temperature_min,sunrise,sunset,daylight_duration,sunshine_duration,uv_index_max,uv_index_clear_sky_max,precipitation_sum,rain_sum,showers_sum,snowfall_sum,precipitation_hours,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,shortwave_radiation_sum,et0_fao_evapotranspiration&timezone=auto`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Weather API error: ${response.status}`);
        return await response.json();
    } catch (e) {
        console.error("Error fetching weather:", e);
        return null;
    }
}

// Helper: Generate Baro Report (Reusing logic from ai-weather.js)
async function generateAIReport(weatherData, profile, userName) {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

        const daysAhead = Number(profile.daysAhead) || 3;
        const isGeneral = profile.isGeneralReport === true;
        
        const toCommaList = (value, fallback) => {
            if (Array.isArray(value)) return value.filter(Boolean).join(", ") || fallback;
            if (typeof value === 'string') return value.trim() || fallback;
            return fallback;
        };

        const location = profile.location || "onbekend";
        
        let styles = toCommaList(profile.reportStyle, "zakelijk");
        // Override style for general report
        if (isGeneral) {
            styles = "makkelijk leesbaar, uitgebreid";
        }
        
        const userSalutation = userName ? userName.split(' ')[0] : (profile.name || "Gebruiker");
        
        const hasActivities = !isGeneral && profile.activities && profile.activities.length > 0;
        const activities = hasActivities ? toCommaList(profile.activities, "") : "";
        
        const hasTimeOfDay = !isGeneral && profile.timeOfDay && profile.timeOfDay.length > 0;
        const timeOfDay = hasTimeOfDay ? toCommaList(profile.timeOfDay, "") : "";
        
        const hasTransport = !isGeneral && profile.transport && profile.transport.length > 0;
        const transport = hasTransport ? toCommaList(profile.transport, "") : "";
        
        const hasHobbies = !isGeneral && typeof profile.hobbies === 'string' && profile.hobbies.trim();
        const hobbies = hasHobbies ? profile.hobbies.trim() : "";
        
        const hasInstructions = typeof profile.otherInstructions === 'string' && profile.otherInstructions.trim();
        const instructions = hasInstructions ? profile.otherInstructions.trim() : "";
        
        const hasHayFever = profile.hayFever === true;
        const reportLength = profile.reportLength || 'standard';

        const prompt = `
          Je bent Baro, een gevatte en deskundige Nederlandse weerman voor een app.
          
          CONTEXT:
          - Type Rapport: ${isGeneral ? 'ALGEMEEN WEERBERICHT' : 'Persoonlijk Weerbericht'}
          - Gebruiker: ${userSalutation}
          - Locatie: ${location}
          - Gewenste stijl: ${styles}
          - Lengte van het bericht: ${reportLength} (BELANGRIJK!)
          ${hasActivities ? `- Activiteiten: ${activities}` : ''}
          ${hasTimeOfDay ? `- Belangrijke dagdelen: ${timeOfDay}` : ''}
          ${hasTransport ? `- Vervoer: ${transport}` : ''}
          ${hasHobbies ? `- Hobby's: ${hobbies}` : ''}
          ${hasInstructions ? `- Extra instructies: ${instructions}` : ''}
          ${hasHayFever ? `- GEZONDHEID: Gebruiker heeft HOOIKOORTS` : ''}
          
          WEERDATA (JSON):
          ${JSON.stringify({
             current: weatherData.current,
             daily: {
                 time: weatherData.daily.time.slice(0, daysAhead),
                 weather_code: weatherData.daily.weather_code.slice(0, daysAhead),
                 temperature_2m_max: weatherData.daily.temperature_2m_max.slice(0, daysAhead),
                 temperature_2m_min: weatherData.daily.temperature_2m_min.slice(0, daysAhead),
                 precipitation_probability_max: weatherData.daily.precipitation_probability_max.slice(0, daysAhead),
             }
          })}

          OPDRACHT:
          Schrijf een beknopt weerbericht (email) voor ${userSalutation}.
          Gebruik de weerdata voor de komende ${daysAhead} dagen.
          
          INSTRUCTIES VOOR LENGTE (${reportLength}):
          ${reportLength === 'factual' ? '- Schrijf EXTREEM BEKNOPT. Gebruik weinig zinnen. Focus puur op de feiten en data. Geen introductiepraatjes.' : ''}
          ${reportLength === 'standard' ? '- Schrijf een gebalanceerd bericht. Niet te kort, niet te lang. Gewoon een goed leesbaar weerbericht.' : ''}
          ${reportLength === 'extended' ? '- Schrijf een UITGEBREID en gedetailleerd verhaal. Neem de ruimte voor nuance, uitleg en context.' : ''}
          
          REGELS:
          1. Begin met "Beste ${userSalutation},"
          2. Wees creatief maar feitelijk juist.
          3. BELANGRIJK: Gebruik HTML tags voor opmaak:
             - Gebruik <br><br> voor witregels tussen alinea's.
             - Gebruik <b> voor dikgedrukte koppen of woorden.
             - Gebruik GEEN markdown (zoals ## of **).
          4. Maak het leuk om te lezen!
          ${hasHayFever ? `5. HOOIKOORTS: Wijd een aparte alinea (of zin bij 'feitelijk') aan de invloed van het actuele weer op hooikoorts. Leg uit waarom het weer gunstig of ongunstig is.` : ''}
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();

    } catch (e) {
        console.error("Error generating report:", e);
        return "Kon geen weerbericht genereren op dit moment.";
    }
}

// Helper: Send Email
async function sendEmail(toEmail, toName, subject, htmlContent) {
    if (!process.env.BREVO_API_KEY) {
        console.error("CRITICAL ERROR: BREVO_API_KEY is missing in environment variables. Cannot send email.");
        return false;
    }

    const sendSmtpEmail = new Brevo.SendSmtpEmail();
    sendSmtpEmail.subject = subject;
    sendSmtpEmail.htmlContent = `
        <html>
            <body style="font-family: sans-serif; line-height: 1.6; color: #333;">
                <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #2563eb;">Jouw Weerbericht</h2>
                    <div style="background: #f8fafc; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0;">
                        ${htmlContent}
                        
                        <div style="margin-top: 25px; text-align: center;">
                            <a href="https://askbaro.com" style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Open Baro App</a>
                        </div>
                    </div>
                    <p style="font-size: 12px; color: #64748b; margin-top: 20px; text-align: center;">
                        Verzonden door Baro | <a href="https://askbaro.com" style="color: #2563eb; text-decoration: none;">Open App</a>
                    </p>
                </div>
            </body>
        </html>
    `;
    sendSmtpEmail.sender = { "name": "Baro", "email": "no-reply@askbaro.com" }; // Should be a verified sender in Brevo
    sendSmtpEmail.to = [{ "email": toEmail, "name": toName }];

    try {
        console.log(`Sending email to ${toEmail} via Brevo...`);
        const data = await apiInstance.sendTransacEmail(sendSmtpEmail);
        console.log("Brevo API Success:", JSON.stringify(data));
        return true;
    } catch (error) {
        console.error("Error sending email via Brevo:", error);
        if (error.body) {
            console.error("Brevo Error Body:", JSON.stringify(error.body));
        }
        return false;
    }
}

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

export const handler = async (event, context) => {
    if (!db) {
        return { statusCode: 500, body: "Database error" };
    }

    const now = new Date();
    console.log(`Email/Telegram Scheduler run at (server time): ${now.toISOString()}`);

    try {
        // 1. Fetch all users with credits > 0
        // Optimization: Filter at database level
        const usersSnapshot = await db.collection('users')
            .where('usage.baroCredits', '>', 0)
            .get();
            
        const usersToProcess = usersSnapshot.docs;
        
        console.log(`Found ${usersToProcess.length} users with credits to check.`);
        const results = [];

        for (const doc of usersToProcess) {
            const userId = doc.id;
            const userData = doc.data();
            
            // Extract settings
            const settings = userData.settings || {};
            // Support multiple profiles
            const profiles = settings.baroProfiles || (settings.baroProfile ? [settings.baroProfile] : []) || [];
            
            if (profiles.length === 0) continue;

            // Determine User Timezone
            const timezone = settings.timezone || 'Europe/Amsterdam';
            
            // Get user's local time
            const userTimeStr = now.toLocaleString('en-US', { timeZone: timezone });
            const userTime = new Date(userTimeStr);
            const userHour = userTime.getHours();
            const userDayName = userTime.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase(); // monday, tuesday...

            // Check match for slots
            let matchedSlot = null;
            if (SLOTS.breakfast.includes(userHour)) matchedSlot = 'breakfast';
            else if (SLOTS.lunch.includes(userHour)) matchedSlot = 'lunch';
            else if (SLOTS.dinner.includes(userHour)) matchedSlot = 'dinner';

            if (!matchedSlot) continue;

            let currentCredits = userData.usage?.baroCredits || 0;

            for (const baroProfile of profiles) {
                if (currentCredits <= 0) {
                     console.log(`User ${userId}: No Baro credits left. Skipping profile ${baroProfile.name || 'unnamed'}.`);
                     break;
                }

                // --- CHECK SCHEDULES ---
                const emailSchedule = baroProfile.emailSchedule;
                const messengerSchedule = baroProfile.messengerSchedule;

                let shouldSendEmail = false;
                let shouldSendMessenger = false;

                // Check Email Schedule
                if (emailSchedule && emailSchedule.enabled && emailSchedule.days) {
                    const dayConfig = emailSchedule.days.find(d => d.day && d.day.toLowerCase() === userDayName);
                    if (dayConfig && dayConfig[matchedSlot]) {
                        shouldSendEmail = true;
                    }
                }

                // Check Messenger Schedule (Telegram ONLY)
                // Push is handled in scheduled-push.js
                if (messengerSchedule && messengerSchedule.enabled && messengerSchedule.days) {
                    const dayConfig = messengerSchedule.days.find(d => d.day && d.day.toLowerCase() === userDayName);
                    if (dayConfig && dayConfig[matchedSlot]) {
                        // Check if we can send Telegram
                        if (userData.telegramChatId) {
                            shouldSendMessenger = true;
                        }
                    }
                }

                if (!shouldSendEmail && !shouldSendMessenger) {
                    continue;
                }

                // Check Audit Log (Idempotency)
                const year = userTime.getFullYear();
                const month = String(userTime.getMonth() + 1).padStart(2, '0');
                const day = String(userTime.getDate()).padStart(2, '0');
                const dateStr = `${year}-${month}-${day}`;
                
                const profileId = baroProfile.id || 'default';
                const auditKey = `${userId}_${profileId}_${dateStr}_${matchedSlot}`;
                const auditRef = db.collection('email_audit_logs').doc(auditKey);
                const auditDoc = await auditRef.get();

                if (auditDoc.exists) {
                    console.log(`User ${userId}: Already processed profile ${profileId} for ${auditKey}.`);
                    continue;
                }

                // --- PROCEED TO SEND ---
                
                // LOAD BALANCING: Add a small random delay (0-15s) to prevent hammering APIs
                // This spreads the load within the function execution time (up to limit)
                const delay = Math.floor(Math.random() * 5000); // Reduced delay since we might have multiple profiles
                await new Promise(resolve => setTimeout(resolve, delay));

                // 1. Get Location
                let lat = 52.3676; // Amsterdam default
                let lon = 4.9041;
                
                // Try to find location coordinates
                const locName = baroProfile.location;
                let locationFound = false;

                // 1. Check if location is an object (new format)
                if (typeof locName === 'object' && locName.lat && locName.lon) {
                    lat = locName.lat;
                    lon = locName.lon;
                    locationFound = true;
                }
                // 2. Check favorites
                else if (locName && typeof locName === 'string' && settings.favorites) {
                    const fav = settings.favorites.find(f => f.name.toLowerCase() === locName.toLowerCase());
                    if (fav) {
                        lat = fav.lat;
                        lon = fav.lon;
                        locationFound = true;
                    }
                }

                // 3. Fallback: Geocoding if specific name provided but not found
                if (!locationFound && locName && typeof locName === 'string' && locName !== "onbekend") {
                     try {
                        const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(locName)}&count=1&language=nl&format=json`;
                        const geoRes = await fetch(geoUrl);
                        if (geoRes.ok) {
                            const geoData = await geoRes.json();
                            if (geoData.results && geoData.results.length > 0) {
                                lat = geoData.results[0].latitude;
                                lon = geoData.results[0].longitude;
                                locationFound = true;
                                console.log(`Geocoded '${locName}' to ${lat},${lon}`);
                            }
                        }
                     } catch(e) {
                         console.error("Geocoding failed for", locName);
                     }
                }

                // 4. Fallback to first favorite
                if (!locationFound && settings.favorites && settings.favorites.length > 0) {
                    lat = settings.favorites[0].lat;
                    lon = settings.favorites[0].lon;
                }

                // 2. Fetch Weather
                const weatherData = await fetchWeatherData(lat, lon);
                if (!weatherData) {
                    console.error(`User ${userId}: Failed to fetch weather for profile ${profileId}`);
                    continue;
                }

                // Helper: Get User Name
                let userName = userData.displayName || baroProfile.name || "Gebruiker";
                // Try to get from Google Auth provider if available
                if (userData.providerData) {
                    const googleProfile = userData.providerData.find(p => p.providerId === 'google.com');
                    if (googleProfile && googleProfile.displayName) {
                        userName = googleProfile.displayName;
                    }
                }
                
                // Helper: Calculate Activity Scores (Simplified for Node)
                const calculateScores = (weather, activities) => {
                    if (!activities || !Array.isArray(activities)) return [];
                    const scores = [];
                    const today = weather.daily;
                    // Use index 0 for today
                    const i = 0; 
                    
                    // Extract relevant daily metrics
                    const tempMax = today.temperature_2m_max[i];
                    const precipSum = today.precipitation_sum[i];
                    const windMax = today.wind_speed_10m_max[i];
                    const precipProb = today.precipitation_probability_max[i];
                    const sunshine = today.sunshine_duration[i] / 3600; // hours

                    activities.forEach(act => {
                        let score = 10;
                        let reason = "Top weer!";
                        
                        // Generic logic based on activityService.ts principles
                        if (['bbq', 'cycling', 'walking', 'golf', 'gardening'].includes(act)) {
                            if (precipSum > 1 || precipProb > 60) { score -= 4; reason = "Kans op regen"; }
                            if (windMax > 35) { score -= 3; reason = "Veel wind"; }
                            if (tempMax < 10) { score -= 2; reason = "Fris"; }
                        }
                        
                        if (['beach', 'sailing'].includes(act)) {
                            if (tempMax < 18) { score -= 5; reason = "Te koud"; }
                            if (sunshine < 3) { score -= 3; reason = "Weinig zon"; }
                            if (precipSum > 0) { score -= 4; reason = "Regen"; }
                        }
                        
                        // Normalize
                        score = Math.max(1, Math.min(10, score));
                        scores.push({ activity: act, score, reason });
                    });
                    return scores;
                };

                const activityScores = calculateScores(weatherData, Array.isArray(baroProfile.activities) ? baroProfile.activities : []);

                // 3. Generate Content
                let emailContent = '';
                if (shouldSendEmail || shouldSendMessenger) {
                    emailContent = await generateReport(weatherData, baroProfile, userName);
                }

                // 4. Send Notifications
                
                let emailSent = false;
                let messengerSent = false;

                // --- EMAIL NOTIFICATION ---
                if (shouldSendEmail) {
                    let userEmail = userData.email;
                    if (!userEmail) {
                        try {
                            const userRecord = await admin.auth().getUser(userId);
                            userEmail = userRecord.email;
                        } catch (e) {
                            console.error(`User ${userId}: Could not fetch email from Auth`, e);
                        }
                    }

                    if (userEmail) {
                        // Check for force flag in user settings
                        const forceTest = userData.forceEmailTest || (settings && settings.forceEmailTest);

                        // Append Scores and Credits to Footer
                        const scoresHtml = activityScores.length > 0 ? `
                            <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee;">
                                <h3 style="font-size: 16px; margin-bottom: 10px;">Jouw Activiteiten Vandaag (${baroProfile.name})</h3>
                                <table style="width: 100%; border-collapse: collapse;">
                                    ${activityScores.map(s => `
                                        <tr>
                                            <td style="padding: 5px 0; text-transform: capitalize;">${s.activity}</td>
                                            <td style="padding: 5px 0; font-weight: bold; color: ${s.score >= 8 ? '#16a34a' : s.score >= 6 ? '#ca8a04' : '#dc2626'};">${s.score}/10</td>
                                            <td style="padding: 5px 0; font-size: 12px; color: #666;">${s.reason}</td>
                                        </tr>
                                    `).join('')}
                                </table>
                            </div>
                        ` : '';

                        const fullHtml = `
                            <h2>Weerbericht voor ${baroProfile.name}</h2>
                            ${emailContent}
                            ${scoresHtml}
                            <div style="margin-top: 30px; padding-top: 15px; border-top: 1px dashed #ddd; font-size: 11px; color: #888; text-align: center;">
                                <p>Credits over: <strong>${currentCredits - 1} Baro Credits</strong></p>
                            </div>
                        `;

                        emailSent = await sendEmail(userEmail, userName, `Jouw Weerbericht (${baroProfile.name}): ${matchedSlot.charAt(0).toUpperCase() + matchedSlot.slice(1)}`, fullHtml);
                    }
                }
                
                // --- TELEGRAM NOTIFICATION ---
                if (shouldSendMessenger && userData.telegramChatId) {
                    try {
                        const telegramMessage = `
<b>Jouw Weerbericht (${baroProfile.name})</b>

${emailContent.replace(/<[^>]*>?/gm, '').trim()}

<b>Activiteiten:</b>
${activityScores.map(s => `- ${s.activity}: ${s.score}/10 (${s.reason})`).join('\n')}

<a href="https://askbaro.com/">Open Baro App</a>
                        `;

                        await sendTelegramNotification(userData.telegramChatId, telegramMessage);
                        console.log(`User ${userId}: Telegram notification sent.`);
                        messengerSent = true;
                    } catch (tgError) {
                        console.error(`User ${userId}: Failed to send Telegram notification:`, tgError);
                    }
                }

                if (emailSent || messengerSent) {
                    // Deduct Credits & Update Usage
                    try {
                        const updates = {
                            'usage.baroCredits': admin.firestore.FieldValue.increment(-1),
                            'usage.totalCalls': admin.firestore.FieldValue.increment(1),
                            'usage.aiCalls': admin.firestore.FieldValue.increment(1)
                        };
                        
                        if (messengerSent) {
                            updates['usage.messengerCount'] = admin.firestore.FieldValue.increment(1);
                        }

                        // Reset force flag if needed
                        const forceTest = userData.forceEmailTest || (settings && settings.forceEmailTest);
                        if (forceTest) {
                            updates.forceEmailTest = false;
                            updates['settings.forceEmailTest'] = false;
                        }

                        await db.collection('users').doc(userId).update(updates);
                        
                        // Audit Log
                        if (!forceTest) {
                             await auditRef.set({
                                userId,
                                profileId,
                                date: dateStr,
                                slot: matchedSlot,
                                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                                status: 'sent',
                                channels: { email: emailSent, messenger: messengerSent }
                            });
                        }

                        // Decrement local credits for next profile in loop
                        currentCredits--;

                    } catch (e) {
                        console.error(`User ${userId}: Failed to update credits`, e);
                    }

                    results.push({ userId, profileId, status: 'sent', slot: matchedSlot, channels: { email: emailSent, messenger: messengerSent } });
                } else {
                    results.push({ userId, profileId, status: 'failed', slot: matchedSlot });
                }
            } // End Profile Loop
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ message: "Check completed", results })
        };

    } catch (e) {
        console.error("Function execution error:", e);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: e.message })
        };
    }
};

// Schedule: Run every hour
export const config = {
    schedule: "0 7,12,17 * * *"
};

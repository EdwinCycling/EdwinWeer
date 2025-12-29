import admin from 'firebase-admin';
import { GoogleGenerativeAI } from '@google/generative-ai';
import * as Brevo from '@getbrevo/brevo';
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
    breakfast: 7, // 7:00
    lunch: 12,    // 12:00
    dinner: 17    // 17:00
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

// Helper: Generate AI Report (Reusing logic from ai-weather.js mostly)
async function generateReport(weatherData, profile, userName) {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || "gemini-2.5-flash-lite" });

        // Logic from ai-weather.js (simplified for import)
        // We reconstruct the prompt here
        const daysAhead = Number(profile.daysAhead) || 3;
        const isGeneral = profile.isGeneralReport === true;
        const language = 'nl'; // Default to NL for now, or fetch from user settings
        
        const toCommaList = (value, fallback) => {
            if (Array.isArray(value)) return value.filter(Boolean).join(", ") || fallback;
            if (typeof value === 'string') return value.trim() || fallback;
            return fallback;
        };

        const location = profile.location || "onbekend";
        const styles = toCommaList(profile.reportStyle, "zakelijk");
        const userSalutation = userName ? userName.split(' ')[0] : (profile.name || "Gebruiker");

        // Construct prompt (Dutch only for now as requested context is Dutch mostly)
        // Ideally we fetch language from settings.
        const prompt = `
          Je bent Baro, een gevatte en deskundige Nederlandse weerman voor een app.
          
          CONTEXT:
          - Type Rapport: ${isGeneral ? 'ALGEMEEN WEERBERICHT' : 'Persoonlijk Weerbericht'}
          - Gebruiker: ${userSalutation}
          - Locatie: ${location}
          - Gewenste stijl: ${styles}
          - Activiteiten: ${toCommaList(profile.activities, "")}
          
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
          
          REGELS:
          1. Begin met "Beste ${userSalutation},"
          2. Wees creatief maar feitelijk juist.
          3. Gebruik HTML opmaak voor de email (<b>, <br>, <i>, etc), maar GEEN volledige HTML doc (alleen body content).
          4. Maak het leuk om te lezen!
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
                    </div>
                    <p style="font-size: 12px; color: #64748b; margin-top: 20px; text-align: center;">
                        Verzonden door Baro | <a href="https://askbaro.com">Open App</a>
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

export const handler = async (event, context) => {
    // FORCE TEST EMAIL (User Request)
    console.log("Attempting to send force test email...");
    try {
        const testSent = await sendEmail("edwin@editsolutions.nl", "Edwin Test", "test", "test mail");
        console.log("Force test email result:", testSent);
    } catch (testError) {
        console.error("Force test email failed:", testError);
    }

    if (!db) {
        return { statusCode: 500, body: "Database error" };
    }

    const now = new Date();

    try {
        // 1. Fetch all users
        const usersSnapshot = await db.collection('users').get();
        const usersToProcess = usersSnapshot.docs;
        
        const results = [];

        for (const doc of usersToProcess) {
            const userId = doc.id;
            const userData = doc.data();
            
            // Extract settings
            const settings = userData.settings || {};
            const baroProfile = settings.baroProfile || userData.baroProfile || settings.aiProfile || userData.aiProfile; // Check all locations for migration
            
            // Check if email schedule is enabled
            if (!baroProfile || !baroProfile.emailSchedule || !baroProfile.emailSchedule.enabled) {
                continue;
            }

            // Determine User Timezone
            const timezone = settings.timezone || 'Europe/Amsterdam';
            
            // Get user's local time
            const userTimeStr = now.toLocaleString('en-US', { timeZone: timezone });
            const userTime = new Date(userTimeStr);
            const userHour = userTime.getHours();
            const userDayName = userTime.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase(); // monday, tuesday...

            // Check match for slots
            let matchedSlot = null;
            
            if (userHour === SLOTS.breakfast) matchedSlot = 'breakfast';
            else if (userHour === SLOTS.lunch) matchedSlot = 'lunch';
            else if (userHour === SLOTS.dinner) matchedSlot = 'dinner';

            if (!matchedSlot) {
                continue; 
            }

            // Check if this day matches the schedule
            const scheduleDays = baroProfile.emailSchedule.days || [];
            const dayConfig = scheduleDays.find(d => d.day.toLowerCase() === userDayName);

            if (!dayConfig || !dayConfig[matchedSlot]) {
                continue;
            }

            // Check Audit Log (Idempotency)
            const year = userTime.getFullYear();
            const month = String(userTime.getMonth() + 1).padStart(2, '0');
            const day = String(userTime.getDate()).padStart(2, '0');
            const dateStr = `${year}-${month}-${day}`;
            
            const auditKey = `${userId}_${dateStr}_${matchedSlot}`;
            const auditRef = db.collection('email_audit_logs').doc(auditKey);
            const auditDoc = await auditRef.get();

            if (auditDoc.exists) {
                continue;
            }

            // --- PROCEED TO SEND ---

            // 1. Get Location
            let lat = 52.3676; // Amsterdam default
            let lon = 4.9041;
            
            // Try to find location coordinates
            const locName = baroProfile.location;
            if (locName && settings.favorites) {
                const fav = settings.favorites.find(f => f.name.toLowerCase() === locName.toLowerCase());
                if (fav) {
                    lat = fav.lat;
                    lon = fav.lon;
                } else if (settings.favorites.length > 0) {
                    lat = settings.favorites[0].lat;
                    lon = settings.favorites[0].lon;
                }
            }

            // 2. Fetch Weather
            const weatherData = await fetchWeatherData(lat, lon);
            if (!weatherData) {
                console.error(`User ${userId}: Failed to fetch weather`);
                continue;
            }

            // 3. Generate Content
            const emailContent = await generateReport(weatherData, baroProfile, userData.displayName || baroProfile.name);

            // 4. Send Email
            let userEmail = userData.email;
            if (!userEmail) {
                try {
                    const userRecord = await admin.auth().getUser(userId);
                    userEmail = userRecord.email;
                } catch (e) {
                    console.error(`User ${userId}: Could not fetch email from Auth`, e);
                }
            }

            if (!userEmail) {
                console.error(`User ${userId}: No email address found`);
                continue;
            }

            const sent = await sendEmail(userEmail, baroProfile.name || "User", `Jouw Weerbericht: ${matchedSlot.charAt(0).toUpperCase() + matchedSlot.slice(1)}`, emailContent);

            if (sent) {
                if (forceTest) {
                    // Reset flag
                    try {
                        await db.collection('users').doc(userId).update({
                            forceEmailTest: false,
                            'settings.forceEmailTest': false
                        });
                    } catch (e) {
                        // Ignore update errors (e.g. if field missing)
                        console.log("Could not reset force flag", e);
                    }
                } else if (auditRef) {
                    // 5. Audit Log
                    await auditRef.set({
                        userId,
                        date: dateStr,
                        slot: matchedSlot,
                        timestamp: admin.firestore.FieldValue.serverTimestamp(),
                        status: 'sent'
                    });
                }
                results.push({ userId, status: 'sent', slot: matchedSlot });
            } else {
                results.push({ userId, status: 'failed', slot: matchedSlot });
            }
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

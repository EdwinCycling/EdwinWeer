import { initFirebase, getDb, admin } from './config/firebaseAdmin.js';
import * as Brevo from '@getbrevo/brevo';
import { callAI } from './config/ai.js';

initFirebase();
const db = getDb();

// Initialize Brevo
const apiInstance = new Brevo.TransactionalEmailsApi();
const apiKey = process.env.BREVO_API_KEY || 'dummy_key';
if (apiInstance.setApiKey) {
    apiInstance.setApiKey(Brevo.TransactionalEmailsApiApiKeys.apiKey, apiKey);
} else {
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

// Helper: Get weather data
async function fetchWeatherData(lat, lon) {
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m,precipitation&daily=weather_code,temperature_2m_max,precipitation_probability_max,wind_speed_10m_max&timezone=auto`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Weather API error: ${response.status}`);
        return await response.json();
    } catch (e) {
        console.error("Error fetching weather:", e);
        return null;
    }
}

// Helper: Generate Baro Push Notification Content
async function generatePushContent(weatherData, profile, userName) {
    try {
        const location = profile.location || "onbekend";
        const userSalutation = userName ? userName.split(' ')[0] : (profile.name || "Gebruiker");

        const prompt = `
          Je bent Baro, de persoonlijke weerman.
          
          CONTEXT:
          - Gebruiker: ${userSalutation}
          - Locatie: ${location}
          
          WEERDATA (VANDAAG):
          - Max Temp: ${weatherData.daily.temperature_2m_max[0]}°C
          - Weer: ${weatherData.daily.weather_code[0]} (WMO code)
          - Neerslagkans: ${weatherData.daily.precipitation_probability_max[0]}%
          - Wind: ${weatherData.daily.wind_speed_10m_max[0]} km/h
          
          OPDRACHT:
          Genereer een korte titel en body voor een push notificatie.
          
          EISEN:
          - Titel: MAXIMAAL 30 tekens. Pakkend en relevant.
          - Body: MAXIMAAL 140 tekens. De essentie van het weerbericht.
          - Taal: Nederlands.
          - Stijl: Vlot, persoonlijk.
          
          OUTPUT FORMAAT (JSON):
          {
            "title": "...",
            "body": "..."
          }
        `;

        const text = await callAI(prompt, { jsonMode: true });
        
        // Clean up markdown code blocks if present
        const jsonStr = text.replace(/```json\n|\n```/g, '').replace(/```/g, '').trim();
        return JSON.parse(jsonStr);

    } catch (e) {
        console.error("Error generating push content:", e);
        return {
            title: "Baro Update",
            body: `Error: ${e.message || "Bekijk het weerbericht in de app."}`
        };
    }
}

async function sendPushNotification(token, title, body, userId) {
    if (!token) return false;

    try {
        await admin.messaging().send({
            token: token,
            notification: {
                title: title,
                body: body,
            },
            webpush: {
                fcmOptions: {
                    link: 'https://askbaro.com'
                },
                notification: {
                    icon: 'https://askbaro.com/icons/baro-icon-192.png'
                }
            }
        });
        console.log(`Push notification sent to user ${userId}`);
        return true;
    } catch (error) {
        console.error('Error sending push notification:', error);
        if (error.code === 'messaging/registration-token-not-registered' || 
            error.message.includes('registration-token-not-registered') ||
            (error.errorInfo && error.errorInfo.code === 'messaging/registration-token-not-registered')) {
            
            console.log(`Token invalid for user ${userId}, removing...`);
            try {
                await db.collection('users').doc(userId).update({
                    fcmToken: admin.firestore.FieldValue.delete()
                });
                console.log(`Removed invalid FCM token for user ${userId}`);
            } catch (cleanupError) {
                console.error(`Failed to remove invalid token for user ${userId}:`, cleanupError);
            }
        }
        return false;
    }
}

export const handler = async (event, context) => {
    if (!db) {
        return { statusCode: 500, body: "Database error" };
    }

    const now = new Date();
    console.log(`Push Scheduler run at (server time): ${now.toISOString()}`);

    try {
        // 1. Fetch all users with credits > 0
        let usersToProcess = [];
        
        if (event.testEmail) {
            console.log(`TEST MODE: Targeting only ${event.testEmail}`);
            usersToProcess = [{
                id: 'test-user',
                data: () => ({
                    email: event.testEmail,
                    displayName: 'Test Edwin',
                    isBanned: false,
                    usage: { baroCredits: 100 },
                    fcmToken: 'mock-fcm-token', // Needed to pass check
                    settings: {
                        timezone: 'Europe/Amsterdam',
                        baroProfile: {
                            id: 'test-profile',
                            name: 'Edwin',
                            location: 'Utrecht',
                            messengerSchedule: { enabled: true, days: [{ day: 'friday', breakfast: true, lunch: true, dinner: true }, { day: 'saturday', breakfast: true, lunch: true, dinner: true }, { day: 'sunday', breakfast: true, lunch: true, dinner: true }, { day: 'monday', breakfast: true, lunch: true, dinner: true }, { day: 'tuesday', breakfast: true, lunch: true, dinner: true }, { day: 'wednesday', breakfast: true, lunch: true, dinner: true }, { day: 'thursday', breakfast: true, lunch: true, dinner: true }] },
                        }
                    }
                })
            }];
        } else {
            const usersSnapshot = await db.collection('users')
                .where('usage.baroCredits', '>', 0)
                .get();
            usersToProcess = usersSnapshot.docs;
        }
        
        console.log(`Found ${usersToProcess.length} users with credits to check for PUSH.`);
        const results = [];

        for (const doc of usersToProcess) {
            const userId = doc.id;
            const userData = doc.data();
            
            // Skip banned users
            if (userData.isBanned === true) {
                console.log(`User ${userId} is banned, skipping push.`);
                continue;
            }

            // Extract settings
            const settings = userData.settings || {};
            // Support multiple profiles
            const profiles = settings.baroProfiles || (settings.baroProfile ? [settings.baroProfile] : []) || [];
            
            if (profiles.length === 0) continue;

            // Check if user has FCM token, otherwise skip entire user
            if (!userData.fcmToken) continue;

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
            
            if (event.testEmail) matchedSlot = 'test_slot';

            if (!matchedSlot) continue;

            let currentCredits = userData.usage?.baroCredits || 0;

            for (const baroProfile of profiles) {
                if (currentCredits <= 0) {
                     console.log(`User ${userId}: No Baro credits left. Skipping profile ${baroProfile.name || 'unnamed'}.`);
                     break;
                }

                // --- CHECK SCHEDULES ---
                const messengerSchedule = baroProfile.messengerSchedule;
                let shouldSendPush = false;

                // Check Messenger Schedule (Push shares the same schedule as Telegram/Messenger)
                if (messengerSchedule && messengerSchedule.enabled && messengerSchedule.days) {
                    const dayConfig = messengerSchedule.days.find(d => d.day && d.day.toLowerCase() === userDayName);
                    if (dayConfig && dayConfig[matchedSlot]) {
                         shouldSendPush = true;
                    }
                }
                
                if (event.testEmail) shouldSendPush = true;

                if (!shouldSendPush) continue;

                // Check Audit Log (Idempotency) - DISTINCT KEY FOR PUSH
                const year = userTime.getFullYear();
                const month = String(userTime.getMonth() + 1).padStart(2, '0');
                const day = String(userTime.getDate()).padStart(2, '0');
                const dateStr = `${year}-${month}-${day}`;
                
                const profileId = baroProfile.id || 'default';
                const auditKey = `${userId}_${profileId}_${dateStr}_${matchedSlot}_push`; // Suffix _push
                const auditRef = db.collection('email_audit_logs').doc(auditKey);
                const auditDoc = await auditRef.get();

                if (!event.testEmail && auditDoc.exists) {
                    console.log(`User ${userId}: Already processed PUSH for profile ${profileId} for ${auditKey}.`);
                    continue;
                }

                // --- PROCEED TO SEND ---
                
                // RATE LIMITING: Enforce max 5 calls per minute to Gemini AI (12s interval)
                const delay = 12000; 
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

                // 4. Fallback to first favorite if still not found
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
                if (userData.providerData) {
                    const googleProfile = userData.providerData.find(p => p.providerId === 'google.com');
                    if (googleProfile && googleProfile.displayName) {
                        userName = googleProfile.displayName;
                    }
                }
                
                // 3. Generate Content
                const pushContent = await generatePushContent(weatherData, baroProfile, userName);

                // 4. Send Notification
                let pushSent = false;
                if (event.testEmail) {
                    const sendSmtpEmail = new Brevo.SendSmtpEmail();
                    sendSmtpEmail.subject = `TEST PUSH: ${pushContent.title}`;
                    sendSmtpEmail.htmlContent = `<html><body>${pushContent.body.replace(/\n/g, '<br>')}</body></html>`;
                    sendSmtpEmail.sender = { "name": "Baro Test", "email": "no-reply@askbaro.com" };
                    sendSmtpEmail.to = [{ "email": event.testEmail }];
                    await apiInstance.sendTransacEmail(sendSmtpEmail);
                    console.log(`Sent Test Push Email to ${event.testEmail}`);
                    pushSent = true;
                } else {
                    pushSent = await sendPushNotification(userData.fcmToken, pushContent.title, pushContent.body, userId);
                }

                if (pushSent) {
                    // Deduct Credits & Update Usage
                    if (!event.testEmail) {
                        try {
                            const nestedUpdates = {
                                usage: {
                                    baroCredits: admin.firestore.FieldValue.increment(-1),
                                    totalCalls: admin.firestore.FieldValue.increment(1),
                                    aiCalls: admin.firestore.FieldValue.increment(1),
                                    pushCount: admin.firestore.FieldValue.increment(1)
                                }
                            };
                            
                            await db.collection('users').doc(userId).set(nestedUpdates, { merge: true });
                            
                            // Audit Log
                            await auditRef.set({
                                userId,
                                profileId,
                                date: dateStr,
                                slot: matchedSlot,
                                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                                status: 'sent',
                                type: 'push'
                            });

                            // Decrement local credits for next profile in loop
                            currentCredits--;

                        } catch (e) {
                            console.error(`User ${userId}: Failed to update credits`, e);
                        }
                    }

                    results.push({ userId, profileId, status: 'sent', slot: matchedSlot, type: 'push' });
                } else {
                    results.push({ userId, profileId, status: 'failed', slot: matchedSlot, type: 'push' });
                }
            } // End Profile Loop
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ message: "Push check completed", results })
        };

    } catch (e) {
        console.error("Function execution error:", e);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: e.message })
        };
    }
};

// Schedule: Run every hour (configured in netlify.toml)
export const config = {
    schedule: "@hourly"
};

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

async function fetchWeatherData(lat, lon, days) {
    try {
        // Fetch up to 16 days forecast to cover the "period" + 10 days ahead
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_direction_10m_dominant,sunrise,sunset&timezone=auto&forecast_days=16`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Weather API error: ${response.status}`);
        return await response.json();
    } catch (e) {
        console.error("Error fetching weather:", e);
        return null;
    }
}

async function generateReport(weatherData, event, diff, profileName, userName, language = 'nl') {
    try {
        const duration = event.duration || 1;
        const isPeriod = duration > 1 || !!event.endDate;
        const isNL = language === 'nl';

        const periodText = isNL 
            ? (isPeriod ? ` en de komende ${duration - 1} dagen` : '')
            : (isPeriod ? ` and the coming ${duration - 1} days` : '');
        
        // Determine instructions based on days left (diff)
        let scheduleInstruction = "";
        
        if (isNL) {
            if (diff === 10) scheduleInstruction = "Het is nog 10 dagen weg. Hou het vaag en algemeen. Geef aan dat het nog ver weg is.";
            else if (diff === 7) scheduleInstruction = "Nog een week te gaan. Geef een voorzichtige trend.";
            else if (diff === 6) scheduleInstruction = "Nog 6 dagen. Iets meer detail, maar blijf voorzichtig.";
            else if (diff <= 5 && diff > 0) scheduleInstruction = `Nog ${diff} dagen. Geef een concretere verwachting. ${isPeriod ? 'Neem nu ook de periode (vervolgdagen) mee in je verwachting.' : ''}`;
            else if (diff === 0) scheduleInstruction = `VANDAAG is de dag! Geef een gedetailleerd weerbericht voor vandaag. ${isPeriod ? 'Neem ook de komende periode mee.' : ''}`;
        } else {
            if (diff === 10) scheduleInstruction = "It is still 10 days away. Keep it vague and general. Indicate that it is still far off.";
            else if (diff === 7) scheduleInstruction = "One week to go. Give a cautious trend.";
            else if (diff === 6) scheduleInstruction = "6 days left. A bit more detail, but remain cautious.";
            else if (diff <= 5 && diff > 0) scheduleInstruction = `${diff} days left. Give a more concrete forecast. ${isPeriod ? 'Now also include the period (subsequent days) in your forecast.' : ''}`;
            else if (diff === 0) scheduleInstruction = `TODAY is the day! Give a detailed weather report for today. ${isPeriod ? 'Also include the coming period.' : ''}`;
        }

        const promptNL = `
          Je bent Baro, de persoonlijke weerman.
          
          CONTEXT:
          - Gebruiker: ${userName}
          - Speciale Dag: "${event.name}"
          - Datum van event: ${event.date} ${periodText} (Duur: ${duration} dagen)
          - Dagen tot event: ${diff}
          - Locatie: ${event.location.name}
          - Gekozen Profiel Naam: ${profileName}
          
          INSTRUCTIE VOOR DIT MOMENT (Schema):
          ${scheduleInstruction}
          
          WEERDATA (JSON):
          ${JSON.stringify(weatherData.daily)}
          
          OPDRACHT:
          Schrijf een leuke, persoonlijke email voor ${userName} over de vooruitzichten voor "${event.name}".
          Begin met "Hoi ${userName}," of een variatie.
          Verwijs naar de naam van de dag ("${event.name}").
          
          Gebruik HTML opmaak (alleen body tags zoals <b>, <br>, <p>).
          Maak het enthousiast!
        `;

        const promptEN = `
          You are Baro, the personal weatherman.
          
          CONTEXT:
          - User: ${userName}
          - Special Day: "${event.name}"
          - Event Date: ${event.date} ${periodText} (Duration: ${duration} days)
          - Days until event: ${diff}
          - Location: ${event.location.name}
          - Chosen Profile Name: ${profileName}
          
          INSTRUCTION FOR THIS MOMENT (Schedule):
          ${scheduleInstruction}
          
          WEATHER DATA (JSON):
          ${JSON.stringify(weatherData.daily)}
          
          ASSIGNMENT:
          Write a fun, personal email for ${userName} about the outlook for "${event.name}".
          Start with "Hi ${userName}," or a variation.
          Refer to the name of the day ("${event.name}").
          
          Use HTML formatting (only body tags like <b>, <br>, <p>).
          Make it enthusiastic!
        `;

        return await callAI(isNL ? promptNL : promptEN);

    } catch (e) {
        console.error("Error generating report:", e);
        return `Error: ${e.message || (language === 'nl' ? "Kon geen weerbericht genereren." : "Could not generate weather report.")}`;
    }
}

async function sendEmail(toEmail, toName, subject, htmlContent, creditsInfo, language = 'nl') {
    if (!process.env.BREVO_API_KEY) return false;

    const title = language === 'nl' ? 'Weerbericht Jouw Dag' : 'Weather Your Day';
    const footer = language === 'nl' ? 'Verzonden door Baro Weerman' : 'Sent by Baro Weerman';

    const sendSmtpEmail = new Brevo.SendSmtpEmail();
    sendSmtpEmail.subject = subject;
    sendSmtpEmail.htmlContent = `
        <html>
            <body style="font-family: sans-serif; line-height: 1.6; color: #333;">
                <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #ec4899;">${title}</h2>
                    <div style="background: #fff1f2; padding: 20px; border-radius: 12px; border: 1px solid #fda4af;">
                        ${htmlContent}
                    </div>
                    <p style="font-size: 12px; color: #64748b; margin-top: 20px; text-align: center;">
                        ${footer}
                    </p>
                </div>
            </body>
        </html>
    `;
    sendSmtpEmail.sender = { "name": "Baro Weerman", "email": "no-reply@askbaro.com" };
    sendSmtpEmail.to = [{ "email": toEmail, "name": toName }];

    try {
        await apiInstance.sendTransacEmail(sendSmtpEmail);
        return true;
    } catch (error) {
        console.error("Error sending email:", error);
        return false;
    }
}

export const handler = async (event, context) => {
    if (!db) return { statusCode: 500, body: "Database error" };

    const now = new Date();
    console.log(`Your Day Scheduler run at (server time): ${now.toISOString()}`);

    try {
        // Optimization: Filter users with credits > 0 directly
        let usersDocs = [];

        if (event.testEmail) {
            console.log(`TEST MODE: Targeting only ${event.testEmail}`);
            // Create a fake event that triggers today (diff 0)
            const today = new Date();
            const dateStr = today.toISOString().split('T')[0]; // "YYYY-MM-DD"
            // Actually the logic uses month-day.
            const m = today.getMonth() + 1;
            const d = today.getDate();
            const fakeDate = `${m}-${d}`; // e.g. "5-24"

            usersDocs = [{
                id: 'test-user',
                data: () => ({
                    email: event.testEmail,
                    displayName: 'Test Edwin',
                    isBanned: false,
                    usage: { baroCredits: 100 },
                    settings: { timezone: 'Europe/Amsterdam' },
                    customEvents: [{
                        id: 'test-event-1',
                        active: true,
                        name: 'Test Event Vandaag',
                        date: fakeDate,
                        location: { lat: 52.09, lon: 5.12, name: 'Utrecht' },
                        duration: 1
                    }]
                })
            }];
        } else {
            const usersSnapshot = await db.collection('users')
                .where('usage.baroCredits', '>', 0)
                .get();
            usersDocs = usersSnapshot.docs;
        }

        const results = [];

        console.log(`Found ${usersDocs.length} users with credits to check for Custom Events.`);

        for (const doc of usersDocs) {
            const userData = doc.data();
            const userId = doc.id;

            // Skip banned users
            if (userData.isBanned === true) {
                console.log(`User ${userId} is banned, skipping scheduled your-day.`);
                continue;
            }

            const customEvents = userData.customEvents || [];
            
            if (!customEvents.length) continue;

            const settings = userData.settings || {};

            // Timezone & Schedule Check
            const timezone = settings.timezone || 'Europe/Amsterdam';
            const userTimeStr = now.toLocaleString('en-US', { timeZone: timezone });
            const userTime = new Date(userTimeStr);
            const userHour = userTime.getHours();

            // Send only between 06:00 and 10:00 (Uitloop 6, 7, 8, 9)
            if (!event.testEmail && (userHour < 6 || userHour > 9)) continue;

            // Date comparison based on User Time (midnight)
            const dateForComparison = new Date(userTime);
            dateForComparison.setHours(0, 0, 0, 0);

            for (const ev of customEvents) {
                if (!ev.active) continue;

                // Calculate Next Occurrence
                const [m, d] = ev.date.split('-').map(Number);
                let nextDate = new Date(dateForComparison.getFullYear(), m - 1, d);
                
                // If date has passed this year, it's next year
                // Note: If today is the date, we want it to be today (diff 0)
                if (nextDate < dateForComparison) {
                    nextDate.setFullYear(dateForComparison.getFullYear() + 1);
                }

                // Calculate Diff in Days
                const diffTime = nextDate.getTime() - dateForComparison.getTime();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                // Check Triggers: 10, 7, 6, 5, 4, 3, 2, 1, 0
                const triggers = [10, 7, 6, 5, 4, 3, 2, 1, 0];
                if (!triggers.includes(diffDays)) continue;

                // Check Audit (Idempotency)
                const auditKey = `${doc.id}_${ev.id}_${diffDays}_days_out`; // unique per user, event, and trigger stage
                const auditRef = db.collection('email_audit_logs').doc(auditKey);
                const auditDoc = await auditRef.get();

                if (!event.testEmail && auditDoc.exists) {
                    continue;
                }

                // RATE LIMITING: Enforce max 5 calls per minute to AI (12s interval)
                const delay = 12000;
                await new Promise(resolve => setTimeout(resolve, delay));

                // Check Credits
                const usage = userData.usage || {};
                const baroCredits = usage.baroCredits !== undefined ? usage.baroCredits : (userData.baroCredits || 0);
                
                if (baroCredits <= 0) {
                    console.log(`Skipping ${doc.id} event ${ev.name}: No Baro credits`);
                    continue;
                }

                // Proceed - Standard Profile
                const profileName = 'Standaard';
                
                // Fetch Weather
                // We need weather for the target date + maybe period
                // But OpenMeteo returns forecast relative to TODAY.
                // So if diffDays is 10, we need index 10 (or around that).
                // Fetch 16 days to be safe.
                const weatherData = await fetchWeatherData(ev.location.lat, ev.location.lon);
                
                if (!weatherData) continue;

                // Generate Report
                let userName = userData.displayName || "Gebruiker";
                 if (userData.providerData) {
                    const gp = userData.providerData.find(p => p.providerId === 'google.com');
                    if (gp && gp.displayName) userName = gp.displayName;
                }
                
                let userEmail = userData.email;
                 if (!userEmail) {
                    try {
                        const userRecord = await admin.auth().getUser(doc.id);
                        userEmail = userRecord.email;
                    } catch (e) {}
                }

                if (!userEmail) continue;

                // Determine Language
                const language = userData.settings?.language || 'nl';
                const isNL = language === 'nl';

                const emailHtml = await generateReport(weatherData, ev, diffDays, profileName, userName, language);

                // Prepare credits info for footer
                const creditsInfo = {
                    baroCredits: Math.max(0, baroCredits - 1),
                    weatherCredits: usage.weatherCredits // if exists
                };

                const subject = isNL 
                    ? `Weerbericht voor ${ev.name} (nog ${diffDays === 0 ? 'VANDAAG' : diffDays + ' dagen'})`
                    : `Weather report for ${ev.name} (${diffDays === 0 ? 'TODAY' : diffDays + ' days left'})`;

                const sent = await sendEmail(userEmail, userName, subject, emailHtml, creditsInfo, language);

                if (sent) {
                    if (!event.testEmail) {
                        await auditRef.set({
                            userId: doc.id,
                            eventId: ev.id,
                            diffDays,
                            timestamp: admin.firestore.FieldValue.serverTimestamp()
                        });
                        
                        // Deduct credit
                        await db.collection('users').doc(doc.id).set({
                            usage: {
                                baroCredits: admin.firestore.FieldValue.increment(-1)
                            }
                        }, { merge: true });
                    }

                    results.push({ userId: doc.id, event: ev.name, status: 'sent' });
                }
            }
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ message: "Custom events processed", results })
        };

    } catch (e) {
        console.error(e);
        return { statusCode: 500, body: e.message };
    }
};

// Schedule: Run hourly at minute 30
export const config = {
    schedule: "30 * * * *"
};

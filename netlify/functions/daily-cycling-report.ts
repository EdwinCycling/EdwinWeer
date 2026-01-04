import admin from 'firebase-admin';
import { Client } from '@notionhq/client';
import fetch from 'node-fetch';
import * as Brevo from '@getbrevo/brevo';
import { GoogleGenerativeAI } from '@google/generative-ai';

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

// Initialize Notion
const notion = new Client({
    auth: process.env.NOTION_API_KEY,
});

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// Initialize Brevo
const brevoApi = new Brevo.TransactionalEmailsApi();
const brevoApiKey = process.env.BREVO_API_KEY || '';
if (brevoApi.setApiKey) {
    brevoApi.setApiKey(Brevo.TransactionalEmailsApiApiKeys.apiKey, brevoApiKey);
}

// Helper: Send Telegram
async function sendTelegramNotification(chatId: string, text: string) {
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

// Helper: Send Email
async function sendEmailNotification(email: string, subject: string, htmlContent: string) {
    if (!brevoApiKey) return;
    
    const sendSmtpEmail = new Brevo.SendSmtpEmail();
    sendSmtpEmail.subject = subject;
    sendSmtpEmail.htmlContent = htmlContent;
    sendSmtpEmail.sender = { "name": "Baro Weerman", "email": "info@baro-app.nl" }; // Adjust sender if needed
    sendSmtpEmail.to = [{ "email": email }];

    try {
        await brevoApi.sendTransacEmail(sendSmtpEmail);
    } catch (e) {
        console.error('Error sending Email:', e);
    }
}

// Helper: Extract Location Name from Widget HTML
function extractLocationName(htmlString: string): string | null {
    if (!htmlString) return null;
    const match = htmlString.match(/data-label_1="([^"]*)"/);
    if (match && match[1]) {
        return match[1].trim();
    }
    return null;
}

// Helper: Geocode Location
async function geocodeLocation(locationName: string, country: string = "") {
    try {
        const query = country ? `${locationName}, ${country}` : locationName;
        const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=1&language=nl&format=json`;
        const response = await fetch(url);
        const data: any = await response.json();
        if (data.results && data.results.length > 0) {
            return {
                lat: data.results[0].latitude,
                lon: data.results[0].longitude,
                name: data.results[0].name,
                country: data.results[0].country
            };
        }
        return null;
    } catch (e) {
        console.error(`Error geocoding ${locationName}:`, e);
        return null;
    }
}

// Helper: Get Weather
async function getWeather(lat: number, lon: number) {
    try {
        // Hourly forecast for today
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,precipitation_probability,precipitation,wind_speed_10m,wind_direction_10m,weather_code,sunshine_duration&timezone=auto&forecast_days=1`;
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Weather API error: ${response.status}`);
        return await response.json();
    } catch (e) {
        console.error("Error fetching weather:", e);
        return null;
    }
}

// Helper: Generate Text with Gemini
async function generateWeatherText(raceName: string, location: string, weatherData: any, additionalInfo: any = {}) {
    try {
        const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || "gemini-2.5-flash-lite" });
        
        const weatherContext = `Data: ${JSON.stringify(weatherData)}. Focus: Middagweer (13:00-17:00).`;

        const prompt = `
            Je bent een enthousiaste wieler-weerman. Schrijf een boeiend weerbericht in het Nederlands voor de koers: "${raceName}".
            Locatie: ${location}.
            ${weatherContext}
            
            Betrek deze informatie in je verhaal:
            - Koersinfo: "${additionalInfo.info || ''}"
            - Recente winnaars: "${additionalInfo.history || ''}"
            - Opmerkelijk: "${additionalInfo.notable || ''}"
            
            Focus op de middag/finale (wind, temperatuur, neerslag) en wat dit betekent voor de renners (waaiers? gladde wegen? zware finale?).
            Maak er een meeslepend, sportief verhaal van. Gebruik een paar relevante emoji's.
            Max 8-10 zinnen.
        `;
        
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (e) {
        console.error("Error generating text:", e);
        return "Geen weerbericht beschikbaar.";
    }
}

// Helper: Get Location from Gemini for long races
async function getRaceLocationFromGemini(raceName: string, date: string, info: string = "", country: string = "") {
    try {
        const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || "gemini-2.5-flash-lite" });
        const prompt = `
            Je bent een wielerexpert. Baseer je op:
            - Koersnaam: "${raceName}"
            - Datum: "${date}"
            - Informatie: "${info}"
            - Land (indien bekend): "${country}"

            Wat is de meest waarschijnlijke finishlocatie (Stad) van deze koers of etappe op deze specifieke datum?
            Geef ALLEEN de stad en het land terug (bijv. "Utsunomiya, Japan" of "Oudenaarde, België").
            Als je het echt niet weet, geef dan "Unknown" terug.
        `;
        
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text().trim().replace(/[*_#]/g, ''); // Remove formatting
        return text.toLowerCase().includes("unknown") ? null : text;
    } catch (e) {
        console.error("Error getting location from Gemini:", e);
        return null;
    }
}

// Main Function
export const handler = async (event: any, context: any) => {
    console.log("Starting Daily Cycling Report...");

    if (!db) {
        console.error("Database not initialized");
        return { statusCode: 500, body: "Database not initialized" };
    }

    try {
        const now = new Date();
        // 1. Notion Data
        const databaseId = process.env.NOTION_DATABASE_ID;
        if (!databaseId) {
            console.error("Missing NOTION_DATABASE_ID");
            throw new Error("Missing NOTION_DATABASE_ID");
        }

        const today = now.toISOString().split('T')[0];
        console.log(`Querying Notion for date: ${today}`);
        
        const cleanDbId = databaseId.trim().replace(/-/g, '');
        const url = `https://api.notion.com/v1/databases/${cleanDbId}/query`;
        console.log(`Querying Notion URL: ${url}`); 

        const filter = {
            and: [
                { property: "Start datum", date: { on_or_before: today } },
                { property: "Eind datum", date: { on_or_after: today } }
            ]
        };

        let response: any;
        try {
            const fetchResponse = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${process.env.NOTION_API_KEY}`,
                    'Notion-Version': '2022-06-28',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    filter: filter
                })
            });

            if (!fetchResponse.ok) {
                const errorData = await fetchResponse.json();
                throw new Error(errorData.message || `Notion API Error: ${fetchResponse.status}`);
            }

            response = await fetchResponse.json();
        } catch (queryError) {
            console.error('Error querying Notion:', queryError);
            return {
                statusCode: 500,
                body: JSON.stringify({ error: 'Failed to query Notion database', details: queryError instanceof Error ? queryError.message : String(queryError) })
            };
        }

        const races = response.results;
        console.log(`Found ${races.length} active races for today (${today})`);

        if (races.length === 0) {
            return { statusCode: 200, body: "No races today" };
        }

        // 2. Prepare Race Data (Generic)
        const raceReports = [];
        for (const race of races) {
            const props = (race as any).properties;
            const fullTitle = props.Koers?.title?.[0]?.plain_text || 
                              props.Name?.title?.[0]?.plain_text || "Onbekende Koers";
            
            const countryMatch = fullTitle.match(/\(([^)]+)\)/);
            const country = countryMatch ? countryMatch[1] : "BE";
            const nameTitle = fullTitle.replace(/\([^)]+\)/, '').trim();

            const category = props.Categorie?.multi_select?.map((c: any) => c.name).join(', ') || "";
            const winners = props["Recente winnaars"]?.rich_text?.[0]?.plain_text || "";
            const info = props.Informatie?.rich_text?.[0]?.plain_text || "";
            const notable = props.Opmerkelijk?.rich_text?.[0]?.plain_text || "";
            
            const startDateStr = props["Start datum"]?.date?.start;
            const endDateStr = props["Eind datum"]?.date?.end || props["Eind datum"]?.date?.start || startDateStr;

            let status = "Eendagskoers";
            let durationDays = 1;
            
            if (startDateStr && endDateStr && startDateStr !== endDateStr) {
                const start = new Date(startDateStr);
                const end = new Date(endDateStr);
                const now = new Date(today);
                const dayDiff = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
                status = `Rit ${dayDiff + 1} van ${Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1}`;
                durationDays = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
            }

            let locationName = null;
            const weatherField = props.Weer?.rich_text?.[0]?.plain_text || ""; 
            locationName = extractLocationName(weatherField);

            // Fallback: Als locatie niet in het weer-veld staat, of als het een lange rittenkoers is, gebruik AI
            if (!locationName || durationDays > 7) {
                const aiLoc = await getRaceLocationFromGemini(nameTitle, today, info, country);
                if (aiLoc) locationName = aiLoc;
            }
            
            let weatherText = "Geen weerbericht beschikbaar.";
            let locationDisplay = locationName || "Onbekend";

            if (locationDisplay !== "Onbekend") {
                const geo = await geocodeLocation(locationDisplay, country);
                if (geo) {
                    locationDisplay = `${geo.name}, ${geo.country}`;
                    const weather = await getWeather(geo.lat, geo.lon);
                    if (weather) {
                        const hourly = (weather as any).hourly;
                        const indices = hourly.time.map((t: string, i: number) => {
                            const h = parseInt(t.split('T')[1].split(':')[0]);
                            return (h >= 13 && h <= 17) ? i : -1;
                        }).filter((i: number) => i !== -1);

                        if (indices.length > 0) {
                            const relevantWeather = {
                                temp_avg: indices.reduce((sum: number, i: number) => sum + hourly.temperature_2m[i], 0) / indices.length,
                                wind_max: Math.max(...indices.map((i: number) => hourly.wind_speed_10m[i])),
                                precip_prob_max: Math.max(...indices.map((i: number) => hourly.precipitation_probability[i])),
                                wind_dir: hourly.wind_direction_10m[indices[Math.floor(indices.length/2)]]
                            };
                            
                            weatherText = await generateWeatherText(
                                nameTitle, 
                                locationDisplay, 
                                relevantWeather, 
                                { info, history: winners, notable }
                            );
                        }
                    }
                }
            }

            raceReports.push({
                title: nameTitle,
                category: category,
                location: locationDisplay,
                status: status,
                weather: weatherText,
                country: country,
                info: info,
                winners: winners,
                notable: notable
            });
        }

        // 3. Process Users
        const usersSnapshot = await db.collection('users')
            .where('settings.cycling_updates.enabled', '==', true)
            .get();

        console.log(`Found ${usersSnapshot.docs.length} users with cycling updates enabled.`);

        let count = 0;
        for (const userDoc of usersSnapshot.docs) {
            const userData = userDoc.data();
            const settings = userData.settings || {};
            const credits = userData.usage?.baroCredits || 0;
            const lastUpdate = userData.last_cycling_update_date;
            const userEmail = userData.email || userData.displayName || userDoc.id;
            const isTestUser = userEmail === 'edwin@editsolutions.nl';

            if (credits <= 0) {
                console.log(`Skipping user ${userEmail}: No credits left (${credits}).`);
                continue;
            }
            if (lastUpdate === today && !isTestUser) {
                console.log(`Skipping user ${userEmail}: Already received update today.`);
                continue;
            }

            // Timezone Check: Send only between 06:00 and 20:00 local time
            const timezone = settings.timezone || 'Europe/Amsterdam';
            const userTimeStr = now.toLocaleString('en-US', { timeZone: timezone });
            const userTime = new Date(userTimeStr);
            const userHour = userTime.getHours();

            // Skip if not in allowed window (06:00 - 20:00)
            // Note: In test mode (event.isTest) or for test users, we skip this check
            if (!event.isTest && !isTestUser && (userHour < 6 || userHour > 20)) {
                console.log(`Skipping user ${userEmail}: Local time is ${userHour}:00 (only sending between 06:00-20:00).`);
                continue;
            }

            const channel = settings.cycling_updates?.channel || 'email';
            
            // Build Unified Message
            let message = "";
            if (channel === 'telegram') {
                message = `<b>Dagelijkse koers update</b>\n\n`;
                message += `Vandaag ${raceReports.length === 1 ? 'staat er' : 'staan er'} ${raceReports.length} ${raceReports.length === 1 ? 'koers' : 'koersen'} op het programma:\n`;
                message += raceReports.map(r => `• ${r.title}`).join('\n') + `\n\n`;

                for (const report of raceReports) {
                    message += `<b>${report.title}</b> (${report.country})\n`;
                    message += `📍 ${report.location} | 📅 ${report.status}\n`;
                    
                    if (report.info) message += `ℹ️ ${report.info}\n`;
                    if (report.winners) message += `🏆 Recente winnaars: ${report.winners}\n`;
                    if (report.notable) message += `✨ Opmerkelijk: ${report.notable}\n`;
                    
                    message += `\n${report.weather}\n\n`;
                }
                message += `<i>Informatie bron: <a href="https://www.ishetalkoers.nl">www.ishetalkoers.nl</a></i>\n`;
                message += `<i>Je hebt nog ${credits - 1} Baro credits.</i>`;
                
                const telegramId = userData.telegramChatId;
                if (telegramId) {
                    console.log(`Sending Telegram report to user: ${userData.email || userData.displayName || userDoc.id} (ChatID: ${telegramId})`);
                    await sendTelegramNotification(telegramId, message);
                }
            } else {
                // Email
                message = `<div style="font-family: sans-serif; max-width: 600px; margin: auto; color: #1e293b;">`;
                message += `<h1 style="color: #1e293b; border-bottom: 2px solid #f1f5f9; padding-bottom: 10px;">Dagelijkse koers update</h1>`;
                message += `<p style="font-size: 16px;">Vandaag ${raceReports.length === 1 ? 'staat er' : 'staan er'} ${raceReports.length} ${raceReports.length === 1 ? 'koers' : 'koersen'} op het programma:</p>`;
                message += `<ul style="background: #f8fafc; padding: 15px 15px 15px 35px; border-radius: 12px; list-style-type: '🚴 '; ">` + 
                           raceReports.map(r => `<li style="margin-bottom: 5px; font-weight: bold;">${r.title}</li>`).join('') + 
                           `</ul>`;

                for (const report of raceReports) {
                    message += `<div style="margin-top: 40px; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">`;
                    message += `<div style="background: #4f46e5; color: white; padding: 15px 20px;">`;
                    message += `<h2 style="margin: 0; font-size: 20px;">${report.title} (${report.country})</h2>`;
                    message += `<p style="margin: 5px 0 0 0; opacity: 0.9; font-size: 14px;">📍 ${report.location} | 📅 ${report.status}</p>`;
                    message += `</div>`;
                    
                    message += `<div style="padding: 20px;">`;
                    
                    if (report.info || report.winners || report.notable) {
                        message += `<div style="margin-bottom: 20px; font-size: 14px; background: #f1f5f9; padding: 15px; border-radius: 8px;">`;
                        if (report.info) message += `<p style="margin: 0 0 8px 0;"><strong>ℹ️ Koersinfo:</strong> ${report.info}</p>`;
                        if (report.winners) message += `<p style="margin: 0 0 8px 0;"><strong>🏆 Recente winnaars:</strong> ${report.winners}</p>`;
                        if (report.notable) message += `<p style="margin: 0;"><strong>✨ Opmerkelijk:</strong> ${report.notable}</p>`;
                        message += `</div>`;
                    }

                    message += `<div style="background: white; line-height: 1.6; font-style: italic; color: #334155;">`;
                    message += report.weather.replace(/\n/g, '<br>');
                    message += `</div>`;
                    
                    message += `</div>`;
                    message += `</div>`;
                }
                
                message += `<p style="margin-top: 40px; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 20px; text-align: center;">`;
                message += `Informatie bron: <a href="https://www.ishetalkoers.nl" style="color: #4f46e5; text-decoration: none;">www.ishetalkoers.nl</a><br>`;
                message += `Je hebt nog ${credits - 1} Baro credits.</p>`;
                message += `</div>`;

                console.log(`Sending Email report to user: ${userData.email} (UID: ${userDoc.id})`);
                await sendEmailNotification(userData.email, `Dagelijkse koers update: ${raceReports.length} ${raceReports.length === 1 ? 'koers' : 'koersen'} vandaag`, message);
            }

            await db.collection('users').doc(userDoc.id).update({
                'usage.baroCredits': admin.firestore.FieldValue.increment(-1),
                'last_cycling_update_date': today
            });
            count++;
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ message: `Sent ${count} reports` })
        };

    } catch (e: any) {
        console.error("Error in daily cycling report:", e);
        return { statusCode: 500, body: e.message };
    }
};

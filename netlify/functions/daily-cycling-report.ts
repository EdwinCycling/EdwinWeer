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

// Helper: Geocode Location
async function geocodeLocation(locationName: string) {
    try {
        const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(locationName)}&count=1&language=nl&format=json`;
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
async function generateWeatherText(raceName: string, location: string, weatherData: any) {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const prompt = `Schrijf een zakelijk weerbericht (geen emoticons) voor de wielerkoers ${raceName} in ${location}. Focus: Middagweer (13:00-17:00). Data: ${JSON.stringify(weatherData)}. Beschrijf wind en neerslag invloed op de koers. Max 5 zinnen.`;
        
        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (e) {
        console.error("Error generating text:", e);
        return "Geen weerbericht beschikbaar.";
    }
}

// Helper: Get Location from Gemini for long races
async function getRaceLocationFromGemini(raceName: string, date: string) {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const prompt = `For the cycling race "${raceName}" on date "${date}", what is the finish location (City, Country) of the stage? Return ONLY the location name (e.g. "Paris, France"), nothing else. If unknown, return "Unknown".`;
        
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text().trim();
        return text === "Unknown" ? null : text;
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
        // 1. Notion Data
        const databaseId = process.env.NOTION_DATABASE_ID;
        if (!databaseId) {
            console.error("Missing NOTION_DATABASE_ID");
            throw new Error("Missing NOTION_DATABASE_ID");
        }

        const today = new Date().toISOString().split('T')[0];
        console.log(`Querying Notion for date: ${today}`);
        
        // Debug Notion Client
        console.log('Notion client keys:', Object.keys(notion));
        if ((notion as any).databases) {
            console.log('Notion databases keys:', Object.keys((notion as any).databases));
            console.log('Type of query:', typeof (notion as any).databases.query);
        } else {
            console.error('Notion databases property is missing!');
        }

        // Query for active races: Start <= Today AND End >= Today
        let response;
        const filter = {
            and: [
                {
                    property: "Start datum",
                    date: {
                        on_or_before: today
                    }
                },
                {
                    property: "Eind datum",
                    date: {
                        on_or_after: today
                    }
                }
            ]
        };

        try {
            if ((notion as any).databases && typeof (notion as any).databases.query === 'function') {
                 response = await (notion.databases as any).query({
                    database_id: databaseId,
                    filter: filter
                } as any);
            } else {
                console.warn('Using fallback notion.request for query');
                response = await notion.request({
                    path: `databases/${databaseId}/query`,
                    method: 'POST',
                    body: {
                        filter: filter
                    }
                });
            }
        } catch (queryError) {
            console.error('Error executing Notion query:', queryError);
            throw queryError;
        }

        const races = (response as any).results;
        console.log(`Found ${races.length} active races for today (${today})`);

        if (races.length === 0) {
            return { statusCode: 200, body: "No races today" };
        }

        const raceReports = [];

        // Process each race
        for (const race of races) {
            const props = (race as any).properties;
            
            // Extract Data
            const nameTitle = props.Koers?.title?.[0]?.plain_text || "Onbekende Koers";
            const category = props.Categorie?.multi_select?.map((c: any) => c.name).join(', ') || "";
            const winners = props["Recente winnaars"]?.rich_text?.[0]?.plain_text || "";
            const info = props.Informatie?.rich_text?.[0]?.plain_text?.substring(0, 150) + "..." || "";
            
            // Dates
            const startDateStr = props["Start datum"]?.date?.start;
            const endDateStr = props["Eind datum"]?.date?.start || startDateStr;

            // Calculate Stage / Status
            let status = "Eendagskoers";
            let durationDays = 1;
            
            if (startDateStr && endDateStr && startDateStr !== endDateStr) {
                const start = new Date(startDateStr);
                const end = new Date(endDateStr);
                const now = new Date(today);
                
                // Calculate day number (1-based)
                const dayDiff = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
                const currentDay = dayDiff + 1;
                
                // Calculate total days
                const totalDiff = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                durationDays = totalDiff;
                
                status = `Rit ${currentDay} van ${totalDiff}`;
            }

            console.log(`Processing race: ${nameTitle}, Status: ${status}, Duration: ${durationDays} days`);

            // Location Logic
            let locationName = null;

            // Strategy: 
            // 1. If long race (> 7 days), ask Gemini for specific stage location
            // 2. Else use Notion "Weer" field regex
            
            if (durationDays > 7) {
                console.log(`Race > 7 days, asking Gemini for location...`);
                locationName = await getRaceLocationFromGemini(nameTitle, today);
                console.log(`Gemini returned location: ${locationName}`);
            }
            
            // Fallback or if short race
            if (!locationName) {
                const weatherField = props.Weer?.rich_text?.[0]?.plain_text || ""; 
                const locationMatch = weatherField.match(/data-label_1="([^"]*)"/);
                locationName = locationMatch ? locationMatch[1] : null;
            }
            
            let weatherText = "Geen weerdata beschikbaar.";
            let locationDisplay = locationName || "Onbekend";

            if (locationName) {
                console.log(`Geocoding location: ${locationName}`);
                const geo = await geocodeLocation(locationName);
                if (geo) {
                    locationDisplay = `${geo.name}, ${geo.country}`;
                    const weather = await getWeather(geo.lat, geo.lon);
                    
                    if (weather) {
                        // Filter 13:00 - 17:00
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
                                wind_dir: hourly.wind_direction_10m[indices[Math.floor(indices.length/2)]] // mid-afternoon
                            };
                            
                            weatherText = await generateWeatherText(nameTitle, locationDisplay, relevantWeather);
                        }
                    }
                }
            }

            raceReports.push({
                title: `${nameTitle} (${category})`,
                location: locationDisplay,
                status: status,
                weather: weatherText,
                info: info,
                history: winners
            });
        }

        // 3. Process Users
        const usersSnapshot = await db.collection('users')
            .where('settings.cycling_updates.enabled', '==', true)
            // .where('usage.baroCredits', '>', 0) // Compound query requires index. Do manual filter to avoid index creation for now.
            .get();

        let count = 0;
        
        for (const doc of usersSnapshot.docs) {
            const userData = doc.data();
            const credits = userData.usage?.baroCredits || 0;
            const lastUpdate = userData.last_cycling_update_date;

            if (credits <= 0) continue;
            if (lastUpdate === today) continue;

            // 4. Send Message
            const channel = userData.settings?.cycling_updates?.channel || 'email';
            
            // Build Message
            let message = "";
            if (channel === 'telegram') {
                message = `<b>🚴 Wielerkoers Update</b>\n\n`;
                for (const report of raceReports) {
                    message += `<b>${report.title}</b>\n`;
                    message += `📍 ${report.location}\n`;
                    message += `📅 ${report.status}\n`;
                    message += `🌤 ${report.weather}\n\n`;
                }
                message += `<i>Je hebt nog ${credits - 1} Baro credits.</i>`;
                
                const telegramId = userData.telegramChatId; // Ensure this field exists
                if (telegramId) {
                    await sendTelegramNotification(telegramId, message);
                }
            } else {
                // Email
                message = `<h1>🚴 Wielerkoers Update</h1>`;
                for (const report of raceReports) {
                    message += `<h2>${report.title}</h2>`;
                    message += `<p><strong>Locatie:</strong> ${report.location}</p>`;
                    message += `<p><strong>Status:</strong> ${report.status}</p>`;
                    message += `<p><strong>Weer:</strong> ${report.weather}</p>`;
                    message += `<p><strong>Info:</strong> ${report.info}</p>`;
                    message += `<p><strong>Historie:</strong> ${report.history}</p>`;
                    message += `<hr>`;
                }
                message += `<p><small>Deze koersinformatie wordt beschikbaar gesteld door <a href="https://ishetalkoers.nl">IsHetAlKoers.nl</a></small></p>`;
                message += `<p>Je hebt nog ${credits - 1} Baro credits.</p>`;

                await sendEmailNotification(userData.email, "🚴 Wielerkoers Weerbericht", message);
            }

            // 5. Update User
            await db.collection('users').doc(doc.id).update({
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

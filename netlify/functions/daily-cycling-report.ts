import { initFirebase, getDb, admin } from './config/firebaseAdmin.js';
import { Client } from '@notionhq/client';
import * as Brevo from '@getbrevo/brevo';
import { callAI } from './config/ai.js';

console.log("MODULE LOAD: daily-cycling-report.ts");

initFirebase();
const db = getDb();

// Initialize Notion
console.log("Initializing Notion client...");
const notion = new Client({
    auth: process.env.NOTION_API_KEY,
});

// Initialize Brevo
console.log("Initializing Brevo API...");
const brevoApi = new Brevo.TransactionalEmailsApi();
const brevoApiKey = process.env.BREVO_API_KEY || '';
if (brevoApi.setApiKey) {
    brevoApi.setApiKey(Brevo.TransactionalEmailsApiApiKeys.apiKey, brevoApiKey);
}

// Schedule: Run daily at 07:40
export const config = {
    schedule: "40 7 * * *"
};
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
    sendSmtpEmail.sender = { "name": "Baro Weerman", "email": "no-reply@askbaro.com" }; // Updated to verified sender
    sendSmtpEmail.to = [{ "email": email }];

    try {
        const data = await brevoApi.sendTransacEmail(sendSmtpEmail);
        console.log("Brevo Email Sent:", JSON.stringify(data));
    } catch (e) {
        console.error('Error sending Email:', e);
    }
}

// Helper: Extract Location Name from Widget HTML
function extractLocationName(htmlString: string): string | null {
    if (!htmlString) return null;

    console.log("Attempting to extract location from:", htmlString.substring(0, 100) + "...");

    // 1. Probeer data-label_1 (meest specifiek, ondersteunt dubbele en enkele quotes)
    const label1Match = htmlString.match(/data-label_1=["']([^"']*)["']/i);
    if (label1Match && label1Match[1] && label1Match[1].trim()) {
        const loc = label1Match[1].trim();
        console.log("Found location via data-label_1:", loc);
        return loc;
    }

    // 2. Fallback: Probeer uit de href URL te halen (bijv. forecast7.com/en/.../valencia/)
    const hrefMatch = htmlString.match(/href=["']([^"']*)["']/i);
    if (hrefMatch && hrefMatch[1]) {
        const url = hrefMatch[1].trim();
        // Pak het laatste deel van het pad dat geen extensie heeft en niet puur cijfers is
        const parts = url.split('/').filter(p => p.length > 0);
        if (parts.length > 0) {
            const lastPart = parts[parts.length - 1];
            if (lastPart && !lastPart.includes('.') && isNaN(Number(lastPart))) {
                const loc = lastPart.replace(/-/g, ' ').toUpperCase();
                console.log("Found location via href URL:", loc);
                return loc;
            }
        }
    }

    // 3. Tweede Fallback: Probeer de tekst tussen de <a> tags (bijv. >VALENCIA WEATHER</a>)
    const textMatch = htmlString.match(/>([^<]+)<\/a>/i);
    if (textMatch && textMatch[1]) {
        let text = textMatch[1].trim();
        // Haal veelvoorkomende woorden weg zoals WEATHER of WEER
        text = text.replace(/\s+(WEATHER|FORECAST|WEER|VERWACHTING)$/i, '');
        if (text) {
            console.log("Found location via link text:", text);
            return text;
        }
    }

    console.warn("Could not extract location from HTML string");
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

// Helper: Generate Text with AI
async function generateWeatherText(raceName: string, location: string, weatherData: any, additionalInfo: any = {}, language: string = 'nl') {
    try {
        const langMap: Record<string, string> = {
            'nl': 'Nederlands',
            'en': 'English',
            'de': 'Deutsch',
            'fr': 'Français',
            'es': 'Español'
        };
        const targetLang = langMap[language] || 'Nederlands';

        const weatherContext = `Data: ${JSON.stringify(weatherData)}. Focus: Middagweer (13:00-17:00).`;

        const prompt = `
            Je bent een enthousiaste wieler-weerman. Schrijf een boeiend weerbericht in het ${targetLang} voor de koers: "${raceName}".
            Locatie: ${location}.
            ${weatherContext}
            
            Betrek deze informatie in je verhaal:
            - Koersinfo: "${additionalInfo.info || ''}"
            - Recente winnaars: "${additionalInfo.history || ''}"
            - Opmerkelijk: "${additionalInfo.notable || ''}"
            
            Focus op de middag/finale (wind, temperatuur, neerslag) en wat dit betekent voor de renners (waaiers? gladde wegen? zware finale?).
            Maak er een meeslepend, sportief verhaal van. Gebruik een paar relevante emoji's.
            Max 8-10 zinnen.
            ${language === 'nl' ? '' : `IMPORTANT: Provide the output in ${targetLang}.`}
        `;
        
        return await callAI(prompt);
    } catch (e: any) {
        console.error("Error generating text:", e);
        return `Error: ${e.message || (language === 'nl' ? "Geen weerbericht beschikbaar." : "No weather report available.")}`;
    }
}

// Helper: Get Location from AI for long races
async function getRaceLocationFromAI(raceName: string, date: string, info: string = "", country: string = "") {
    try {
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
        
        const text = await callAI(prompt);
        const cleanText = text.trim().replace(/[*_#]/g, ''); // Remove formatting
        return cleanText.toLowerCase().includes("unknown") ? null : cleanText;
    } catch (e) {
        console.error("Error getting location from AI:", e);
        return null;
    }
}

// Main Function
export const handler = async (event: any, context: any) => {
    console.log("--------------------------------------------------");
    console.log("DAILY CYCLING REPORT HANDLER START");
    console.log("Time:", new Date().toISOString());
    console.log("Is Test Event:", !!event.isTest);
    console.log("--------------------------------------------------");

    if (!db) {
        console.error("CRITICAL: Database (Firestore) not initialized!");
        return { statusCode: 500, body: "Database not initialized" };
    }

    try {
        const now = new Date();
        const today = now.toISOString().split('T')[0];

        // 1. Process Users (Check first if anyone is listening)
        let activeUsers: any[] = [];
        if (event.testEmail) {
             console.log(`TEST MODE: Targeting only ${event.testEmail}`);
             activeUsers = [{
                id: 'test-user',
                data: () => ({
                    email: event.testEmail,
                    settings: {
                        cycling_updates: { enabled: true, channel: 'email' },
                        language: 'nl',
                        timezone: 'Europe/Amsterdam'
                    },
                    usage: { baroCredits: 100 },
                    last_cycling_update_date: '1970-01-01'
                })
             }];
        } else {
            const usersSnapshot = await db.collection('users')
                .where('settings.cycling_updates.enabled', '==', true)
                .get();
            activeUsers = usersSnapshot.docs;
        }
        
        if (activeUsers.length === 0) {
            console.log("No users subscribed to cycling updates. Skipping race processing.");
            return { statusCode: 200, body: "No subscribed users" };
        }

        const uniqueLanguages = new Set<string>();
        activeUsers.forEach(doc => {
            const lang = doc.data().settings?.language || 'nl';
            uniqueLanguages.add(lang);
        });

        // 2. Notion Data
        const databaseId = process.env.NOTION_DATABASE_ID;
        if (!databaseId) {
            console.error("Missing NOTION_DATABASE_ID");
            throw new Error("Missing NOTION_DATABASE_ID");
        }

        console.log(`Querying Notion for date: ${today}`);
        
        const cleanDbId = databaseId.trim().replace(/-/g, '');
        const url = `https://api.notion.com/v1/databases/${cleanDbId}/query`;
        console.log(`Querying Notion URL: ${url}\n`); 

        const filter = {
            and: [
                { property: "Start datum", date: { on_or_before: today } },
                { property: "Eind datum", date: { on_or_after: today } }
            ]
        };
        console.log("Notion Filter:", JSON.stringify(filter, null, 2));

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
                const errorData = await fetchResponse.json() as any;
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

        // 3. Prepare Race Data (Generic)
        const raceReports = [];
        for (const race of races) {
            // Rate limit between races to prevent AI overload
            await new Promise(resolve => setTimeout(resolve, 5000));

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
            const weatherField = props.Weer?.rich_text?.map((rt: any) => rt.plain_text).join('') || ""; 
            locationName = extractLocationName(weatherField);

            // Fallback: Als locatie niet in het weer-veld staat, of als het een lange rittenkoers is, gebruik AI
            // CHANGE: Verbeterde logica. Als het een rittenkoers is (> 1 dag), verandert de locatie dagelijks.
            // Dus we moeten ALTIJD AI vragen waar de rit vandaag finisht, tenzij de HTML widget heel specifiek is (wat zelden zo is voor hele tour).
            // Ook als geocoding faalt, proberen we AI.
            let useAI = !locationName || durationDays > 1;
            
            // Check eerst of we de locatie kunnen geocoden als we die hebben
            let geo = null;
            if (locationName && !useAI) {
                geo = await geocodeLocation(locationName, country);
                if (!geo) {
                    console.log(`Geocoding failed for '${locationName}', trying AI fallback...`);
                    useAI = true;
                }
            }

            if (useAI) {
                const aiLoc = await getRaceLocationFromAI(nameTitle, today, info, country);
                if (aiLoc) {
                    console.log(`AI suggest location for ${nameTitle}: ${aiLoc}`);
                    locationName = aiLoc;
                    // Opnieuw geocoden met nieuwe naam
                    geo = await geocodeLocation(locationName, country);
                }
            }
            
            let weatherTexts: Record<string, string> = {};
            let locationDisplay = locationName || "Onbekend";

            if (geo) {
                locationDisplay = `${geo.name}, ${geo.country}`;
                // Retry mechanisme voor weer
                let weather = await getWeather(geo.lat, geo.lon);
                if (!weather) {
                    console.log("Retrying weather fetch...");
                    await new Promise(r => setTimeout(r, 2000));
                    weather = await getWeather(geo.lat, geo.lon);
                }

                if (weather) {
                    const hourly = (weather as any).hourly;
                    // ... rest of logic
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
                            
                            // Generate for all unique languages found
                            for (const lang of Array.from(uniqueLanguages)) {
                                // RATE LIMITING: Enforce max 5 calls per minute to Gemini AI (12s interval)
                                await new Promise(resolve => setTimeout(resolve, 12000));
                                weatherTexts[lang] = await generateWeatherText(
                                    nameTitle, 
                                    locationDisplay, 
                                    relevantWeather, 
                                    { info, history: winners, notable },
                                    lang
                                );
                            }
                        }
                    }
                }
            }

            // Default weather text if none generated
            if (Object.keys(weatherTexts).length === 0) {
                weatherTexts['nl'] = "Geen weerbericht beschikbaar.";
            }

            raceReports.push({
                title: nameTitle,
                category: category,
                location: locationDisplay,
                status: status,
                weatherTexts: weatherTexts,
                country: country,
                info: info,
                winners: winners,
                notable: notable
            });
        }

        // 4. Send Reports to Users
        let count = 0;
        for (const userDoc of activeUsers) {
            const userData = userDoc.data();
            const userId = userDoc.id;

            // Skip banned users
            if (userData.isBanned === true) {
                console.log(`Skipping banned user ${userId} for cycling report.`);
                continue;
            }

            const settings = userData.settings || {};
            const credits = userData.usage?.baroCredits || 0;
            const lastUpdate = userData.last_cycling_update_date;
            
            // Gebruik UID als backup als email ontbreekt in het document
            const userEmail = (userData.email || "").toLowerCase().trim();
            
            // Edwin's UID en Email bypass
            const isTestUser = false;

            if (credits <= 0) {
                console.log(`Skipping user ${userId}: No credits left (${credits}).`);
                continue;
            }
            if (lastUpdate === today) {
                console.log(`Skipping user ${userId}: Already received update today.`);
                continue;
            }

            // Timezone Check: Send only between 07:00 and 10:00 local time
            const timezone = settings.timezone || 'Europe/Amsterdam';
            const userTimeStr = now.toLocaleString('en-US', { timeZone: timezone });
            const userTime = new Date(userTimeStr);
            const userHour = userTime.getHours();

            // Skip if not in allowed window (07:00 - 10:00)
            // Note: In test mode (event.isTest) we skip this check
            if (!event.testEmail && !event.isTest && (userHour < 7 || userHour > 10)) {
                console.log(`Skipping user ${userId}: Local time is ${userHour}:00 (only sending between 07:00-10:00).`);
                continue;
            }

            // Bepaal de taal voor de AI
            const userLang = settings.language || 'nl';
            const langMap: Record<string, string> = {
                'nl': 'Nederlands',
                'en': 'English',
                'de': 'Deutsch',
                'fr': 'Français',
                'es': 'Español'
            };
            const targetLang = langMap[userLang] || 'Nederlands';

            const channel = settings.cycling_updates?.channel || 'email';
            
            // Build Unified Message (Gebruik generieke reports die we al hebben voorbereid)
            // Maar als de taal anders is dan NL, moeten we het weerbericht vertalen of opnieuw genereren
            // Voor nu houden we het simpel: we sturen de NL versie, tenzij we AI opdracht geven per taal.
            // TODO: In de toekomst AI per taal aanroepen in de generic reports loop.
            
            let message = "";
            if (channel === 'telegram') {
                const header = userLang === 'nl' ? 'Dagelijkse koers update' : 'Daily cycling update';
                const raceInfo = userLang === 'nl' 
                    ? `Vandaag ${raceReports.length === 1 ? 'staat er' : 'staan er'} ${raceReports.length} ${raceReports.length === 1 ? 'koers' : 'koersen'} op het programma:`
                    : `Today there ${raceReports.length === 1 ? 'is' : 'are'} ${raceReports.length} ${raceReports.length === 1 ? 'race' : 'races'} scheduled:`;

                message = `<b>${header}</b>\n\n`;
                message += `${raceInfo}\n`;
                message += raceReports.map(r => `• ${r.title}`).join('\n') + `\n\n`;

                for (const report of raceReports) {
                    message += `<b>${report.title}</b> (${report.country})\n`;
                    message += `📍 ${report.location} | 📅 ${report.status}\n`;
                    
                    if (report.info) message += `ℹ️ ${report.info}\n`;
                    if (report.winners) message += `🏆 ${userLang === 'nl' ? 'Recente winnaars' : 'Recent winners'}: ${report.winners}\n`;
                    if (report.notable) message += `✨ ${userLang === 'nl' ? 'Opmerkelijk' : 'Notable'}: ${report.notable}\n`;
                    
                    const weather = report.weatherTexts[userLang] || report.weatherTexts['nl'] || "No weather report available.";
                    message += `\n${weather}\n\n`;
                }
                const footer = userLang === 'nl' ? 'Informatie bron' : 'Information source';
                const creditsInfo = userLang === 'nl' ? `Je hebt nog ${credits - 1} Baro credits.` : `You have ${credits - 1} Baro credits left.`;
                
                message += `<i>${footer}: <a href="https://www.ishetalkoers.nl">www.ishetalkoers.nl</a></i>\n`;
                message += `<i>${creditsInfo}</i>`;
                
                const telegramId = userData.telegramChatId;
                if (telegramId) {
                    console.log(`Sending Telegram report to user: ${userId} (ChatID: ${telegramId})`);
                    await sendTelegramNotification(telegramId, message);
                }
            } else {
                // Email
                const emailSubject = userLang === 'nl' 
                    ? `Dagelijkse koers update: ${raceReports.length} ${raceReports.length === 1 ? 'koers' : 'koersen'} vandaag`
                    : `Daily cycling update: ${raceReports.length} ${raceReports.length === 1 ? 'race' : 'races'} today`;

                message = `<div style="font-family: sans-serif; max-width: 600px; margin: auto; color: #1e293b;">`;
                message += `<h1 style="color: #1e293b; border-bottom: 2px solid #f1f5f9; padding-bottom: 10px;">${userLang === 'nl' ? 'Dagelijkse koers update' : 'Daily cycling update'}</h1>`;
                message += `<p style="font-size: 16px;">${userLang === 'nl' 
                    ? `Vandaag ${raceReports.length === 1 ? 'staat er' : 'staan er'} ${raceReports.length} ${raceReports.length === 1 ? 'koers' : 'koersen'} op het programma:`
                    : `Today there ${raceReports.length === 1 ? 'is' : 'are'} ${raceReports.length} ${raceReports.length === 1 ? 'race' : 'races'} scheduled:`}</p>`;
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
                        if (report.info) message += `<p style="margin: 0 0 8px 0;"><strong>ℹ️ ${userLang === 'nl' ? 'Koersinfo' : 'Race info'}:</strong> ${report.info}</p>`;
                        if (report.winners) message += `<p style="margin: 0 0 8px 0;"><strong>🏆 ${userLang === 'nl' ? 'Recente winnaars' : 'Recent winners'}:</strong> ${report.winners}</p>`;
                        if (report.notable) message += `<p style="margin: 0;"><strong>✨ ${userLang === 'nl' ? 'Opmerkelijk' : 'Notable'}:</strong> ${report.notable}</p>`;
                        message += `</div>`;
                    }

                    message += `<div style="background: white; line-height: 1.6; font-style: italic; color: #334155;">`;
                    const weather = report.weatherTexts[userLang] || report.weatherTexts['nl'] || "No weather report available.";
                    message += weather.replace(/\n/g, '<br>');
                    message += `</div>`;
                    
                    message += `</div>`;
                    message += `</div>`;
                }
                
                const footerText = userLang === 'nl' ? 'Informatie bron' : 'Information source';
                const creditsLeftText = userLang === 'nl' ? `Je hebt nog ${credits - 1} Baro credits.` : `You have ${credits - 1} Baro credits left.`;

                message += `<p style="margin-top: 40px; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 20px; text-align: center;">`;
                message += `${footerText}: <a href="https://www.ishetalkoers.nl" style="color: #4f46e5; text-decoration: none;">www.ishetalkoers.nl</a><br>`;
                message += `${creditsLeftText}</p>`;
                message += `</div>`;

                console.log(`Sending Email report to user: ${userData.email || userId} (UID: ${userId})`);
                await sendEmailNotification(userData.email || userId, emailSubject, message);
            }

            // Update user usage
            if (!event.testEmail) {
                await db.collection('users').doc(userId).set({
                    usage: {
                        baroCredits: admin.firestore.FieldValue.increment(-1)
                    },
                    last_cycling_update_date: today
                }, { merge: true });
            }
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

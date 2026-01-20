import admin from 'firebase-admin';

// Initialize Firebase Admin (Reuse existing logic)
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

const db = admin.apps.length ? admin.firestore() : null;

// Helpers
async function fetchWeatherData(lat, lon) {
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,precipitation_probability,wind_speed_10m,wind_direction_10m,weather_code,sunshine_duration&timezone=auto&forecast_days=2`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('Weather API Error');
        return await response.json();
    } catch (e) {
        console.error("Fetch weather error:", e);
        return null;
    }
}

// Logic similar to tripPlannerService.ts but adapted for backend JS
function calculateTripOptions(forecast, settings, targetDay = 'today') {
    if (!forecast || !forecast.hourly) return [];

    const options = [];
    const hourly = forecast.hourly;
    
    // Parse start time (e.g. "10:00")
    const [startH] = settings.startTime.split(':').map(Number);
    const duration = settings.duration;

    // Define search window with split margins
    // Backend defaults to +/- 1 hour window to give options
    const minStartHour = Math.max(0, startH - 1);
    const maxStartHour = Math.min(23, startH + 1);

    // Determine day index offset
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const targetDateStr = targetDay === 'today' ? todayStr : tomorrowStr;

    // Find the first index that matches the target date
    // Note: OpenMeteo time is ISO string
    let baseIndex = hourly.time.findIndex(t => t.startsWith(targetDateStr));
    
    if (baseIndex === -1) {
        baseIndex = targetDay === 'today' ? 0 : 24;
    }

    for (let h = minStartHour; h <= maxStartHour; h++) {
        // Calculate start index
        const startIndex = baseIndex + h;
        
        // Check if we have enough data for the duration
        if (startIndex + duration >= hourly.time.length) continue;

        // Create Window
        const windowIndices = [];
        for (let i = 0; i < duration; i++) {
            windowIndices.push(startIndex + i);
        }

        // Analyze Window
        let sumTemp = 0;
        let maxWind = 0;
        let minWind = 999;
        let maxRainProb = 0;
        let sumSunChance = 0;
        let windDirs = [];

        windowIndices.forEach(idx => {
            sumTemp += hourly.temperature_2m[idx];
            const wind = hourly.wind_speed_10m[idx];
            maxWind = Math.max(maxWind, wind);
            minWind = Math.min(minWind, wind);
            maxRainProb = Math.max(maxRainProb, hourly.precipitation_probability[idx]);
            
            // Sun calculation
            const sunSeconds = hourly.sunshine_duration ? hourly.sunshine_duration[idx] : 0;
            const sunChance = Math.min(100, (sunSeconds / 3600) * 100);
            sumSunChance += sunChance;

            windDirs.push(hourly.wind_direction_10m[idx]);
        });
        
        if (minWind === 999) minWind = 0;

        const avgTemp = sumTemp / duration;
        const avgSunChance = sumSunChance / duration;
        
        // Calculate Score (Simple Version)
        let score = 10;
        if (maxRainProb > 10) score -= (maxRainProb / 10);
        if (maxRainProb > 50) score -= 2;

        const isCycling = settings.activity === 'cycling';
        const windLimit = isCycling ? 25 : 40;
        
        if (maxWind > windLimit) score -= 2;
        if (maxWind > windLimit + 15) score -= 3;

        if (avgTemp < 5) score -= 1;
        if (avgTemp > 30) score -= 2;

        score = Math.max(1, Math.min(10, Math.round(score * 10) / 10));

        // Format times
        // Safety check for time string
        const startTimeStr = hourly.time[startIndex] ? hourly.time[startIndex].split('T')[1].substring(0, 5) : `${h}:00`;
        const endTimeIndex = startIndex + duration; 
        let endTimeStr = '';
        if (endTimeIndex < hourly.time.length) {
             endTimeStr = hourly.time[endTimeIndex].split('T')[1].substring(0, 5);
        } else {
            endTimeStr = `${(h + duration) % 24}:00`.padStart(5, '0');
        }

        // Wind Direction Text (Simplified)
        const getWindDir = (deg) => {
             const dirs = ['N', 'NO', 'O', 'ZO', 'Z', 'ZW', 'W', 'NW'];
             return dirs[Math.round(deg / 45) % 8];
        };

        options.push({
            startTime: startTimeStr,
            endTime: endTimeStr,
            score,
            avgTemp,
            maxWind,
            maxRain: maxRainProb,
            windDirectionText: getWindDir(windDirs[0]),
            isTargetTime: h === startH
        });
    }

    // Sort: Best Score first, then closest to target time
    options.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return 0; // Keep order roughly
    });

    return options;
}

function generateHtmlTable(options, settings) {
    const rows = options.map(opt => `
        <tr style="border-bottom: 1px solid #eee; ${opt.isTargetTime ? 'background-color: #f8fafc;' : ''}">
            <td style="padding: 12px 8px; font-weight: bold;">${opt.startTime} - ${opt.endTime}</td>
            <td style="padding: 12px 8px;">
                <span style="font-weight: bold; color: ${opt.score >= 8 ? '#16a34a' : opt.score >= 6 ? '#ca8a04' : '#dc2626'}">${opt.score}</span>
            </td>
            <td style="padding: 12px 8px;">${Math.round(opt.avgTemp)}°</td>
            <td style="padding: 12px 8px;">
                ${Math.round(opt.maxWind)} <span style="font-size: 10px; color: #666;">km/u</span> ${opt.windDirectionText}
            </td>
            <td style="padding: 12px 8px;">
                ${opt.maxRain > 0 ? `${opt.maxRain}%` : '<span style="color: #ccc;">-</span>'}
            </td>
        </tr>
    `).join('');

    return `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #fff;">
            <div style="background: linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%); padding: 24px; border-radius: 16px 16px 0 0; color: white;">
                <h2 style="margin: 0; font-size: 24px;">🚴 Baro Rit Advies</h2>
                <p style="margin: 8px 0 0 0; opacity: 0.9; font-size: 14px;">Jouw dagelijkse update voor vandaag</p>
            </div>
            
            <div style="padding: 20px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 16px 16px;">
                <!-- Settings Summary -->
                <div style="background: #f1f5f9; padding: 12px 16px; border-radius: 12px; margin-bottom: 24px; display: flex; align-items: center; gap: 12px;">
                    <div style="font-size: 24px;">⚙️</div>
                    <div style="font-size: 14px; color: #475569;">
                        <strong>Jouw instellingen:</strong><br>
                        ${settings.activity === 'cycling' ? 'Wielrennen' : 'Fietsen'} • ${settings.duration} uur • Start rond ${settings.startTime}
                    </div>
                </div>

                <h3 style="margin: 0 0 16px 0; font-size: 16px; color: #1e293b;">Beste tijdsloten voor vandaag:</h3>

                <table style="width: 100%; border-collapse: collapse; font-size: 14px; text-align: left;">
                    <thead>
                        <tr style="color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">
                            <th style="padding: 8px; border-bottom: 2px solid #e2e8f0;">Tijd</th>
                            <th style="padding: 8px; border-bottom: 2px solid #e2e8f0;">Score</th>
                            <th style="padding: 8px; border-bottom: 2px solid #e2e8f0;">Temp</th>
                            <th style="padding: 8px; border-bottom: 2px solid #e2e8f0;">Wind</th>
                            <th style="padding: 8px; border-bottom: 2px solid #e2e8f0;">Regen</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>

                <div style="margin-top: 24px; text-align: center;">
                    <a href="https://baro-app.nl" style="display: inline-block; background: #0f172a; color: white; text-decoration: none; padding: 12px 24px; border-radius: 99px; font-weight: bold; font-size: 14px;">Open Baro App</a>
                </div>
            </div>
            
            <div style="text-align: center; padding: 20px; color: #94a3b8; font-size: 12px;">
                <p>Je ontvangt dit bericht omdat je Baro Rit Advies hebt ingesteld.</p>
            </div>
        </div>
    `;
}

// Notification Senders
async function sendEmail(email, subject, html) {
    if (!process.env.BREVO_API_KEY) return false;
    try {
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'api-key': process.env.BREVO_API_KEY,
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                sender: { name: 'Baro Weerman', email: 'info@askbaro.com' },
                to: [{ email }],
                subject,
                htmlContent: html
            })
        });
        return response.ok;
    } catch (e) {
        console.error("Email error:", e);
        return false;
    }
}

async function sendTelegram(chatId, html) {
    if (!process.env.TELEGRAM_BOT_TOKEN) return false;
    try {
        const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
        // Convert simplified HTML to Telegram compatible (stripped mostly) or just send text representation
        // For now, we assume users prefer the email for the nice table, but we can send a simplified text version to Telegram
        
        // Strip HTML for Telegram (basic)
        const text = html.replace(/<[^>]*>?/gm, ' ').replace(/\s+/g, ' ');
        
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: "Je Baro Rit Advies staat klaar! Check je email voor de details of open de app.",
                parse_mode: 'HTML'
            })
        });
        return response.ok;
    } catch (e) {
        console.error("Telegram error:", e);
        return false;
    }
}

export const handler = async (event, context) => {
    if (!db) return { statusCode: 500, body: "Database error" };

    const now = new Date();
    console.log(`Baro Weerman run at ${now.toISOString()}`);

    try {
        const usersRef = db.collection('users');
        const snapshot = await usersRef.get();

        const results = [];
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

        for (const doc of snapshot.docs) {
            const userData = doc.data();
            const userId = doc.id;

            // Skip banned users
            if (userData.isBanned === true) {
                console.log(`User ${userId} is banned, skipping baro-weerman.`);
                continue;
            }

            const settings = userData.baro_weerman;

            if (!settings || !settings.enabled) continue;

            const credits = userData.usage?.baroCredits || 0;
            if (credits <= 0) continue;

            const userTimezone = userData.settings?.timezone || 'Europe/Amsterdam';
            const userTimeStr = now.toLocaleString('en-US', { timeZone: userTimezone });
            const userTime = new Date(userTimeStr);
            const userHour = userTime.getHours();

            if (userHour < 7 || userHour > 8) continue; 

            const currentDayName = days[userTime.getDay()];
            if (!settings.days || !settings.days.includes(currentDayName)) continue;

            const dateStr = userTime.toISOString().split('T')[0];
            const auditKey = `baro_weerman_${userId}_${dateStr}`;
            const auditRef = db.collection('audit_logs').doc(auditKey);
            const auditDoc = await auditRef.get();

            if (auditDoc.exists) {
                continue; 
            }

            let lat = 52.09, lon = 5.12;
            if (settings.location) {
                lat = settings.location.lat;
                lon = settings.location.lon;
            }

            const weather = await fetchWeatherData(lat, lon);
            if (!weather) continue;

            // Calculate Options
            const tripOptions = calculateTripOptions(weather, settings.trip_settings);
            if (tripOptions.length === 0) continue;

            // Helper: Get User Name
            let userName = userData.displayName || "Fietser";
            // Try to get from Google Auth provider if available (fallback)
            if (userData.providerData) {
                const googleProfile = userData.providerData.find(p => p.providerId === 'google.com');
                if (googleProfile && googleProfile.displayName) {
                    userName = googleProfile.displayName;
                }
            }

            // Generate HTML
            const html = generateHtmlTable(tripOptions, settings.trip_settings, userName);

            let sent = false;
            // Always prefer Email for this rich format
            const email = userData.email;
            if (email) {
                sent = await sendEmail(email, `Baro Rit Advies: Jouw opties voor vandaag`, html);
            }
            
            // Optional: Send Telegram notification that email is ready (or simplified version)
            // Force send if channel is telegram OR if email is missing but telegram is linked
            if ((settings.channel === 'telegram' || !email) && userData.telegramChatId) {
                try {
                    await sendTelegram(userData.telegramChatId, html);
                    sent = true; // Mark as sent if at least one channel worked
                    console.log(`Sent Baro Weerman Telegram to ${userId}`);
                } catch (e) {
                    console.error(`Failed to send Telegram to ${userId}`, e);
                }
            }

            if (sent) {
                await usersRef.doc(userId).update({
                    'usage.baroCredits': admin.firestore.FieldValue.increment(-1),
                    'usage.totalCalls': admin.firestore.FieldValue.increment(1)
                });

                await auditRef.set({
                    userId,
                    sentAt: admin.firestore.FieldValue.serverTimestamp(),
                    status: 'sent',
                    bestScore: tripOptions[0].score
                });

                results.push({ userId, status: 'sent' });
            }
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ message: "Baro Weerman run complete", results })
        };

    } catch (e) {
        console.error("Baro Weerman Error:", e);
        return { statusCode: 500, body: e.message };
    }
};

export const config = {
    schedule: "@hourly"
};
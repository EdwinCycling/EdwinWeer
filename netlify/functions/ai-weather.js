import { GoogleGenerativeAI } from '@google/generative-ai';
import admin from 'firebase-admin';
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

const db = admin.firestore();

export const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*', // Controlled by Netlify TOML/Env in production, but kept open here for dev
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-App-Source',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: 'Method Not Allowed' };
  }

  // Security: Check for custom header to prevent basic script abuse
  const appSource = event.headers['x-app-source'] || event.headers['X-App-Source'];
  if (appSource !== 'BaroWeatherApp') {
    return {
       statusCode: 403,
       headers,
       body: JSON.stringify({ error: 'Unauthorized source' })
    };
  }

  // Security: Rate Limiting (Strict IP-based for AI)
  const clientIp = event.headers['client-ip'] || event.headers['x-forwarded-for'] || 'unknown';
  if (clientIp !== 'unknown') {
      if (!global.aiRateLimitCache) global.aiRateLimitCache = new Map();
      
      const now = Date.now();
      const windowMs = 60 * 60 * 1000; // 1 hour
      const limit = 20; // 20 AI calls per hour per IP (Generous for user, strict for abuser)

      // Clean old entries
      if (global.aiRateLimitCache.size > 5000) global.aiRateLimitCache.clear();

      const record = global.aiRateLimitCache.get(clientIp) || { count: 0, startTime: now };
      
      if (now - record.startTime > windowMs) {
          record.count = 1;
          record.startTime = now;
      } else {
          record.count++;
      }
      
      global.aiRateLimitCache.set(clientIp, record);

      if (record.count > limit) {
           return {
              statusCode: 429,
              headers,
              body: JSON.stringify({ error: 'Too Many Requests (AI Limit)' })
          };
      }
  }

  // Security: Auth Check & Credit Deduction
  let uid;
  try {
      const authHeader = event.headers['authorization'] || event.headers['Authorization'];
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return { statusCode: 401, headers, body: JSON.stringify({ error: 'Missing authentication' }) };
      }
      const idToken = authHeader.split('Bearer ')[1];
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      uid = decodedToken.uid;

      // Transaction to check and deduct credits
      await db.runTransaction(async (t) => {
          const userRef = db.collection('users').doc(uid);
          const doc = await t.get(userRef);
          
          if (!doc.exists) {
              throw new Error('User profile not found');
          }
          
          const data = doc.data();
          const usage = data.usage || {};
          const baroCredits = usage.baroCredits || 0;
          const weatherCredits = usage.weatherCredits || 0;

          // Check Requirements
          // 1. Must have > 150 Weather Credits (Pro/Active user check)
          if (weatherCredits < 150) {
              throw new Error('Insufficient Weather Credits (min 150 required)');
          }

          // 2. Must have > 0 Baro Credits (Cost)
          if (baroCredits <= 0) {
              throw new Error('Insufficient Baro Credits');
          }

          // Deduct 1 Baro Credit
          t.update(userRef, {
              'usage.baroCredits': admin.firestore.FieldValue.increment(-1),
              'usage.aiCalls': admin.firestore.FieldValue.increment(1) // Track stats
          });
      });

  } catch (error) {
      console.error("Auth/Credit Error:", error);
      const message = error.message || 'Authentication failed';
      const status = message.includes('Insufficient') ? 402 : 403;
      return {
          statusCode: status,
          headers,
          body: JSON.stringify({ error: message })
      };
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("Missing GEMINI_API_KEY");
      return { 
        statusCode: 500, 
        headers, 
        body: JSON.stringify({ error: "Server configuration error" }) 
      };
    }

    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid JSON body' })
      };
    }

    const { weatherData, profile, userName, language = 'nl' } = body || {};

    if (!weatherData || !profile) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Missing weather data or profile" })
      };
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL }); // Upgraded model

    const toCommaList = (value, fallback) => {
      if (Array.isArray(value)) return value.filter(Boolean).join(", ") || fallback;
      if (typeof value === 'string') return value.trim() || fallback;
      return fallback;
    };

    const getWindDirection = (degrees) => {
      const directions = ['Noord', 'Noord-Noordoost', 'Noordoost', 'Oost-Noordoost', 'Oost', 'Oost-Zuidoost', 'Zuidoost', 'Zuid-Zuidoost', 'Zuid', 'Zuid-Zuidwest', 'Zuidwest', 'West-Zuidwest', 'West', 'West-Noordwest', 'Noordwest', 'Noord-Noordwest'];
      const index = Math.round(degrees / 22.5) % 16;
      return directions[index];
    };

    const safeSliceArray = (arr, n) => (Array.isArray(arr) ? arr.slice(0, n) : []);

    const daysAhead = Number.isFinite(Number(profile.daysAhead)) ? Math.max(1, Math.min(14, Number(profile.daysAhead))) : 3;
    const daily = weatherData.daily || {};

    const safeWeatherData = {
      timezone: weatherData.timezone,
      current: weatherData.current
        ? {
            time: weatherData.current.time,
            temperature_2m: weatherData.current.temperature_2m,
            apparent_temperature: weatherData.current.apparent_temperature,
            weather_code: weatherData.current.weather_code,
            wind_speed_10m: weatherData.current.wind_speed_10m,
            wind_direction_10m: weatherData.current.wind_direction_10m,
            wind_direction_text: getWindDirection(weatherData.current.wind_direction_10m),
            precipitation: weatherData.current.precipitation,
            cloud_cover: weatherData.current.cloud_cover,
            relative_humidity_2m: weatherData.current.relative_humidity_2m,
            is_day: weatherData.current.is_day,
          }
        : undefined,
      daily: {
        time: safeSliceArray(daily.time, daysAhead).map(dateStr => {
            // Add weekday name to date string for AI context
            try {
                const d = new Date(dateStr);
                const dayName = d.toLocaleDateString(language === 'nl' ? 'nl-NL' : 'en-GB', { weekday: 'long' });
                return `${dateStr} (${dayName})`;
            } catch (e) {
                return dateStr;
            }
        }),
        weather_code: safeSliceArray(daily.weather_code, daysAhead),
        temperature_2m_max: safeSliceArray(daily.temperature_2m_max, daysAhead),
        temperature_2m_min: safeSliceArray(daily.temperature_2m_min, daysAhead),
        precipitation_sum: safeSliceArray(daily.precipitation_sum, daysAhead),
        precipitation_probability_max: safeSliceArray(daily.precipitation_probability_max, daysAhead),
        wind_speed_10m_max: safeSliceArray(daily.wind_speed_10m_max, daysAhead),
        wind_gusts_10m_max: safeSliceArray(daily.wind_gusts_10m_max, daysAhead),
        sunshine_duration: safeSliceArray(daily.sunshine_duration, daysAhead),
      }
    };

    // Construct the prompt based on profile
    // FILTER OUT empty/default values to prevent "Let op: geen..." messages
    const isGeneral = profile.isGeneralReport === true;
    
    const hasActivities = !isGeneral && profile.activities && profile.activities.length > 0;
    const activities = hasActivities ? toCommaList(profile.activities, "") : "";
    
    const location = typeof profile.location === 'string' && profile.location.trim() ? profile.location.trim() : "onbekend";
    
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

    let styles = toCommaList(profile.reportStyle, "zakelijk");
    
    // Override style for general report
    if (isGeneral) {
        styles = "makkelijk leesbaar, uitgebreid";
    }

    const userSalutation = userName ? userName.split(' ')[0] : (profile.name || "Gebruiker");

    // Language configuration
    const lang = (language || 'nl').toLowerCase();
    const isDutch = lang === 'nl';

    // Helper for explicit date formatting
    const getFormattedDate = (dateStr) => {
        try {
            const d = dateStr ? new Date(dateStr) : new Date();
            return d.toLocaleDateString(isDutch ? 'nl-NL' : 'en-GB', { 
                weekday: 'long', 
                year: 'numeric', 
                month: 'long', 
                day: 'numeric' 
            });
        } catch (e) {
            return dateStr;
        }
    };

    const todayFull = getFormattedDate(safeWeatherData.current?.time);

    let prompt = '';
    
    if (isDutch) {
        prompt = `
          Je bent Baro, een gevatte en deskundige Nederlandse weerman. Je schrijft persoonlijke, boeiende weerberichten.
          
          CONTEXT:
          - Type Rapport: ${isGeneral ? 'ALGEMEEN WEERBERICHT' : 'Persoonlijk Weerbericht van Baro'}
          - Gebruiker: ${userSalutation}
          - Locatie: ${location}
          - Datum Vandaag: ${todayFull} (Let op het jaartal!)
          - Gewenste stijl: ${styles}
          - Lengte van het bericht: ${reportLength} (BELANGRIJK!)
          ${hasActivities ? `- Activiteiten: ${activities}` : ''}
          ${hasTimeOfDay ? `- Belangrijke dagdelen: ${timeOfDay}` : ''}
          ${hasTransport ? `- Vervoer: ${transport}` : ''}
          ${hasHobbies ? `- Hobby's: ${hobbies}` : ''}
          ${hasInstructions ? `- Extra instructies: ${instructions}` : ''}
          ${hasHayFever ? `- GEZONDHEID: Gebruiker heeft HOOIKOORTS` : ''}

          WEERDATA (JSON):
          ${JSON.stringify(safeWeatherData)}

          OPDRACHT:
          Schrijf als Baro een weerbericht voor ${userSalutation} voor locatie ${location}.
          Gebruik de weerdata voor de komende ${daysAhead} dagen.
          SCHRIJF HET HELE BERICHT IN HET NEDERLANDS.

          ${reportLength === 'factual' ? '- Schrijf een KORT en BONDIG bericht. Focus op de feiten. Geen poespas.' : ''}
          ${reportLength === 'standard' ? '- Schrijf een gebalanceerd bericht. Niet te kort, niet te lang. Gewoon een goed leesbaar weerbericht.' : ''}
          ${reportLength === 'extended' ? '- Schrijf een UITGEBREID en gedetailleerd verhaal. Neem de ruimte voor nuance, uitleg en context.' : ''}

          STRIKTE REGELS:
          1. AANHEF: Begin het bericht ALTIJD met "Beste ${userSalutation},".
          2. AFSLUITING: Eindig het bericht ALTIJD met "Groetjes van Baro".
          3. IDENTITEIT: Je bent Baro. Verwijs niet naar jezelf als AI of assistent.
          4. DATUMS: HET IS VANDAAG: ${todayFull}. Gebruik dit als referentie. Controleer ALTIJD welke dag van de week bij een datum hoort in het huidige jaar.
          5. CONTENT: Vermeld NOOIT dat instellingen ontbreken. Als een veld leeg is, negeer het volledig.
          6. ACTIVITEITEN: Geef kwalitatief advies over de opgegeven activiteiten.
          7. VERVOER: Geef specifiek advies indien opgegeven.
          8. DATA: Gebruik altijd de exacte waarden uit de JSON.
          9. STIJL: Houd je aan de gevraagde stijl (${styles}). Geen markdown headers (#), gebruik platte tekst.
          ${hasHayFever ? `10. HOOIKOORTS: Wijd een aparte alinea (of zin bij 'feitelijk') aan de invloed van het actuele weer op hooikoorts. Leg uit waarom het weer gunstig of ongunstig is.` : ''}

          Structuur:
          - Korte introductie over het huidige weer (${todayFull}) door Baro.
          - Vooruitzicht voor de komende dagen.
          - Specifiek advies voor activiteiten/vervoer (indien van toepassing).
          - Afsluiting: Groetjes van Baro.
        `;
    } else {
        // English / International Prompt
        prompt = `
          You are Baro, a witty and expert weather reporter. You write personal, engaging weather reports.
          
          CONTEXT:
          - Report Type: ${isGeneral ? 'GENERAL REPORT' : 'Personal Weather Report by Baro'}
          - User: ${userSalutation}
          - Location: ${location}
          - Today's Date: ${todayFull} (Check the year!)
          - Requested Style: ${styles}
          - Output Language: ${lang.toUpperCase()}
          ${hasActivities ? `- Activities: ${activities}` : ''}
          ${hasTimeOfDay ? `- Important times: ${timeOfDay}` : ''}
          ${hasTransport ? `- Transport: ${transport}` : ''}
          ${hasHobbies ? `- Hobbies: ${hobbies}` : ''}
          ${hasInstructions ? `- Extra instructions: ${instructions}` : ''}
          ${hasHayFever ? `- HEALTH: User has HAY FEVER` : ''}

          WEATHER DATA (JSON):
          ${JSON.stringify(safeWeatherData)}

          ASSIGNMENT:
          Write as Baro a weather report for ${userSalutation} for the location ${location}.
          Use the weather data for the next ${daysAhead} days.
          WRITE THE ENTIRE REPORT IN ${lang.toUpperCase()}.

          STRICT RULES:
          1. GREETING: ALWAYS start with "Dear ${userSalutation}," (or equivalent in ${lang}).
          2. CLOSING: ALWAYS end with "Best regards, Baro" (or equivalent in ${lang}, e.g., "Groetjes van Baro" for Dutch).
          3. IDENTITY: You are Baro. Do not refer to yourself as AI or an assistant.
          4. DATES: TODAY IS: ${todayFull}. Use this as reference. ALWAYS check the day of the week correctly for the current year.
          5. CONTENT: NEVER mention missing settings.
          6. ACTIVITIES: Provide qualitative advice.
          7. TRANSPORT: Give specific advice if listed.
          8. DATA: Always use exact values from JSON.
          9. STYLE: Follow the requested style (${styles}). No markdown headers (#), use plain text.
          ${hasHayFever ? `10. HAY FEVER: Dedicate a separate paragraph to how the current weather affects hay fever (e.g., rain is good, wind/dry is bad).` : ''}

          Structure:
          - Short introduction about current weather (${todayFull}) by Baro.
          - Outlook for coming days.
          - Specific advice for activities/transport (if applicable).
          - Closing: Best regards, Baro.
        `;
    }

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text })
    };
  } catch (error) {
    console.error('Gemini Error:', error);
    const statusCode = error.status || 500;
    const errorMessage = error.message || 'Failed to generate report';
    
    // Log the full error for debugging
    if (error.errorDetails) {
      console.error('Error Details:', JSON.stringify(error.errorDetails, null, 2));
    }

    return {
      statusCode,
      headers,
      body: JSON.stringify({ 
        error: errorMessage,
        details: error.errorDetails || null,
        status: statusCode
      })
    };
  }
};

export const handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
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
  if (appSource !== 'EdwinWeerApp') {
    return {
       statusCode: 403,
       headers,
       body: JSON.stringify({ error: 'Unauthorized source' })
    };
  }

  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("Missing GEMINI_API_KEY");
      return { 
        statusCode: 500, 
        headers: {
          ...headers,
          'Content-Type': 'application/json; charset=utf-8'
        }, 
        body: JSON.stringify({ error: "Server configuration error" }) 
      };
    }

    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return {
        statusCode: 400,
        headers: {
          ...headers,
          'Content-Type': 'application/json; charset=utf-8'
        },
        body: JSON.stringify({ error: 'Invalid JSON body' })
      };
    }

    const { weatherData, profile, userName, language = 'nl' } = body || {};

    if (!weatherData || !profile) {
      return {
        statusCode: 400,
        headers: {
          ...headers,
          'Content-Type': 'application/json; charset=utf-8'
        },
        body: JSON.stringify({ error: "Missing weather data or profile" })
      };
    }

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
        time: safeSliceArray(daily.time, daysAhead),
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
    
    const styles = toCommaList(profile.reportStyle, "zakelijk");

    const userSalutation = userName ? userName.split(' ')[0] : (profile.name || "Gebruiker");

    // Language configuration
    const lang = (language || 'nl').toLowerCase();
    const isDutch = lang === 'nl';

    let prompt = '';
    
    if (isDutch) {
        prompt = `
          Je bent een gevatte, Nederlandse weerman voor een app.
          
          CONTEXT:
          - Type Rapport: ${isGeneral ? 'ALGEMEEN WEERBERICHT (Focus op algemeen beeld voor de regio, geen persoonlijke adviezen)' : 'Persoonlijk Weerbericht'}
          - Gebruiker: ${userSalutation}
          - Locatie: ${location}
          - Gewenste stijl: ${styles}
          ${hasActivities ? `- Activiteiten: ${activities}` : ''}
          ${hasTimeOfDay ? `- Belangrijke dagdelen: ${timeOfDay}` : ''}
          ${hasTransport ? `- Vervoer: ${transport}` : ''}
          ${hasHobbies ? `- Hobby's: ${hobbies}` : ''}
          ${hasInstructions ? `- Extra instructies: ${instructions}` : ''}

          WEERDATA (JSON):
          ${JSON.stringify(safeWeatherData)}

          OPDRACHT:
          Schrijf een weerbericht voor ${userSalutation} voor de locatie ${location}.
          Gebruik de weerdata voor de komende ${daysAhead} dagen.

          STRIKTE REGELS:
          1. AANHEF: Begin het bericht ALTIJD met "Beste ${userSalutation},". Gebruik nooit "Beste inwoner van..." of iets dergelijks.
          2. DATUMS: Controleer de datums in de JSON data. Zorg dat de dagen van de week (maandag, dinsdag, etc.) kloppen met de datum (YYYY-MM-DD). Vandaag is ${safeWeatherData.current?.time || new Date().toISOString().split('T')[0]}.
          3. CONTENT: Vermeld NOOIT dat instellingen ontbreken (bijv. "Je hebt geen vervoer opgegeven"). Als een veld leeg is, negeer het volledig.
          4. ACTIVITEITEN: Geef kwalitatief advies over de opgegeven activiteiten. Bereken GEEN scores (cijfers), dit doet het systeem al.
          5. VERVOER: Als vervoer is opgegeven, geef specifiek advies (bijv. tegenwind op de fiets).
          6. DATA: Gebruik altijd de exacte waarden uit de JSON (wind, temp, regen). Verzin er niets bij.
          7. STIJL: Houd je aan de gevraagde stijl (${styles}). Geen markdown headers (#), gebruik platte tekst.

          Structuur:
          - Korte introductie over het huidige weer.
          - Vooruitzicht voor de komende dagen.
          - Specifiek advies voor activiteiten/vervoer (indien van toepassing).
          - Afsluiting.
        `;
    } else {
        // English / International Prompt
        prompt = `
          You are a witty weather reporter for an app.
          
          CONTEXT:
          - Report Type: ${isGeneral ? 'GENERAL REPORT (Focus on general regional overview, no personal advice)' : 'Personal Weather Report'}
          - User: ${userSalutation}
          - Location: ${location}
          - Requested Style: ${styles}
          - Output Language: ${lang.toUpperCase()} (IMPORTANT: Write the report in this language)
          ${hasActivities ? `- Activities: ${activities}` : ''}
          ${hasTimeOfDay ? `- Important times: ${timeOfDay}` : ''}
          ${hasTransport ? `- Transport: ${transport}` : ''}
          ${hasHobbies ? `- Hobbies: ${hobbies}` : ''}
          ${hasInstructions ? `- Extra instructions: ${instructions}` : ''}

          WEATHER DATA (JSON):
          ${JSON.stringify(safeWeatherData)}

          ASSIGNMENT:
          Write a weather report for ${userSalutation} for the location ${location}.
          Use the weather data for the next ${daysAhead} days.
          WRITE THE ENTIRE REPORT IN ${lang.toUpperCase()}.

          STRICT RULES:
          1. GREETING: ALWAYS start with "Dear ${userSalutation}," (or the equivalent in ${lang}).
          2. DATES: Check the dates in the JSON data. Ensure days of the week match the date. Today is ${safeWeatherData.current?.time || new Date().toISOString().split('T')[0]}.
          3. CONTENT: NEVER mention missing settings. If a field is empty, ignore it completely.
          4. ACTIVITIES: Provide qualitative advice on the listed activities. Do NOT calculate scores.
          5. TRANSPORT: If transport is listed, give specific advice.
          6. DATA: Always use exact values from JSON. Do not invent data.
          7. STYLE: Follow the requested style (${styles}). No markdown headers (#), use plain text.

          Structure:
          - Short introduction about current weather.
          - Outlook for coming days.
          - Specific advice for activities/transport (if applicable).
          - Closing.
        `;
    }

    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);

    const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || "gemini-2.5-flash-lite" });

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify({ text })
    };

  } catch (error) {
    console.error("Gemini Error:", error);
    return {
      statusCode: 500,
      headers: {
        ...headers,
        'Content-Type': 'application/json; charset=utf-8'
      },
      body: JSON.stringify({ error: "Failed to generate weather report", details: error?.message || String(error) })
    };
  }
};
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

    const { weatherData, profile } = body || {};

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
    const activities = toCommaList(profile.activities, "geen specifieke activiteiten");
    const location = typeof profile.location === 'string' && profile.location.trim() ? profile.location.trim() : "onbekend";
    const timeOfDay = toCommaList(profile.timeOfDay, "hele dag");
    const transport = toCommaList(profile.transport, "geen specifiek vervoer");
    const hobbies = typeof profile.hobbies === 'string' && profile.hobbies.trim() ? profile.hobbies.trim() : "geen";
    const instructions = typeof profile.otherInstructions === 'string' && profile.otherInstructions.trim() ? profile.otherInstructions.trim() : "geen";
    const styles = toCommaList(profile.reportStyle, "zakelijk");

    const prompt = `
      Je bent een gevatte, Nederlandse weerman voor een app.
      Gebruikersprofiel:
      - Activiteiten: ${activities}
      - Locatie: ${location}
      - Belangrijke dagdelen: ${timeOfDay}
      - Vervoer: ${transport}
      - Hobby's: ${hobbies}
      - Extra instructies: ${instructions}
      - Gewenste stijl: ${styles}

      Weerdata (JSON):
      ${JSON.stringify(safeWeatherData)}

      Let op de eenheden in de data:
      - wind_speed_10m is in km/u.
      - wind_direction_10m is in graden (0=Noord, 90=Oost, 180=Zuid, 270=West).
      - temperature is in graden Celsius.

      Opdracht:
      Schrijf een persoonlijk weerbericht voor de gebruiker gebaseerd op bovenstaande data en profiel.
      Het bericht MOET een voorspelling bevatten voor alle ${daysAhead} dagen die in de data staan (vandaag plus de komende dagen).
      
      Belangrijke inhoudelijke eisen:
      - Begin met te vermelden dat dit het lokale weer is voor ${location} en de data is van ${safeWeatherData.current?.time || "vandaag"}.
      - Neem altijd de windkracht en windrichting mee in je verhaal. Vertaal graden naar windrichting (bijv. zuidwest) en km/u eventueel naar Beaufort als dat natuurlijker klinkt, maar haal ze niet door elkaar.
      - Als het koud is (< 10 graden), vermeld dan expliciet de gevoelstemperatuur.
      - Als het warm is (> 25 graden), vermeld dan expliciet de hitte-index of hoe warm het werkelijk aanvoelt.
      - Focus op wat voor de gebruiker belangrijk is (bijv. regen tijdens fietsen, wind voor zeilen).
      - Voor dagen 1 t/m 7: Geef een gedetailleerde voorspelling.
      ${daysAhead > 7 ? `- Voor dagen 8 t/m ${daysAhead}: Geef ALLEEN een algemene trend gebaseerd op de activiteiten, zonder specifieke details.` : ''}
      
      Houd de stijl aan die gevraagd is.
      Gebruik geen markdown formatting zoals bold of headers, gewoon platte tekst of met emoji's als de stijl dat toelaat.
      Houd het beknopt maar waardevol.
    `;

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

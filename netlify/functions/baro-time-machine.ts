
import { callAI, extractJSON } from './config/ai.js';
import admin from 'firebase-admin';

// Initialize Firebase Admin
let initError: string | null = null;

const initFirebase = () => {
    if (!admin.apps.length) {
        try {
            let serviceAccount;
            if (process.env.FIREBASE_SERVICE_ACCOUNT) {
                try {
                    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
                } catch (parseError: any) {
                    console.error("JSON Parse Error for FIREBASE_SERVICE_ACCOUNT:", parseError);
                    initError = `JSON Parse Error: ${parseError.message}`;
                    return;
                }
            } else if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PROJECT_ID) {
                serviceAccount = {
                    projectId: process.env.FIREBASE_PROJECT_ID,
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                    // Handle newlines in private key
                    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
                };
            } else {
                initError = "No Firebase credentials found in environment variables (FIREBASE_SERVICE_ACCOUNT or FIREBASE_PRIVATE_KEY/CLIENT_EMAIL/PROJECT_ID)";
                return;
            }

            if (serviceAccount) {
                admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount)
                });
                console.log("Firebase Admin initialized successfully");
            }
        } catch (e: any) {
            console.error("Error initializing Firebase Admin:", e);
            initError = `Init Error: ${e.message}`;
        }
    }
};

export const handler = async (event: any, context: any) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-App-Source',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    // Initialize Firebase on first request
    initFirebase();
    
    if (!admin.apps.length) {
        console.error("Firebase not initialized. Check environment variables.");
        console.error("FIREBASE_SERVICE_ACCOUNT present:", !!process.env.FIREBASE_SERVICE_ACCOUNT);
        console.error("FIREBASE_PRIVATE_KEY present:", !!process.env.FIREBASE_PRIVATE_KEY);
        console.error("FIREBASE_CLIENT_EMAIL present:", !!process.env.FIREBASE_CLIENT_EMAIL);
        console.error("FIREBASE_PROJECT_ID present:", !!process.env.FIREBASE_PROJECT_ID);
        
        return { 
            statusCode: 500, 
            headers, 
            body: JSON.stringify({ 
                error: 'Server configuration error: Firebase not initialized',
                details: initError || 'Unknown initialization error',
                env_check: {
                    has_service_account: !!process.env.FIREBASE_SERVICE_ACCOUNT,
                    has_private_key: !!process.env.FIREBASE_PRIVATE_KEY,
                    service_account_length: process.env.FIREBASE_SERVICE_ACCOUNT ? process.env.FIREBASE_SERVICE_ACCOUNT.length : 0
                }
            }) 
        };
    }
    const db = admin.firestore();
    
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    // Only allow POST
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: 'Method Not Allowed' };
    }

    // Security: Check for custom header
    const appSource = event.headers['x-app-source'] || event.headers['X-App-Source'];
    if (appSource !== 'BaroWeatherApp') {
        return {
            statusCode: 403,
            headers,
            body: JSON.stringify({ error: 'Unauthorized source' })
        };
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
            if (data?.isBanned === true) {
                throw new Error('User is banned');
            }

            const usage = data.usage || {};
            const baroCredits = usage.baroCredits !== undefined ? usage.baroCredits : (data.baroCredits || 0);

            // Must have > 0 Baro Credits (Cost)
            if (baroCredits <= 0) {
                throw new Error('Insufficient Baro Credits');
            }

            // Deduct 1 Baro Credit
            t.set(userRef, {
                usage: {
                    baroCredits: admin.firestore.FieldValue.increment(-1),
                    aiCalls: admin.firestore.FieldValue.increment(1)
                }
            }, { merge: true });
        });

    } catch (error: any) {
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
        const { weatherData, location, date, language, lastWeekWeather } = JSON.parse(event.body);
        
        let prompt = "";
        
        if (language === 'nl') {
             prompt = `Je bent een journalist uit het jaar ${date.split('-')[0]} voor de krant 'AskBaro.COM Daily'.
            
            Input:
            Locatie: ${location}
            Datum: ${date}
            Weer overzicht:
            - Ochtend: ${weatherData.morning.temp}°C, ${weatherData.morning.condition}
            - Middag: ${weatherData.afternoon.temp}°C, ${weatherData.afternoon.condition}
            - Avond: ${weatherData.evening.temp}°C, ${weatherData.evening.condition}
            - Nacht: ${weatherData.night.temp}°C, ${weatherData.night.condition}
            - Algemeen: Max ${weatherData.maxTemp}°C, Min ${weatherData.minTemp}°C, ${weatherData.precipSum}mm neerslag.
            
            Weer afgelopen week (voor context):
            ${lastWeekWeather ? JSON.stringify(lastWeekWeather) : "Geen data"}

            Opdracht:
            Genereer de inhoud voor een voorpagina van een krant uit die tijd.
            
            BELANGRIJKE REGELS:
            1. SCHRIJFSTIJL: Gebruik een VERHALENDE en BOEIENDE journalistieke stijl. Schrijf alsof je de lezer meeneemt in de sfeer van de dag. Vermijd droge opsommingen. Gebruik normale spelling met HOOFDLETTERS waar dat hoort (begin van zinnen, namen, etc.).
            2. TITELS: Gebruik GEEN Camel Case (dus niet Elk Woord Een Hoofdletter). Gebruik normale zin-notatie: "Zware storm teistert de kust van Holland".
            3. KORT NIEUWS: Dit MOETEN waargebeurde, realistische historische feiten zijn die plaatsvonden op PRECIES deze datum (${date}) of maximaal 1 tot 3 dagen ervoor. Zoek naar belangrijke politieke, culturele of wetenschappelijke gebeurtenissen uit die specifieke tijdgeest. Het MOET 100% kloppen, geen aannames. GEEN HALLUCINATIES.
            4. FUN FACT: Een luchtig, maar WAARGEBEURD historisch feitje dat specifiek verbonden is aan deze dag (dag/maand) in de geschiedenis.
            5. FAKE AD: Verzin een grappige, tijd-periodieke advertentie (tekst).
            
            Return JSON format:
            {
                "headline": "Pakkende, verhalende titel (Sentence case)",
                "weather_report": "Een uitgebreid, boeiend en verhalend nieuwsartikel over het weer van de dag, de impact op de mensen en de sfeer. Schrijf een langere tekst om de kolommen goed te vullen. (minimaal 180, maximaal 250 woorden)",
                "last_week_article": {
                    "title": "Titel over de afgelopen week (Sentence case)",
                    "content": "Een verhalende terugblik op het weer van de afgelopen week (max 100 woorden)"
                },
                "world_news": ["Realistisch historisch feit 1 van deze specifieke datum", "Realistisch historisch feit 2", "Realistisch historisch feit 3"],
                "fun_fact": {
                    "title": "Titel (Sentence case)",
                    "content": "Een kort, waargebeurd luchtig feitje over deze datum in de geschiedenis (max 40 woorden)."
                },
                "fake_ad_title": "Titel van een nepproduct/dienst uit die tijd",
                "fake_ad_body": "Wervende tekst voor de advertentie",
                "fake_ad_price": "Prijs altijd vermelden in Dollars (bijv. $2.50)",
                "price": "$0.50"
            }
            
            Return ONLY the JSON object, no markdown formatting.`;
        } else if (language === 'fr') {
            prompt = `Vous êtes un journaliste de l'année ${date.split('-')[0]} pour le journal 'AskBaro.COM Daily'.
            
            Input:
            Lieu: ${location}
            Date: ${date}
            Météo:
            - Matin: ${weatherData.morning.temp}°C, ${weatherData.morning.condition}
            - Après-midi: ${weatherData.afternoon.temp}°C, ${weatherData.afternoon.condition}
            - Soir: ${weatherData.evening.temp}°C, ${weatherData.evening.condition}
            - Nuit: ${weatherData.night.temp}°C, ${weatherData.night.condition}
            - Général: Max ${weatherData.maxTemp}°C, Min ${weatherData.minTemp}°C, ${weatherData.precipSum}mm précipitations.
            
            Météo semaine dernière:
            ${lastWeekWeather ? JSON.stringify(lastWeekWeather) : "Pas de données"}

            Tâche:
            Générer le contenu de la une d'un journal de cette époque.
            
            RÈGLES IMPORTANTES:
            1. STYLE D'ÉCRITURE: Utilisez un style journalistique NARRATIF et CAPTIVANT. Écrivez comme si vous transportiez le lecteur dans l'atmosphère de la journée. Évitez les listes sèches. Utilisez une orthographe normale avec des MAJUSCULES là où elles doivent être (début de phrase, noms, etc.).
            2. TITRES: N'utilisez PAS le Camel Case. Utilisez la notation de phrase normale: "Une violente tempête frappe la côte".
            3. BRÈVES: Ce DOIVENT être des faits historiques réels et réalistes qui ont eu lieu EXACTEMENT à cette date (${date}) ou au maximum 1 à 3 jours avant. Recherchez des événements politiques, culturels ou scientifiques importants de cette époque spécifique. Les faits doivent être 100% exacts, pas de suppositions. PAS D'HALLUCINATIONS.
            4. FAIT AMUSANT: Un fait historique léger mais VRAI spécifiquement lié à ce jour (jour/mois) dans l'histoire.
            5. FAUSSE PUB: Inventez une publicité drôle et d'époque (texte).

            Return JSON format:
            {
                "headline": "Titre accrocheur et narratif (Sentence case)",
                "weather_report": "Un article de presse complet, captivant et narratif sur la météo du jour, l'impact sur les gens et l'atmosphère. Écrivez un texte plus long pour bien remplir les colonnes. (minimum 180, maximum 250 mots)",
                "last_week_article": {
                    "title": "Titre sur la semaine dernière (Sentence case)",
                    "content": "Un retour narratif sur la météo de la semaine dernière (max 100 mots)"
                },
                "world_news": ["Fait historique réaliste 1 de cette date spécifique", "Fait historique réaliste 2", "Fait historique réaliste 3"],
                "fun_fact": {
                    "title": "Titre (Sentence case)",
                    "content": "Un court fait léger et vrai sur cette date dans l'histoire (max 40 mots)."
                },
                "fake_ad_title": "Titre d'un faux produit/service de l'époque",
                "fake_ad_body": "Texte promotionnel pour la publicité",
                "fake_ad_price": "Toujours mentionner le prix en Dollars (ex. $2.50)",
                "price": "$0.50"
            }
            
            Return ONLY the JSON object, no markdown formatting.`;
        } else if (language === 'de') {
             prompt = `Sie sind ein Journalist aus dem Jahr ${date.split('-')[0]} für die Zeitung 'AskBaro.COM Daily'.
            
            Input:
            Ort: ${location}
            Datum: ${date}
            Wetterübersicht:
            - Morgen: ${weatherData.morning.temp}°C, ${weatherData.morning.condition}
            - Nachmittag: ${weatherData.afternoon.temp}°C, ${weatherData.afternoon.condition}
            - Abend: ${weatherData.evening.temp}°C, ${weatherData.evening.condition}
            - Nacht: ${weatherData.night.temp}°C, ${weatherData.night.condition}
            - Allgemein: Max ${weatherData.maxTemp}°C, Min ${weatherData.minTemp}°C, ${weatherData.precipSum}mm Niederschlag.
            
            Wetter letzte Woche:
            ${lastWeekWeather ? JSON.stringify(lastWeekWeather) : "Keine Daten"}

            Aufgabe:
            Generieren Sie den Inhalt für eine Titelseite einer Zeitung aus dieser Zeit.
            
            WICHTIGE REGELN:
            1. SCHREIBSTIL: Verwenden Sie einen ERZÄHLENDEN und FESSELNDEN journalistischen Stil. Schreiben Sie so, als würden Sie den Leser in die Atmosphäre des Tages mitnehmen. Vermeiden Sie trockene Aufzählungen. Verwenden Sie normale Rechtschreibung.
            2. TITEL: Verwenden Sie KEIN Camel Case. Verwenden Sie normale Satzschreibweise: "Schwerer Sturm trifft die Küste".
            3. KURZNACHRICHTEN: Dies MÜSSEN wahre, realistische historische Fakten sein, die GENAU an diesem Datum (${date}) oder maximal 1 bis 3 Tage davor stattfanden. Suchen Sie nach wichtigen politischen, kulturellen oder wissenschaftlichen Ereignissen aus diesem spezifischen Zeitgeist. Die Fakten MÜSSEN 100% stimmen, keine Vermutungen. KEINE HALLUZINATIONEN.
            4. FUN FACT: Eine lockere, aber WAHRE historische Tatsache, die speziell mit diesem Tag (Tag/Monat) in der Geschichte verbunden ist.
            5. FAKE AD: Erfinden Sie eine lustige, zeitgenössische Werbung (Text).

            Return JSON format:
            {
                "headline": "Packender, erzählender Titel (Sentence case)",
                "weather_report": "Ein ausführlicher, fesselnder und erzählender Zeitungsartikel über das Wetter des Tages, die Auswirkungen auf die Menschen und die Atmosphäre. Schreiben Sie einen längeren Text, um die Spalten gut zu füllen. (mindestens 180, maximal 250 Wörter)",
                "last_week_article": {
                    "title": "Titel über die letzte Woche (Sentence case)",
                    "content": "Ein erzählender Rückblick auf das Wetter der letzten Woche (max 100 Wörter)"
                },
                "world_news": ["Realistischer historischer Fakt 1 von diesem spezifischen Datum", "Realistischer historischer Fakt 2", "Realistischer historischer Fakt 3"],
                "fun_fact": {
                    "title": "Titel (Sentence case)",
                    "content": "Eine kurze, wahre, lockere Tatsache über dieses Datum in der Geschichte (max 40 Wörter)."
                },
                "fake_ad_title": "Titel eines gefälschten Produkts/Dienstleistung aus der Zeit",
                "fake_ad_body": "Werbetext für die Anzeige",
                "fake_ad_price": "Preis immer in Dollar angeben (z.B. $2.50)",
                "price": "$0.50"
            }
            
            Return ONLY the JSON object, no markdown formatting.`;
        } else if (language === 'es') {
             prompt = `Eres un periodista del año ${date.split('-')[0]} para el periódico 'AskBaro.COM Daily'.
            
            Input:
            Ubicación: ${location}
            Fecha: ${date}
            Resumen del tiempo:
            - Mañana: ${weatherData.morning.temp}°C, ${weatherData.morning.condition}
            - Tarde: ${weatherData.afternoon.temp}°C, ${weatherData.afternoon.condition}
            - Noche: ${weatherData.evening.temp}°C, ${weatherData.evening.condition}
            - Madrugada: ${weatherData.night.temp}°C, ${weatherData.night.condition}
            - General: Max ${weatherData.maxTemp}°C, Min ${weatherData.minTemp}°C, ${weatherData.precipSum}mm precipitación.
            
            Tiempo semana pasada:
            ${lastWeekWeather ? JSON.stringify(lastWeekWeather) : "Sin datos"}

            Tarea:
            Generar el contenido para la portada de un periódico de esa época.
            
            REGLAS IMPORTANTES:
            1. ESTILO DE ESCRITURA: Usa un estilo periodístico NARRATIVO y CAUTIVADOR. Escribe como si llevaras al lector a la atmósfera del día. Evita listas secas. Usa ortografía normal.
            2. TÍTULOS: NO uses Camel Case. Usa notación de frase normal: "Fuerte tormenta golpea la costa".
            3. NOTICIAS BREVES: Estos DEBEN ser hechos históricos reales y realistas que ocurrieron EXACTAMENTE en esta fecha (${date}) o máximo 1 a 3 días antes. Busca eventos políticos, culturales o científicos importantes de ese espíritu de la época específico. Los hechos DEBEN ser 100% correctos, sin suposiciones. NO ALUCINACIONES.
            4. DATO CURIOSO: Un hecho histórico ligero pero VERDADERO específicamente vinculado a este día (día/mes) en la historia.
            5. ANUNCIO FALSO: Inventa un anuncio divertido y de época (texto).

            Return JSON format:
            {
                "headline": "Título pegadizo y narrativo (Sentence case)",
                "weather_report": "Un artículo de noticias extenso, cautivador y narrativo sobre el tiempo del día, el impacto en la gente y la atmósfera. Escribe un texto más largo para llenar bien las columnas. (mínimo 180, máximo 250 palabras)",
                "last_week_article": {
                    "title": "Título sobre la semana pasada (Sentence case)",
                    "content": "Una retrospectiva narrativa sobre el tiempo de la semana pasada (max 100 palabras)"
                },
                "world_news": ["Hecho histórico realista 1 de esta fecha específica", "Hecho histórico realista 2", "Hecho histórico realista 3"],
                "fun_fact": {
                    "title": "Título (Sentence case)",
                    "content": "Un dato breve, verdadero y ligero sobre esta fecha en la historia (max 40 palabras)."
                },
                "fake_ad_title": "Título de un producto/servicio falso de la época",
                "fake_ad_body": "Texto promocional para el anuncio",
                "fake_ad_price": "Siempre mencionar el precio en Dólares (ej. $2.50)",
                "price": "$0.50"
            }
            
            Return ONLY the JSON object, no markdown formatting.`;
        } else {
            // Default English
            prompt = `You are a journalist from the year ${date.split('-')[0]} for the newspaper 'AskBaro.COM Daily'.
            
            Input:
            Location: ${location}
            Date: ${date}
            Weather Overview:
            - Morning: ${weatherData.morning.temp}°C, ${weatherData.morning.condition}
            - Afternoon: ${weatherData.afternoon.temp}°C, ${weatherData.afternoon.condition}
            - Evening: ${weatherData.evening.temp}°C, ${weatherData.evening.condition}
            - Night: ${weatherData.night.temp}°C, ${weatherData.night.condition}
            - General: Max ${weatherData.maxTemp}°C, Min ${weatherData.minTemp}°C, ${weatherData.precipSum}mm precipitation.
            
            Weather Last Week (for context):
            ${lastWeekWeather ? JSON.stringify(lastWeekWeather) : "No data"}

            Task:
            Generate content for a newspaper front page from that time.
            
            IMPORTANT RULES:
            1. WRITING STYLE: Use a NARRATIVE and ENGAGING journalistic style. Write as if you are taking the reader into the atmosphere of the day. Avoid dry lists. Use normal capitalization.
            2. TITLES: Do NOT use Camel Case. Use normal sentence case: "Heavy storm hits the coast".
            3. SHORT NEWS: These MUST be true, realistic historical facts that happened EXACTLY on this date (${date}) or max 1 to 3 days before. Look for important political, cultural, or scientific events from that specific zeitgeist. It MUST be 100% correct, no assumptions. NO HALLUCINATIONS.
            4. FUN FACT: A light but TRUE historical fact specifically linked to this day (day/month) in history.
            5. FAKE AD: Invent a funny, period-appropriate advertisement (text).

            Return JSON format:
            {
                "headline": "Catchy, narrative title (Sentence case)",
                "weather_report": "An extensive, captivating and narrative news article about the day's weather, the impact on people and the atmosphere. Write a longer text to fill the columns well. (minimum 180, maximum 250 words)",
                "last_week_article": {
                    "title": "Title about last week (Sentence case)",
                    "content": "A narrative look back at last week's weather (max 100 words)"
                },
                "world_news": ["Realistic historical fact 1 from this specific date", "Realistic historical fact 2", "Realistic historical fact 3"],
                "fun_fact": {
                    "title": "Title (Sentence case)",
                    "content": "A short, true, light fact about this date in history (max 40 words)."
                },
                "fake_ad_title": "Title of a fake product/service from the time",
                "fake_ad_body": "Promotional text for the advertisement",
                "fake_ad_price": "Price always in Dollars (e.g. $2.50)",
                "price": "$0.50"
            }
            
            Return ONLY the JSON object, no markdown formatting.`;
        }

        const text = await callAI(prompt, { jsonMode: true, temperature: 0.7 });
        const json = extractJSON(text);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify(json)
        };
    } catch (error: any) {
        console.error("AI Error:", error);
        
        // Log stack trace for debugging
        if (error.stack) {
             console.error(error.stack);
        }

        const statusCode = error.status || 500;
        return {
            statusCode,
            headers,
            body: JSON.stringify({ 
                error: error.message || "Failed to generate newspaper",
                details: error.errorDetails || error.toString(), // Include full error string
                stack: error.stack // Include stack trace in dev response
            })
        };
    }
};

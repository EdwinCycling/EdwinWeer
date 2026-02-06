import { Client } from '@notionhq/client';
import { callAI } from './config/ai.js';

// Initialize Notion
const notion = new Client({
    auth: process.env.NOTION_API_KEY,
});

// Helper: Extract Location Name from Widget HTML
function extractLocationName(htmlString: string): string | null {
    if (!htmlString) return null;

    // 1. Probeer data-label_1 (meest specifiek, ondersteunt dubbele en enkele quotes)
    const label1Match = htmlString.match(/data-label_1=["']([^"']*)["']/i);
    if (label1Match && label1Match[1] && label1Match[1].trim()) {
        return label1Match[1].trim();
    }

    // 2. Fallback: Probeer uit de href URL te halen (bijv. forecast7.com/en/.../valencia/)
    const hrefMatch = htmlString.match(/href=["']([^"']*)["']/i);
    if (hrefMatch && hrefMatch[1]) {
        const url = hrefMatch[1].trim();
        const parts = url.split('/').filter(p => p.length > 0);
        if (parts.length > 0) {
            const lastPart = parts[parts.length - 1];
            if (lastPart && !lastPart.includes('.') && isNaN(Number(lastPart))) {
                return lastPart.replace(/-/g, ' ').toUpperCase();
            }
        }
    }

    // 3. Tweede Fallback: Probeer de tekst tussen de <a> tags (bijv. >VALENCIA WEATHER</a>)
    const textMatch = htmlString.match(/>([^<]+)<\/a>/i);
    if (textMatch && textMatch[1]) {
        let text = textMatch[1].trim();
        text = text.replace(/\s+(WEATHER|FORECAST|WEER|VERWACHTING)$/i, '');
        if (text) return text;
    }

    return null;
}

export const handler = async (event: any, context: any) => {
    const logs: string[] = [];
    const log = (msg: string, data?: any) => {
        const timestamp = new Date().toISOString();
        const message = data ? `${msg} ${JSON.stringify(data, null, 2)}` : msg;
        console.log(message);
        logs.push(`[${timestamp}] ${message}`);
    };

    log("Starting Test Cycling Function with AI...");

    try {
        const databaseId = process.env.NOTION_DATABASE_ID;
        const apiKey = process.env.NOTION_API_KEY;
        const geminiKey = process.env.GEMINI_API_KEY;

        if (!databaseId || !apiKey) throw new Error("Missing Notion Environment Variables");
        if (!geminiKey) log("WARNING: Missing GEMINI_API_KEY, AI report will be skipped");

        const today = new Date().toISOString().split('T')[0];
        log(`Querying for date: ${today}`);

        const filter = {
            and: [
                { property: "Start datum", date: { on_or_before: today } },
                { property: "Eind datum", date: { on_or_after: today } }
            ]
        };

        let races: any[] = [];
        const cleanDbId = databaseId.trim().replace(/-/g, '');
        const url = `https://api.notion.com/v1/databases/${cleanDbId}/query`;
        log(`Querying Notion URL: ${url}`);
        
        const fetchResponse = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Notion-Version': '2022-06-28',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ filter: filter })
        });

        const responseData: any = await fetchResponse.json();
        if (!fetchResponse.ok) throw new Error(responseData.message || `HTTP Error ${fetchResponse.status}`);
        races = responseData.results;
        log(`Found ${races.length} races.`);

        const processedRaces = await Promise.all(races.map(async (r: any) => {
            const properties = r.properties;
            
            // 1. Koers Naam
            const fullTitle = properties?.Koers?.title?.[0]?.plain_text || 
                              properties?.Name?.title?.[0]?.plain_text || 'Onbekende Koers';
            
            // 2. Land extractie uit (..)
            const countryMatch = fullTitle.match(/\(([^)]+)\)/);
            const country = countryMatch ? countryMatch[1] : 'BE'; // Default naar BE als niet gevonden
            const cleanTitle = fullTitle.replace(/\([^)]+\)/, '').trim();

            // 3. Weer/Locatie extractie
            const weerHtml = properties?.Weer?.rich_text?.map((rt: any) => rt.plain_text).join('') || '';
            let location = extractLocationName(weerHtml);

            // Fallback: Als locatie niet in het weer-veld staat, probeer het via AI te vinden
            if (!location) {
                try {
                    const infoText = properties.Informatie?.rich_text?.[0]?.plain_text || "";
                    const locPrompt = `
                        Je bent een wielerexpert. Baseer je op:
                        - Koersnaam: "${cleanTitle}"
                        - Datum: "${today}"
                        - Informatie: "${infoText}"
                        - Land: "${country}"

                        Wat is de meest waarschijnlijke finishlocatie (Stad) van deze koers op deze datum?
                        Geef ALLEEN de stad en het land terug (bijv. "Utsunomiya, Japan"). 
                        Als je het echt niet weet, geef dan "Onbekend" terug.
                    `;
                    const aiLoc = (await callAI(locPrompt)).trim().replace(/[*_#]/g, '');
                    if (!aiLoc.toLowerCase().includes("onbekend")) {
                        location = aiLoc;
                        log(`AI Locatie Fallback gevonden: ${location}`);
                    }
                } catch (e) {
                    log(`Fout bij AI locatie fallback voor ${cleanTitle}:`, e);
                }
            }
            
            if (!location) location = 'Onbekend';

            // 4. Extra Velden
            const winners = properties["Recente winnaars"]?.rich_text?.[0]?.plain_text || "";
            const info = properties.Informatie?.rich_text?.[0]?.plain_text || "";
            const notable = properties.Opmerkelijk?.rich_text?.[0]?.plain_text || "";

            log(`Processing: ${cleanTitle} in ${location} (${country})`);

            // 5. Gemini AI aanroep
            let aiReport = "Baro Rapportage overgeslagen (geen sleutel of fout)";
            try {
                const prompt = `
                    Je bent een enthousiaste wieler-weerman. Schrijf een boeiend weerbericht in het Nederlands voor de koers: "${cleanTitle}".
                    Locatie: ${location}, ${country}.
                    Focus: Middagweer (13:00-17:00).
                    
                    Betrek deze informatie in je verhaal:
                    - Koersinfo: "${info}"
                    - Recente winnaars: "${winners}"
                    - Opmerkelijk: "${notable}"
                    
                    Geef een update over wat de renners in de middag/finale kunnen verwachten (wind, temperatuur, neerslag) en wat dit betekent voor de koers (waaiers? gladde wegen? zware finale?).
                    
                    Maak er een meeslepend, sportief verhaal van. Gebruik een paar relevante emoji's.
                    Max 8-10 zinnen.
                `;
                
                aiReport = await callAI(prompt);
                log(`AI Report generated for ${cleanTitle}`);
            } catch (aiErr: any) {
                log(`AI Error for ${cleanTitle}:`, aiErr.message);
                aiReport = `Fout bij genereren AI rapport: ${aiErr.message}`;
            }

            return {
                id: r.id,
                original_title: fullTitle,
                clean_title: cleanTitle,
                country: country,
                location: location,
                winners: winners,
                info: info,
                notable: notable,
                startDate: properties?.['Start datum']?.date?.start,
                endDate: properties?.['Eind datum']?.date?.end,
                aiReport: aiReport,
                weerHtml: weerHtml
            };
        }));

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                status: 'success',
                logs: logs,
                data: {
                    racesCount: processedRaces.length,
                    races: processedRaces
                }
            }, null, 2)
        };

    } catch (error: any) {
        log('FATAL ERROR:', error);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                status: 'error',
                message: error.message,
                logs: logs
            }, null, 2)
        };
    }
};


import { GoogleGenerativeAI } from '@google/generative-ai';
import Cerebras from '@cerebras/cerebras_cloud_sdk';

// Configuration
const CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY;
export const CEREBRAS_MODEL = process.env.CEREBRAS_MODEL || "llama-3.3-70b";
const CEREBRAS_MODEL_FALLBACK = process.env.CEREBRAS_MODEL_FALLBACK;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-1.5-flash";

if (!GEMINI_API_KEY) {
    console.warn("WARNING: GEMINI_API_KEY is missing. Fallback will not work.");
}
if (!CEREBRAS_API_KEY) {
    console.warn("WARNING: CEREBRAS_API_KEY is missing. Primary AI will be skipped.");
}

console.log(`AI Config: Primary ${CEREBRAS_MODEL}, Fallback 1: ${CEREBRAS_MODEL_FALLBACK || "None"}, Fallback 2: ${GEMINI_MODEL}`);

/**
 * Universal AI Caller with Fallback
 * 1. Cerebras (Primary)
 * 2. Cerebras (Fallback Model)
 * 3. Gemini (Fallback)
 * 
 * @param {string} prompt - The user prompt
 * @param {object} options - Options: { systemInstruction: string, jsonMode: boolean, temperature: number }
 * @returns {Promise<string>} The generated text
 */
export async function callAI(prompt, options = {}) {
    const { systemInstruction, jsonMode = false, temperature = 0.7 } = options;
    let lastError = null;

    // 1. Try Cerebras (Primary)
    if (CEREBRAS_API_KEY) {
        try {
            console.log(`[AI] Trying Cerebras Primary (${CEREBRAS_MODEL})...`);
            const client = new Cerebras({ apiKey: CEREBRAS_API_KEY });
            
            const messages = [];
            if (systemInstruction) {
                messages.push({ role: "system", content: systemInstruction });
            }
            messages.push({ role: "user", content: prompt });

            const completion = await client.chat.completions.create({
                messages,
                model: CEREBRAS_MODEL,
                temperature: temperature,
                response_format: jsonMode ? { type: "json_object" } : undefined
            });

            const text = completion.choices[0].message.content;
            console.log(`[AI] Cerebras Primary success.`);
            return text;

        } catch (error) {
            console.error(`[AI] Cerebras Primary failed: ${error.message}`);
            lastError = error;
            // Continue to fallback 1
        }
    }

    // 2. Try Cerebras (Fallback Model)
    if (CEREBRAS_API_KEY && CEREBRAS_MODEL_FALLBACK) {
        try {
            console.log(`[AI] Trying Cerebras Fallback (${CEREBRAS_MODEL_FALLBACK})...`);
            const client = new Cerebras({ apiKey: CEREBRAS_API_KEY });
            
            const messages = [];
            if (systemInstruction) {
                messages.push({ role: "system", content: systemInstruction });
            }
            messages.push({ role: "user", content: prompt });

            const completion = await client.chat.completions.create({
                messages,
                model: CEREBRAS_MODEL_FALLBACK,
                temperature: temperature,
                response_format: jsonMode ? { type: "json_object" } : undefined
            });

            const text = completion.choices[0].message.content;
            console.log(`[AI] Cerebras Fallback success.`);
            return text;

        } catch (error) {
            console.error(`[AI] Cerebras Fallback failed: ${error.message}`);
            lastError = error;
            // Continue to fallback 2
        }
    }

    // 3. Fallback to Gemini
    if (GEMINI_API_KEY) {
        try {
            console.log(`[AI] Fallback to Gemini (${GEMINI_MODEL})...`);
            const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
            const modelConfig = { model: GEMINI_MODEL };
            if (systemInstruction) {
                modelConfig.systemInstruction = systemInstruction;
            }
            
            const model = genAI.getGenerativeModel(modelConfig);
            
            const generationConfig = {
                temperature: temperature,
            };
            
            if (jsonMode) {
                generationConfig.responseMimeType = "application/json";
            }

            const result = await model.generateContent({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig
            });

            const text = result.response.text();
            console.log(`[AI] Gemini success.`);
            return text;

        } catch (error) {
            console.error(`[AI] Gemini failed: ${error.message}`);
            lastError = error;
        }
    }

    throw new Error(`All AI providers failed. Last error: ${lastError?.message || "Configuration error"}`);
}

/**
 * Helper to extract JSON from markdown or raw text
 */
export const extractJSON = (text) => {
    try {
        // First try direct parse
        return JSON.parse(text);
    } catch (e) {
        // Try to find JSON block
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
            try {
                return JSON.parse(match[0]);
            } catch (e2) {
                 // Try cleaning markdown
                const clean = text.replace(/```json/g, '').replace(/```/g, '').trim();
                try {
                     return JSON.parse(clean);
                } catch(e3) {
                     throw e;
                }
            }
        }
        throw e;
    }
};

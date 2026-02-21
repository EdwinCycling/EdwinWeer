
import Cerebras from '@cerebras/cerebras_cloud_sdk';

// Configuration
const CEREBRAS_API_KEY = process.env.CEREBRAS_API_KEY;

// Safe Model Selection
let primaryModel = process.env.CEREBRAS_MODEL || "llama-3.3-70b";
// Force switch if deprecated Qwen model is detected in env
if (primaryModel.includes("qwen")) {
    console.warn(`[Config] Detected unsupported model '${primaryModel}' in env. Switching to 'llama-3.3-70b'.`);
    primaryModel = "llama-3.3-70b";
}

export const CEREBRAS_MODEL = primaryModel;

let fallbackModel = process.env.CEREBRAS_MODEL_FALLBACK || "llama-3.1-8b";
if (fallbackModel.includes("qwen")) {
    console.warn(`[Config] Detected unsupported fallback model '${fallbackModel}'. Switching to 'llama-3.1-8b'.`);
    fallbackModel = "llama-3.1-8b";
}
const CEREBRAS_MODEL_FALLBACK = fallbackModel;

if (!CEREBRAS_API_KEY) {
    console.warn("WARNING: CEREBRAS_API_KEY is missing. AI will be skipped.");
}

console.log(`AI Config: Primary ${CEREBRAS_MODEL}, Fallback: ${CEREBRAS_MODEL_FALLBACK}`);

/**
 * Universal AI Caller with Fallback (Cerebras ONLY)
 * 1. Cerebras (Primary)
 * 2. Cerebras (Fallback Model)
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
            // Continue to fallback
        }
    }

    // 2. Try Cerebras (Fallback Model)
    if (CEREBRAS_API_KEY) {
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

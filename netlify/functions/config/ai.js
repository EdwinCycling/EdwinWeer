// Central AI Configuration
// Strictly uses GEMINI_MODEL from environment variables
if (!process.env.GEMINI_MODEL) {
    console.error("CRITICAL: GEMINI_MODEL is missing in process.env!");
    throw new Error("GEMINI_MODEL environment variable is missing. Please add it to your .env file.");
}
export const GEMINI_MODEL = process.env.GEMINI_MODEL;
console.log(`AI Config: Using model ${GEMINI_MODEL}`);

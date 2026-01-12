// Central AI Configuration
// User requested update to latest models (referenced as "3.0" but mapping to latest available 2.0 Flash)
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
export const GEMINI_FALLBACK_MODELS = ["gemini-2.0-flash", "gemini-1.5-flash"];


import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env.local or .env manually
try {
    let envPath = path.resolve(__dirname, '../.env.local');
    if (!fs.existsSync(envPath)) {
        envPath = path.resolve(__dirname, '../.env');
    }

    if (fs.existsSync(envPath)) {
        console.log(`Loading env from ${envPath}`);
        const envConfig = fs.readFileSync(envPath, 'utf-8');
        envConfig.split('\n').forEach(line => {
             // Skip comments and empty lines
            if (!line || line.startsWith('#')) return;
            
            const firstEq = line.indexOf('=');
            if (firstEq > 0) {
                const key = line.substring(0, firstEq).trim();
                let value = line.substring(firstEq + 1).trim();
                
                // Remove surrounding quotes if present
                if ((value.startsWith('"') && value.endsWith('"')) || 
                    (value.startsWith("'") && value.endsWith("'"))) {
                    value = value.substring(1, value.length - 1);
                }
                
                // Handle escaped newlines in value (common in Firebase keys)
                // BUT NOT for JSON strings like FIREBASE_SERVICE_ACCOUNT which need to be parsed first
                if (key !== 'FIREBASE_SERVICE_ACCOUNT') {
                     value = value.replace(/\\n/g, '\n');
                }

                if (!process.env[key]) {
                    process.env[key] = value;
                }
            }
        });
        console.log("Loaded environment variables");
    } else {
         console.warn("No .env or .env.local found!");
    }
} catch (e) {
    console.error("Error loading env", e);
}

const TEST_EMAIL = 'edwin@editsolutions.nl';

async function runTest() {
    console.log("--- STARTING CYCLING REPORT TEST ---");
    console.log(`Target Email: ${TEST_EMAIL}`);

    // Dynamic import to allow env vars to load first
    const { handler: cyclingHandler } = await import('../netlify/functions/daily-cycling-report.ts');

    const event = { testEmail: TEST_EMAIL };
    const context = {};

    try {
        console.log("\n--- Testing Daily Cycling Report ---");
        const res = await cyclingHandler(event, context);
        console.log("Result:", res);
        console.log("✅ Daily Cycling Report finished.");
    } catch (e) {
        console.error("❌ Daily Cycling Report failed:", e);
    }
}

runTest();

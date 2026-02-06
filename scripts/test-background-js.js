
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

// Import handlers
// Note: We use dynamic imports because we need to load env vars first,
// and top-level imports are hoisted and run before we can set process.env.

const TEST_EMAIL = 'edwin@editsolutions.nl';

async function runTests() {
    console.log("--- STARTING BACKGROUND TASK TESTS (JS Functions) ---");
    console.log(`Target Email: ${TEST_EMAIL}`);

    // Dynamic imports
    const { handler: emailHandler } = await import('../netlify/functions/scheduled-email.js');
    const { handler: activityHandler } = await import('../netlify/functions/scheduled-activity-planner.js');
    const { handler: yourDayHandler } = await import('../netlify/functions/scheduled-your-day.js');
    const { handler: pushHandler } = await import('../netlify/functions/scheduled-push.js');

    const event = { testEmail: TEST_EMAIL };
    const context = {};

    // 1. Scheduled Email
    try {
        console.log("\n--- 1. Testing Scheduled Email ---");
        const res = await emailHandler(event, context);
        console.log("Result:", res);
        console.log("✅ Scheduled Email finished.");
    } catch (e) {
        console.error("❌ Scheduled Email failed:", e);
    }

    // 2. Activity Planner
    try {
        console.log("\n--- 2. Testing Activity Planner ---");
        const res = await activityHandler(event, context);
        console.log("Result:", res);
        console.log("✅ Activity Planner finished.");
    } catch (e) {
        console.error("❌ Activity Planner failed:", e);
    }

    // 3. Your Day
    try {
        console.log("\n--- 3. Testing Your Day ---");
        const res = await yourDayHandler(event, context);
        console.log("Result:", res);
        console.log("✅ Your Day finished.");
    } catch (e) {
        console.error("❌ Your Day failed:", e);
    }

    // 4. Push Notifications
    try {
        console.log("\n--- 4. Testing Push Notifications ---");
        const res = await pushHandler(event, context);
        console.log("Result:", res);
        console.log("✅ Push Notifications finished.");
    } catch (e) {
        console.error("❌ Push Notifications failed:", e);
    }
    
    console.log("\n--- TESTS COMPLETED ---");
    console.log("Check your email (edwin@editsolutions.nl) for results.");
}

runTests();

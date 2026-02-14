
import { handler as cyclingHandler } from '../netlify/functions/daily-cycling-report.ts';

async function runTest() {
    const testEvent = {
        testEmail: 'edwin@editsolutions.nl',
        isTest: true
    };

    const context = {};

    console.log("=== STARTING CYCLING REPORT TEST ===");
    console.log("Target User: edwin@editsolutions.nl");
    console.log("--------------------------------");

    try {
        const result = await cyclingHandler(testEvent, context);
        console.log("Result:", result.statusCode, result.body);
    } catch (e) {
        console.error("FAILED Cycling Report:", e);
    }

    console.log("\n=== TEST COMPLETED ===");
}

runTest();

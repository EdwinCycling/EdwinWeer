
import { handler as emailHandler } from '../netlify/functions/scheduled-email.js';
import { handler as pushHandler } from '../netlify/functions/scheduled-push.js';
import { handler as activityHandler } from '../netlify/functions/scheduled-activity-planner.js';
import { handler as yourDayHandler } from '../netlify/functions/scheduled-your-day.js';
import { handler as weermanHandler } from '../netlify/functions/scheduled-baro-weerman.js';
import { handler as alertHandler } from '../netlify/functions/send-alert.js';

async function runTests() {
    const testEvent = {
        testEmail: 'edwin@editsolutions.nl',
        httpMethod: 'POST' // Mock method if needed
    };

    const context = {};

    console.log("=== STARTING BACKEND TESTS ===");
    console.log("Target User: edwin@editsolutions.nl");
    console.log("--------------------------------");

    try {
        console.log("\n1. Testing Scheduled Email...");
        const emailResult = await emailHandler(testEvent, context);
        console.log("Result:", emailResult.statusCode, emailResult.body);
    } catch (e) {
        console.error("FAILED Scheduled Email:", e.message);
    }

    try {
        console.log("\n2. Testing Scheduled Push...");
        const pushResult = await pushHandler(testEvent, context);
        console.log("Result:", pushResult.statusCode, pushResult.body);
    } catch (e) {
        console.error("FAILED Scheduled Push:", e.message);
    }

    try {
        console.log("\n3. Testing Activity Planner...");
        const activityResult = await activityHandler(testEvent, context);
        console.log("Result:", activityResult.statusCode, activityResult.body);
    } catch (e) {
        console.error("FAILED Activity Planner:", e.message);
    }

    try {
        console.log("\n4. Testing Your Day...");
        const yourDayResult = await yourDayHandler(testEvent, context);
        console.log("Result:", yourDayResult.statusCode, yourDayResult.body);
    } catch (e) {
        console.error("FAILED Your Day:", e.message);
    }

    try {
        console.log("\n5. Testing Baro Weerman (Route Planner)...");
        // This function doesn't seem to check event.testEmail explicitly in the loop filter, 
        // but let's see. It iterates all users.
        // I might need to mock db if I could, but here I just run it.
        const weermanResult = await weermanHandler(testEvent, context);
        console.log("Result:", weermanResult.statusCode, weermanResult.body);
    } catch (e) {
        console.error("FAILED Baro Weerman:", e.message);
    }

    try {
        console.log("\n6. Testing Send Alert...");
        const alertEvent = {
            httpMethod: 'POST',
            body: JSON.stringify({
                email: 'edwin@editsolutions.nl',
                name: 'Edwin',
                type: 'credits_low',
                current: 5,
                limit: 100
            })
        };
        const alertResult = await alertHandler(alertEvent, context);
        console.log("Result:", alertResult.statusCode, alertResult.body);
    } catch (e) {
        console.error("FAILED Send Alert:", e.message);
    }

    console.log("\n=== TESTS COMPLETED ===");
}

runTests();

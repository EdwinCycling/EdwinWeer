
const admin = require('firebase-admin');
const { MAJOR_CITIES } = require('./services/cityData');

// Mock init for local script
if (!admin.apps.length) {
    // Try to find credentials in env
    if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PROJECT_ID) {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            })
        });
    } else {
        console.error("No credentials found in env.");
        process.exit(1);
    }
}

const db = admin.firestore();

async function checkRounds() {
    console.log("Checking game rounds...");
    const snapshot = await db.collection('game_rounds').orderBy('targetDate', 'desc').limit(10).get();
    
    if (snapshot.empty) {
        console.log("No rounds found.");
        return;
    }

    snapshot.docs.forEach(doc => {
        const data = doc.data();
        console.log(`- ID: ${doc.id}, Status: ${data.status}, Date: ${data.targetDate}, City: ${data.city?.name}`);
    });

    const openRound = snapshot.docs.find(d => d.data().status === 'open');
    if (!openRound) {
        console.log("\nWARNING: No OPEN round found!");
    } else {
        console.log(`\nActive OPEN round: ${openRound.id} (${openRound.data().targetDate})`);
    }
}

checkRounds().catch(console.error);

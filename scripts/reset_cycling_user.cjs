const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// Initialize Firebase Admin
let serviceAccount;
const serviceAccountPath = path.join(__dirname, '../service-account.json');

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } catch (e) {
        console.error("Error parsing FIREBASE_SERVICE_ACCOUNT env var");
    }
} else if (fs.existsSync(serviceAccountPath)) {
    serviceAccount = require(serviceAccountPath);
} else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    serviceAccount = {
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    };
}

if (!serviceAccount) {
    console.error("No service account found.");
    process.exit(1);
}

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function resetUser(email) {
    console.log(`Resetting cycling update for user: ${email}`);
    try {
        const usersRef = db.collection('users');
        const snapshot = await usersRef.where('email', '==', email).get();
        
        if (snapshot.empty) {
            console.log('No user found with that email. Trying scan...');
            const allUsers = await usersRef.get();
            let found = false;
            for (const doc of allUsers.docs) {
                const data = doc.data();
                if (data.email === email || (data.info && data.info.email === email)) {
                    console.log(`Found user! ID: ${doc.id}. Resetting...`);
                    await doc.ref.update({
                        last_cycling_update_date: ""
                    });
                    console.log('Reset successful.');
                    found = true;
                    break;
                }
            }
            if (!found) console.log("User not found.");
            return;
        }

        for (const doc of snapshot.docs) {
            console.log(`Found user! ID: ${doc.id}. Resetting...`);
            await doc.ref.update({
                last_cycling_update_date: ""
            });
            console.log('Reset successful.');
        }
    } catch (err) {
        console.error('Error:', err);
    }
}

resetUser('edwin@editsolutions.nl').then(() => process.exit(0));

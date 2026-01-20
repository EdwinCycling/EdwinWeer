const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// Initialize Firebase Admin
// Try to find service account
let serviceAccount;
const serviceAccountPath = path.join(__dirname, '../service-account.json');
const envPath = path.join(__dirname, '../.env');

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } catch (e) {
        console.error("Error parsing FIREBASE_SERVICE_ACCOUNT env var");
    }
} else if (fs.existsSync(envPath)) {
    // Manually parse .env for FIREBASE_SERVICE_ACCOUNT
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/^FIREBASE_SERVICE_ACCOUNT=(.*)$/m);
    if (match) {
        try {
            serviceAccount = JSON.parse(match[1]);
        } catch (e) {
            console.error("Error parsing FIREBASE_SERVICE_ACCOUNT from .env");
        }
    }
}

if (!serviceAccount && fs.existsSync(serviceAccountPath)) {
    serviceAccount = require(serviceAccountPath);
} else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    serviceAccount = {
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    };
}

if (!serviceAccount) {
    console.error("No service account found. Please set FIREBASE_SERVICE_ACCOUNT env var or place service-account.json in root.");
    process.exit(1);
}

try {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
} catch (e) {
    if (!admin.apps.length) {
        console.error("Failed to initialize admin:", e);
        process.exit(1);
    }
}

const db = admin.firestore();

async function setAdmin(email) {
    console.log(`Setting admin role for user with email: ${email}`);
    try {
        // 1. Find user in Firebase Auth
        let userRecord;
        try {
            userRecord = await admin.auth().getUserByEmail(email);
            console.log(`Found user in Firebase Auth! UID: ${userRecord.uid}`);
        } catch (authErr) {
            console.log(`User with email ${email} not found in Firebase Auth.`);
            
            // Try scanning users if needed, but getUserByEmail is the standard way
            console.log("Checking if user exists in Firestore despite not being in Auth (unlikely)...");
        }

        if (userRecord) {
            // 2. Update Firestore document with the role
            const userRef = db.collection('users').doc(userRecord.uid);
            await userRef.set({ role: 'admin' }, { merge: true });
            console.log(`Successfully updated Firestore document for UID ${userRecord.uid} with role: admin.`);
            return;
        }

        // Fallback: search Firestore if auth lookup failed (maybe they use a different email field)
        const usersRef = db.collection('users');
        const snapshot = await usersRef.where('email', '==', email).get();
        
        if (snapshot.empty) {
            console.log('No matching documents found with direct email query in Firestore. Trying scan...');
            const allUsers = await usersRef.get();
            let found = false;
            console.log(`Scanning through ${allUsers.size} Firestore documents...`);
            for (const doc of allUsers.docs) {
                const data = doc.data();
                const userEmail = data.email || (data.info && data.info.email);
                
                if (userEmail === email) {
                    console.log(`Found user in Firestore scan! ID: ${doc.id}. Updating role to admin...`);
                    await doc.ref.update({ role: 'admin' });
                    console.log('Successfully updated role to admin.');
                    found = true;
                    break;
                }
            }
            if (!found) console.log("User not found in Auth or Firestore.");
            return;
        }

        for (const doc of snapshot.docs) {
            console.log(`Found user in Firestore query! ID: ${doc.id}. Updating role to admin...`);
            await doc.ref.update({ role: 'admin' });
            console.log('Successfully updated role to admin.');
        }
    } catch (err) {
        console.error('Error during setAdmin:', err);
    }
}

const targetEmail = process.argv[2] || 'edwin@editsolutions.nl';
setAdmin(targetEmail).then(() => process.exit(0));

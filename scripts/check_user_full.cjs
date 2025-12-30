const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

// Initialize Firebase Admin
// Try to find service account
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
} else {
    // Try to construct from individual env vars if available (common in some setups)
    if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
        serviceAccount = {
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        };
    }
}

if (!serviceAccount) {
    console.error("No service account found. Please set FIREBASE_SERVICE_ACCOUNT env var or place service-account.json in root.");
    // Attempt to list users anyway if default creds work (e.g. gcloud auth)
    // But for this environment, we likely need the env var or file.
    // For now, let's try to mock or warn.
    console.log("Checking if we can run without explicit service account...");
} else {
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
}

const db = admin.firestore();

async function checkUser(email) {
    console.log(`Checking user with email: ${email}`);
    try {
        const usersRef = db.collection('users');
        // This requires an index or scanning. Ideally search by email field if it exists in doc.
        // If user docs are indexed by UID, we can't find by email easily without a query.
        // Assuming 'email' field exists in user doc.
        const snapshot = await usersRef.where('email', '==', email).get();
        
        if (snapshot.empty) {
            console.log('No matching documents.');
            // Try searching all and filtering (slow but works for small db)
            console.log('Trying scan...');
            const allUsers = await usersRef.get();
            let found = false;
            allUsers.forEach(doc => {
                const data = doc.data();
                if (data.email === email || (data.info && data.info.email === email)) {
                    console.log(`Found user! ID: ${doc.id}`);
                    console.log('Usage Data:', JSON.stringify(data.usage, null, 2));
                    console.log('Purchases Data:', JSON.stringify(data.purchases, null, 2)); // If it exists
                    found = true;
                }
            });
            if (!found) console.log("User definitely not found.");
            return;
        }

        snapshot.forEach(doc => {
            console.log(doc.id, '=>', doc.data());
            console.log('Usage:', doc.data().usage);
        });
    } catch (err) {
        console.log('Error getting documents', err);
    }
}

async function checkPurchases(email) {
    console.log(`Checking purchases for email: ${email}`);
     try {
        const purchasesRef = db.collection('purchases');
        // We might need to find the userId first from the checkUser step
        // For now, let's just list all purchases to see if we see anything relevant
        const snapshot = await purchasesRef.orderBy('createdAt', 'desc').limit(20).get();
         if (snapshot.empty) {
            console.log('No purchases found in global collection.');
            return;
        }
        
        console.log("Recent global purchases:");
        snapshot.forEach(doc => {
             const data = doc.data();
             console.log(`${doc.id} => User: ${data.userId}, Amount: ${data.amount}, Type: ${data.type}, Date: ${data.createdAt?.toDate ? data.createdAt.toDate() : data.createdAt}`);
        });

    } catch (err) {
        console.log('Error getting purchases', err);
    }
}

async function run() {
    await checkUser('edwin@editsolutions.nl');
    await checkUser('edwin@editsolutions.bnl'); // Check the typo version too
    // await checkPurchases('edwin@editsolutions.nl');
}

run();

import admin from 'firebase-admin';

/**
 * Initializes Firebase Admin SDK.
 * Prioritizes individual environment variables to avoid 4KB limit issues.
 */
export function initFirebase() {
    if (!admin.apps.length) {
        try {
            let serviceAccount;
            
            // Prioritize individual keys to avoid the 4KB limit of AWS Lambda environment variables
            if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PROJECT_ID) {
                serviceAccount = {
                    projectId: process.env.FIREBASE_PROJECT_ID,
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                    // Handle newlines in private key which are often escaped in env vars
                    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
                };
            } 
            // Fallback to legacy single JSON variable (not recommended due to size limits)
            else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
                try {
                    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
                } catch (e) {
                    console.error("Error parsing FIREBASE_SERVICE_ACCOUNT:", e);
                }
            }

            if (serviceAccount) {
                admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount)
                });
                console.log("Firebase Admin initialized successfully.");
            } else {
                console.error("Missing Firebase Admin credentials. Please set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY.");
            }
        } catch (e) {
            console.error("Error initializing Firebase Admin:", e);
        }
    }
    
    return admin.apps.length ? admin.firestore() : null;
}

/**
 * Gets the Firestore instance if initialized.
 */
export function getDb() {
    return admin.apps.length ? admin.firestore() : null;
}

export { admin };

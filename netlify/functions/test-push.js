import admin from 'firebase-admin';

// Initialize Firebase Admin
if (!admin.apps.length) {
    try {
        let serviceAccount;
        if (process.env.FIREBASE_SERVICE_ACCOUNT) {
            serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        } else if (process.env.FIREBASE_PRIVATE_KEY && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PROJECT_ID) {
            serviceAccount = {
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                // Handle newlines in private key which are often escaped in env vars
                privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            };
        }

        if (serviceAccount) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
        } else {
            console.error("Missing Firebase Admin credentials");
        }
    } catch (e) {
        console.error("Error initializing Firebase Admin:", e);
    }
}

async function sendPushNotification(token, title, body) {
    if (!token) return false;

    try {
        await admin.messaging().send({
            token: token,
            notification: {
                title: title,
                body: body,
            },
            webpush: {
                fcmOptions: {
                    link: 'https://askbaro.com'
                },
                notification: {
                    icon: 'https://askbaro.com/icons/baro-icon-192.png'
                }
            }
        });
        console.log(`Test push notification sent`);
        return true;
    } catch (error) {
        console.error('Error sending push notification:', error);
        return false;
    }
}

export const handler = async (event, context) => {
    // Only allow POST
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    try {
        const body = JSON.parse(event.body);
        const { token } = body;

        if (!token) {
            return { statusCode: 400, body: JSON.stringify({ message: "Missing token" }) };
        }

        const success = await sendPushNotification(token, "Test Notificatie", "Dit is een testbericht om te controleren of pushmeldingen werken!");

        if (success) {
            return {
                statusCode: 200,
                body: JSON.stringify({ message: "Test notification sent successfully" }),
            };
        } else {
            return {
                statusCode: 500,
                body: JSON.stringify({ message: "Failed to send notification" }),
            };
        }
    } catch (error) {
        console.error("Error in test-push function:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: "Internal Server Error" }),
        };
    }
};

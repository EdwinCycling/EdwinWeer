import Stripe from 'stripe';
import admin from 'firebase-admin';

// Initialize Firebase Admin (Copied from scheduled-email.js to ensure independence)
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

const db = admin.apps.length ? admin.firestore() : null;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-02-24.acacia',
});

// Mapping of Price IDs to Credit Amounts
// REPLACE THESE WITH YOUR ACTUAL STRIPE PRICE IDs
const CREDIT_PACKAGES = {
    [process.env.STRIPE_PRICE_WEATHER]: { type: 'weatherCredits', amount: 100 },
    [process.env.STRIPE_PRICE_BARO]: { type: 'baroCredits', amount: 500 },
};

export const handler = async (event) => {
  // Webhooks are always POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const sig = event.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!sig || !webhookSecret) {
      console.error("Missing signature or webhook secret");
      return { statusCode: 400, body: 'Webhook Error: Missing signature or secret' };
  }

  let stripeEvent;

  try {
    stripeEvent = stripe.webhooks.constructEvent(event.body, sig, webhookSecret);
  } catch (err) {
    console.error(`Webhook Signature Verification Failed: ${err.message}`);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  // Handle the event
  if (stripeEvent.type === 'checkout.session.completed') {
      const session = stripeEvent.data.object;
      
      const userId = session.metadata?.userId;
      
      if (!userId) {
          console.error("No userId in session metadata");
          return { statusCode: 200, body: 'Received but no userId found' };
      }

      if (!db) {
          console.error("Database not initialized");
          return { statusCode: 500, body: 'Database error' };
      }

      try {
          // Retrieve line items to find out what was purchased
          // Note: If you have only 1 item per checkout, this is simple.
          // If you have multiple, you need to iterate.
          const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
          
          const updates = {};
          
          for (const item of lineItems.data) {
              const priceId = item.price.id;
              
              // Determine credits based on price ID
              // You can also use metadata on the Price object in Stripe if you prefer dynamic config
              // For now, we use the hardcoded mapping or a default
              
              let packageInfo = CREDIT_PACKAGES[priceId];
              
              // If not found in mapping, try to look at session metadata or default
              if (!packageInfo) {
                  console.warn(`Unknown Price ID: ${priceId}, using default 100 credits`);
                  packageInfo = { type: 'weatherCredits', amount: 100 };
              }
              
              if (updates[packageInfo.type]) {
                  updates[packageInfo.type] += packageInfo.amount * item.quantity;
              } else {
                  updates[packageInfo.type] = packageInfo.amount * item.quantity;
              }
          }

          // Update Firestore
          const userRef = db.collection('users').doc(userId);
          
          const updateData = {};
          for (const [key, value] of Object.entries(updates)) {
              updateData[`usage.${key}`] = admin.firestore.FieldValue.increment(value);
          }
          
          await userRef.update(updateData);
          console.log(`Updated credits for user ${userId}:`, updates);
          
      } catch (err) {
          console.error(`Error updating credits: ${err.message}`);
          return { statusCode: 500, body: 'Error updating database' };
      }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};

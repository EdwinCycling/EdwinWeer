import Stripe from 'stripe';
import admin from 'firebase-admin';
import * as Brevo from '@getbrevo/brevo';

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

const db = admin.apps.length ? admin.firestore() : null;

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');

// Initialize Brevo
const brevoApi = new Brevo.TransactionalEmailsApi();
const brevoApiKey = process.env.BREVO_API_KEY || '';
if (brevoApi.setApiKey) {
    brevoApi.setApiKey(Brevo.TransactionalEmailsApiApiKeys.apiKey, brevoApiKey);
} else {
    // Fallback
    if (!(brevoApi as any).authentications['apiKey']) {
        (brevoApi as any).authentications['apiKey'] = {} as any;
    }
    (brevoApi as any).authentications['apiKey'].apiKey = brevoApiKey;
}

// Mapping of Price IDs to Credit Amounts
const CREDIT_PACKAGES: Record<string, { type: 'weatherCredits' | 'baroCredits', amount: number }> = {
    [process.env.STRIPE_PRICE_WEATHER || '']: { type: 'weatherCredits', amount: 10000 },
    [process.env.STRIPE_PRICE_BARO || '']: { type: 'baroCredits', amount: 500 },
};

async function sendPurchaseEmail(email: string, name: string, locale: string, updates: Record<string, number>) {
    if (!process.env.BREVO_API_KEY) {
        console.warn("No BREVO_API_KEY, skipping email");
        return;
    }

    // Translations
    const translations: any = {
        nl: {
            subject: 'Bevestiging van je aankoop',
            title: 'Bedankt voor je aankoop!',
            intro: (name: string) => `Beste ${name},<br><br>Bedankt dat je Baro steunt! Je aankoop is succesvol verwerkt en de credits zijn toegevoegd aan je account.`,
            limits: `<strong>Nieuwe limieten actief:</strong><br>• 250 calls per dag<br>• 2500 calls per maand`,
            footer: `Veel plezier met de app!<br><br>Met vriendelijke groet,<br>Het Baro Team`
        },
        en: {
            subject: 'Purchase Confirmation',
            title: 'Thank you for your purchase!',
            intro: (name: string) => `Dear ${name},<br><br>Thank you for supporting Baro! Your purchase has been successfully processed and the credits have been added to your account.`,
            limits: `<strong>New limits active:</strong><br>• 250 calls per day<br>• 2500 calls per month`,
            footer: `Enjoy the app!<br><br>Best regards,<br>The Baro Team`
        },
        de: {
            subject: 'Kaufbestätigung',
            title: 'Vielen Dank für Ihren Kauf!',
            intro: (name: string) => `Hallo ${name},<br><br>Vielen Dank, dass Sie Baro unterstützen! Ihr Kauf wurde erfolgreich bearbeitet und die Credits wurden Ihrem Konto gutgeschrieben.`,
            limits: `<strong>Neue Limits aktiv:</strong><br>• 250 Anrufe pro Tag<br>• 2500 Anrufe pro Monat`,
            footer: `Viel Spaß mit der App!<br><br>Mit freundlichen Grüßen,<br>Das Baro Team`
        },
        fr: {
            subject: 'Confirmation d\'achat',
            title: 'Merci pour votre achat !',
            intro: (name: string) => `Bonjour ${name},<br><br>Merci de soutenir Baro ! Votre achat a été traité avec succès et les crédits ont été ajoutés à votre compte.`,
            limits: `<strong>Nouveaux plafonds actifs :</strong><br>• 250 appels par jour<br>• 2500 appels par mois`,
            footer: `Profitez de l'application !<br><br>Cordialement,<br>L'équipe Baro`
        },
        es: {
            subject: 'Confirmación de compra',
            title: '¡Gracias por tu compra!',
            intro: (name: string) => `Hola ${name},<br><br>¡Gracias por apoyar a Baro! Tu compra ha sido procesada con éxito y los créditos se han añadido a tu cuenta.`,
            limits: `<strong>Nuevos límites activos:</strong><br>• 250 llamadas por día<br>• 2500 llamadas por mes`,
            footer: `¡Disfruta de la aplicación!<br><br>Saludos cordiales,<br>El equipo de Baro`
        }
    };

    const normalizedLocale = locale.split(/[-_]/)[0].toLowerCase();
    const t = translations[normalizedLocale] || translations.en;
    
    // Construct message based on what was bought
    let itemsList = '';
    let hasWeatherCredits = false;

    for (const [type, amount] of Object.entries(updates)) {
        if (type === 'weatherCredits') {
            hasWeatherCredits = true;
            itemsList += `<li><strong>${amount.toLocaleString(locale)} Weather Credits</strong></li>`;
        } else if (type === 'baroCredits') {
            itemsList += `<li><strong>${amount.toLocaleString(locale)} Baro Credits</strong></li>`;
        }
    }

    const limitsText = hasWeatherCredits
        ? `<div style="margin-top: 15px; padding: 10px; background-color: #f0fdf4; border-radius: 8px; color: #166534;">
            ${t.limits}
           </div>`
        : '';

    const htmlContent = `
        <html>
            <body style="font-family: sans-serif; line-height: 1.6; color: #333;">
                <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                    <h2 style="color: #2563eb;">${t.title}</h2>
                    <div style="background: #f8fafc; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0;">
                        ${t.intro(name)}
                        <ul style="margin: 15px 0; padding-left: 20px;">
                            ${itemsList}
                        </ul>
                        ${limitsText}
                    </div>
                    <p style="margin-top: 20px;">
                        ${t.footer}
                    </p>
                    <p style="font-size: 12px; color: #64748b; margin-top: 40px; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 20px;">
                        Verzonden door Baro | <a href="https://askbaro.com" style="color: #2563eb;">Open App</a>
                    </p>
                </div>
            </body>
        </html>
    `;

    const sendSmtpEmail = new Brevo.SendSmtpEmail();
    sendSmtpEmail.subject = t.subject;
    sendSmtpEmail.htmlContent = htmlContent;
    sendSmtpEmail.sender = { "name": "Baro", "email": "no-reply@askbaro.com" };
    sendSmtpEmail.to = [{ "email": email, "name": name }];

    try {
        await brevoApi.sendTransacEmail(sendSmtpEmail);
        console.log(`Confirmation email sent to ${email}`);
    } catch (error) {
        console.error("Error sending confirmation email:", error);
    }
}

export const handler = async (event: any) => {
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
  } catch (err: any) {
    console.error(`Webhook Signature Verification Failed: ${err.message}`);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  // Handle the event
  if (stripeEvent.type === 'checkout.session.completed') {
      const session = stripeEvent.data.object as Stripe.Checkout.Session;
      
      const userId = session.metadata?.userId;
      const locale = session.metadata?.locale || session.locale || 'nl';
      
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
          const lineItems = await stripe.checkout.sessions.listLineItems(session.id);
          
          const updates: Record<string, number> = {};
          
          for (const item of lineItems.data) {
              const priceId = item.price?.id;
              if (!priceId) continue;
              
              let packageInfo = CREDIT_PACKAGES[priceId];
              
              if (!packageInfo) {
                  console.warn(`Unknown Price ID: ${priceId}, using default 100 credits`);
                  packageInfo = { type: 'weatherCredits', amount: 100 };
              }
              
              const qty = item.quantity || 1;
              
              if (updates[packageInfo.type]) {
                  updates[packageInfo.type] += packageInfo.amount * qty;
              } else {
                  updates[packageInfo.type] = packageInfo.amount * qty;
              }
          }

          // Update Firestore
          const userRef = db.collection('users').doc(userId);
          
          const updateData: Record<string, any> = {};
          for (const [key, value] of Object.entries(updates)) {
              updateData[`usage.${key}`] = admin.firestore.FieldValue.increment(value);
          }
          
          await userRef.update(updateData);
          console.log(`Updated credits for user ${userId}:`, updates);

          // Send Confirmation Email
          if (session.customer_details?.email) {
              await sendPurchaseEmail(
                  session.customer_details.email, 
                  session.customer_details.name || 'Baro Gebruiker', 
                  locale, 
                  updates
              );
          }
          
      } catch (err: any) {
          console.error(`Error updating credits: ${err.message}`);
          return { statusCode: 500, body: 'Error updating database' };
      }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};

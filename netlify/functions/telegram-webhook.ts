import { Handler } from '@netlify/functions';
import { initFirebase, getDb, admin } from './config/firebaseAdmin.js';

initFirebase();
const db = getDb();

export const handler: Handler = async (event) => {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const body = JSON.parse(event.body || '{}');
        const message = body.message;

        // Verify it's a valid message
        if (!message || !message.text) {
            return { statusCode: 200, body: 'Ignored: No text content' };
        }

        const chatId = message.chat.id;
        const text = message.text.trim();

        // Handle /start command
        if (text.startsWith('/start')) {
            // Extract parameter (firebase_uid)
            // /start <firebase_uid>
            const parts = text.split(' ');
            if (parts.length < 2) {
                await sendTelegramMessage(chatId, "Hoi! Om te koppelen moet je de link vanuit de Baro app gebruiken.");
                return { statusCode: 200, body: 'OK' };
            }

            const firebaseUid = parts[1];

            // Verify Firebase User exists
            try {
                const userRef = db.collection('users').doc(firebaseUid);
                const userDoc = await userRef.get();

                if (!userDoc.exists) {
                     await sendTelegramMessage(chatId, "Er is iets misgegaan. Ik kan je account niet vinden. Probeer opnieuw via de app.");
                     return { statusCode: 200, body: 'User not found' };
                }

                const userData = userDoc.data();
                if (userData?.isBanned === true) {
                    await sendTelegramMessage(chatId, "Je account is geblokkeerd. Toegang geweigerd.");
                    return { statusCode: 200, body: 'User banned' };
                }

                // Update User with Telegram Chat ID
                await userRef.update({
                    telegramChatId: chatId.toString()
                });

                await sendTelegramMessage(chatId, "✅ Hoi! Je bent succesvol gekoppeld aan Baro. Je ontvangt nu hier je weerberichten.");
                
            } catch (error) {
                console.error('Error linking user:', error);
                await sendTelegramMessage(chatId, "Er is een technische fout opgetreden. Probeer het later opnieuw.");
            }
        } else {
             // Handle other messages (optional)
             await sendTelegramMessage(chatId, "Ik ben een bot voor weerberichten. Ik reageer alleen op commando's.");
        }

        return {
            statusCode: 200,
            body: JSON.stringify({ message: "Processed" })
        };

    } catch (error) {
        console.error('Webhook error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal Server Error' })
        };
    }
};

async function sendTelegramMessage(chatId: number | string, text: string) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
        console.error('Missing TELEGRAM_BOT_TOKEN');
        return;
    }

    try {
        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: text,
                parse_mode: 'HTML' // Allow some formatting
            })
        });
    } catch (e) {
        console.error('Error sending Telegram message:', e);
    }
}

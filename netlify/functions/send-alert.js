import * as Brevo from '@getbrevo/brevo';

// Initialize Brevo
const apiInstance = new Brevo.TransactionalEmailsApi();
const apiKey = process.env.BREVO_API_KEY || 'dummy_key';

// Set API key using the correct method for v3
if (apiInstance.setApiKey) {
    apiInstance.setApiKey(Brevo.TransactionalEmailsApiApiKeys.apiKey, apiKey);
} else {
    // Fallback
    if (!apiInstance.authentications['apiKey']) {
        apiInstance.authentications['apiKey'] = {};
    }
    apiInstance.authentications['apiKey'].apiKey = apiKey;
}

export const handler = async (event, context) => {
    // Only allow POST
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { email, name, type, current, limit } = JSON.parse(event.body);

        if (!email) {
            return { statusCode: 400, body: 'Missing email' };
        }

        let subject = "Baro Alert";
        let message = "";

        if (type === 'day_80') {
            subject = "⚠️ Je nadert je dagelijkse limiet";
            message = `Je hebt <b>${current}</b> van de <b>${limit}</b> dagelijkse calls gebruikt (80%).`;
        } else if (type === 'day_100') {
            subject = "🛑 Dagelijkse limiet bereikt";
            message = `Je hebt je dagelijkse limiet van <b>${limit}</b> calls bereikt. Je kunt morgen weer verder of upgraden naar Pro.`;
        } else if (type === 'month_80') {
            subject = "⚠️ Je nadert je maandelijkse limiet";
            message = `Je hebt <b>${current}</b> van de <b>${limit}</b> maandelijkse calls gebruikt (80%).`;
        } else if (type === 'month_100') {
            subject = "🛑 Maandelijkse limiet bereikt";
            message = `Je hebt je maandelijkse limiet van <b>${limit}</b> calls bereikt.`;
        } else if (type === 'credits_low') {
            subject = "⚠️ Je credits zijn bijna op";
            message = `Je hebt nog maar <b>${current}</b> credits over.`;
        } else {
            message = `Je gebruik: ${current}/${limit}`;
        }

        const sendSmtpEmail = new Brevo.SendSmtpEmail();
        sendSmtpEmail.subject = subject;
        sendSmtpEmail.htmlContent = `
            <html>
                <body style="font-family: sans-serif; line-height: 1.6; color: #333;">
                    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                        <h2 style="color: #2563eb;">${subject}</h2>
                        <div style="background: #f8fafc; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0;">
                            <p>${message}</p>
                            <p>Upgrade je bundel om ongestoord verder te gaan.</p>
                        </div>
                        <p style="font-size: 12px; color: #64748b; margin-top: 20px; text-align: center;">
                            Verzonden door Baro | <a href="https://askbaro.com">Open App</a>
                        </p>
                    </div>
                </body>
            </html>
        `;
        sendSmtpEmail.sender = { "name": "Baro Weerman", "email": "no-reply@askbaro.com" };
        sendSmtpEmail.to = [{ "email": email, "name": name || "Baro User" }];

        await apiInstance.sendTransacEmail(sendSmtpEmail);

        return {
            statusCode: 200,
            body: JSON.stringify({ message: "Alert email sent successfully" })
        };

    } catch (e) {
        console.error("Alert email error:", e);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: e.message })
        };
    }
};

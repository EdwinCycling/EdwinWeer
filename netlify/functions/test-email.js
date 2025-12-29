import * as Brevo from '@getbrevo/brevo';

// Initialize Brevo
const apiInstance = new Brevo.TransactionalEmailsApi();
const apiKey = process.env.BREVO_API_KEY || 'dummy_key';

// Set API key using the correct method for v3
const apiKeyInstance =  apiInstance.authentications['apiKey'];
apiKeyInstance.apiKey = apiKey;

export const handler = async (event, context) => {
    // Only allow POST
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const { email, name, content } = JSON.parse(event.body);

        if (!email || !content) {
            return { statusCode: 400, body: 'Missing email or content' };
        }

        const sendSmtpEmail = new Brevo.SendSmtpEmail();
        sendSmtpEmail.subject = "Test Baro Weerbericht";
        sendSmtpEmail.htmlContent = `
            <html>
                <body style="font-family: sans-serif; line-height: 1.6; color: #333;">
                    <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                        <h2 style="color: #2563eb;">Jouw Weerbericht (Test)</h2>
                        <div style="background: #f8fafc; padding: 20px; border-radius: 12px; border: 1px solid #e2e8f0;">
                            ${content.replace(/\n/g, '<br>')}
                        </div>
                        <p style="font-size: 12px; color: #64748b; margin-top: 20px; text-align: center;">
                            Verzonden door Baro | <a href="https://askbaro.com">Open App</a>
                        </p>
                    </div>
                </body>
            </html>
        `;
        sendSmtpEmail.sender = { "name": "Baro", "email": "no-reply@askbaro.com" };
        sendSmtpEmail.to = [{ "email": email, "name": name || "Tester" }];

        await apiInstance.sendTransacEmail(sendSmtpEmail);

        return {
            statusCode: 200,
            body: JSON.stringify({ message: "Test email sent successfully" })
        };

    } catch (e) {
        console.error("Test email error:", e);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: e.message })
        };
    }
};

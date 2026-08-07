export const sendOTP = async (to: string, code: string, maxRetries = 3): Promise<boolean> => {
    // If no BREVO API key is configured, log the code to console for local testing
    if (!process.env.BREVO_API_KEY) {
        console.log(`\n=========================================`);
        console.log(`🎯 [DEV MODE] OTP for ${to} is: ${code}`);
        console.log(`=========================================\n`);
        return true;
    }

    let attempt = 1;
    while (attempt <= maxRetries) {
        try {
            const response = await fetch('https://api.brevo.com/v3/smtp/email', {
                method: 'POST',
                headers: {
                    'accept': 'application/json',
                    'api-key': process.env.BREVO_API_KEY,
                    'content-type': 'application/json'
                },
                body: JSON.stringify({
                    sender: { name: 'Zoom Clone', email: process.env.SMTP_USER },
                    to: [{ email: to }],
                    subject: 'Your Zoom Clone Verification Code',
                    htmlContent: `<p>Your verification code is: <strong>${code}</strong></p><p>It will expire in 10 minutes.</p>`
                })
            });

            if (!response.ok) {
                const errorData = await response.text();
                throw new Error(`Brevo API error: ${errorData}`);
            }

            console.log(`✅ Brevo Email dispatched successfully to ${to}`);
            return true;
        } catch (error) {
            console.error(`❌ Attempt ${attempt} to send OTP via Brevo failed:`, error);
            if (attempt === maxRetries) {
                return false;
            }
            await new Promise(resolve => setTimeout(resolve, 800));
            attempt++;
        }
    }
    return false;
};

import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export const sendOTP = async (to: string, code: string, maxRetries = 3): Promise<boolean> => {
    // If no Resend API key is configured, instantly log the code to console for local testing
    if (!process.env.RESEND_API_KEY) {
        console.log(`\n=========================================`);
        console.log(`🎯 [DEV MODE] OTP for ${to} is: ${code}`);
        console.log(`=========================================\n`);
        return true;
    }

    let attempt = 1;
    while (attempt <= maxRetries) {
        try {
            const { data, error } = await resend.emails.send({
                from: 'Zoom Clone <onboarding@resend.dev>',
                to: [to],
                subject: 'Your Zoom Clone Verification Code',
                html: `<p>Your verification code is: <strong>${code}</strong></p><p>It will expire in 10 minutes.</p>`,
            });

            if (error) {
                throw new Error(error.message);
            }

            console.log(`✅ Resend Email dispatched successfully to ${to}. ID: ${data?.id}`);
            return true;
        } catch (error) {
            console.error(`❌ Attempt ${attempt} to send OTP via Resend failed:`, error);
            if (attempt === maxRetries) {
                return false;
            }
            // Rapid backoff for API
            await new Promise(resolve => setTimeout(resolve, 800));
            attempt++;
        }
    }
    return false;
};

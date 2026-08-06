import nodemailer from 'nodemailer';

let transporter: nodemailer.Transporter | null = null;

async function getTransporter() {
    if (transporter) return transporter;

    // Use SMTP options from env if they exist
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
        transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT) || 587,
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
        });
        return transporter;
    }

    // Fallback to Ethereal dummy account for local development
    console.log('No SMTP configuration found. Generating Ethereal test account...');
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false, // true for 465, false for other ports
        auth: {
            user: testAccount.user, // generated ethereal user
            pass: testAccount.pass, // generated ethereal password
        },
    });

    console.log(`Ethereal Test account generated: ${testAccount.user}`);
    return transporter;
}

export const sendOTP = async (to: string, code: string) => {
    try {
        const mailTransporter = await getTransporter();
        const info = await mailTransporter.sendMail({
            from: '"Zoom Clone" <noreply@zoomclone.local>',
            to,
            subject: 'Your Verification Code',
            text: `Your verification code is: ${code}`,
            html: `<p>Your verification code is: <b>${code}</b></p><p>It will expire in 10 minutes.</p>`,
        });

        console.log(`Mail sent to ${to}. Message ID: ${info.messageId}`);
        // Log the preview URL for Ethereal emails
        if (nodemailer.getTestMessageUrl(info)) {
            console.log('Preview URL: %s', nodemailer.getTestMessageUrl(info));
        }

        return true;
    } catch (error) {
        console.error('Failed to send OTP:', error);
        return false;
    }
};

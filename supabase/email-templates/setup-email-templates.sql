-- Supabase Email Templates Setup for ReplyFlowHQ
-- Run this script in your Supabase SQL editor to configure custom email templates

-- Update password reset email template
UPDATE auth.mfa_factors 
SET email_template = '
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reset Your Password - ReplyFlowHQ</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f8fafc; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .card { background: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1); overflow: hidden; }
        .header { background: linear-gradient(135deg, #0b1220 0%, #1e293b 100%); padding: 40px 20px; text-align: center; }
        .logo { display: inline-flex; align-items: center; gap: 8px; margin-bottom: 20px; }
        .logo-icon { width: 32px; height: 32px; background: #2563eb; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 14px; }
        .logo-text { color: white; font-size: 20px; font-weight: 600; }
        .logo-text span:first-child { color: white; }
        .logo-text span:last-child { color: #60a5fa; }
        .title { color: white; font-size: 24px; font-weight: 600; margin-bottom: 8px; }
        .content { padding: 40px 30px; }
        .message { color: #475569; font-size: 16px; margin-bottom: 32px; line-height: 1.6; }
        .button-container { text-align: center; margin: 32px 0; }
        .button { display: inline-block; background: #2563eb; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: 600; text-align: center; transition: background-color 0.2s ease; }
        .button:hover { background: #1d4ed8; }
        .info { color: #64748b; font-size: 14px; margin-bottom: 24px; text-align: center; }
        .divider { height: 1px; background: #e2e8f0; margin: 32px 0; }
        .footer { padding: 30px; background: #f8fafc; text-align: center; }
        .footer-text { color: #64748b; font-size: 14px; margin-bottom: 16px; }
        .footer-link { color: #2563eb; text-decoration: none; }
        .footer-link:hover { text-decoration: underline; }
        .footer-brand { color: #475569; font-size: 14px; font-weight: 600; }
        .footer-brand a { color: #2563eb; text-decoration: none; }
        .footer-brand a:hover { text-decoration: underline; }
        @media (prefers-color-scheme: dark) { body { background-color: #0f172a; color: #f1f5f9; } .card { background: #1e293b; border: 1px solid #334155; } .message { color: #cbd5e1; } .info { color: #94a3b8; } .divider { background: #334155; } .footer { background: #0f172a; } .footer-text { color: #94a3b8; } .footer-brand { color: #cbd5e1; } }
        @media (max-width: 600px) { .container { padding: 10px; } .header { padding: 30px 20px; } .title { font-size: 20px; } .content { padding: 30px 20px; } .button { padding: 12px 24px; font-size: 15px; } }
    </style>
</head>
<body>
    <div class="container">
        <div class="card">
            <div class="header">
                <div class="logo">
                    <div class="logo-icon">RF</div>
                    <div class="logo-text"><span>ReplyFlow</span><span>HQ</span></div>
                </div>
                <h1 class="title">Reset Your Password</h1>
            </div>
            <div class="content">
                <p class="message">We received a request to reset the password for your ReplyFlowHQ account.</p>
                <div class="button-container"><a href="{{ .ConfirmationURL }}" class="button">Reset Password</a></div>
                <p class="info">This link expires in 1 hour for security reasons.</p>
                <p class="info">If you didn''t request a password reset, you can safely ignore this email.</p>
            </div>
            <div class="divider"></div>
            <div class="footer">
                <p class="footer-text">Need help? <a href="mailto:support@replyflowhq.com" class="footer-link">support@replyflowhq.com</a></p>
                <div class="footer-brand"><a href="https://replyflowhq.com">ReplyFlowHQ</a></div>
            </div>
        </div>
    </div>
</body>
</html>'
WHERE factor_type = 'recovery' AND email_template IS NOT NULL;

-- Update email confirmation template
UPDATE auth.mfa_factors 
SET email_template = '
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Confirm Your Email - ReplyFlowHQ</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, ''Segoe UI'', Roboto, ''Helvetica Neue'', Arial, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f8fafc; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .card { background: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1); overflow: hidden; }
        .header { background: linear-gradient(135deg, #0b1220 0%, #1e293b 100%); padding: 40px 20px; text-align: center; }
        .logo { display: inline-flex; align-items: center; gap: 8px; margin-bottom: 20px; }
        .logo-icon { width: 32px; height: 32px; background: #2563eb; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 14px; }
        .logo-text { color: white; font-size: 20px; font-weight: 600; }
        .logo-text span:first-child { color: white; }
        .logo-text span:last-child { color: #60a5fa; }
        .title { color: white; font-size: 24px; font-weight: 600; margin-bottom: 8px; }
        .content { padding: 40px 30px; }
        .message { color: #475569; font-size: 16px; margin-bottom: 32px; line-height: 1.6; }
        .button-container { text-align: center; margin: 32px 0; }
        .button { display: inline-block; background: #2563eb; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: 600; text-align: center; transition: background-color 0.2s ease; }
        .button:hover { background: #1d4ed8; }
        .info { color: #64748b; font-size: 14px; margin-bottom: 24px; text-align: center; }
        .divider { height: 1px; background: #e2e8f0; margin: 32px 0; }
        .footer { padding: 30px; background: #f8fafc; text-align: center; }
        .footer-text { color: #64748b; font-size: 14px; margin-bottom: 16px; }
        .footer-link { color: #2563eb; text-decoration: none; }
        .footer-link:hover { text-decoration: underline; }
        .footer-brand { color: #475569; font-size: 14px; font-weight: 600; }
        .footer-brand a { color: #2563eb; text-decoration: none; }
        .footer-brand a:hover { text-decoration: underline; }
        @media (prefers-color-scheme: dark) { body { background-color: #0f172a; color: #f1f5f9; } .card { background: #1e293b; border: 1px solid #334155; } .message { color: #cbd5e1; } .info { color: #94a3b8; } .divider { background: #334155; } .footer { background: #0f172a; } .footer-text { color: #94a3b8; } .footer-brand { color: #cbd5e1; } }
        @media (max-width: 600px) { .container { padding: 10px; } .header { padding: 30px 20px; } .title { font-size: 20px; } .content { padding: 30px 20px; } .button { padding: 12px 24px; font-size: 15px; } }
    </style>
</head>
<body>
    <div class="container">
        <div class="card">
            <div class="header">
                <div class="logo">
                    <div class="logo-icon">RF</div>
                    <div class="logo-text"><span>ReplyFlow</span><span>HQ</span></div>
                </div>
                <h1 class="title">Confirm Your Email</h1>
            </div>
            <div class="content">
                <p class="message">Welcome to ReplyFlowHQ! Please confirm your email address to complete your account setup.</p>
                <div class="button-container"><a href="{{ .ConfirmationURL }}" class="button">Confirm Email Address</a></div>
                <p class="info">This link expires in 24 hours for security reasons.</p>
                <p class="info">If you didn''t create an account with ReplyFlowHQ, you can safely ignore this email.</p>
            </div>
            <div class="divider"></div>
            <div class="footer">
                <p class="footer-text">Need help? <a href="mailto:support@replyflowhq.com" class="footer-link">support@replyflowhq.com</a></p>
                <div class="footer-brand"><a href="https://replyflowhq.com">ReplyFlowHQ</a></div>
            </div>
        </div>
    </div>
</body>
</html>'
WHERE factor_type = 'signup' AND email_template IS NOT NULL;

-- Note: For Supabase, you need to configure email templates through the dashboard or API
-- This script shows the HTML content that should be used for each template type

-- Template Variables Available:
-- {{ .ConfirmationURL }} - The confirmation/reset link
-- {{ .InviterName }} - Name of the person who sent the invite (for invite emails)
-- {{ .UserEmail }} - Email address of the recipient
-- {{ .SiteURL }} - Your application URL

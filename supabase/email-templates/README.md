# ReplyFlowHQ Email Templates

This directory contains custom Supabase email templates designed to match ReplyFlowHQ branding and provide a consistent, professional email experience for all authentication-related communications.

## Templates

### 1. Password Reset (`reset-password.html`)
- **Purpose**: Sent when users request to reset their password
- **Trigger**: `resetPasswordForEmail()` function call
- **Expiration**: 1 hour
- **Features**:
  - ReplyFlowHQ branding with logo and colors
  - Mobile-responsive design
  - Dark mode support
  - Professional "Reset Password" CTA button
  - Security information and help contact

### 2. Email Confirmation (`confirm-signup.html`)
- **Purpose**: Sent when users sign up and need to confirm their email
- **Trigger**: User registration with email confirmation required
- **Expiration**: 24 hours
- **Features**:
  - Consistent ReplyFlowHQ branding
  - Welcome messaging
  - "Confirm Email Address" CTA button
  - Security and help information

### 3. Magic Link (`magic-link.html`)
- **Purpose**: Sent for passwordless sign-in
- **Trigger**: Magic link authentication requests
- **Expiration**: 1 hour
- **Features**:
  - Passwordless sign-in explanation
  - "Sign In to ReplyFlowHQ" CTA button
  - Security information

### 4. Invite User (`invite.html`)
- **Purpose**: Sent when users are invited to join a team/organization
- **Trigger**: Team member invitations
- **Expiration**: 7 days
- **Features**:
  - Inviter information display
  - "Accept Invitation" CTA button
  - Team context and welcome messaging

## Design System

### Colors
- **Primary Blue**: `#2563eb` (ReplyFlowHQ brand color)
- **Primary Dark**: `#0b1220` (Header background)
- **Secondary Dark**: `#1e293b` (Header gradient)
- **Text Primary**: `#1e293b` (Light mode) / `#f1f5f9` (Dark mode)
- **Text Secondary**: `#475569` (Light mode) / `#cbd5e1` (Dark mode)
- **Text Muted**: `#64748b` (Light mode) / `#94a3b8` (Dark mode)

### Typography
- **Font Family**: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`
- **Font Sizes**: 14px (small text), 16px (body), 20px (headers), 24px (titles)
- **Font Weights**: 400 (regular), 600 (semibold), 700 (bold)

### Components
- **Logo**: RF icon + ReplyFlowHQ text with blue accent
- **Buttons**: Rounded corners, ReplyFlowHQ blue, hover states
- **Cards**: White background with subtle shadows, rounded corners
- **Headers**: Gradient background with centered logo and title

## Implementation

### Supabase Configuration

To use these templates with Supabase:

1. **Via Supabase Dashboard**:
   - Go to Authentication → Email Templates
   - Select each template type (Recovery, Signup, Magic Link, Invite)
   - Replace the default HTML with the content from the corresponding files
   - Update subject lines as needed

2. **Via SQL** (see `setup-email-templates.sql`):
   - Run the SQL script in your Supabase SQL editor
   - The script contains the HTML content for each template
   - Note: Some templates may need to be configured via the dashboard

3. **Via API**:
   - Use the Supabase Management API to update email templates
   - Reference the HTML content in the template files

### Template Variables

All templates support these Supabase variables:
- `{{ .ConfirmationURL }}` - The confirmation/reset link
- `{{ .InviterName }}` - Name of the person who sent the invite (invite emails)
- `{{ .UserEmail }}` - Email address of the recipient
- `{{ .SiteURL }}` - Your application URL

### Customization

To customize templates:
1. Edit the HTML files in this directory
2. Update colors in the `<style>` section
3. Modify text content and messaging
4. Test changes with email preview tools
5. Update Supabase configuration

## Testing

### Local Testing
1. Use email testing services like Mailtrap or EmailJS
2. Test with different email clients (Gmail, Outlook, Apple Mail)
3. Test on mobile devices
4. Test dark mode rendering

### Production Testing
1. Send test emails to multiple email providers
2. Verify links work correctly
3. Check expiration times
4. Test spam score and deliverability

## Best Practices

### Email Deliverability
- Use inline CSS for maximum compatibility
- Keep HTML simple and semantic
- Include plain text fallback if needed
- Test spam scores before deployment
- Use proper DKIM/SPF records

### Accessibility
- Use semantic HTML structure
- Include alt text for images
- Ensure sufficient color contrast
- Test with screen readers
- Use proper heading hierarchy

### Performance
- Keep email size under 100KB
- Optimize images for email
- Use web-safe fonts
- Minimize CSS where possible
- Test load times on slow connections

## Maintenance

### Regular Updates
- Review template performance quarterly
- Update branding as needed
- Test with new email client versions
- Monitor deliverability metrics
- Update security information

### Troubleshooting
- Check Supabase email logs
- Verify template syntax
- Test with different email providers
- Check for rendering issues
- Monitor user feedback

## Support

For email template issues:
- Email: `support@replyflowhq.com`
- Documentation: Check Supabase email template docs
- Testing: Use email preview tools before deployment

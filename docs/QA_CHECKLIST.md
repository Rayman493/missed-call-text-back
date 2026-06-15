# ReplyFlow Production QA Checklist

Use this checklist before inviting beta customers to ensure all critical flows work correctly.

## 1. Signup and Billing

### Account Creation
- [ ] Navigate to signup page
- [ ] Create new account with valid email and password
- [ ] Verify email confirmation is sent (check email)
- [ ] Confirm email and redirect to onboarding
- [ ] Sign in with existing credentials works
- [ ] Sign out works correctly
- [ ] Password reset flow works
- [ ] "Forgot Password" sends reset email

### Stripe Checkout
- [ ] Start free trial from onboarding
- [ ] Stripe checkout page loads correctly
- [ ] Payment form is valid and accepts test card
- [ ] Successful checkout redirects to `/billing/success`
- [ ] Failed checkout shows appropriate error
- [ ] Trial status is correctly set in database
- [ ] Subscription status is correctly set in database

### Billing Management
- [ ] Navigate to Settings > Billing
- [ ] "Manage Billing" button opens Stripe Customer Portal
- [ ] Portal shows correct subscription details
- [ ] Can update payment method in portal
- [ ] Can cancel subscription in portal
- [ ] Portal changes sync back to ReplyFlow

### Account Deletion
- [ ] Navigate to Settings > Account
- [ ] Click "Delete Account"
- [ ] Confirmation modal appears
- [ ] Type confirmation text
- [ ] Account deletion completes
- [ ] Stripe subscription is canceled
- [ ] Auth user is deleted from database
- [ ] Business is deleted from database
- [ ] Twilio number is marked as reserved (not deleted)
- [ ] Confirmation email is sent
- [ ] User is signed out and redirected to homepage

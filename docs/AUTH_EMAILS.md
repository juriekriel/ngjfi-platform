# Sign-in emails — Supabase settings

Sign-in links must work in **any** browser: a ministry leader requests a link
on a laptop and opens it on their phone, or taps it inside the Mail app. The
default Supabase link (PKCE) only works in the exact browser tab that asked for
it, and breaks when a newer link has been requested since — that was the
"sign-in loop" of 23 Sept 2026. So every auth email links to `/auth/confirm`
with a one-time `token_hash`, which works anywhere.

## 1. URL configuration (Authentication → URL Configuration)

- **Site URL:** `https://jfindx.org`
- **Redirect URLs:** add `https://jfindx.org/**` and
  `https://deploy-preview-*--ngjfi-platform.netlify.app/**`

## 2. Email templates (Authentication → Emails → Templates)

Replace the link in each template below. Keep the rest of the wording as you like.

**Magic Link**

```html
<h2>Your sign-in link</h2>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink&next=/build">Sign in to the Index</a></p>
<p>This link works once, for about an hour, on any device.</p>
```

**Confirm signup** (first sign-in for a new address)

```html
<h2>Confirm your email</h2>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup&next=/build">Confirm and sign in</a></p>
```

**Invite user** (if invites are ever sent from the dashboard)

```html
<h2>You're invited</h2>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/build">Accept and sign in</a></p>
```

## 3. Email volume (Authentication → Emails → SMTP, and → Rate Limits)

Supabase's built-in email service allows only a few emails per hour for the
whole project — it is for testing. Before pilots, connect a provider
(Resend, Postmark, SendGrid, Amazon SES) under SMTP Settings, then raise the
email rate limit.

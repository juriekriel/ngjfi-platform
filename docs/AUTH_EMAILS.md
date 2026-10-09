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
whole project — it is for testing. Before pilots, connect **Resend** (it
already sends the waitlist mail) under SMTP Settings, then raise the email
rate limit.

1. **Verify the domain first.** In Resend, add `jfindx.org` and publish the
   SPF and DKIM records it gives you. Sign-in mail from an unverified domain
   lands in spam.
2. **A dedicated key.** Create a Resend API key with **sending access only**,
   just for Supabase Auth — not the waitlist key (`RESEND_API_KEY`).
3. **Supabase → Authentication → Emails → SMTP Settings:**

   | Setting | Value |
   |---|---|
   | Host | `smtp.resend.com` |
   | Port | `465` (SSL) — or `587` (STARTTLS) |
   | Username | `resend` |
   | Password | the dedicated API key |
   | Sender email | `no-reply@jfindx.org` |
   | Sender name | `The Jesus Index` |

4. **Authentication → Rate Limits:** raise the email limit (e.g. 100/hour).
5. **Test:** request magic links for three different addresses within a
   minute. All three should arrive in under a minute, outside spam.

The Resend plan that covers the expected volume is a spend decision —
confirm it before switching.

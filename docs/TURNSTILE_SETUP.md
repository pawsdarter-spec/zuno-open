# Turning on the sign-up bot check (Cloudflare Turnstile)

Turnstile is Cloudflare's free "are you human?" check. With it on, every new Zuno account has to pass
it, so bots can't make accounts in bulk. The browser shows the check; the **server** asks Cloudflare
whether it passed, so it can't be skipped by changing the page.

Without the keys, sign-up works exactly as before (handy for running Zuno on your own computer).

## 1. Make a widget in Cloudflare

1. Sign in at dash.cloudflare.com and open **Turnstile** (it's free, no domain needed).
2. **Add widget**. Give it a name like "Zuno sign-up".
3. Add every address people open Zuno on, hostname only (no `https://`, no path): for example
   `zuno-tau7.onrender.com`, plus your own domain if you have one. Add `localhost` too if you want
   to try it locally.
4. Pick **Managed** and save.
5. Cloudflare shows a **Site Key** (public) and a **Secret Key** (private).

Cloudflare's own guide: https://developers.cloudflare.com/turnstile/get-started/

## 2. Give Zuno the keys

In the Render dashboard, open the Zuno service › **Environment** and add:

| Variable | Value |
| --- | --- |
| `TURNSTILE_SITE_KEY` | the Site Key |
| `TURNSTILE_SECRET_KEY` | the Secret Key |
| `TURNSTILE_HOSTNAME` | optional: the address you expect, like `zuno-tau7.onrender.com`. Tokens made anywhere else are refused. |
| `ZUNO_REQUIRE_TURNSTILE` | optional: `1` makes Zuno refuse sign-ups while the keys are missing, instead of letting them through. |

Save; Render restarts Zuno with them. **Settings › Setup Status** (staff) and the Admin Dashboard
show "Sign-up bot check" as on.

The secret key must only ever live in Render's Environment tab. Never put it in the code, a
committed `.env` file, a screenshot or a chat. If it leaks, make a new one in Cloudflare (rotate the
secret on the widget) and update Render. The browser only ever gets the site key, through
`GET /api/public-config`.

## 3. What people see

1. They open **Register**; the check appears above **Continue** (often it passes by itself).
2. Zuno sends the one-use token with the sign-up.
3. The server asks Cloudflare (`siteverify`) and only makes the account if Cloudflare says it passed,
   the action is `register`, and (with `TURNSTILE_HOSTNAME`) it came from your site.
4. If it fails, the check resets so they can try again.

Logging in doesn't use the check; it already has its own limits per account and per address.

## 4. Check it works

- Open Zuno in a private window and pick **Register**: the check shows and sign-up works.
- Try signing up with the check not done: Zuno says to complete it first.
- Log in to an existing account: no check, works as normal.
- Widget doesn't show? Check the hostname list in Cloudflare and that the site and secret key are
  from the same widget, then look at the browser console and the Render logs. Zuno's Content
  Security Policy already allows `https://challenges.cloudflare.com`.

If Cloudflare can't be reached, sign-ups pause with "Bot verification is temporarily unavailable"
rather than letting everyone through.

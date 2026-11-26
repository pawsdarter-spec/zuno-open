# Zuno Employee Dashboard

The staff-only Employee Dashboard replaces the old profile-popout badge manager and the separate Moderation entry in Settings. Open **Settings → Employee Dashboard** while signed in with a Zuno Staff account.

## Included tools

- Search user accounts by username, display name, or user ID.
- Grant and remove staff-managed badges. Existing server-side badge rules remain in force, including founder/manager protections and re-authentication for sensitive badge changes.
- Edit a user's username, display name, and pronouns.
- Remove profile content (bio, pronouns, display name, avatar, banner, background, profile sound, and widgets) using the existing profile-moderation workflow.
- Issue warnings, timeouts, and account bans through the existing moderation system. Bans retain the existing appeal and restoration rules and require password re-authentication.
- Mute and unmute a user's ability to send messages for a selected duration.
- Apply or remove a DM-only restriction. A restricted account can continue using DMs and DM calls, but cannot post in server channels or threads or join server voice calls. Existing server voice sessions are ended when the restriction is applied.
- Put usernames on hold or blacklist them, and put server vanity names on hold. Policies are persisted and enforced by the server during registration, username changes, and server vanity updates.

## Account Standing

Account Standing already existed in the original Zuno source. It continues to show recent warnings, timeouts, bans, and moderation history. It now also reports active message mutes and the DM-only restriction.

## One-time staff sign-in

The Employee Dashboard has a second password prompt in addition to the normal Zuno staff account. Staff enter the dashboard password once per signed-in Zuno session; the unlock is stored only on the server-side session and expires after 12 hours. Signing out or ending the Zuno session removes that unlock. Failed attempts are rate-limited.

For deployment, set the environment variable `ZUNO_STAFF_DASHBOARD_PASSWORD` on the server to the password chosen by the Zuno owner. On Render, open the service's **Environment** settings, add that key, paste the password as its value, save, and redeploy/restart. For local development, set the same environment variable in the shell before running `npm start`. Do not put the password in `server/config.js`, client JavaScript, or a committed `.env` file. If the variable is missing, dashboard sign-in fails closed.

The password is an additional gate, not a replacement for Zuno staff roles: a user must still be an authorized staff account. The server checks both staff status and the session unlock for Employee Dashboard APIs, badge changes, and moderation APIs. Existing permission hierarchy, founder/manager protections, and password re-authentication for especially sensitive actions remain in force. Employee actions are written to the moderation log. DM-only and mute restrictions are enforced server-side, not just by hiding controls in the client.

## Tests

Run `npm test` from the project folder. The security suite includes checks for staff-only access, profile identity updates, badge changes, held usernames, held server vanities, DM-only message/call restrictions, DM availability, mute enforcement, and Account Standing metadata.


## Performance improvements

The message scam-warning scanner now runs when messages are rendered instead of polling the open chat every two seconds. It builds one message-ID lookup per scan rather than searching the full message list for every visible row. This reduces repeated idle work and avoids the previous quadratic lookup pattern in long conversations. The existing Appearance → Performance mode remains available to disable expensive visual effects on slower devices.

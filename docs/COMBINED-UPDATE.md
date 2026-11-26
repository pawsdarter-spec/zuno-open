# Zuno 0.54 Combined Update

This build combines the Zuno 0.54 profile/channel update with the Employee Dashboard and staff dashboard authentication.

Included: channel mentions and navigation, self-profile access, channel Flair, profile background opacity, profile metrics/comments/frames, Employee Dashboard, staff sign-in gate, staff moderation tools, and server vanity eligibility rules.

Configure `ZUNO_STAFF_DASHBOARD_PASSWORD` on the server before deploying. Keep the password out of source control and frontend files. The dashboard password is an additional gate; it does not replace staff-role authorization.

The service worker cache was bumped so clients fetch the combined assets.

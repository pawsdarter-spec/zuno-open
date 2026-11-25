# Security hardening and raid response

Zuno already includes server-side request shielding, per-route rate limits, account/login throttles,
Cloudflare Turnstile verification, password hashing, session cookies, authorization checks, private
attachment checks, security headers/CSP, and load shedding. The browser is not a security boundary:
all meaningful checks must remain on the server.

## Required production settings

Configure these as environment variables in the hosting provider (never commit secrets):

- `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY`: Cloudflare Turnstile keys for the production hostname.
- `TURNSTILE_HOSTNAME`: the exact hostname expected from Turnstile, for example `heyzuno.uk`.
- `ZUNO_REQUIRE_TURNSTILE=1`: fail closed if Turnstile is not configured; without this, registrations remain open when keys are absent.
- Keep `ZUNO_TRUST_XFF` disabled unless Zuno is directly behind a trusted proxy whose forwarding headers are overwritten.
  On Render, the server has its own trusted-proxy handling. Do not expose the Node server directly while trusting client-supplied forwarding headers.
- `ZUNO_SHIELD_MAX` can tune the global request ceiling; change it only after observing real traffic and load tests.

## Network blocks and IP privacy

The existing `ZUNO_BLOCK` setting rejects requests whose observed address begins with one of the configured
prefixes, for example `ZUNO_BLOCK=198.51.100.,203.0.113.`. Use this only for a verified abusive network.
It is a network-wide block, not a reliable identity check: VPNs, mobile carriers, schools, offices, and
households can share addresses, and attackers can change addresses. It can therefore block innocent users.
Prefer account bans and short-lived rate limits for individual abuse.

Zuno deliberately does not persist full IP addresses. Its visitor limiter uses a keyed, in-memory tag that
changes on restart; its network shield temporarily groups visitors by a coarse network. Do not add permanent
raw-IP account histories or automatically ban every account sharing an IP. If network-level blocking is
necessary, keep it time-limited, narrowly scoped, access-controlled, and documented in the privacy notice.

## Username policy

Registration is enforced by `server/namefilter.js`; `public/app.js` adds matching immediate feedback only.
The server check is authoritative and rejects usernames containing the reserved platform names in `server/namefilter.js`, including
punctuation-separated attempts that normalize to those strings.

## Frontend and backend boundaries

- Frontend validation is for usability only and can be bypassed by direct HTTP requests.
- Never trust a client-supplied user ID, role, ban state, IP address, or bot flag.
- Keep authorization, rate limits, input validation, upload validation, and bot verification on the server.
- Keep session cookies HttpOnly/SameSite and use HTTPS in production.
- Configure the hosting platform's DDoS/WAF protections as well; application-level controls cannot absorb
  volumetric attacks that saturate the network before requests reach Node.

## Verification

Run `npm test` with Node.js 22+ from the project root. The security suite now includes server-side tests
for the reserved names in usernames and punctuation bypasses. These tests do not simulate a real
distributed botnet, upstream DDoS, production proxy configuration, or Cloudflare WAF behavior.

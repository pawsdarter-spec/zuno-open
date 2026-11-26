# Zuno Website Update Publisher (0.55.0)

The founder-only Admin Dashboard now includes a Website Update Publisher.

## Publish an update notice

1. Deploy the new Zuno server/static files to your hosting provider first.
2. Open Settings → Admin Dashboard → Website update publisher.
3. Enter a version, popup title, summary, and optional bug-fix list (one item per line).
4. Select **Preview & Publish Update**, review the exact popup, then publish.
5. Online users receive the release notice over Zuno's live event stream. Offline users receive it on their next app session. Users can choose Later or Refresh Zuno.

## Important deployment note

This panel publishes release notes and tells clients to reload. It does not upload source code, run a hosting deployment, or restart the Node server. Deploy the code through Render/your hosting provider or CI/CD first; then publish the announcement. The service worker shell cache was bumped to v59 so a reload installs the newly deployed frontend assets.

## Security

Both publishing and the admin dashboard endpoint are protected by the existing founder-only `needFounder` server check. The browser UI is not the security boundary.

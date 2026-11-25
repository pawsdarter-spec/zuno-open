# Contributing to Zuno

Thanks for helping! Everything you need is in **[docs/DEVELOPING.md](docs/DEVELOPING.md)**:

- how to run Zuno locally (`npm start`, `npm test`; Node 22+, no packages to install)
- where every setting lives (most are in `server/config.js`; secrets are environment variables)
- how the server and app are put together, and the pattern newer files use to add to older ones
- a checklist for adding a feature, and the security rules every change must follow

The short version: work on a branch, keep comments in plain language, run `npm test`, and never put
keys or passwords in the code.

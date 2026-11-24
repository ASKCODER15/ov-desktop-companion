# Contributing to OV

Thanks for helping improve OV. The project is an Electron-based Windows desktop companion with local AI and an optional mobile remote.

## Before opening an issue

- Search existing issues to avoid duplicates.
- Use the bug-report or feature-request template.
- Include the OV version, Windows version, reproduction steps, and relevant logs.
- Remove personal information, bearer tokens, PINs, private paths, Wi-Fi names, notification text, and clipboard contents.
- For security vulnerabilities, follow `SECURITY.md` instead of opening a public issue.

## Development setup

1. Use Windows 10/11 for the desktop runtime and native Windows integrations.
2. Install a supported Node.js release and npm.
3. Clone the repository and run `npm install` from the project root.
4. Start the app with `npm start`.
5. Run `npm run verify` before submitting changes. Run `npm run build:apk` only when changing mobile packaging (requires JDK 17+ and Android SDK 34 according to the current project report).

Check the current `package.json` scripts before relying on a command; the project is evolving.

## Pull request expectations

- Keep changes focused and explain the user-facing impact.
- Describe the problem, solution, and important trade-offs.
- Include test commands and the actual results from the current checkout.
- Add screenshots or a short recording for visible UI changes, using sanitised demo data only.
- Update documentation when behaviour, permissions, settings, or setup steps change.
- Do not commit generated APKs, signing keys, auth tokens, `.env` files, user settings, local chat history, notification databases, or machine-specific logs.
- Do not introduce cloud dependencies or telemetry without documenting the data flow and obtaining maintainer review.
- Preserve Electron security settings and validate all IPC inputs and external URLs.

## Commit and review

Use clear commit messages, for example `fix: validate mobile pairing input` or `docs: clarify local model setup`. Pull requests should be reviewable, include a rollback consideration for risky changes, and pass the project's verification suite.

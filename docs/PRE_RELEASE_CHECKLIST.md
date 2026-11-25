# Important: Public Release Checklist

This checklist is a release gate. Complete it against the exact commit that will become public.

## 1. Product identity migration

- [ ] Confirm the public product name is **OV** everywhere it is visible to users.
- [ ] Decide whether internal identifiers remain for compatibility or are renamed in a dedicated migration.
- [ ] Search the source for `AURA`, `PetFish`, `petfish`, old tray labels, old app names, old API response values, and old local-data paths.
- [ ] If changing `%LOCALAPPDATA%\\PetFish`, implement a safe migration that preserves existing user settings, auth material, tasks, and chat history. Do not simply change the path and strand user data.
- [ ] Update `package.json` name/description only after checking the packaging/build scripts and any imports or update workflows that depend on the old package name.
- [ ] Update Windows shortcuts, installer metadata, mobile labels, app icons, and documentation consistently.

## 2. Intellectual property & licensing — mandatory review

The V8 public release replaces earlier superhero/animal placeholders with four original OV industrial robots (**Kronos** — Interstellar 4-Slab Monolith, **Aegis** — Bipedal Field Mech, **Optix** — Deep Research Rover, and **Orbit** — Autonomous Synth Pod), 16 original hardware skins, local open-source Whisper (`faster-whisper`) voice control (`A+S+W`), and neutral music search links. Before publishing, independently verify:

- [ ] Review all companion visuals, skin names, voice profiles, UI copy, posters (`docs/posters/`), icons, and mobile assets to confirm no unintended third-party trademarks, likenesses, or copyrighted material remain.
- [ ] Confirm that any third-party fonts, icons, or tools referenced or bundled have licenses compatible with public distribution.
- [ ] Do not assume that adding a “fan-made” or “not affiliated” disclaimer gives permission to distribute copyrighted or trademarked material.
- [ ] Ensure the MIT license applies only to material the project is authorised to license. Add separate notices for third-party components where required.
- [ ] Confirm the correct legal copyright holder is named in `LICENSE`; replace the generic `OV contributors` line if needed.

## 3. Security and privacy hygiene

- [ ] Confirm no `.auth-token`, `mobile-auth.json`, `mobile-signing.jks`, `*.jks`, `*.keystore`, APK, private key, `.env`, user settings, task database, chat history, clipboard dump, notification database, or local logs are staged.
- [ ] Run `git status --short` and inspect every staged file with `git diff --cached --stat` and `git diff --cached`.
- [ ] Search the repository and commit history for secrets, personal names, home/work paths, Wi-Fi SSIDs, device names, LAN IPs, pairing links, PINs, bearer tokens, and real notification content.
- [ ] Verify demo screenshots use sanitised data. The project report describes a `--verify-render` mode that substitutes demo values; inspect all exported posters manually.
- [ ] Confirm the hook server binds only to loopback and that mobile remote/tunnel mode remains opt-in.
- [ ] Verify no production token, signing key, or account credential is stored in source control or GitHub Actions logs.
- [ ] Ensure the security policy's private reporting route is enabled in GitHub repository settings.

## 4. Verification on the release commit

- [ ] Run `npm install` from a clean checkout.
- [ ] Run `npm run verify` and save the output from the exact release commit.
- [ ] Run `electron . --verify-render` if supported by the current checkout; inspect all exported companion renders and posters.
- [ ] Build the Android APK with `npm run build:apk` if the mobile package is part of the release. Do not upload signing keystores.
- [ ] Test on a clean Windows user profile, not only the developer's machine.
- [ ] Test with Ollama unavailable, LM Studio unavailable, and both available; confirm the app fails gracefully when no local model is running.
- [ ] Test mobile pairing, expired PINs, incorrect tokens, token rotation, offline queue replay, and stopping the tunnel.
- [ ] Test Allow/Deny flows and confirm unsafe actions remain user-controlled.
- [ ] Confirm install, start, stop, uninstall, and data-retention behaviour are documented.

## 5. GitHub repository setup

- [ ] Set repository name to `ov-desktop-companion` (or the final chosen slug).
- [ ] Add the repository description and topics from `GITHUB_REPOSITORY_METADATA.md`.
- [ ] Upload `docs/assets/ov-github-social-preview.png` as the GitHub social preview image.
- [ ] Set the repository avatar/logo using `docs/assets/ov-github-avatar.png` where the repository/account settings allow it.
- [ ] Enable Issues and Discussions only if they will be actively maintained.
- [ ] Enable private vulnerability reporting.
- [ ] Enable Dependabot alerts and secret scanning where available.
- [ ] Add a release with version, supported platform, checksums, and clear installation instructions only after the artifacts are verified.
- [ ] Confirm the README, license, security policy, and contribution guide match the actual code and distribution terms.

## 6. Final staged-file check

```powershell
git status --short
git diff --cached --stat
git diff --cached
```

Do not publish until every mandatory item above is addressed. The documentation kit does not itself audit the source code, verify the current build, or grant third-party IP rights.

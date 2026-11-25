# Third-Party Notices & Intellectual Property Disclosures

The MIT License in [`LICENSE`](LICENSE) applies **only** to original source code, original procedural artwork, original UI templates, original synthesized audio motifs, and documentation created by OV contributors and lawfully distributable under the MIT License.

---

## 1. Direct & Development Dependencies

OV has **zero external runtime npm dependencies** (`dependencies` is empty in `package.json`).

| Package | Scope | License | Purpose |
| :--- | :--- | :--- | :--- |
| **Electron** (`electron@^35.7.5`) | `devDependencies` (desktop runtime) | MIT (bundles Chromium, Node.js, V8, and third-party components under their respective open-source licenses) | Local desktop application shell on Windows |

For the full list of licenses bundled inside Electron/Chromium, see `node_modules/electron/dist/LICENSES.chromium.html` after running `npm install`.

---

## 2. Optional External Tools & Trademarks Referenced

OV integrates with or launches user-installed local tools and operating-system services. All product names, logos, and trademarks belong to their respective owners; OV is **not** affiliated with, endorsed by, or sponsored by any of the following:

- **Microsoft Windows**, **PowerShell**, **WinRT**, **Windows OneCore Voices**, **Visual Studio Code** — trademarks of Microsoft Corporation.
- **Ollama** — trademark of Ollama Inc.
- **LM Studio** — trademark of Element Labs, Inc.
- **Claude / Claude Code** — trademarks of Anthropic, PBC.
- **Cursor** — trademark of Anysphere, Inc.
- **Brave** — trademark of Brave Software, Inc.
- **Cloudflare / cloudflared** — trademarks of Cloudflare, Inc.
- **Android / Android SDK** — trademarks of Google LLC.
- **OpenAI Whisper / `faster-whisper`** — open-source MIT-licensed speech recognition model/runtime installed locally by the user for offline voice commands (`A + S + W`).
- **Spotify**, **YouTube**, **WhatsApp**, **Discord**, **GitHub** — trademarks of their respective owners.
- **shadcn/ui** — MIT-licensed UI component reference studied solely for visual design principles (spacing, typography hierarchy, neutral surfaces); no code or packages from `shadcn-ui/ui` are copied or bundled.

---

## 3. Original OV Robot Designs & User-Local Assets

- **Redistributable OV Robot Units:** **Kronos** (4-Slab Articulated Monolith), **Aegis** (Bipedal Field Mech), **Optix** (Deep Research Rover), and **Orbit** (Autonomous Synth Pod) are original procedural vector/canvas designs created for OV, paired with synthesized Web Audio motifs. No copyrighted third-party character artwork, movie stills, logos, or soundtrack files are distributed in this repository.
- **User-Local Custom Companions:** Any custom artwork uploaded by a user inside the **Companion Creator** is stored strictly locally on the user's computer (`%LOCALAPPDATA%\PetFish\custom-heroes\`), excluded from Git, and never uploaded to external servers. Users are solely responsible for ensuring they hold the rights to any local artwork they choose to import or share.
- **No Legal Advice / No Formal Legal Clearance Claim:** This notice is provided for transparency and good open-source hygiene. It does not constitute legal advice or formal legal clearance, and a disclaimer is never a substitute for permission where third-party rights apply. Maintainers should perform independent legal review before broad commercial or public binary distribution.

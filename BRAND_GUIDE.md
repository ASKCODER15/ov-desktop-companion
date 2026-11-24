# OV Brand Guide

## Brand identity

- **Name:** OV
- **Product descriptor:** Local-first AI desktop companion
- **Primary tagline:** A living AI companion for your desktop.
- **Visual character:** Engraved, tactile, bold, technical, and memorable.

## Logo concept

The OV mark is a custom interlocked lettermark inside a rounded-square badge. Its layered, thick contour lines and engraved hatching give it a tactile identity that stands apart from the usual gradient orb or generic AI-brain symbol.

The design is intentionally monochrome first. Keep its linework, proportions, rounded-square frame, and contrast intact.

## Approved palette

| Token | Value | Use |
|---|---|---|
| Ink | `#080A0E` | Primary dark mark and text |
| Paper | `#FFFFFF` | Light backgrounds and reverse mark |
| Midnight | `#0B0D11` | Dark banners and presentation backgrounds |
| Slate | `#D3D8E0` | Secondary text on dark backgrounds |
| Muted slate | `#9AA5B5` | Supporting labels on dark backgrounds |

## Approved files

| File | Intended use |
|---|---|
| `docs/assets/ov-mark-black-transparent.png` | Primary mark on light backgrounds |
| `docs/assets/ov-mark-white-transparent.png` | Reversed mark on dark backgrounds |
| `docs/assets/ov-logo-white-background.png` | White-background logo presentation |
| `docs/assets/ov-github-avatar.png` | Square repository/profile artwork |
| `docs/assets/ov-icon.ico` | Windows icon asset; verify app packaging references before replacing the existing icon |
| `docs/assets/ov-github-social-preview.png` | GitHub repository social preview (1280 × 640) |
| `docs/assets/ov-system-overview.svg` | README and documentation architecture visual |

## Clear-space and sizing

- Use the full rounded-square emblem without cropping its outer frame.
- Keep a clear margin around the mark of at least 8% of the artwork width.
- Use the 512px avatar for repository/profile surfaces and the 1024px transparent files for README and release visuals.
- The engraved hatch detail is part of the identity. Avoid reducing the full mark below 48px where possible; at smaller sizes, use the 512px avatar and check legibility in the actual interface.
- Do not stretch, skew, rotate, recolour individual strokes, add shadows, or place the black mark on a dark background without switching to the white version.

## GitHub placement

1. Place the logo near the top of `README.md` using the black transparent mark on GitHub's light rendering or the white mark on a dark surface.
2. Set `ov-github-social-preview.png` in **Repository Settings → General → Social preview**.
3. Use `ov-system-overview.svg` as the README's product architecture visual.
4. Keep screenshots and diagrams consistent with the monochrome mark. Do not add unrelated AI gradients or generic glowing orb motifs.

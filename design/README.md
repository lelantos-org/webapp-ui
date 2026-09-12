# Wallet design — v2

The target design for `webapp-ui`. **This folder is the source of truth for what the
app should look like** — when code and these files disagree, the files win.

Live, pannable version: https://claude.ai/code/artifact/abae8176-aaf5-4f04-aeb3-012d76752411
(open the **wallet — v2** page from the pages menu).

## Pointing Claude at it

Name the screen, not "the design":

> Make `src/features/assets/ShieldedTable.tsx` match `design/screens/home.dc.html`.

"Apply the design" has been read as "apply the tokens" before — the palette and fonts
landed while the layouts did not. A named file is unambiguous.

## What is canonical

Everything in `screens/` is current. Where one screen has several artboards, the more
specific one wins:

- **`home.simplified`** is the target Home. `home` is the earlier, busier version kept
  for comparison — its five-column table and extra cards were deliberately cut back.
- **`*.review`** screens are part of the Send and Unshield flows, not alternatives to them.
- **`*.paper`** are the light theme. Dark is the default.
- **`ux-findings`** is a written critique, not a screen.

### Home

| Canvas title | File |
|---|---|
| Home | `screens/home.dc.html` |
| Home — simplified | `screens/home.simplified.dc.html` |
| Home — syncing | `screens/home.syncing.dc.html` |
| Home — nothing shielded | `screens/home.empty.dc.html` |
| Home — mobile | `screens/home.mobile.dc.html` |
| Home — syncing, mobile | `screens/home.syncing.mobile.dc.html` |
| Available assets | `screens/available-assets.dc.html` |

### Onboarding

| Canvas title | File |
|---|---|
| Welcome / connect | `screens/welcome.dc.html` |

### Actions

| Canvas title | File |
|---|---|
| Shield | `screens/shield.dc.html` |
| Shield — choose an asset | `screens/shield.choose-asset.dc.html` |
| Shield — mobile | `screens/shield.mobile.dc.html` |
| Send privately | `screens/send.dc.html` |
| Send · review | `screens/send.review.dc.html` |
| Send — mobile | `screens/send.mobile.dc.html` |
| Unshield | `screens/unshield.dc.html` |
| Unshield · review | `screens/unshield.review.dc.html` |
| Unshield — mobile | `screens/unshield.mobile.dc.html` |
| Swap | `screens/swap.dc.html` |
| Swap — mobile | `screens/swap.mobile.dc.html` |
| In-flight / settled / failed | `screens/progress.dc.html` |

### Claim links

| Canvas title | File |
|---|---|
| Send by link | `screens/send-by-link.dc.html` |
| Claim-link vault | `screens/claim-link-vault.dc.html` |
| Claim (recipient) | `screens/claim.dc.html` |
| Claim — mobile | `screens/claim.mobile.dc.html` |

### System

| Canvas title | File |
|---|---|
| Design system | `screens/design-system.dc.html` |
| States | `screens/states.dc.html` |
| States added in 2.1 | `screens/states.added.dc.html` |

### Light theme

| Canvas title | File |
|---|---|
| Home — warm paper | `screens/home.paper.dc.html` |
| Shield — warm paper | `screens/shield.paper.dc.html` |
| Swap — warm paper | `screens/swap.paper.dc.html` |

### Reference

| Canvas title | File |
|---|---|
| UX findings | `screens/ux-findings.dc.html` |

### Brand

| File | What |
|---|---|
| `brand/identity.dc.html` | The final identity sheet: mark, wordmark, lockups, rules |
| `brand/icon.svg` | App icon — already copied to `public/icon.svg` |
| `brand/icon-maskable.svg` | Maskable PWA icon source |
| `brand/mark.svg` | The mark alone, `currentColor` |

## Reading these files

Each `.dc.html` is one artboard from the design canvas. **They do not render on their
own** — they reference `./support.js`, which only exists inside the canvas editor. To
*see* a screen, use the link above. To *read* one, open it as text: every value is an
inline style, so exact spacing, sizes and colours are right there in the markup.

Colours are written against the same token names as `src/styles/tokens.css`
(`var(--bg-1)`, `var(--accent)`, …), so a value in a file maps directly onto the code.

## Tokens already implemented

Palette (both themes), fonts, radii, and the brand mark are in the code. What remains is
**structure** — see `ux-findings` and compare each screen against its component.

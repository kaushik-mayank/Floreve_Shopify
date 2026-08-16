# Florève — Shopify theme

A custom Online Store 2.0 theme for **Florève, Maison de Joaillerie**.

Built on Shopify Liquid, JSON templates, section groups, CSS and dependency-free
JavaScript. No frameworks, no external runtime, no third-party requests.

---

## Installing

1. Zip the contents of this folder so that `layout/`, `sections/`, `templates/`,
   `snippets/`, `assets/`, `config/` and `locales/` sit at the **root** of the
   archive (not inside a `theme/` folder).
2. Shopify admin → **Online Store → Themes → Add theme → Upload zip file**.
3. Preview, then **Publish**.

Or with Shopify CLI, from inside this folder:

```
shopify theme dev      # local preview
shopify theme push     # upload
```

---

## First-run checklist

The theme ships ready to look complete, but it is deliberately empty of claims
you have not made. Work through these in Shopify admin:

| Where | What to do |
| --- | --- |
| **Navigation** | Create a `main-menu` and a `footer` menu. Nested menus render as a dropdown; three levels render as a mega menu. |
| **Theme settings → Brand** | The Florève lockup is bundled. Upload replacements only if the official artwork changes. |
| **Theme settings → Cart** | Choose the slide-out bag or the bag page. |
| **Homepage** | Add images to the Hero, Editorial story, Chapters, Collection showcase and Invitation sections. |
| **Collections** | Set a collection image — the collection heading section uses it as a banner. |
| **Collections → Filters** | Add Shopify's storefront filters. The theme renders whatever you enable. |
| **Pages** | Create `about` and `contact` pages; the theme includes matching templates. |
| **Policies** | Fill in shipping, returns and privacy — the footer links to them automatically. |
| **Products** | See "Product metafields" below. |

### Homepage sequence

The default homepage moves a visitor through recognition → intrigue →
product → craft → discovery → desire → action:

`Hero → Brand statement → Signature collection → Botany (editorial) →
Collection showcase → Craft (editorial) → Chapters → Running line →
Statement → Invitation`

Every section can be reordered, duplicated or removed in the theme editor.

---

## Product metafields

The product template has two **expandable row — metafield** blocks so that
materials and care live with the product rather than in the theme. Create these
in **Settings → Custom data → Products**:

| Namespace and key | Type | Shown as |
| --- | --- | --- |
| `custom.materials` | Rich text | "Materials and measurements" |
| `custom.care` | Rich text | "Care" |

A row with nothing in it does not render. You can point the blocks at any other
namespace and key, add more rows, or swap them for the **expandable row — page**
block to reuse a shared shipping or returns page.

---

## Badges

Badges are only ever drawn from real data:

- **Sold out** — from Shopify inventory.
- **On sale** — only when a compare-at price is actually set.
- **Anything else** — add a product tag in the form `badge:Made to order`.

The theme will not invent scarcity, popularity or social proof.

---

## Structure

```
assets/
  base.css          design tokens, primitives, colour schemes
  components.css    header, cards, product, cart, footer, sections
  theme.js          drawers, cart, variants, gallery, facets, search
  floreve-logo.png        transparent lockup
  floreve-logo-light.png  lockup for dark grounds
  floreve-mark.png        calyx mark alone
config/             theme settings schema and defaults
layout/             theme.liquid, password.liquid
locales/            en.default.json
sections/           section groups, page sections, main-* templates
snippets/           product card, price, facets, variant picker, icons …
templates/          JSON templates + customer and gift card templates
```

### Colour schemes

Sections take a colour scheme rather than individual colours, so the palette
stays coherent: `parchment`, `white`, `alt` (warm parchment), `dark`
(atelier black), `sage`, `blush`. Each scheme redefines a small set of
`--scheme-*` tokens that every component reads from.

### The palette rule

Parchment dominates. Champagne gold is an accent — the calyx mark, hairline
rules, eyebrow labels — and is never a background. Body copy is warm grey, not
black. Nothing is bold.

---

## Behaviour notes

- **JavaScript is an enhancement.** Add to bag, filtering, search, variant
  selection and pagination all work without it; the script upgrades them to
  in-place updates.
- **Cart** uses `/cart/add.js` and `/cart/change.js` with the Section Rendering
  API. Any element marked `data-cart-section="{{ section.id }}"` refreshes
  automatically.
- **Recommendations** load themselves from Shopify's product recommendations
  route when they scroll into view, and render nothing when there is no data.
- **Motion** is disabled wholesale for visitors who prefer reduced motion, and
  can be turned off for everyone in **Theme settings → Motion**.
- **Search** uses Shopify predictive search; the section `predictive-search` is
  fetched by the search panel and is not meant to be placed on a page.

---

## Accessibility

Semantic landmarks, one `h1` per page, visible gold focus rings, keyboard-
operable drawers with focus trapping and `Escape` to close, labelled form
fields, alt text from Shopify image data, and `prefers-reduced-motion` support
throughout. Unavailable variant combinations are struck through rather than
hidden so no selection is a dead end.

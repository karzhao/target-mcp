# Target MCP Server

MCP server for Target store lookups, product info, and product search.

## Tools

### `find_stores`
Find Target stores near a ZIP code (maps ZIP to state via prefix, lists all stores in that state).

```json
{
  "zip": "07624"
}
```

Returns store name, address, phone, and URL.

### `lookup_product`
Look up a Target product by TCIN (product ID).

```json
{
  "tcin": "92557848"
}
```

Returns product title, price (when available), image, and URL.

### `search_products`
Search Target products by keyword. Uses a headless browser (Playwright) to bypass anti-bot protections.

```json
{
  "query": "pickleball",
  "limit": 10
}
```

Returns title, TCIN, price, brand, rating, stock status, image, and buy URL.

## Setup

```bash
npm install && npm run build
```

Playwright Chromium browser (~94MB) is downloaded automatically during `npm install`.

## Usage with Claude

Add to your `opencode.json`:

```json
{
  "mcpServers": {
    "target": {
      "command": "node",
      "args": ["path/to/target-mcp/dist/server.js"]
    }
  }
}
```

## Limitations

- Product prices may not always be available (loaded via client-side API)
- Store availability can only be checked for one store at a time (the CDUI API only returns the primary store)
- Search takes ~10s due to headless browser startup and page load

## Scraping strategy

This project followed the [scraping skill](.agents/skills/scraping/SKILL.md) methodology:

1. **Reconnaissance**: Inspected Target's public web surface to discover data sources — the Redsky API (captcha-protected, unusable), the Sapphire runtime API (requires authenticated session), and the CDUI orchestration API (SPA internal, accepts URL parameter overrides).
2. **Least-resistance approach**: Used plain HTTP scraping for pages that don't require JavaScript (store directory, PDP), and reserved Playwright for the search flow where all product data is delivered client-side.
3. **Playwright interception**: Instead of parsing DOM, the SPA's CDUI API response is intercepted (`cdui_orchestrations/v1/pages/slp`) — delivering 276KB of structured JSON with products, prices, ratings, and per-store fulfillment.
4. **Store context override**: Target uses IP geolocation for default store selection. The CDUI request is modified to inject `purchasable_store_ids`, lat/lng (resolved via Zippopotam.us), and ZIP — scoping availability to the user's chosen store.

## How it works

- **Stores**: Scrapes the state store directory (`/store-locator/store-directory/{state}`), then individual store pages (`/sl/{name}/{id}`) for address and phone. ZIP codes are mapped to US states by prefix.
- **Product lookup**: Scrapes the PDP page (`/p/-/A-{tcin}`) for title and image.
- **Product search**: Uses Playwright to load the search page, intercepts the CDUI orchestration API response, and extracts products with prices, brands, ratings, per-store pickup/in-store availability, and shipping stock. `store_id` and `zip` (from `find_stores`) are required to scope results to a specific store.

Concurrency: store details are scraped 5 at a time. Large states (e.g. CA with ~158 stores) take ~30s.

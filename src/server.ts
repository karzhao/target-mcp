import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { findStoresByZip, lookupProduct, searchProducts } from "./api.js";

const server = new McpServer(
  { name: "target-mcp", version: "1.0.0" },
  {
    capabilities: { tools: {} },
    instructions:
      "MCP server for Target store data. Find stores by ZIP code, look up product details by TCIN, and search products by keyword.",
  }
);

server.registerTool("find_stores", {
  description:
    "Find Target stores near a ZIP code. Returns store names, addresses, phone numbers, and store URLs.",
  inputSchema: {
    zip: z
      .string()
      .length(5)
      .describe("5-digit US ZIP code to search for nearby Target stores"),
  },
  annotations: { readOnlyHint: true },
}, async ({ zip }) => {
  try {
    const stores = await findStoresByZip(zip);
    if (stores.length === 0) {
      return {
        content: [{ type: "text", text: `No Target stores found near ${zip}.` }],
      };
    }
    const lines = stores.map(
      (s, i) =>
        `${i + 1}. **${s.name}** (ID: ${s.store_id})\n` +
        `   ${s.address}\n` +
        (s.phone ? `   Phone: ${s.phone}\n` : "") +
        `   ${s.url}`
    );
    return {
      content: [
        {
          type: "text",
          text: `Found ${stores.length} Target store(s) near ${zip}:\n\n${lines.join("\n\n")}`,
        },
      ],
    };
  } catch (err) {
    return {
      content: [{ type: "text", text: `Error: ${err}` }],
      isError: true,
    };
  }
});

server.registerTool("lookup_product", {
  description:
    "Look up a Target product by its TCIN (product ID). Returns title, price, and image.",
  inputSchema: {
    tcin: z
      .string()
      .describe("Target TCIN - found in product URLs like /-/A-92557848"),
  },
  annotations: { readOnlyHint: true },
}, async ({ tcin }) => {
  try {
    const info = await lookupProduct(tcin);
    const lines = [
      `**${info.title}**`,
      `TCIN: ${info.tcin}`,
      info.price !== null ? `Price: $${info.price.toFixed(2)}` : "Price: Not available",
      `URL: ${info.buy_url}`,
    ];
    if (info.image_url) {
      lines.push(`Image: ${info.image_url}`);
    }
    return {
      content: [{ type: "text", text: lines.join("\n") }],
    };
  } catch (err) {
    return {
      content: [{ type: "text", text: `Error: ${err}` }],
      isError: true,
    };
  }
});

server.registerTool("search_products", {
  description:
    "Search Target products by keyword. Returns product titles, TCINs, prices, images, brands, ratings, shipping stock status, and per-store pickup/in-store availability at a specific store. REQUIRES store_id and zip from find_stores results. Uses a browser to bypass anti-bot protections (~10s).",
  inputSchema: {
    query: z.string().min(1).describe("Search keyword (e.g. 'pickleball', 'coffee maker')"),
    limit: z.number().min(1).max(50).default(10).describe("Max results (default 10, max 50)"),
    store_id: z.string().describe("Store ID to check pickup/in-store availability (from find_stores results)"),
    zip: z.string().length(5).describe("ZIP code for the store (from find_stores results)"),
  },
  annotations: { readOnlyHint: true },
}, async ({ query, limit, store_id, zip }) => {
  try {
    const results = await searchProducts(query, limit, store_id, zip);
    if (results.length === 0) {
      return {
        content: [{ type: "text", text: `No products found for "${query}".` }],
      };
    }
    const lines = results.map(
      (r, i) => {
        const storeLines = r.available_stores.map(
          (s) =>
            `     - ${s.store_name} (${s.store_id}): ` +
            (s.pickup_available ? "✅ Pickup" : "❌ Pickup") +
            (s.in_store_available ? " / ✅ In-store" : " / ❌ In-store") +
            (s.pickup_date ? ` (ready ${s.pickup_date})` : "")
        );
        return (
          `${i + 1}. **${r.title}**\n` +
          `   TCIN: ${r.tcin}  |  Brand: ${r.brand || "N/A"}\n` +
          `   Price: ${r.formatted_price || "N/A"}` +
          (r.rating ? `  |  Rating: ${r.rating}/5 (${r.review_count} reviews)` : "") +
          `\n   Shipping: ${r.in_stock ? "✅ In Stock" : "❌ Out of Stock"}` +
          (storeLines.length ? `\n   Store availability:\n${storeLines.join("\n")}` : "") +
          `\n   ${r.buy_url}` +
          (r.image_url ? `\n   Image: ${r.image_url}` : "")
        );
      }
    );
    return {
      content: [
        {
          type: "text",
          text: `Found ${results.length} product(s) for "${query}":\n\n${lines.join("\n\n")}`,
        },
      ],
    };
  } catch (err) {
    return {
      content: [{ type: "text", text: `Error: ${err}` }],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

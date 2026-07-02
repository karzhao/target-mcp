const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9",
};
function decodeEntities(text) {
    return text
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x27;/g, "'")
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)));
}
function titleCase(slug) {
    return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
const ZIP_PREFIX = {
    "00": "puerto-rico", "01": "massachusetts", "02": "massachusetts",
    "03": "new-hampshire", "04": "maine", "05": "vermont",
    "06": "connecticut", "07": "new-jersey", "08": "new-jersey",
    "10": "new-york", "11": "new-york", "12": "new-york",
    "13": "new-york", "14": "new-york",
    "15": "pennsylvania", "16": "pennsylvania", "17": "pennsylvania",
    "18": "pennsylvania", "19": "pennsylvania",
    "20": "virginia", "21": "maryland", "22": "virginia",
    "23": "virginia", "24": "virginia",
    "25": "west-virginia", "26": "west-virginia",
    "27": "north-carolina", "28": "north-carolina",
    "29": "south-carolina",
    "30": "georgia", "31": "georgia",
    "32": "florida", "33": "florida", "34": "florida",
    "35": "alabama", "36": "alabama",
    "37": "tennessee", "38": "tennessee",
    "39": "mississippi",
    "40": "kentucky", "41": "kentucky", "42": "kentucky",
    "43": "ohio", "44": "ohio", "45": "ohio", "46": "ohio",
    "47": "indiana", "48": "michigan", "49": "michigan",
    "50": "iowa", "51": "iowa",
    "52": "iowa", "53": "wisconsin", "54": "wisconsin",
    "55": "minnesota", "56": "minnesota",
    "57": "south-dakota", "58": "north-dakota",
    "59": "montana",
    "60": "illinois", "61": "illinois",
    "62": "illinois", "63": "missouri",
    "64": "missouri", "65": "missouri", "66": "kansas",
    "67": "kansas", "68": "nebraska",
    "69": "nebraska",
    "70": "louisiana", "71": "louisiana",
    "72": "arkansas", "73": "oklahoma",
    "74": "oklahoma", "75": "texas",
    "76": "texas", "77": "texas", "78": "texas", "79": "texas",
    "80": "colorado", "81": "colorado",
    "82": "wyoming", "83": "idaho",
    "84": "utah", "85": "arizona",
    "86": "arizona", "87": "new-mexico",
    "88": "nevada", "89": "nevada",
    "90": "california", "91": "california", "92": "california",
    "93": "california", "94": "california", "95": "california",
    "96": "california", "97": "oregon",
    "98": "washington", "99": "alaska",
};
function zipToState(zip) {
    const prefix = zip.slice(0, 2);
    if (ZIP_PREFIX[prefix])
        return ZIP_PREFIX[prefix];
    return "new-york";
}
async function fetchPage(url) {
    const res = await fetch(url, { headers: HEADERS });
    return res.text();
}
async function runConcurrent(items, fn, concurrency) {
    const results = [];
    for (let i = 0; i < items.length; i += concurrency) {
        const batch = items.slice(i, i + concurrency);
        const batchResults = await Promise.all(batch.map(fn));
        results.push(...batchResults);
    }
    return results;
}
export async function findStoresByZip(zip) {
    const state = zipToState(zip);
    const dirUrl = `https://www.target.com/store-locator/store-directory/${state}`;
    const html = await fetchPage(dirUrl);
    const links = [...html.matchAll(/<a[^>]*href="(\/sl\/([^/]+)\/(\d+))"[^>]*>([^<]+)<\/a>/g)];
    const entries = links.map((m) => ({
        slug: m[2],
        id: m[3],
        name: decodeEntities(m[4].trim()),
        dirUrl: `https://www.target.com${m[1]}`,
    }));
    return runConcurrent(entries, async (entry) => {
        try {
            const details = await scrapeStorePage(entry.slug, entry.id);
            return details;
        }
        catch {
            return {
                store_id: entry.id,
                name: entry.name,
                address: "",
                phone: "",
                url: entry.dirUrl,
            };
        }
    }, 5);
}
async function scrapeStorePage(slug, storeId) {
    const url = `https://www.target.com/sl/${slug}/${storeId}`;
    const html = await fetchPage(url);
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/);
    const rawTitle = titleMatch?.[1]?.trim() ?? titleCase(slug);
    const name = decodeEntities(rawTitle.replace(/\s*[:|]\s*Target\s*$/i, "").trim());
    const addrMatch = html.match(/\\"address_line1\\":\\"([^"]+)\\",\\"address_line2\\":\\"([^"]+)\\"/);
    const address = addrMatch
        ? `${addrMatch[1]}, ${addrMatch[2]}`
        : "";
    const phones = html.match(/\d{3}-\d{3}-\d{4}/g);
    const phone = phones?.[0] ?? "";
    return { store_id: storeId, name, address, phone, url };
}
export async function lookupProduct(tcin) {
    const buyUrl = `https://www.target.com/p/-/A-${tcin}`;
    const html = await fetchPage(buyUrl);
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/);
    const rawTitle = titleMatch?.[1] ?? `Product ${tcin}`;
    const title = decodeEntities(rawTitle.replace(/\s*:\s*Target$/, "").trim());
    const imgMatch = html.match(/<link[^>]*rel="preload"[^>]*as="image"[^>]*imageSrcSet="([^"]+)"/i);
    let imageUrl = "";
    if (imgMatch) {
        imageUrl = imgMatch[1].split(",")[0].trim().split(" ")[0];
    }
    let price = null;
    const priceMatch = html.match(/"price":\s*"(\d+\.\d{2})"/);
    if (priceMatch) {
        price = parseFloat(priceMatch[1]);
    }
    return { tcin, title, price, image_url: imageUrl, buy_url: buyUrl };
}
async function zipToCoords(zip) {
    try {
        const res = await fetch(`https://api.zippopotam.us/us/${zip}`, {
            headers: HEADERS,
        });
        const data = await res.json();
        const place = data?.places?.[0];
        if (place) {
            return { lat: place.latitude, lng: place.longitude };
        }
    }
    catch { }
    return null;
}
export async function searchProducts(query, limit = 10, store_id, zip) {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    try {
        const context = await browser.newContext({
            userAgent: HEADERS["User-Agent"],
        });
        const page = await context.newPage();
        page.setDefaultTimeout(15000);
        let slpData = null;
        // Override CDUI SLP params to scope to the requested store
        const coords = await zipToCoords(zip);
        await page.route("**/cdui_orchestrations/**/slp**", async (route) => {
            const url = new URL(route.request().url());
            url.searchParams.set("purchasable_store_ids", store_id);
            url.searchParams.set("scheduled_delivery_store_id", store_id);
            url.searchParams.set("store_id", store_id);
            url.searchParams.set("zip", zip);
            url.searchParams.set("scheduled_delivery_zip_code", zip);
            if (coords) {
                url.searchParams.set("latitude", coords.lat);
                url.searchParams.set("longitude", coords.lng);
            }
            await route.continue({ url: url.toString() });
        });
        page.on("response", async (resp) => {
            const url = resp.url();
            if (url.includes("cdui_orchestrations") && url.includes("slp")) {
                try {
                    slpData = JSON.parse(await resp.text());
                }
                catch { }
            }
        });
        const searchUrl = `https://www.target.com/s?searchTerm=${encodeURIComponent(query)}`;
        await page.goto(searchUrl, {
            waitUntil: "domcontentloaded",
            timeout: 20000,
        });
        await page.waitForTimeout(8000);
        if (!slpData) {
            return [];
        }
        const products = slpData.data_source_modules?.[0]?.module_data?.search_response
            ?.products || [];
        return products.slice(0, limit).map((p) => {
            const item = p.item || {};
            const desc = item.product_description || {};
            const enrichment = item.enrichment || {};
            const imageInfo = enrichment.image_info || {};
            const primaryImage = imageInfo.primary_image || {};
            const price = p.price || {};
            const ratings = p.ratings_and_reviews || {};
            const fulfillment = p.fulfillment || {};
            const shipping = fulfillment.shipping_options || {};
            const storeOpts = fulfillment.store_options || [];
            const availableStores = storeOpts.map((so) => {
                const addr = so.store?.mailing_address || {};
                const addrParts = [addr.address_line1, addr.city, addr.state, addr.postal_code].filter(Boolean);
                return {
                    store_id: so.location_id || "",
                    store_name: so.store?.location_name || "",
                    store_address: addrParts.join(", "),
                    pickup_available: so.order_pickup?.availability_status === "IN_STOCK",
                    in_store_available: so.in_store_only?.availability_status === "IN_STOCK",
                    pickup_date: so.order_pickup?.pickup_date || null,
                };
            });
            return {
                tcin: p.tcin || "",
                title: decodeEntities(desc.title || ""),
                price: price.current_retail ?? null,
                formatted_price: price.formatted_current_price || "",
                image_url: primaryImage.url || "",
                buy_url: `https://www.target.com/p/-/A-${p.tcin}`,
                brand: (typeof item.primary_brand === "object" ? item.primary_brand?.name : item.primary_brand) || "",
                rating: ratings?.rating?.average ?? null,
                review_count: ratings?.rating?.count ?? null,
                in_stock: shipping.availability_status === "IN_STOCK",
                available_stores: availableStores,
            };
        });
    }
    finally {
        await browser.close();
    }
}
//# sourceMappingURL=api.js.map
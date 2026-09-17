import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { env } from "./env.js";
import { bulkPath, keywordPath, slimAudit, slimKeywordRows, slimShopInfo, slimStats, slimTopListings } from "./erank.js";

const output = (value: unknown, isError = false) => ({
  isError,
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
});
const run = async (op: () => Promise<unknown>) => {
  try { return output(await op()); }
  catch (error) {
    return { isError: true, content: [{ type: "text" as const, text: `Error: ${message(error)}` }] };
  }
};
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
const session = () => env().ERANK_SESSION.getByName("owner");
const country = z.string().optional().describe("Country (default USA)");
const marketplace = z.enum(["etsy", "amazon", "ebay"]).optional().describe("Marketplace (default etsy)");
const limit = z.number().int().min(1).max(100).optional().describe("Maximum rows to return");
const query = { country, marketplace };

export async function createMcpServer(): Promise<McpServer> {
  const server = new McpServer({ name: "erank-mcp", version: "0.1.0" }, {
    instructions: "Unofficial read-only eRank (Etsy SEO) MCP for one account. Start with keyword_stats or related_searches for keyword research; listing_audit for a specific Etsy listing id; shop_info for any public Etsy shop. Results are cached ~1h; be gentle.",
  });

  server.tool("keyword_stats", "Return search metrics and the recent trend for a keyword, using country USA and marketplace etsy by default.",
    { keyword: z.string().min(1), ...query }, ({ keyword, country, marketplace }) => run(async () =>
      slimStats(await session().api(keywordPath("stats", keyword, { country, marketplace })))));

  server.tool("related_searches", "Return related keyword metrics, using country USA, marketplace etsy, and limit 25 by default.",
    { keyword: z.string().min(1), ...query, limit }, ({ keyword, country, marketplace, limit }) => run(async () => {
      const raw = await session().api(keywordPath("related-searches", keyword, { country, marketplace }, true));
      return slimKeywordRows(Array.isArray(raw) ? raw : [], limit ?? 25);
    }));

  server.tool("near_matches", "Return close keyword matches, using country USA, marketplace etsy, and limit 25 by default.",
    { keyword: z.string().min(1), ...query, limit }, ({ keyword, country, marketplace, limit }) => run(async () => {
      const raw = await session().api(keywordPath("near-matches", keyword, { country, marketplace }));
      return slimKeywordRows(Array.isArray(raw) ? raw : [], limit ?? 25);
    }));

  server.tool("etsy_tags", "Return suggested Etsy tag metrics, using country USA, marketplace etsy, and limit 25 by default.",
    { keyword: z.string().min(1), ...query, limit }, ({ keyword, country, marketplace, limit }) => run(async () => {
      const raw = await session().api(keywordPath("etsy-tags", keyword, { country, marketplace }, true));
      return slimKeywordRows(Array.isArray(raw) ? raw : [], limit ?? 25);
    }));

  server.tool("top_listings", "Return top listings for a keyword, using country USA, marketplace etsy, and limit 20 by default.",
    { keyword: z.string().min(1), ...query, limit }, ({ keyword, country, marketplace, limit }) => run(async () => {
      const value = slimTopListings(await session().api(keywordPath("top-listings", keyword, { country, marketplace })));
      return { ...value, listings: value.listings.slice(0, limit ?? 20) };
    }));

  server.tool("bulk_keywords", "Return one metric row for each keyword, using country USA and marketplace etsy by default.",
    { keywords: z.array(z.string().min(1)).min(1).max(50), ...query }, ({ keywords, country, marketplace }) => run(async () => {
      const raw = await session().api(bulkPath(keywords, { country, marketplace }));
      const entries = raw !== null && typeof raw === "object" ? Object.entries(raw) : [];
      return Object.fromEntries(entries.map(([keyword, row]) => [keyword, slimKeywordRows([row], 1)[0]]));
    }));

  server.tool("listing_audit", "Return listing SEO scores, issues, performance, price, tag metrics, and any partial-request errors, using country USA by default.",
    { listing_id: z.union([z.number().int(), z.string().regex(/^\d+$/)]), country }, ({ listing_id, country }) => run(async () => {
      const id = String(listing_id), selected = encodeURIComponent(country ?? "USA"), s = session();
      const results = await Promise.allSettled([
        s.api(`/api/listing-audit/score?id=${id}&country=${selected}&listing_lang=en-US`),
        s.api(`/api/listing-audit/scorecard?id=${id}`),
        s.api(`/api/listing-audit/${id}/tags?country_avg=${selected}&country=${selected}&listing_lang=en-US`),
      ]);
      if (results[0].status === "rejected" && results[1].status === "rejected" && results[2].status === "rejected") throw results[0].reason;
      const values = results.map((result) => result.status === "fulfilled" ? result.value : undefined);
      const names = ["score", "scorecard", "tags"];
      const errors = results.flatMap((result, index) => result.status === "rejected" ? [`${names[index]}: ${message(result.reason)}`] : []);
      return { ...slimAudit({ score: values[0], scorecard: values[1], tags: values[2] }), errors };
    }));

  server.tool("shop_info", "Return public eRank statistics for an Etsy shop.",
    { shop_name: z.string().min(1) }, ({ shop_name }) => run(async () =>
      slimShopInfo(await session().api(`/api/shop-info/${encodeURIComponent(shop_name)}`))));

  server.tool("my_shops", "Return shops connected to the account and its dashboard profile when available.", {}, () => run(async () => {
    const s = session(), shops = await s.api("/api/member-shops");
    const [profile] = await Promise.allSettled([s.api("/api/dashboard/shop-profile")]);
    return { shops, profile: profile.status === "fulfilled" ? profile.value : null };
  }));

  return server;
}

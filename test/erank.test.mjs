import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { bulkPath, keywordPath, metric, slimAudit, slimKeywordRows, slimShopInfo, slimStats, slimTopListings } from "../src/erank.ts";

describe("metric", () => {
  test("prefers positive order values and preserves display-only values", () => {
    assert.equal(metric({ order_value: 10442, value: "10,442" }), 10442);
    assert.equal(metric({ order_value: 0, value: "< 20" }), "< 20");
    assert.equal(metric(undefined), null);
  });
});

describe("slimStats", () => {
  test("maps metrics and keeps the last twelve trend points", () => {
    const result = slimStats({ term: "ring", avg_searches: { order_value: 10 }, avg_clicks: { value: "< 20" }, search_trend: Array.from({ length: 13 }, (_, i) => i) });
    assert.equal(result.avgSearches, 10);
    assert.equal(result.avgClicks, "< 20");
    assert.deepEqual(result.searchTrend, Array.from({ length: 12 }, (_, i) => i + 1));
  });
});

describe("slimKeywordRows", () => {
  test("sorts numeric searches first and preserves non-numeric API order", () => {
    const rows = slimKeywordRows([
      { keyword: "unknown", avg_searches: { value: "Unknown" } },
      { keyword: "high", avg_searches: { order_value: 50 } },
      { keyword: "low", avg_searches: { order_value: 10 } },
      { keyword: "under", avg_searches: { value: "< 20" } },
    ], 3);
    assert.deepEqual(rows.map((row) => row.keyword), ["high", "low", "unknown"]);
  });
});

describe("slimTopListings", () => {
  test("maps nested listing data", () => {
    const result = slimTopListings({ listings: { count: 1, data: [{ listing_id: 7, title: "Ring", shop_name: "Shop", price: "12.00", currency_code: "USD", tags: ["silver"] }] } });
    assert.equal(result.count, 1);
    assert.deepEqual(result.listings[0], { listingId: 7, title: "Ring", shop: "Shop", url: "", price: "12.00 USD", views: null, favorites: null, ageDays: null, dailyViews: null, estSales: null, estRevenue: null, tags: ["silver"] });
  });
});

describe("slimAudit", () => {
  test("handles partial input and omits passing feedback", () => {
    const result = slimAudit({ score: { overall: 80, title: { score: 5, feedback: [{ module: "Good", status: "pass" }, { module: "Fix title", status: "fail", urgency: 2 }] } } });
    assert.equal(result.overallScore, 80);
    assert.deepEqual(result.sections.title.issues, [{ module: "Fix title", status: "fail", urgency: 2 }]);
    assert.deepEqual(result.performance, { views: null, sales: null, conversionRate: null, favorites: null });
    assert.equal(slimAudit({ score: { overall: { score: 80 } } }).overallScore, 80);
    assert.deepEqual(slimAudit({}), { overallScore: null, sections: {}, performance: { views: null, sales: null, conversionRate: null, favorites: null }, price: null, tags: [] });
  });
});

describe("slimShopInfo", () => {
  test("maps shop fields and builds its Etsy URL", () => {
    const result = slimShopInfo({ name: "SilverShop", shop_id: 4, country: "US", sales: { total: 9 }, total_listings: 3, is_vacation: true });
    assert.equal(result.url, "https://www.etsy.com/shop/SilverShop");
    assert.deepEqual(result.sales, { total: 9 });
    assert.equal(result.isVacation, true);
  });
});

describe("keywordPath", () => {
  test("uses defaults and adds every match filter", () => {
    const path = keywordPath("related-searches", "silver ring", {}, true);
    assert.equal(path, "/api/keyword-tool/related-searches?keyword=silver+ring&country=USA&marketplace=etsy&opensearch_filters%5Bexact_match%5D=true&opensearch_filters%5Bphrase_match%5D=true&opensearch_filters%5Bdefault_match%5D=true&opensearch_filters%5Bbroad_match%5D=true");
  });
});

describe("bulkPath", () => {
  test("repeats the keywords parameter", () => {
    assert.equal(bulkPath(["silver ring", "gold ring"], { country: "GBR", marketplace: "amazon" }), "/api/keyword-tool/bulk-keywords?country=GBR&marketplace=amazon&keywords%5B%5D=silver+ring&keywords%5B%5D=gold+ring");
  });
});

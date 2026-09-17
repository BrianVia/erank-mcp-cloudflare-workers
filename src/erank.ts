/** Pure helpers for shaping eRank API payloads (no I/O). */

type Options = { country?: string; marketplace?: "etsy" | "amazon" | "ebay" };

const obj = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" ? value as Record<string, unknown> : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const num = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;
const str = (value: unknown): string | undefined => typeof value === "string" ? value : undefined;

export function metric(value: unknown): string | number | null {
  const cell = obj(value), order = num(cell.order_value);
  return order !== undefined && order > 0 ? order : str(cell.value) ?? null;
}

export function slimStats(raw: unknown) {
  const value = obj(raw);
  return {
    term: str(value.term) ?? "",
    avgSearches: metric(value.avg_searches),
    avgClicks: metric(value.avg_clicks),
    ctr: metric(value.ctr),
    competition: metric(value.competition),
    keywordDifficulty: metric(value.keyword_difficulty),
    competitionUpdated: str(value.competition_updated) ?? null,
    searchTrend: list(value.search_trend).slice(-12),
  };
}

export function slimKeywordRows(raw: unknown[], limit: number) {
  return raw.map((item) => {
    const row = obj(item);
    return {
      keyword: str(row.keyword) ?? "",
      characters: num(row.character_count) ?? null,
      avgSearches: metric(row.avg_searches),
      avgClicks: metric(row.avg_clicks),
      ctr: metric(row.ctr),
      competition: metric(row.competition),
      keywordDifficulty: metric(row.keyword_difficulty),
      score: num(row.score) ?? null,
      topTag: Boolean(row.top_tag),
    };
  }).sort((a, b) => {
    if (typeof a.avgSearches === "number" && typeof b.avgSearches === "number") return b.avgSearches - a.avgSearches;
    return typeof a.avgSearches === "number" ? -1 : typeof b.avgSearches === "number" ? 1 : 0;
  }).slice(0, limit);
}

export function slimTopListings(raw: unknown) {
  const listings = obj(obj(raw).listings), data = list(listings.data);
  return {
    count: num(listings.count) ?? data.length,
    listings: data.map((item) => {
      const row = obj(item);
      const price = str(row.price) ?? num(row.price), currency = str(row.currency_code) ?? "";
      return {
        listingId: num(row.listing_id) ?? null, title: str(row.title) ?? "",
        shop: str(row.shop_name) ?? "", url: str(row.url) ?? "",
        price: price === undefined ? null : `${price} ${currency}`.trim(),
        views: num(row.views) ?? null, favorites: num(row.num_favorers) ?? null,
        ageDays: num(row.age_in_days) ?? null, dailyViews: num(row.daily_views) ?? null,
        estSales: num(row.est_sales) ?? null, estRevenue: num(row.est_revenue) ?? null,
        tags: list(row.tags).map(String),
      };
    }),
  };
}

export function slimAudit(input: { score?: unknown; scorecard?: unknown; tags?: unknown }) {
  const score = obj(input.score), card = obj(input.scorecard), original = obj(obj(card.listing_price).original);
  const sections = Object.fromEntries(Object.entries(score).flatMap(([name, value]) => {
    const section = obj(value), sectionScore = num(section.score);
    if (sectionScore === undefined) return [];
    const issues = list(section.feedback).flatMap((item) => {
      const feedback = obj(item), status = str(feedback.status);
      return status === "pass" ? [] : [{
        module: str(feedback.module) ?? "", status: status ?? "", urgency: feedback.urgency ?? null,
      }];
    });
    return [[name, { score: sectionScore, issues }]];
  }));
  const amount = (name: string) => obj(obj(card[name]).all).amount ?? null;
  const price = str(original.price) ?? num(original.price), currency = str(original.currency);
  return {
    overallScore: num(score.overall) ?? num(obj(score.overall).score) ?? null,
    sections,
    performance: { views: amount("views"), sales: amount("sales"), conversionRate: amount("conversion_rate"), favorites: amount("favorites") },
    price: price === undefined || currency === undefined ? null : `${price} ${currency}`,
    tags: list(obj(input.tags).tags_analysis).map((item) => {
      const tag = obj(item);
      return {
        tag: str(tag.keyword) ?? "", characters: num(tag.character_count) ?? null,
        searches: metric(tag.searches), clicks: metric(tag.clicks), ctr: metric(tag.ctr),
        competition: metric(tag.competition), keywordDifficulty: metric(tag.keyword_difficulty),
        multiWord: Boolean(tag.multi_word), startOfTitle: Boolean(tag.start_of_title),
        usedInDescription: Boolean(tag.used_in_desc),
      };
    }),
  };
}

export function slimShopInfo(raw: unknown) {
  const shop = obj(raw), name = str(shop.name) ?? "";
  return {
    name, shopId: num(shop.shop_id) ?? null, country: str(shop.country) ?? "",
    createdAt: str(shop.created_at) ?? null, globalRank: num(shop.global_rank) ?? null,
    nationalRank: num(shop.national_rank) ?? null, sales: obj(shop.sales),
    totalListings: num(shop.total_listings) ?? null, isVacation: Boolean(shop.is_vacation),
    url: `https://www.etsy.com/shop/${name}`,
  };
}

export function keywordPath(endpoint: string, keyword: string, opts: Options = {}, allMatchFilters = false): string {
  const params = new URLSearchParams({ keyword, country: opts.country ?? "USA", marketplace: opts.marketplace ?? "etsy" });
  if (allMatchFilters) for (const match of ["exact_match", "phrase_match", "default_match", "broad_match"]) {
    params.append(`opensearch_filters[${match}]`, "true");
  }
  return `/api/keyword-tool/${endpoint}?${params.toString()}`;
}

export function bulkPath(keywords: string[], opts: Options = {}): string {
  const params = new URLSearchParams({ country: opts.country ?? "USA", marketplace: opts.marketplace ?? "etsy" });
  for (const keyword of keywords) params.append("keywords[]", keyword);
  return `/api/keyword-tool/bulk-keywords?${params.toString()}`;
}

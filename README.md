# erank-mcp-cloudflare-workers

A remote [Model Context Protocol](https://modelcontextprotocol.io/) server for one eRank account, hosted on Cloudflare Workers. It provides keyword research, listing audits, and shop data through eRank's unofficial members API.

One Worker provides a bearer-protected, stateless `/mcp` endpoint. A Durable Object owns the Sanctum cookies and caches responses for about one hour.

## Setup

```sh
npm install
npx wrangler login
cp wrangler.jsonc wrangler.local.jsonc
```

In `wrangler.local.jsonc`, replace `erank.example.com` with a hostname on a Cloudflare zone you manage. Deploy using that local config:

```sh
WRANGLER_CONFIG=wrangler.local.jsonc npm run deploy
npx wrangler secret put ERANK_USERNAME --config wrangler.local.jsonc
npx wrangler secret put ERANK_PASSWORD --config wrangler.local.jsonc
npx wrangler secret put MCP_BEARER --config wrangler.local.jsonc
```

The custom-domain route creates its DNS record on first deploy.

## Tools

| Tool | Description |
|---|---|
| `keyword_stats` | Search volume, clicks, CTR, competition, difficulty, and trend for one keyword |
| `related_searches` | Related keyword rows sorted by average searches |
| `near_matches` | Close keyword matches sorted by average searches |
| `etsy_tags` | Suggested Etsy tags sorted by average searches |
| `top_listings` | Top Etsy listings for a keyword |
| `bulk_keywords` | Metrics for up to 50 keywords |
| `listing_audit` | SEO scores, issues, performance, price, and tag analysis for one listing |
| `shop_info` | Public eRank data for an Etsy shop |
| `my_shops` | Shops connected to the account and its dashboard profile |

Read-only. Results stay cached for about one hour.

## Raw HTTP

The endpoint uses stateless Streamable HTTP and returns SSE-framed MCP responses.

```sh
curl -s https://erank.example.com/mcp -X POST \
  -H 'Authorization: Bearer <MCP_BEARER>' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

`GET /` identifies the MCP endpoint. `GET /health` is public and reports the session and cache status without making a network request.

## Local development

```sh
cp .dev.vars.example .dev.vars
npm run check
npx wrangler dev
```

## Notes

- Authentication uses Laravel Sanctum cookies. The Worker fetches a CSRF cookie, posts the account credentials to `/api/login`, and stores the returned cookies in the Durable Object.
- eRank rejects authenticated API requests without a browser `User-Agent`. The Worker sends the same Chrome user agent as the source client.
- Credentials are Worker secrets and are sent only to `members.erank.com`.
- `/mcp` requires `MCP_BEARER`. `/` and `/health` are public.
- The Worker ports the client logic directly and does not use Node APIs such as `fs`, `process`, or `Buffer`.

## License

MIT. See [LICENSE](LICENSE).

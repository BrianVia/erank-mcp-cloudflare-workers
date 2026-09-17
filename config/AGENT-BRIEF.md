# eRank agent briefing

Brian's eRank Etsy SEO data is available over MCP at `https://erank.brianvia.com/mcp`.
The server provides read-only keyword research, listing audits, and shop data.

## Auth

Static bearer. The bearer is not in this file. Get it from:

- Claude Code on via-halo: the `erank` MCP server is registered at user scope.
- Other agents on via-halo: `node -e 'process.stdout.write(require(process.env.HOME+"/.config/erank-mcp/setup-secrets.json").MCP_BEARER)'`
- Anywhere else: ask Brian for `MCP_BEARER`. Never paste it into chat, logs, or Notion.

Header: `Authorization: Bearer <MCP_BEARER>`. A missing or wrong bearer returns 401.
`GET https://erank.brianvia.com/health` requires no auth and returns `{"ok":true,"authorized":...,"loginAt":...,"cached":...}`.

## Tools (9)

| Tool | Args | Use |
|---|---|---|
| `keyword_stats` | `keyword`, `country?`, `marketplace?` | Keyword metrics and recent trend. |
| `related_searches` | `keyword`, `country?`, `marketplace?`, `limit?` | Related keyword metrics. |
| `near_matches` | `keyword`, `country?`, `marketplace?`, `limit?` | Close keyword matches. |
| `etsy_tags` | `keyword`, `country?`, `marketplace?`, `limit?` | Suggested Etsy tags. |
| `top_listings` | `keyword`, `country?`, `marketplace?`, `limit?` | Top listings for a keyword. |
| `bulk_keywords` | `keywords`, `country?`, `marketplace?` | Metrics for up to 50 keywords. |
| `listing_audit` | `listing_id`, `country?` | Listing scores, issues, performance, price, and tag metrics. |
| `shop_info` | `shop_name` | Public data for an Etsy shop. |
| `my_shops` | none | Connected shops and the account dashboard profile. |

## Gotchas

- Results stay cached for about one hour in the session object. Keep request volume low.
- Listing IDs are numeric Etsy listing IDs.
- The default country is `USA`, and the default marketplace is `etsy`.
- eRank auth uses Laravel Sanctum cookies and requires a browser `User-Agent`.

## Raw HTTP

```sh
curl -s https://erank.brianvia.com/mcp -X POST -H "Authorization: Bearer $MCP_BEARER" \
  -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"keyword_stats","arguments":{"keyword":"silver ring"}}}'
```

The response uses SSE framing. Remove `data: `, parse the JSON, and read `result.content[0].text`. Text that starts with `Error:` means the tool failed.

## Register in a client

- Claude Code: `claude mcp add -s user --transport http erank https://erank.brianvia.com/mcp --header "Authorization: Bearer $MCP_BEARER"`
- Any other MCP client: use HTTP transport with the same URL and header.

Source: `~/Development/Personal/erank-mcp-cloudflare-workers` · https://github.com/BrianVia/erank-mcp-cloudflare-workers

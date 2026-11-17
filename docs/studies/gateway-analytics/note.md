# Gateway and LLM observability dashboards: what leads, what we should lead with

Study of OpenRouter, Portkey, Helicone, LiteLLM, Cloudflare AI Gateway, Langfuse and Braintrust. Sources are public docs, vendor blog posts and the vendors' own published screenshots. No accounts were opened, so "first screen" means what the docs and published images show, not a live tenant. Date of study: 2026-11-17.

## Findings

1. **No product leads with TTFT.** In all seven, spend, requests and tokens come first (Braintrust slips total latency in as its second tile). Latency is one tile or one chart (total or mean duration, usually with a p50/p95 toggle). TTFT exists in most of them (OpenRouter generation detail, LiteLLM Prometheus, Langfuse, Braintrust, and Helicone's requests table by a secondary source) but only as a per-request field or an opt-in metric, never a headline. Gluck's suspicion holds: two TTFT-flavoured tiles in a KPI row of eight, plus a full-width TTFT waterfall, is more TTFT weight than any peer gives it.
2. **Cost leads, and it leads first.** OpenRouter: total spend is the first card. Portkey: Cost is the top-left chart. Helicone: Requests then Costs. LiteLLM: Total Spend is the page heading. Langfuse: counts, then cost charts dominate. Braintrust is the most latency-forward: spans, then a p50/p95 total-latency chart, then cost (second tile of six, and still total duration, not TTFT). Cloudflare lists requests, tokens, cost, errors, cache.
3. **Volume and cost are ranked, not latency.** Every "top N" card ranks by spend, tokens or requests: top API keys, top apps, top models, top users, top use cases. Nobody ranks by latency on the default screen. Portkey is the one place latency appears as a sortable column (Summary tab, avg latency per group).
4. **Cache is a first-class KPI at only one vendor.** OpenRouter puts cache hit rate in the top row (fourth of five). Portkey gives cache its own tab (hits, hit rate, speedup, savings). Cloudflare lists cached-response percentage as one of five metrics. Helicone, Langfuse and Braintrust fold cached tokens into token and cost breakdowns (Langfuse shows `input_cached_tokens` as its own cost line per trace). LiteLLM exposes cache reads only in Prometheus.
5. **Errors are always present.** Helicone has an error donut, LiteLLM has a Failed Requests card, Portkey has an Errors tab with rescued-by-fallback counts, Cloudflare lists errors. Our row has errors, which is right.
6. **Blended unit cost is the quiet standout.** OpenRouter's fifth card is blended $ per 1M tokens, with a sparkline and a delta against the prior period on every card. That normalises cost against volume, and we have no equivalent.
7. **Limits are settings, not a first-screen gauge.** Rate limits and budgets live in config (LiteLLM tpm/rpm/budgets per key, user and team; Helicone request, cost and property limits; Cloudflare fixed or sliding request limits; OpenRouter credits and free-tier caps) and in alerts (Helicone, Braintrust, Langfuse). None puts remaining headroom in the top row.
8. **Breakdowns are one dropdown, not a card per dimension.** OpenRouter Explore takes a metric plus up to two group-by dimensions (model, provider, key, app, user, workspace, session...) with a rank-by and limit. Portkey Summary and Braintrust take any metadata field. Click-through from any chart to the logs behind it is standard.

Caveat on fit: these are fleet and billing tools for many apps and users. Scope is a single-operator cockpit for interactive agent turns, where felt latency matters more than it does on a billing page. That argues for keeping one latency tile prominent, and for keeping the TTFT-by-layer waterfall (no peer has layer attribution, it is our differentiator), but behind a click rather than as the second screen-wide band.

## Comparison

| Product | Top row / first screen | Ranked or sorted by | Latency shown | Cache | Limits and plan | Per-model / per-key |
|---|---|---|---|---|---|---|
| OpenRouter Activity | Total spend, requests, token volume, cache hit rate, blended $/1M (sparkline and prior-period delta each) | Top API keys, top apps by tokens; Trends tab ranks by movement; Explore has rank-by and limit | Explore only: latency and throughput at p50/p90/p99. TTFT only in per-generation detail | Hit rate in top row; prompt caching chart; cache savings in generation cost | Credits, free-tier caps (20 rpm, 50 to 1000 per day), workspace budgets; separate pages | Group by model, provider, key, app, user, workspace, session (two at a time) |
| Portkey | Cost, tokens used, mean latency (p50 toggle), requests, unique users | Top models and top users by requests; Summary tab sorts by any column | Mean latency tile with a percentile dropdown (P50 shown). No TTFT in the analytics docs | Own tab: hit rate, simple vs semantic, speedup, savings | Not checked | Summary groups by service, model, any metadata key: requests, cost, avg latency, success rate, avg tokens |
| Helicone | Requests (success vs error), costs, errors donut, top models, top countries, latency (s/req) | Top models by requests, top countries | One latency tile, total seconds per request. TTFT per request in the requests table (secondary source) | Provider prompt caching supported; no cache tile in the hero image | Request, cost and property rate limits; alerts; weekly reports | Top models; custom properties for any slice; sessions |
| LiteLLM Usage | Total spend heading, then monthly spend bars; customer view adds requests, success, failed, tokens | Top API keys and top models by spend | Not on the Usage page. Prometheus has total, LLM API, TTFT and overhead latency histograms | Prometheus only (provider cache reads vs LiteLLM response cache hits) | tpm, rpm, parallel limits and budgets per key, user, team; dynamic allocation | Tabs: global, organization, team, customer, tag, end user. Cost vs Activity toggle |
| Cloudflare AI Gateway | Requests, tokens, cost, errors, cached percentage (docs list; no public screenshot found) | Not documented; GraphQL orders by cost or time | None in the analytics list. Log rows carry duration | Cached responses percentage | Fixed or sliding request limits, spend limits (beta) | Filter by provider, model, cost, tokens, one metadata key |
| Langfuse Home | Home defaults to: traces, model cost, latency percentiles, scores, model usage. Curated cost dashboard opens with trace and observation counts, total cost, cost by model and environment | Top 20 users, use cases and observations by cost | Latency dashboard; percentile widgets. TTFT supported via `completionStartTime`, not top row | Cached token cost lines per trace | Alerts on spend thresholds; no gateway limits in the dashboard | By model, user, trace name, environment, prompt version |
| Braintrust Cost and quality | Spans, latency (p50, p95 lines), total LLM cost, token count, tool executions, topics | Group by any metadata field | One latency chart, p50 and p95. TTFT listed as an available metric | Prompt tokens shown as uncached; cache tokens priced in the cost chart | Alerts on error rate, latency, daily cost | Group by model, environment, user, metadata |

## Screenshots

Vendor-published images, saved beside this note. Cloudflare publishes no dashboard image in its docs, so it has none here.

- `openrouter-activity-docs.png`: OpenRouter Activity Overview, the real first screen.
- `portkey-analytics.jpg`: Portkey analytics from its docs (stylised backdrop, real tiles).
- `helicone-dashboard.png`: Helicone hero image from its docs. A marketing render, so tile choice is real but proportions are not.
- `litellm-admin-ui-spend.png` and `litellm-customer-usage.png`: LiteLLM Usage tab (2024 build) and Customer Usage (late 2025).
- `langfuse-cost-dashboard.png` and `langfuse-costs-usage.png`: Langfuse curated cost dashboard, and a trace with latency and cost breakdown.
- `braintrust-cost-quality.png`: Braintrust built-in Cost and quality dashboard.

## What Scope should lead with, ranked

1. **List-price cost, with blended $ per 1M tokens beside it.** Nearly every peer leads here. Add a sparkline and a delta against the prior window to each KPI card, as OpenRouter does.
2. **Turns and rounds.** Our request volume. Keep.
3. **Tokens, with the cache split.** Input, output and cached on one tile instead of output tokens alone.
4. **Cache hit.** Keep in the top row. Only OpenRouter does, and for an agent loop with a large prefix it is the cost lever.
5. **One latency tile: turn p50 with p90 beneath.** Total duration, the thing every peer shows. A small TTFT toggle on this tile is enough.
6. **Errors.** Keep.
7. **Provider cards, then a ranked table with a group-by dropdown** (model, provider, aria, key) in place of a card per dimension. Rows clickable into the turns table.

## What to demote

1. **TTFT p50 out of the KPI row.** It is the clearest overweight. Fold it into the latency tile.
2. **The full-width TTFT-by-layer waterfall below the fold, or behind a click on the latency tile.** Keep it. It is the one view no peer has.
3. **Prefill, TPOT, inter-token latency and tokens/s into a "streaming detail" group, collapsed by default.** Peers keep these in per-request detail or Prometheus, not on the landing view.
4. **Throughput and latency p50/p90 as two separate sections.** Merge into the single latency tile plus its detail.
5. **Tools, events and daemon at the bottom, as now.** No peer shows them on the landing page, and the low placement matches Braintrust's tool executions sitting after cost and tokens.

## Sources

- OpenRouter: openrouter.ai/docs/guides/features/activity, openrouter.ai/blog/announcements/activity-dashboard/
- Portkey: portkey.ai/docs/product/observability/analytics
- Helicone: docs.helicone.ai (cost-tracking, custom-rate-limits, alerts, reports, prompt-caching)
- LiteLLM: docs.litellm.ai/docs/proxy (cost_tracking, customer_usage, prometheus, users)
- Cloudflare: developers.cloudflare.com/ai-gateway (observability/analytics, costs, features/rate-limiting)
- Langfuse: langfuse.com/docs/metrics (overview, custom-dashboards), token-and-cost-tracking
- Braintrust: braintrust.dev/docs/observe/dashboards, docs/deploy/monitor, blog/monitor

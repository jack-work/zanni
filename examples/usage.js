"use strict";
window.USAGE_SPAIN = {
 "generated_at": "2026-11-19T06:34:14Z",
 "from": "2026-11-18T06:34:14Z",
 "to": "2026-11-19T06:34:14Z",
 "join_rule": "a direct path, or a rou2 path whose upstream the enrichment does not name, belongs to the plan of the same provider whose seven_day reset_at is within 2m of the path's observed seven_day reset_at (nearest wins); otherwise a rou2 path is its own plan and a direct path an unidentified plan, one per distinct anchor",
 "sources": {
  "usage": "cache_round: figaro.round spans with usage (direct; rou2-routed only before rou2_usage_since) and the rou2 usage log; successful rounds with prompt tokens",
  "rou2_usage_since": "2026-11-11T08:42:19Z",
  "enrichment": [
   {
    "name": "rou2",
    "status": "ok",
    "generated_at": "2026-11-19T06:32:00.758936173Z",
    "error_code": null
   }
  ]
 },
 "providers": [
  {
   "provider": "anthropic",
   "label": "Anthropic",
   "plans": [
    {
     "plan": "anthropic-kic",
     "label": "subscription",
     "account": "kic",
     "windows": [
      {
       "window": "five_hour",
       "used_percent": 17,
       "reset_at": "2026-11-19T11:00:00Z",
       "status": "allowed",
       "source": "observed_headers",
       "fetched_at": "2026-11-19T06:31:15Z",
       "stale": false
      },
      {
       "window": "seven_day",
       "used_percent": 3,
       "reset_at": "2026-11-26T01:00:00Z",
       "status": "allowed",
       "source": "observed_headers",
       "fetched_at": "2026-11-19T06:31:15Z",
       "stale": false
      },
      {
       "window": "7d_oi",
       "used_percent": 0,
       "reset_at": "2026-11-26T01:00:00Z",
       "status": "allowed",
       "source": "observed_headers",
       "fetched_at": "2026-11-19T06:07:26Z",
       "stale": true
      },
      {
       "window": "overage",
       "used_percent": null,
       "reset_at": null,
       "status": "rejected",
       "source": "observed_headers",
       "fetched_at": "2026-11-19T06:31:15Z",
       "stale": false
      }
     ],
     "binding": "five_hour",
     "access": [
      {
       "gateway": "rou2",
       "host": "spain",
       "via": "anthropic-kic",
       "requests": 150,
       "input_tokens": 398,
       "output_tokens": 69657,
       "cache_read_tokens": 42173976,
       "cache_write_tokens": 4608792,
       "cache_read_share": 0.9014775955949625,
       "priced_requests": 150,
       "list_cost_usd": 30.968184700000002,
       "last_seen": "2026-11-19T06:31:15Z",
       "observed": [
        {
         "window": "seven_day",
         "used_percent": 3,
         "reset_at": "2026-11-26T01:00:00Z",
         "status": "allowed",
         "source": "observed_headers",
         "fetched_at": "2026-11-19T06:31:15Z",
         "stale": false
        }
       ]
      }
     ]
    },
    {
     "plan": "anthropic-max",
     "label": "subscription",
     "account": "personal",
     "windows": [
      {
       "window": "seven_day",
       "used_percent": 95,
       "reset_at": "2026-11-24T02:00:00Z",
       "status": "allowed_warning",
       "source": "observed_headers",
       "fetched_at": "2026-11-19T06:32:33Z",
       "stale": false
      },
      {
       "window": "overage",
       "used_percent": null,
       "reset_at": null,
       "status": "rejected",
       "source": "observed_headers",
       "fetched_at": "2026-11-19T06:32:33Z",
       "stale": false
      }
     ],
     "binding": "seven_day",
     "access": [
      {
       "gateway": "rou2",
       "host": "spain",
       "via": "anthropic-max",
       "requests": 78,
       "input_tokens": 212,
       "output_tokens": 23076,
       "cache_read_tokens": 8929343,
       "cache_write_tokens": 954719,
       "cache_read_share": 0.9033888578968976,
       "priced_requests": 78,
       "list_cost_usd": 6.4756126,
       "last_seen": "2026-11-19T06:06:38Z",
       "observed": [
        {
         "window": "seven_day",
         "used_percent": 94,
         "reset_at": "2026-11-24T02:00:00Z",
         "status": "allowed_warning",
         "source": "observed_headers",
         "fetched_at": "2026-11-19T06:06:38Z",
         "stale": true
        }
       ]
      },
      {
       "gateway": "direct",
       "host": "gluck",
       "via": "anthropic",
       "requests": 12515,
       "input_tokens": 29632,
       "output_tokens": 7011556,
       "cache_read_tokens": 2783983954,
       "cache_write_tokens": 144979532,
       "cache_read_share": 0.9504918044672579,
       "priced_requests": 12515,
       "list_cost_usd": 1396.4281436,
       "last_seen": "2026-11-19T06:32:33Z",
       "observed": [
        {
         "window": "seven_day",
         "used_percent": 95,
         "reset_at": "2026-11-24T02:00:00Z",
         "status": "allowed_warning",
         "source": "observed_headers",
         "fetched_at": "2026-11-19T06:32:33Z",
         "stale": false
        }
       ]
      }
     ]
    },
    {
     "plan": "anthropic-personal",
     "label": "pay as you go",
     "account": "personal",
     "windows": [],
     "binding": null,
     "access": [
      {
       "gateway": "rou2",
       "host": "spain",
       "via": "anthropic-personal",
       "requests": 4,
       "input_tokens": 5120,
       "output_tokens": 812,
       "cache_read_tokens": 0,
       "cache_write_tokens": 0,
       "cache_read_share": 0.0,
       "priced_requests": 4,
       "list_cost_usd": 0.0275,
       "last_seen": "2026-11-19T03:10:02Z",
       "observed": []
      }
     ]
    }
   ]
  },
  {
   "provider": "openai_subscription",
   "label": "OpenAI",
   "plans": [
    {
     "plan": "chatgpt-personal",
     "label": "subscription",
     "account": "personal",
     "binding": "primary_10080m",
     "windows": [
      {
       "window": "secondary_300m",
       "used_percent": 4,
       "reset_at": "2026-11-19T09:12:00Z",
       "status": "allowed",
       "source": "observed_headers",
       "fetched_at": "2026-11-16T05:58:00Z",
       "stale": true
      },
      {
       "window": "primary_10080m",
       "used_percent": 100,
       "reset_at": "2026-11-20T18:00:00Z",
       "status": "rejected",
       "source": "observed_headers",
       "fetched_at": "2026-11-16T05:58:00Z",
       "stale": true
      }
     ],
     "access": [
      {
       "gateway": "rou2",
       "host": "spain",
       "via": "chatgpt-personal",
       "requests": 0,
       "input_tokens": 0,
       "output_tokens": 0,
       "cache_read_tokens": 0,
       "cache_write_tokens": 0,
       "cache_read_share": null,
       "priced_requests": 0,
       "list_cost_usd": null,
       "last_seen": "2026-11-16T05:58:00Z",
       "observed": []
      }
     ]
    }
   ]
  },
  {
   "provider": "gemini",
   "label": "Google",
   "plans": [
    {
     "plan": "gemini",
     "label": "subscription",
     "account": "personal",
     "binding": "daily",
     "windows": [
      {
       "window": "daily",
       "used_percent": 34,
       "reset_at": "2026-11-19T08:00:00Z",
       "status": "allowed",
       "source": "provider_reported",
       "fetched_at": "2026-11-19T06:30:00Z",
       "stale": false
      }
     ],
     "access": [
      {
       "gateway": "rou2",
       "host": "spain",
       "via": "gemini",
       "requests": 61,
       "input_tokens": 220144,
       "output_tokens": 18230,
       "cache_read_tokens": 0,
       "cache_write_tokens": 0,
       "cache_read_share": 0.0,
       "priced_requests": 61,
       "list_cost_usd": 0.41,
       "last_seen": "2026-11-19T06:20:11Z",
       "observed": []
      }
     ]
    },
    {
     "plan": "unidentified",
     "label": "unidentified plan",
     "account": null,
     "binding": null,
     "windows": [],
     "access": [
      {
       "gateway": "direct",
       "host": "cheroot",
       "via": "gemini",
       "requests": 3,
       "input_tokens": 9100,
       "output_tokens": 640,
       "cache_read_tokens": 0,
       "cache_write_tokens": 0,
       "cache_read_share": 0.0,
       "priced_requests": 3,
       "list_cost_usd": null,
       "last_seen": "2026-11-18T22:04:00Z",
       "observed": []
      }
     ]
    }
   ]
  },
  {
   "provider": "explabs",
   "label": "Experiential Labs",
   "plans": [
    {
     "plan": "explabs",
     "label": "pay as you go",
     "account": "personal",
     "windows": [],
     "binding": null,
     "access": [
      {
       "gateway": "rou2",
       "host": "spain",
       "via": "explabs",
       "requests": 2,
       "input_tokens": 1918,
       "output_tokens": 67,
       "cache_read_tokens": 0,
       "cache_write_tokens": 0,
       "cache_read_share": 0,
       "priced_requests": 2,
       "list_cost_usd": 0.002253,
       "last_seen": "2026-11-19T04:45:32Z",
       "observed": []
      }
     ]
    }
   ]
  },
  {
   "provider": "modelflare",
   "label": "Modelflare",
   "plans": [
    {
     "plan": "modelflare",
     "label": "pay as you go",
     "account": "personal",
     "windows": [],
     "binding": null,
     "access": [
      {
       "gateway": "rou2",
       "host": "spain",
       "via": "modelflare",
       "requests": 17,
       "input_tokens": 48211,
       "output_tokens": 9034,
       "cache_read_tokens": 120400,
       "cache_write_tokens": 0,
       "cache_read_share": 0.7140696633078506,
       "priced_requests": 17,
       "list_cost_usd": 0.1932,
       "last_seen": "2026-11-19T05:02:40Z",
       "observed": []
      }
     ]
    }
   ]
  },
  {
   "provider": "azure",
   "label": "Azure",
   "plans": [
    {
     "plan": "azure",
     "label": "pay as you go",
     "account": "personal",
     "windows": [],
     "binding": null,
     "access": [
      {
       "gateway": "rou2",
       "host": "spain",
       "via": "azure",
       "requests": 0,
       "input_tokens": 0,
       "output_tokens": 0,
       "cache_read_tokens": 0,
       "cache_write_tokens": 0,
       "cache_read_share": null,
       "priced_requests": 0,
       "list_cost_usd": null,
       "last_seen": null,
       "observed": []
      }
     ]
    }
   ]
  }
 ]
};
window.USAGE_NOW = Date.parse("2026-11-19T06:34:20Z");
window.USAGE_OPENED = [];
window.usage = z2.usageBand(document.getElementById("usage"), {
  now: function () { return window.USAGE_NOW; },
  timeZone: "UTC",
  planLabel: function (pv, pl) {
    if (pl.label === "subscription") return { anthropic: "Claude Max", openai_subscription: "ChatGPT", gemini: "Gemini Code Assist" }[pv.provider] || "Subscription";
    if (pl.label === "pay as you go") return "API key";
    if (pl.label === "unidentified plan") return "Unidentified plan";
    return pl.label;
  },
  onOpen: function (ref) { window.USAGE_OPENED.push(ref); }
});
if (!/[?&]hold\b/.test(location.search)) window.usage.update(window.USAGE_SPAIN);

# figchat benchmarks

    nix run .#figchat-bench -- $(nix build .#figchat-shell --print-out-paths)          # writes bench/results/<date>-<sha>.json
    nix run .#figchat-bench -- check bench/results/<file>.json bench/budgets.json
    nix run .#figchat-bench -- chart                                                   # bench/chart.html from every result
    nix build .#checks.x86_64-linux.figchat-perf                                       # bench plus budget check, fails on regression

Chromium at 390x844 unless named. The door is `test/figchat-server.js` (the mock's bench mode: `--history`, `--page`, `--fps`, `--bytes`, `--chunk`) with `bench/door.js` preloaded, which adds only what the mock lacks:

- `BENCH_ASSET_CACHE=<value>`: Cache-Control on `/chat/assets/*` (the bench uses the gateway's `private, max-age=3600`).
- `GET /__bench/send?count=N&text=T`: N `figaro.qua` calls on the main aria, as if from another client.
- `GET /__bench/status`: running, queued, turn count, bytes of the last sealed turn.

The page's own hooks are read through `data-testid` (`composer-input`, `transcript-scroller`) and the `figchat:attach` and `figchat:first-frame` marks.

What each section measures:

| key | how |
|---|---|
| bundle | every file of the shell, raw, gzip -9, brotli 11; `unhashed` lists names without a content hash |
| load.cold / load.warm | fresh context, then a second page in the same context; paint entries, `tti` is link live plus a tree row plus two frames; wire bytes and cache hits from CDP |
| attach | `#/` loaded, then the hash set to the main aria; `first_frame` is the time to more than three turns painted (two frames), `app_mark` is the page's own `figchat:attach` to `figchat:first-frame` |
| input[] | CPU throttle 1x and 4x. `keydown_to_paint` is keydown timestamp to the task after the next frame; `roundtrip` is `keystrokes()` from the test kit. Idle, during the mock's tool reply, and during a 24 KB prose reply (`streaming_long.series`, per window of 25 keys) |
| stream_frame | per 40 ms stream frame: React commits, components rendered (counted through the DevTools hook, split into live turn, settled turns, outside the transcript), CDP script, layout and style |
| input_webkit | the same keydown-to-paint in WebKit with the iPhone 15 profile, idle and during the long reply |
| scroll | wheel flings toward the top of a 10 000-turn history: rAF frame times, long tasks, turns paged in |
| scroll_dom | flings through the transcript left by the memory run (200+ turns in the DOM) |
| memory | 200 turns streamed one after another at 2 ms frames; heap after GC, DOM elements and listeners per turn; `after_detach` is the heap once the aria is left |
| wire | door frames and bytes per turn over the same run, by message kind |
| session | 500 turns of 3 KB (150 B per frame, 200 fps) streamed into one aria in batches of 100; heap after GC, DOM elements and listeners at each batch end, wire bytes per turn. Compresses a two hour session (a turn every 15 s) into about a minute |

'use strict';
const mock = require('../examples/aria-mock.js');

const TABLE = 'The two layouts, side by side:\n\n| layout | crossings | width | verdict |\n| --- | ---: | ---: | --- |\n| layered (Sugiyama) | 3 | 1240px | keep |\n| force | 11 | 980px | drop |\n\nA long unbroken token: `figaro/api/livedoc/settle_round_closes_when_the_live_cursor_passes_the_anchor` and a link https://example.com/a/very/long/path/that/should/wrap/somewhere/sensible';

const create = mock.create;
mock.create = function (o) {
  const core = create(o);
  const lane = core.arias[core.ids.lane];
  const t = lane.turns[lane.turns.length - 1];
  const at = t.at + 30000;
  lane.turns.push({ id: t.id + 1, inquiry: 'Compare the two layouts in a table, and quote the rule.', sealed: true, at, lastV: 0, nodes: [
    { type: 'thinking', role: 'output', at: at + 1000, markdown: 'A table is the shortest honest answer here.' },
    { type: 'prose', role: 'output', at: at + 2000, markdown: TABLE },
    { type: 'tool', role: 'output', at: at + 3000, name: 'bash', tool_call_id: 'call_fail', status: 'error', args: { command: 'go test ./layout/...' }, summary: 'command=go test ./layout/...', output: 'FAIL\tfigaro/layout\t0.4s\npanic: nil node', output_base: 0, opened_at: at + 2400, started_at: at + 2500, finished_at: at + 2900 },
    { type: 'prose', role: 'output', at: at + 4000, markdown: '> A node is settled only when the round closes.\n\nThe failing test is unrelated; it panics on a nil node before layout runs.' },
  ] });
  return core;
};

require('./figchat-server.js');

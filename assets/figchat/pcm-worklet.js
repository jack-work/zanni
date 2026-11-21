(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (typeof registerProcessor === 'function') registerProcessor('figchat-pcm', api.makeProcessor(AudioWorkletProcessor));
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TARGET_RATE = 16000;
  var FRAME_MS = 40;
  var FRAME_SAMPLES = TARGET_RATE * FRAME_MS / 1000;
  var LEVEL_GAIN = 6;
  var CUTOFF = 0.9;
  var LOBES = 4;

  function Framer(sourceRate, emit) {
    this.step = sourceRate / TARGET_RATE;
    this.emit = emit;
    this.cut = this.step > 1 ? CUTOFF / this.step : 1;
    this.reach = this.step > 1 ? Math.ceil(LOBES / this.cut) : 1;
    this.buf = new Float32Array(0);
    this.pos = 0;
    this.frame = new Int16Array(FRAME_SAMPLES);
    this.n = 0;
    this.energy = 0;
  }

  Framer.prototype.sample = function (pos) {
    var buf = this.buf;
    var i0 = Math.floor(pos);
    var frac = pos - i0;
    if (this.step <= 1) return buf[i0] + (buf[i0 + 1] - buf[i0]) * frac;
    var sum = 0;
    var norm = 0;
    for (var k = -this.reach + 1; k <= this.reach; k++) {
      var t = k - frac;
      var x = t * this.cut;
      var w = x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
      w *= 0.5 + 0.5 * Math.cos(Math.PI * t / this.reach);
      norm += w;
      var at = i0 + k;
      if (at >= 0) sum += w * buf[at];
    }
    return sum / norm;
  };

  Framer.prototype.push = function (block) {
    var buf = new Float32Array(this.buf.length + block.length);
    buf.set(this.buf, 0);
    buf.set(block, this.buf.length);
    this.buf = buf;
    var pos = this.pos;
    while (pos + this.reach < buf.length - 1) {
      this.put(this.sample(pos));
      pos += this.step;
    }
    var drop = Math.max(0, Math.floor(pos) - this.reach);
    this.buf = buf.slice(drop);
    this.pos = pos - drop;
  };

  Framer.prototype.put = function (v) {
    if (v > 1) v = 1;
    else if (v < -1) v = -1;
    this.frame[this.n++] = v < 0 ? v * 32768 : v * 32767;
    this.energy += v * v;
    if (this.n === FRAME_SAMPLES) {
      var rms = Math.sqrt(this.energy / FRAME_SAMPLES);
      var out = this.frame.buffer;
      this.frame = new Int16Array(FRAME_SAMPLES);
      this.n = 0;
      this.energy = 0;
      this.emit(out, Math.min(1, rms * LEVEL_GAIN));
    }
  };

  function makeProcessor(Base) {
    return class extends Base {
      constructor() {
        super();
        var port = this.port;
        this.framer = new Framer(sampleRate, function (buffer, level) { port.postMessage({ pcm: buffer, level: level }, [buffer]); });
      }

      process(inputs) {
        var ch = inputs[0] && inputs[0][0];
        if (ch && ch.length) this.framer.push(ch);
        return true;
      }
    };
  }

  return { Framer: Framer, makeProcessor: makeProcessor, TARGET_RATE: TARGET_RATE, FRAME_MS: FRAME_MS, FRAME_SAMPLES: FRAME_SAMPLES };
}));

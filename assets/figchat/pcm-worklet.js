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

  function Framer(sourceRate, emit) {
    this.step = sourceRate / TARGET_RATE;
    this.emit = emit;
    this.pos = 0;
    this.last = 0;
    this.has = false;
    this.frame = new Int16Array(FRAME_SAMPLES);
    this.n = 0;
    this.energy = 0;
  }

  Framer.prototype.push = function (block) {
    var buf = block;
    if (this.has) {
      buf = new Float32Array(block.length + 1);
      buf[0] = this.last;
      buf.set(block, 1);
    }
    var pos = this.pos;
    while (pos + 1 < buf.length) {
      var i0 = Math.floor(pos);
      this.put(buf[i0] + (buf[i0 + 1] - buf[i0]) * (pos - i0));
      pos += this.step;
    }
    this.pos = pos - (buf.length - 1);
    this.last = buf[buf.length - 1];
    this.has = true;
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

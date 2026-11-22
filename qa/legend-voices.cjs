const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

module.exports = (async () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../vo/manifest.json'), 'utf8'));
  const ctx = vm.createContext({ performance: { now: () => 0 }, setTimeout() {}, clearTimeout() {},
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve(manifest) }) });
  ctx.window = ctx;
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/audio.js'), 'utf8'), ctx);
  await new Promise(resolve => ctx.PH.audio.voWhenReady(resolve));
  for (const [key, intro, reply] of [
    ['tmac', '半步就行。剩下的是出手。', '我不后仰，你也得先跟上。'],
    ['nash', '你盯我，顺下的那位谁管？', '你没跟出来？那这球我自己投。'],
    ['rip', '你跟我跑就好。一会儿还有一圈。', '我在肘区等你，别迟到。']
  ]) {
    const pack = manifest.voices[key], data = fs.readFileSync(path.join(__dirname, '../vo', pack.s));
    assert.equal(pack.voice, 'zh-CN-YunxiNeural');
    assert.equal(pack.s, 'p/' + key + '.mp3');
    assert.equal(data.length, pack.frames * 120);
    const lines = Object.values(pack.lines).flat();
    assert.equal(lines.length, 8);
    assert.equal(new Set(lines.map(it => it.f)).size, 8);
    let offset = 0;
    for (const it of lines) {
      assert.equal(it.o, offset);
      assert(it.n > 0 && it.d > 0.5 && Math.abs(it.d - it.n * 0.024) < 0.002);
      for (let frame = it.o; frame < it.o + it.n; frame++) {
        const h = data.readUInt32BE(frame * 120);
        assert.equal(h >>> 21, 0x7ff, 'MP3 sync');
        assert.equal((h >>> 19) & 3, 2, 'MPEG2');
        assert.equal((h >>> 17) & 3, 1, 'Layer III');
        assert.equal((h >>> 12) & 15, 5, '40kbps');
        assert.equal((h >>> 10) & 3, 1, '24kHz');
        assert.equal((h >>> 9) & 1, 0, 'no padding: exactly 120 bytes per frame');
      }
      offset += it.n;
    }
    assert.equal(offset, pack.frames);
    assert.equal(ctx.PH.audio.voLine(key, 'dom', 0).t, intro);
    assert.equal(ctx.PH.audio.voLine(key, 'taunt', 1).t, reply);
    const skip = new Set([pack.lines.taunt[0].f]);
    assert.equal(ctx.PH.audio.voLine(key, 'taunt', 0, skip).t, reply, 'walk-in clip is not repeated by comeback');
    assert.equal(ctx.PH.audio.voLine(key, 'missing', 0), null);
    assert.equal(ctx.PH.audio.voSay(ctx.PH.audio.voLine(key, 'dom', 0)), false, 'no audio device remains safe');
    console.log('PASS:', key, '8 Mandarin voice lines, contiguous 120-byte sprites, real manifest intro/comeback and offline-device safety');
  }

  const gainNodes = [], voices = [], tones = [];
  const param = () => ({ setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  class AudioContext {
    currentTime = 1;
    sampleRate = 24000;
    createGain() {
      const node = { gain: param(), connect(dest) { this.dest = dest; return dest; } };
      gainNodes.push(node);
      return node;
    }
    createBuffer() { return { getChannelData: () => new Float32Array(this.sampleRate) }; }
    createBiquadFilter() { return { frequency: param(), Q: {}, connect: (dest) => dest }; }
    createOscillator() { return { frequency: param(), connect: (dest) => dest, start: (when) => tones.push(when), stop() {} }; }
    createBufferSource() {
      return {
        connect(dest) { this.dest = dest; return dest; },
        start(when) { if (this.buffer.decoded) voices.push({ when, dest: this.dest, buffer: this.buffer }); },
        stop() {}
      };
    }
    decodeAudioData(data, resolve) { resolve({ decoded: data, duration: data.byteLength / 120 * 0.024 }); }
  }
  ctx.AudioContext = AudioContext;
  ctx.fetch = async (url) => {
    const data = fs.readFileSync(path.join(__dirname, '..', url));
    return { ok: true, arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) };
  };
  const audio = ctx.PH.audio;
  audio.play('foulWhistle');
  assert.deepEqual(tones, [1, 1, 1.155, 1.155], 'two distinct whistle blasts');
  const foulGain = gainNodes[5];
  assert.equal(foulGain.gain.value, 1.3, 'the foul whistle is boosted locally');
  assert.equal(foulGain.dest, gainNodes[3], 'the boost still uses the SFX bus');
  const foulLayers = gainNodes.slice(6);
  assert.equal(foulLayers.length, 6, 'two tones and a noise layer per blast');
  assert(foulLayers.every(layer => layer.dest === foulGain), 'all whistle layers share the boost');
  for (const [event, key, index, line] of [
    ['foulCharge', 'daniels', 1, '啧，碰一下也算我犯规？'],
    ['foulShot', 'edwards', 1, '嘶，裁判你看见没？'],
    ['foulAndOne', 'chet', 1, '嘿，犯规也拦不住我！']
  ]) {
    const pack = manifest.voices[key], clip = pack.lines.hurt[index];
    assert.equal(audio.vo('curry', event, 'pri').t, line);
    await new Promise(setImmediate);
    const { when, dest, buffer } = voices.shift();
    assert(when > tones.at(-1) + 0.18, 'reaction starts after the whistle');
    assert.equal(dest, gainNodes[4], 'reaction uses the voice bus');
    const data = fs.readFileSync(path.join(__dirname, '../vo', pack.s));
    assert.deepEqual(Buffer.from(buffer.decoded), data.subarray(clip.o * 120, (clip.o + clip.n) * 120));
  }
  audio.setMix('vo', 0);
  assert.equal(gainNodes[4].gain.value, 0);
  audio.setMix('sfx', 0);
  assert.equal(gainNodes[3].gain.value, 0);
  audio.setVo(false);
  assert.equal(audio.vo('curry', 'foulShot', 'pri'), null);
  audio.setVo(true);
  audio.setSfx(false);
  audio.play('foulWhistle');
  assert.equal(audio.vo('curry', 'foulShot', 'pri'), null);
  assert.equal(tones.length, 4);
  console.log('PASS foul mixer: two whistle blasts, three existing Mandarin clips, whistle before voice, existing mutes and mixer buses');
})().catch(error => { console.error(error); process.exitCode = 1; });

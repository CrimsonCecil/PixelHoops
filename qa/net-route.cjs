// rooms.js routeInfo: selected ICE pair -> HUD route, TURN leg transport and ICE RTT.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '../js/rooms.js'), 'utf8');
const start = src.indexOf('  function routeInfo(stats)');
const routeInfo = new Function(src.slice(start, src.indexOf('  function directIce', start)) + '\nreturn routeInfo;')();
const stats = (local, remote, pair = {}) => new Map([
  ['T', { type: 'transport', selectedCandidatePairId: 'P' }],
  ['L', { type: 'local-candidate', id: 'L', ...local }],
  ['R', { type: 'remote-candidate', id: 'R', ...remote }],
  ['P', { type: 'candidate-pair', id: 'P', localCandidateId: 'L', remoteCandidateId: 'R', ...pair }],
]);
assert.deepEqual(routeInfo(stats({ candidateType: 'srflx', protocol: 'udp' }, { candidateType: 'prflx' }, { currentRoundTripTime: 0.0234 })), { route: 'direct', proto: '', rtt: 23 });
assert.deepEqual(routeInfo(stats({ candidateType: 'relay', protocol: 'udp', relayProtocol: 'tcp' }, { candidateType: 'srflx' }, { currentRoundTripTime: 0.7 })), { route: 'turn', proto: 'tcp', rtt: 700 });
assert.deepEqual(routeInfo(stats({ candidateType: 'relay', protocol: 'udp', relayProtocol: 'udp' }, { candidateType: 'relay' })), { route: 'turn', proto: 'udp', rtt: null });
assert.deepEqual(routeInfo(stats({ candidateType: 'host' }, { candidateType: 'relay' }, { currentRoundTripTime: 0.08 })), { route: 'turn', proto: 'peer', rtt: 80 });
// No transport report (Firefox): fall back to the nominated succeeded pair.
const ff = stats({ candidateType: 'host' }, { candidateType: 'host' }, { nominated: true, state: 'succeeded' }); ff.delete('T');
assert.equal(routeInfo(ff).route, 'direct');
assert.equal(routeInfo(new Map()), null);
console.log('PASS: routeInfo reports route, TURN leg transport (udp/tcp/peer) and ICE RTT from getStats.');

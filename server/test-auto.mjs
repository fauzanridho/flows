/**
 * Automated test for signaling server.
 * Run: node server/test-auto.mjs
 * Requires wrangler dev running at localhost:8787
 */

import WebSocket from 'ws'; // Use: npx -y tsx server/test-auto.mjs (or install ws)

const URL = 'ws://localhost:8787/ws';
const TOKEN = 'dev-test-token-ganti-di-production-min32char';
const HEADERS = { Authorization: `Bearer ${TOKEN}` };

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}`);
    failed++;
  }
}

function connect(name) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL, { headers: HEADERS });
    const messages = [];
    ws.on('open', () => resolve({ ws, messages, name }));
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      messages.push(msg);
    });
    ws.on('error', reject);
  });
}

function waitMsg(client, type, timeout = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${type} on ${client.name}`)), timeout);
    const check = () => {
      const idx = client.messages.findIndex(m => m.type === type);
      if (idx >= 0) {
        clearTimeout(timer);
        resolve(client.messages.splice(idx, 1)[0]);
      } else {
        setTimeout(check, 50);
      }
    };
    check();
  });
}

function send(client, msg) {
  client.ws.send(JSON.stringify(msg));
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('\n🧪 Test 1: Wrong token → 401');
  try {
    await new Promise((resolve, reject) => {
      const ws = new WebSocket(URL, { headers: { Authorization: 'Bearer wrong' } });
      ws.on('open', () => { reject(new Error('Should not connect')); ws.close(); });
      ws.on('unexpected-response', (req, res) => { resolve(res.statusCode); });
      ws.on('error', () => resolve(401));
    });
    assert(true, 'Wrong token rejected');
  } catch (e) {
    assert(false, `Wrong token: ${e.message}`);
  }

  console.log('\n🧪 Test 2: Two clients join');
  const clientA = await connect('A');
  send(clientA, { type: 'join', deviceId: 'A', platform: 'test', appVersion: '1.0.0' });
  const joinedA = await waitMsg(clientA, 'joined');
  assert(joinedA.role === 'impolite', `A is impolite (got ${joinedA.role})`);
  assert(joinedA.peers.length === 0, 'A has no peers initially');

  const clientB = await connect('B');
  send(clientB, { type: 'join', deviceId: 'B', platform: 'test', appVersion: '1.0.0' });
  const joinedB = await waitMsg(clientB, 'joined');
  assert(joinedB.role === 'polite', `B is polite (got ${joinedB.role})`);
  assert(joinedB.peers.includes('A'), 'B sees A as peer');

  const peerJoinedA = await waitMsg(clientA, 'peer-joined');
  assert(peerJoinedA.deviceId === 'B', 'A received peer-joined for B');

  const peerJoinedB = await waitMsg(clientB, 'peer-joined');
  assert(peerJoinedB.deviceId === 'A', 'B received peer-joined for A');

  console.log('\n🧪 Test 3: Signal relay');
  send(clientA, { type: 'signal', kind: 'offer', data: { type: 'offer', sdp: 'test-sdp' } });
  const signalB = await waitMsg(clientB, 'signal');
  assert(signalB.kind === 'offer', 'B received offer');
  assert(signalB.data.sdp === 'test-sdp', 'SDP forwarded correctly');

  send(clientB, { type: 'signal', kind: 'answer', data: { type: 'answer', sdp: 'answer-sdp' } });
  const signalA = await waitMsg(clientA, 'signal');
  assert(signalA.kind === 'answer', 'A received answer');

  console.log('\n🧪 Test 4: State relay');
  send(clientA, { type: 'state', muted: true, camera: false, screen: false, mode: 'sleep' });
  const stateB = await waitMsg(clientB, 'state');
  assert(stateB.muted === true, 'State muted relayed');
  assert(stateB.mode === 'sleep', 'State mode relayed');

  console.log('\n🧪 Test 5: Third client → room-full');
  const clientC = await connect('C');
  send(clientC, { type: 'join', deviceId: 'C', platform: 'test', appVersion: '1.0.0' });
  const errorC = await waitMsg(clientC, 'error');
  assert(errorC.code === 'room-full', `C gets room-full (got ${errorC.code})`);
  await sleep(500);

  console.log('\n🧪 Test 6: Same deviceId replace');
  const clientA2 = await connect('A2');
  send(clientA2, { type: 'join', deviceId: 'A', platform: 'test', appVersion: '1.0.0' });

  // Old A should get replaced
  const replacedA = await waitMsg(clientA, 'error');
  assert(replacedA.code === 'replaced', 'Old A got replaced');

  // New A gets joined
  const joinedA2 = await waitMsg(clientA2, 'joined');
  assert(joinedA2.peers.includes('B'), 'New A sees B');

  // B should get peer-left then peer-joined
  const peerLeftB = await waitMsg(clientB, 'peer-left');
  assert(peerLeftB.deviceId === 'A', 'B got peer-left for old A');
  const peerJoinedB2 = await waitMsg(clientB, 'peer-joined');
  assert(peerJoinedB2.deviceId === 'A', 'B got peer-joined for new A');

  console.log('\n🧪 Test 7: Leave');
  send(clientB, { type: 'leave' });
  await sleep(500);
  const peerLeftA2 = await waitMsg(clientA2, 'peer-left');
  assert(peerLeftA2.deviceId === 'B', 'New A got peer-left for B');

  console.log('\n🧪 Test 8: Reconnect after leave');
  const clientB2 = await connect('B2');
  send(clientB2, { type: 'join', deviceId: 'B', platform: 'test', appVersion: '1.0.0' });
  const joinedB2 = await waitMsg(clientB2, 'joined');
  assert(joinedB2.role === 'polite', 'Reconnected B is polite');
  assert(joinedB2.peers.includes('A'), 'Reconnected B sees A');

  console.log('\n🧪 Test 9: Bad messages');
  send(clientB2, { foo: 'bar' }); // no type
  await sleep(200);
  const badMsg = await waitMsg(clientB2, 'error');
  assert(badMsg.code === 'bad-message', 'No type → bad-message');

  console.log('\n🧪 Test 10: Ping/pong');
  send(clientB2, { type: 'ping' });
  const pong = await waitMsg(clientB2, 'pong');
  assert(pong.type === 'pong', 'Pong received');

  // Cleanup
  clientA2.ws.close();
  clientB2.ws.close();
  clientC.ws.close();

  console.log(`\n${'═'.repeat(40)}`);
  console.log(`✅ Passed: ${passed}  ❌ Failed: ${failed}`);
  console.log(`${'═'.repeat(40)}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('Test error:', e);
  process.exit(1);
});

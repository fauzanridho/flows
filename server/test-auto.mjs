/**
 * Automated test for signaling server (Tahap 3).
 * Run: node server/test-auto.mjs
 * Requires wrangler dev running at localhost:8787
 */

import WebSocket from 'ws';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read token from .dev.vars
let TOKEN = 'aef8cd2699d8fe5415f7e5e7c210b22bb5e02234f460a1b0427a2df734577f88';
try {
  const varsPath = path.join(__dirname, '.dev.vars');
  if (fs.existsSync(varsPath)) {
    const vars = fs.readFileSync(varsPath, 'utf-8');
    const match = vars.match(/ROOM_TOKEN\s*=\s*["']([^"']+)["']/);
    if (match) TOKEN = match[1];
  }
} catch (e) {}

const URL = 'ws://localhost:8787/ws';
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

function connect(name, customHeaders = HEADERS) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(URL, { headers: customHeaders });
    const messages = [];
    ws.on('open', () => resolve({ ws, messages, name }));
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      messages.push(msg);
    });
    ws.on('error', reject);
  });
}

function waitMsg(client, type, timeout = 2500) {
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
  console.log(`\n🚀 Memulai test suite Tahap 3 (Target: ${URL})...\n`);

  console.log('🧪 Test 1: Wrong token → 401');
  try {
    const status = await new Promise((resolve, reject) => {
      const ws = new WebSocket(URL, { headers: { Authorization: 'Bearer wrong-token' } });
      ws.on('open', () => { reject(new Error('Should not connect')); ws.close(); });
      ws.on('unexpected-response', (req, res) => { resolve(res.statusCode); });
      ws.on('error', (err) => resolve(401));
    });
    assert(status === 401, `Wrong token rejected with 401 (got ${status})`);
  } catch (e) {
    assert(false, `Wrong token test: ${e.message}`);
  }

  console.log('\n🧪 Test 2: Two clients join & ICE servers');
  const clientA = await connect('A');
  send(clientA, { type: 'join', deviceId: 'A', platform: 'android', appVersion: '1.0.0' });
  const joinedA = await waitMsg(clientA, 'joined');
  assert(joinedA.role === 'impolite', `A is impolite (got ${joinedA.role})`);
  assert(joinedA.peers.length === 0, 'A has no peers initially');
  assert(Array.isArray(joinedA.iceServers) && joinedA.iceServers.length > 0, 'A receives iceServers');

  const clientB = await connect('B');
  send(clientB, { type: 'join', deviceId: 'B', platform: 'android', appVersion: '1.0.0' });
  const joinedB = await waitMsg(clientB, 'joined');
  assert(joinedB.role === 'polite', `B is polite (got ${joinedB.role})`);
  assert(joinedB.peers.includes('A'), 'B sees A as peer');
  assert(Array.isArray(joinedB.iceServers) && joinedB.iceServers.length > 0, 'B receives iceServers');

  const peerJoinedA = await waitMsg(clientA, 'peer-joined');
  assert(peerJoinedA.deviceId === 'B', 'A received peer-joined for B');

  const peerJoinedB = await waitMsg(clientB, 'peer-joined');
  assert(peerJoinedB.deviceId === 'A', 'B received peer-joined for A');

  console.log('\n🧪 Test 3: Signal relay with deviceId preservation');
  send(clientA, { type: 'signal', kind: 'offer', data: { type: 'offer', sdp: 'test-sdp' } });
  const signalB = await waitMsg(clientB, 'signal');
  assert(signalB.kind === 'offer', 'B received offer');
  assert(signalB.data.sdp === 'test-sdp', 'SDP forwarded correctly');
  assert(signalB.deviceId === 'A', 'Signal includes deviceId of sender');

  send(clientB, { type: 'signal', kind: 'answer', data: { type: 'answer', sdp: 'answer-sdp' } });
  const signalA = await waitMsg(clientA, 'signal');
  assert(signalA.kind === 'answer', 'A received answer');
  assert(signalA.deviceId === 'B', 'Signal answer includes deviceId of sender');

  console.log('\n🧪 Test 4: State relay');
  send(clientA, { type: 'state', muted: true, camera: false, screen: false, mode: 'sleep' });
  const stateB = await waitMsg(clientB, 'state');
  assert(stateB.muted === true, 'State muted relayed');
  assert(stateB.mode === 'sleep', 'State mode relayed');
  assert(stateB.deviceId === 'A', 'State includes deviceId');

  console.log('\n🧪 Test 5: Third client → room-full');
  const clientC = await connect('C');
  send(clientC, { type: 'join', deviceId: 'C', platform: 'android', appVersion: '1.0.0' });
  const errorC = await waitMsg(clientC, 'error');
  assert(errorC.code === 'room-full', `C gets room-full (got ${errorC.code})`);
  await sleep(300);

  console.log('\n🧪 Test 6: Same deviceId replace');
  const clientA2 = await connect('A2');
  send(clientA2, { type: 'join', deviceId: 'A', platform: 'android', appVersion: '1.0.0' });

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
  await sleep(400);
  const peerLeftA2 = await waitMsg(clientA2, 'peer-left');
  assert(peerLeftA2.deviceId === 'B', 'New A got peer-left for B');

  console.log('\n🧪 Test 8: Reconnect after leave');
  const clientB2 = await connect('B2');
  send(clientB2, { type: 'join', deviceId: 'B', platform: 'android', appVersion: '1.0.0' });
  const joinedB2 = await waitMsg(clientB2, 'joined');
  assert(joinedB2.role === 'polite', 'Reconnected B is polite');
  assert(joinedB2.peers.includes('A'), 'Reconnected B sees A');

  console.log('\n🧪 Test 9: Bad messages handling');
  send(clientB2, { foo: 'bar' }); // no type
  await sleep(150);
  const badMsg = await waitMsg(clientB2, 'error');
  assert(badMsg.code === 'bad-message', 'No type → bad-message');

  send(clientB2, { type: 'signal', kind: 'invalid-kind' });
  await sleep(150);
  const badSignal = await waitMsg(clientB2, 'error');
  assert(badSignal.code === 'bad-message', 'Invalid signal kind → bad-message');

  console.log('\n🧪 Test 10: Ping/pong auto-response');
  send(clientB2, { type: 'ping' });
  const pong = await waitMsg(clientB2, 'pong');
  assert(pong.type === 'pong', 'Pong received');

  // Cleanup
  clientA2.ws.close();
  clientB2.ws.close();
  clientC.ws.close();

  console.log(`\n${'═'.repeat(45)}`);
  console.log(`🏁 HASIL TEST: ✅ Passed: ${passed}  ❌ Failed: ${failed}`);
  console.log(`${'═'.repeat(45)}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('Test error:', e);
  process.exit(1);
});

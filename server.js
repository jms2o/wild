import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT || 3000);
const PUBLIC = join(process.cwd(), 'public');
const PROFILE_FILE = join(process.cwd(), 'data', 'profiles.json');
const WORLD = 2048;
const players = new Map();
const sockets = new Map();
const duels = new Map();
const colors = ['#ef7d57', '#f4b41a', '#7cc4e4', '#c75c96', '#72b16f', '#a890fe'];
let nextId = 1;

const zones = [
  { id: 'glade', name: 'Claro de Lumbre', x: 0, y: 0, w: 1024, h: 1024, ground: '#83bb75', grass: '#609f61', pool: ['Lumipup', 'Mosslet', 'Bramblet'] },
  { id: 'tide', name: 'Costa de Bruma', x: 1024, y: 0, w: 1024, h: 1024, ground: '#78b8bb', grass: '#53959c', pool: ['Lumipup', 'Mistfin', 'Nebulyn'] },
  { id: 'grove', name: 'Bosque Ámbar', x: 0, y: 1024, w: 1024, h: 1024, ground: '#b6a65f', grass: '#847b45', pool: ['Mosslet', 'Bramblet', 'Nebulyn', 'Auroryx'] },
  { id: 'ash', name: 'Tierras de Ceniza', x: 1024, y: 1024, w: 1024, h: 1024, ground: '#b86a55', grass: '#8d4d47', pool: ['Bramblet', 'Pyraxis', 'Cindrake'] }
];
const species = [
  { name: 'Lumipup', rarity: 'Común', type: 'Luz', color: '#f6d365', hp: 28, moves: [{ name: 'Destello', power: 10 }, { name: 'Rayo suave', power: 14 }] },
  { name: 'Mosslet', rarity: 'Común', type: 'Naturaleza', color: '#72c76d', hp: 30, moves: [{ name: 'Hoja viva', power: 10 }, { name: 'Raíz firme', power: 13 }] },
  { name: 'Bramblet', rarity: 'Poco común', type: 'Naturaleza', color: '#b07a4c', hp: 37, moves: [{ name: 'Látigo espina', power: 13 }, { name: 'Golpe corteza', power: 16 }] },
  { name: 'Mistfin', rarity: 'Poco común', type: 'Agua', color: '#72c9df', hp: 36, moves: [{ name: 'Burbuja', power: 12 }, { name: 'Marea baja', power: 16 }] },
  { name: 'Nebulyn', rarity: 'Rara', type: 'Éter', color: '#9d8cff', hp: 45, moves: [{ name: 'Pulso niebla', power: 15 }, { name: 'Cometa éter', power: 19 }] },
  { name: 'Pyraxis', rarity: 'Épica', type: 'Fuego', color: '#f26b38', hp: 54, moves: [{ name: 'Ascua', power: 18 }, { name: 'Llama espiral', power: 23 }] },
  { name: 'Cindrake', rarity: 'Épica', type: 'Fuego', color: '#df3f31', hp: 58, moves: [{ name: 'Garra ígnea', power: 20 }, { name: 'Cráter rojo', power: 24 }] },
  { name: 'Auroryx', rarity: 'Legendaria', type: 'Luz', color: '#ffe98a', hp: 70, moves: [{ name: 'Halo solar', power: 25 }, { name: 'Aurora final', power: 30 }] }
];
const byName = new Map(species.map(item => [item.name, item]));
const creatures = new Map();
const spawnWeight = { Común: 56, 'Poco común': 25, Rara: 12, Épica: 6, Legendaria: 1 };
let profiles = await loadProfiles();
let raid = freshRaid();

function freshRaid() { return { id: `raid-${Date.now()}`, active: true, name: 'Cindragon', type: 'Fuego', color: '#ff6546', x: 1640, y: 1550, hp: 420, maxHp: 420, members: new Set() }; }
async function loadProfiles() { try { return JSON.parse(await readFile(PROFILE_FILE, 'utf8')); } catch { return {}; } }
function persist() { mkdir(join(process.cwd(), 'data'), { recursive: true }).then(() => writeFile(PROFILE_FILE, JSON.stringify(profiles, null, 2))).catch(error => console.error('No se pudo guardar el progreso:', error.message)); }
function publicCreature(value) { const base = byName.get(value.name) || species[0]; return { name: base.name, rarity: base.rarity, type: base.type, color: base.color, hp: base.hp, moves: base.moves }; }
function profileFor(name) { const key = name.toLocaleLowerCase('es-MX'); if (!profiles[key]) profiles[key] = { captures: [publicCreature({ name: 'Lumipup' })], wins: 0, coins: 35 }; profiles[key].captures = profiles[key].captures.map(publicCreature); return { key, ...profiles[key] }; }
function savePlayer(player) { profiles[player.profileKey] = { captures: player.captures.map(publicCreature), wins: player.wins, coins: player.coins }; persist(); }
function message(ws, data) { if (ws?.readyState === ws.OPEN) ws.send(JSON.stringify(data)); }
function broadcast(data, except = null) { for (const [id, ws] of sockets) if (id !== except) message(ws, data); }
function cleanName(value) { const clean = String(value || 'Explorador').replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑ0-9 _-]/g, '').trim().slice(0, 14); return clean || 'Explorador'; }
function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function zoneAt(x, y) { return zones.find(zone => x >= zone.x && x < zone.x + zone.w && y >= zone.y && y < zone.y + zone.h) || zones[0]; }
function pickSpecies(zone) { const candidates = zone.pool.map(name => byName.get(name)); const total = candidates.reduce((sum, item) => sum + spawnWeight[item.rarity], 0); let roll = Math.random() * total; for (const item of candidates) { roll -= spawnWeight[item.rarity]; if (roll <= 0) return item; } return candidates[0]; }
function spawnCreature(zone = zones[Math.floor(Math.random() * zones.length)]) { const info = pickSpecies(zone); const id = `c${nextId++}`; const creature = { id, ...publicCreature(info), zone: zone.id, x: zone.x + 72 + Math.floor(Math.random() * (zone.w - 144)), y: zone.y + 72 + Math.floor(Math.random() * (zone.h - 144)) }; creatures.set(id, creature); return creature; }
function raidState() { return { active: raid.active, name: raid.name, type: raid.type, color: raid.color, x: raid.x, y: raid.y, hp: raid.hp, maxHp: raid.maxHp, members: raid.members.size }; }
function raidBroadcast(text = null) { broadcast({ type: 'raidUpdate', raid: raidState(), text }); }
function duelPayload(player, rival, duel) { return { type: 'duelStart', rival: { id: rival.id, name: rival.name, creature: rival.captures[0] }, myHp: duel.hp[player.id], rivalHp: duel.hp[rival.id], turn: duel.turn, moves: player.captures[0].moves }; }
for (let i = 0; i < 36; i++) spawnCreature();

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.ico': 'image/x-icon' };
const server = createServer(async (req, res) => {
  const requested = req.url === '/' ? 'index.html' : req.url.split('?')[0].replace(/^\/+/, ''); const target = normalize(join(PUBLIC, requested));
  if (!target.startsWith(PUBLIC)) { res.writeHead(403); res.end('Forbidden'); return; }
  try { const file = await readFile(target); res.writeHead(200, { 'content-type': mime[extname(target)] || 'application/octet-stream' }); res.end(file); } catch { res.writeHead(404); res.end('No encontrado'); }
});
const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, socket, head) => { if (req.url === '/ws' || req.url === '/api/ws') wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws)); else socket.destroy(); });

wss.on('connection', ws => {
  let id = null;
  ws.on('message', raw => {
    let data; try { data = JSON.parse(raw.toString()); } catch { return; }
    if (data.type === 'join' && !id) {
      id = `p${nextId++}`; const name = cleanName(data.name); const profile = profileFor(name);
      const player = { id, name, x: 900 + Math.floor(Math.random() * 180), y: 900 + Math.floor(Math.random() * 180), color: colors[players.size % colors.length], profileKey: profile.key, captures: profile.captures, wins: profile.wins, coins: profile.coins };
      players.set(id, player); sockets.set(id, ws); message(ws, { type: 'init', id, players: [...players.values()], creatures: [...creatures.values()], zones, raid: raidState() });
      broadcast({ type: 'playerJoined', player }, id); broadcast({ type: 'notice', text: `${name} llegó al mundo.` }); return;
    }
    const player = players.get(id); if (!player) return;
    if (data.type === 'move') { const x = Number(data.x), y = Number(data.y); if (!Number.isFinite(x) || !Number.isFinite(y) || Math.hypot(x - player.x, y - player.y) > 36) return; player.x = Math.max(32, Math.min(WORLD - 32, x)); player.y = Math.max(32, Math.min(WORLD - 32, y)); broadcast({ type: 'playerMoved', id, x: player.x, y: player.y }, id); return; }
    if (data.type === 'capture') {
      const creature = creatures.get(data.creatureId); if (!creature || distance(player, creature) > 88) return;
      creatures.delete(creature.id); player.captures.push(publicCreature(creature)); player.coins += 5; savePlayer(player); broadcast({ type: 'creatureRemoved', id: creature.id }); message(ws, { type: 'captureResult', creature, coins: player.coins }); broadcast({ type: 'notice', text: `${player.name} capturó a ${creature.name} (${creature.rarity}).` });
      setTimeout(() => { const fresh = spawnCreature(zoneAt(creature.x, creature.y)); broadcast({ type: 'creatureSpawned', creature: fresh }); }, 7000); return;
    }
    if (data.type === 'duelRequest') { const rival = players.get(data.targetId); if (!rival || rival.id === id || distance(player, rival) > 130 || duels.has(id) || duels.has(rival.id)) return; message(sockets.get(rival.id), { type: 'duelInvite', from: { id: player.id, name: player.name } }); message(ws, { type: 'notice', text: `Invitación enviada a ${rival.name}.` }); return; }
    if (data.type === 'duelAnswer') {
      const challenger = players.get(data.fromId); if (!challenger || duels.has(id) || duels.has(challenger.id)) return;
      if (!data.accept) { message(sockets.get(challenger.id), { type: 'notice', text: `${player.name} rechazó el duelo.` }); return; }
      const duel = { a: challenger.id, b: player.id, hp: { [challenger.id]: challenger.captures[0].hp, [player.id]: player.captures[0].hp }, turn: challenger.id }; duels.set(challenger.id, duel); duels.set(player.id, duel);
      message(sockets.get(challenger.id), duelPayload(challenger, player, duel)); message(sockets.get(player.id), duelPayload(player, challenger, duel)); broadcast({ type: 'notice', text: `${challenger.name} y ${player.name} comenzaron un duelo.` }); return;
    }
    if (data.type === 'attack') {
      const duel = duels.get(id); if (!duel || duel.turn !== id) return;
      const rivalId = duel.a === id ? duel.b : duel.a; const move = player.captures[0].moves[Number(data.move) || 0] || player.captures[0].moves[0]; const damage = Math.max(5, move.power + Math.floor(Math.random() * 7) - 3); duel.hp[rivalId] -= damage;
      if (duel.hp[rivalId] <= 0) { player.wins++; player.coins += 25; savePlayer(player); for (const participantId of [id, rivalId]) message(sockets.get(participantId), { type: 'duelEnd', winner: player.name, coins: participantId === id ? player.coins : null }); duels.delete(id); duels.delete(rivalId); broadcast({ type: 'notice', text: `${player.name} ganó el duelo con ${move.name}.` }); }
      else { duel.turn = rivalId; for (const participantId of [id, rivalId]) message(sockets.get(participantId), { type: 'duelUpdate', attacker: id, move: move.name, damage, myHp: duel.hp[participantId], rivalHp: duel.hp[participantId === duel.a ? duel.b : duel.a], turn: duel.turn }); } return;
    }
    if (data.type === 'duelForfeit') {
      const duel = duels.get(id); if (!duel) return;
      const rivalId = duel.a === id ? duel.b : duel.a; const rival = players.get(rivalId);
      duels.delete(id); duels.delete(rivalId);
      for (const participantId of [id, rivalId]) message(sockets.get(participantId), { type: 'duelEnd', winner: rival?.name || 'El rival', coins: null });
      broadcast({ type: 'notice', text: `${player.name} abandonó el duelo.` }); return;
    }
    if (data.type === 'joinRaid') { if (!raid.active) { message(ws, { type: 'notice', text: 'La incursión se está preparando. Vuelve pronto.' }); return; } if (distance(player, raid) > 180) { message(ws, { type: 'notice', text: 'Acércate a Cindragon para unirte a la incursión.' }); return; } raid.members.add(id); message(ws, { type: 'raidJoined', moves: player.captures[0].moves }); raidBroadcast(`${player.name} se unió a la incursión.`); return; }
    if (data.type === 'raidAttack') {
      if (!raid.active || !raid.members.has(id)) return; const move = player.captures[0].moves[Number(data.move) || 0] || player.captures[0].moves[0]; const damage = Math.max(7, move.power + Math.floor(Math.random() * 9)); raid.hp = Math.max(0, raid.hp - damage);
      if (raid.hp > 0) { raidBroadcast(`${player.name} usó ${move.name}: ${damage} de daño.`); return; }
      const members = [...raid.members].map(memberId => players.get(memberId)).filter(Boolean); for (const winner of members) { winner.captures.push(publicCreature({ name: 'Cindrake' })); winner.coins += 100; savePlayer(winner); message(sockets.get(winner.id), { type: 'raidReward', creature: publicCreature({ name: 'Cindrake' }), coins: winner.coins }); }
      broadcast({ type: 'notice', text: `¡Cindragon fue vencido! ${members.length} explorador(es) recibieron a Cindrake.` }); raid.active = false; raidBroadcast('Incursión completada. Volverá en un momento.'); setTimeout(() => { raid = freshRaid(); raidBroadcast('¡Cindragon ha regresado a las Tierras de Ceniza!'); }, 45000);
    }
  });
  ws.on('close', () => { if (!id) return; const player = players.get(id); if (player) savePlayer(player); players.delete(id); sockets.delete(id); raid.members.delete(id); const duel = duels.get(id); if (duel) { duels.delete(duel.a); duels.delete(duel.b); } broadcast({ type: 'playerLeft', id }); raidBroadcast(); if (player) broadcast({ type: 'notice', text: `${player.name} salió del mundo.` }); });
});
if (!process.env.VERCEL) server.listen(PORT, () => console.log(`Wilds Online listo en http://localhost:${PORT}`));

export default server;

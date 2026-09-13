const canvas = document.querySelector('#world');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;
const state = { id:null, me:null, players:new Map(), creatures:new Map(), zones:[], raid:null, raidMoves:[], raidJoined:false, keys:new Set(), last:0, ws:null, camera:{x:0,y:0}, duel:null, invite:null };
const $ = query => document.querySelector(query);
const rarity = { 'Común':'#d4e7c4', 'Poco común':'#8ed0b4', Rara:'#7fa2f1', Épica:'#bd83ea', Legendaria:'#f3cf55' };

function notify(text) { const item = document.createElement('div'); item.textContent = text; $('#feed').prepend(item); setTimeout(() => item.remove(), 6000); }
function send(data) { if (state.ws?.readyState === WebSocket.OPEN) state.ws.send(JSON.stringify(data)); }
function zoneAt(x, y) { return state.zones.find(zone => x >= zone.x && x < zone.x + zone.w && y >= zone.y && y < zone.y + zone.h) || state.zones[0]; }
function renderCollection() {
  const rows = (state.me?.captures || []).slice(-5).reverse().map(c => `<div class="creature-row"><i class="dot" style="background:${c.color}"></i><span>${c.name}</span></div>`).join('');
  $('#collection').innerHTML = rows || '<span>Sin criaturas</span>'; $('#wins').textContent = `Victorias: ${state.me?.wins || 0}`; $('#coins').textContent = `Fragmentos: ${state.me?.coins || 0}`;
}
function renderRaid() {
  const active = state.raid?.active; const ratio = active ? state.raid.hp / state.raid.maxHp * 100 : 0;
  $('#raid-name').textContent = active ? `${state.raid.name} · ${state.raid.members} equipo` : 'Incursión en preparación';
  $('#raid-hp').style.width = `${ratio}%`; $('#raid-join').hidden = !active || state.raidJoined; $('#raid-join').textContent = 'Unirse a la incursión';
  $('#raid-info').textContent = state.raidJoined ? 'Elige un movimiento para atacar.' : active ? 'En Tierras de Ceniza. Acércate y usa R.' : 'Cindragon regresará pronto.';
  const actions = $('#raid-moves'); actions.innerHTML = '';
  if (state.raidJoined) state.raidMoves.forEach((move, index) => { const button = document.createElement('button'); button.className = 'move'; button.textContent = move.name; button.onclick = () => send({ type:'raidAttack', move:index }); actions.append(button); });
}
function connect() {
  const name = $('#name').value.trim() || 'Explorador'; state.ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/ws`);
  state.ws.addEventListener('open', () => send({ type:'join', name })); state.ws.addEventListener('close', () => notify('Conexión perdida. Recarga para volver.'));
  state.ws.addEventListener('message', event => handle(JSON.parse(event.data)));
}
function handle(data) {
  if (data.type === 'init') {
    state.id = data.id; data.players.forEach(player => state.players.set(player.id, player)); state.me = state.players.get(state.id); data.creatures.forEach(creature => state.creatures.set(creature.id, creature)); state.zones = data.zones; state.raid = data.raid;
    $('#login').hidden = true; $('#game').hidden = false; renderCollection(); renderRaid(); notify('Explora los cuatro biomas y busca criaturas especiales.'); requestAnimationFrame(loop); return;
  }
  if (data.type === 'playerJoined') state.players.set(data.player.id, data.player);
  if (data.type === 'playerLeft') state.players.delete(data.id);
  if (data.type === 'playerMoved') { const player = state.players.get(data.id); if (player) { player.x = data.x; player.y = data.y; } }
  if (data.type === 'creatureRemoved') state.creatures.delete(data.id);
  if (data.type === 'creatureSpawned') state.creatures.set(data.creature.id, data.creature);
  if (data.type === 'captureResult') { state.me.captures.push(data.creature); state.me.coins = data.coins; renderCollection(); notify(`¡${data.creature.name} se unió a tu colección!`); }
  if (data.type === 'notice') notify(data.text);
  if (data.type === 'duelInvite') { state.invite = data.from; $('#prompt-text').textContent = `${data.from.name} te reta a un duelo.`; $('#prompt').hidden = false; }
  if (data.type === 'duelStart') { state.duel = { rival:data.rival, myHp:data.myHp, rivalHp:data.rivalHp, turn:data.turn, moves:data.moves }; openBattle('¡El duelo comienza!'); }
  if (data.type === 'duelUpdate') { state.duel.myHp = data.myHp; state.duel.rivalHp = data.rivalHp; state.duel.turn = data.turn; openBattle(data.attacker === state.id ? `${data.move} impactó.` : `El rival usó ${data.move}: ${data.damage} de daño.`); }
  if (data.type === 'duelEnd') { notify(`${data.winner} ganó el duelo.`); if (data.winner === state.me.name) state.me.wins++; if (data.coins !== null) state.me.coins = data.coins; state.duel = null; $('#battle').hidden = true; renderCollection(); }
  if (data.type === 'raidJoined') { state.raidJoined = true; state.raidMoves = data.moves; renderRaid(); notify('¡Estás dentro de la incursión!'); }
  if (data.type === 'raidUpdate') { state.raid = data.raid; if (!data.raid.active) state.raidJoined = false; renderRaid(); if (data.text) notify(data.text); }
  if (data.type === 'raidReward') { state.me.captures.push(data.creature); state.me.coins = data.coins; state.raidJoined = false; renderCollection(); renderRaid(); notify('¡Recompensa de incursión: Cindrake!'); }
}
function openBattle(status) {
  const myCreature = state.me.captures?.[0] || { hp: 30, moves: [{ name:'Impacto', power:10 }] }; const rivalCreature = state.duel.rival?.creature || { hp: myCreature.hp }; const moves = state.duel.moves?.length ? state.duel.moves : myCreature.moves;
  $('#battle').hidden = false; $('#battle-status').textContent = status; $('#my-hp').style.width = `${Math.max(0, state.duel.myHp) / myCreature.hp * 100}%`; $('#rival-hp').style.width = `${Math.max(0, state.duel.rivalHp) / rivalCreature.hp * 100}%`;
  const actions = $('#battle-moves'); actions.innerHTML = ''; const myTurn = state.duel.turn === state.id;
  moves.forEach((move, index) => { const button = document.createElement('button'); button.className = 'move'; button.disabled = !myTurn; button.textContent = myTurn ? move.name : 'Turno rival'; button.onclick = () => send({ type:'attack', move:index }); actions.append(button); });
}
function nearest(items, range) { let found = null, best = range; for (const item of items.values()) { const d = Math.hypot(item.x - state.me.x, item.y - state.me.y); if (d < best) { found = item; best = d; } } return found; }
function update(delta) {
  if (!state.me) return; if (!state.duel) { let dx = 0, dy = 0; if (state.keys.has('w') || state.keys.has('arrowup')) dy--; if (state.keys.has('s') || state.keys.has('arrowdown')) dy++; if (state.keys.has('a') || state.keys.has('arrowleft')) dx--; if (state.keys.has('d') || state.keys.has('arrowright')) dx++; if (dx || dy) { const magnitude = Math.hypot(dx, dy), speed = 170 * delta; state.me.x = Math.max(32, Math.min(2016, state.me.x + dx / magnitude * speed)); state.me.y = Math.max(32, Math.min(2016, state.me.y + dy / magnitude * speed)); send({ type:'move', x:state.me.x, y:state.me.y }); } }
  state.camera.x += (state.me.x - 480 - state.camera.x) * .12; state.camera.y += (state.me.y - 270 - state.camera.y) * .12; const zone = zoneAt(state.me.x, state.me.y); if (zone) $('#location').textContent = zone.name;
}
function px(x, y) { return [x - state.camera.x, y - state.camera.y]; }
function drawPixelCreature(x, y, creature, size = 1) { ctx.fillStyle = 'rgba(25,40,34,.23)'; ctx.fillRect(x - 10 * size, y + 11 * size, 22 * size, 5 * size); ctx.fillStyle = '#172b3a'; ctx.fillRect(x - 11 * size, y - 14 * size, 22 * size, 25 * size); ctx.fillStyle = creature.color; ctx.fillRect(x - 8 * size, y - 11 * size, 16 * size, 18 * size); ctx.fillStyle = '#fff5d6'; ctx.fillRect(x - 4 * size, y - 7 * size, 3 * size, 3 * size); ctx.fillRect(x + 3 * size, y - 7 * size, 3 * size, 3 * size); }
function draw() {
  ctx.clearRect(0, 0, 960, 540); for (const zone of state.zones) { const [x, y] = px(zone.x, zone.y); ctx.fillStyle = zone.ground; ctx.fillRect(x, y, zone.w, zone.h); const startX = x - (x % 64), startY = y - (y % 64); ctx.fillStyle = zone.grass; for (let gx = startX; gx < x + zone.w; gx += 64) for (let gy = startY; gy < y + zone.h; gy += 64) { ctx.fillRect(gx + 10, gy + 13, 3, 8); ctx.fillRect(gx + 13, gy + 9, 5, 7); } }
  ctx.fillStyle = '#4e9fc0'; const [riverX] = px(1010, 0); ctx.fillRect(riverX, 0, 28, 540); const [, riverY] = px(0, 1010); ctx.fillRect(0, riverY, 960, 28);
  for (const creature of state.creatures.values()) { const [x, y] = px(creature.x, creature.y); if (x < -30 || x > 990 || y < -30 || y > 570) continue; ctx.fillStyle = rarity[creature.rarity]; ctx.fillRect(x - 14, y - 17, 28, 29); drawPixelCreature(x, y, creature); ctx.fillStyle = '#fff5d6'; ctx.font = '15px VT323'; ctx.textAlign = 'center'; ctx.fillText(`${creature.name} · ${creature.type}`, x, y - 23); }
  if (state.raid?.active) { const [x, y] = px(state.raid.x, state.raid.y); if (x > -60 && x < 1020 && y > -60 && y < 600) { ctx.fillStyle = '#ffdd55'; ctx.fillRect(x - 32, y - 35, 64, 65); drawPixelCreature(x, y, state.raid, 2.3); ctx.fillStyle = '#fff5d6'; ctx.font = '20px VT323'; ctx.fillText('⚔ CINDRAGON', x, y - 46); } }
  for (const player of state.players.values()) { const [x, y] = px(player.x, player.y); ctx.fillStyle = 'rgba(25,40,34,.28)'; ctx.fillRect(x - 12, y + 13, 24, 5); ctx.fillStyle = '#172b3a'; ctx.fillRect(x - 10, y - 18, 20, 33); ctx.fillStyle = player.color; ctx.fillRect(x - 7, y - 15, 14, 12); ctx.fillStyle = '#f0c19b'; ctx.fillRect(x - 6, y - 2, 12, 11); ctx.fillStyle = '#f7f4d9'; ctx.font = '17px VT323'; ctx.textAlign = 'center'; ctx.fillText(player.name, x, y - 25); if (player.id === state.id) { ctx.strokeStyle = '#fff5d6'; ctx.lineWidth = 2; ctx.strokeRect(x - 13, y - 21, 26, 38); } }
  $('#online').textContent = `${state.players.size} explorador${state.players.size === 1 ? '' : 'es'}`;
}
function loop(time) { const delta = Math.min((time - state.last) / 1000, .05); state.last = time; update(delta); draw(); requestAnimationFrame(loop); }

$('#enter').addEventListener('click', connect); $('#name').addEventListener('keydown', event => { if (event.key === 'Enter') connect(); });
addEventListener('keydown', event => { const key = event.key.toLowerCase(); state.keys.add(key); if (event.repeat || !state.me) return; if (key === 'e') { const creature = nearest(state.creatures, 88); if (creature) send({ type:'capture', creatureId:creature.id }); else notify('Acércate más a una criatura para capturarla.'); } if (key === 'b') { const others = new Map([...state.players].filter(([id]) => id !== state.id)); const rival = nearest(others, 130); if (rival) send({ type:'duelRequest', targetId:rival.id }); else notify('Acércate a otro explorador para retarlo.'); } if (key === 'r') send({ type:'joinRaid' }); });
addEventListener('keyup', event => state.keys.delete(event.key.toLowerCase()));
$('#accept').addEventListener('click', () => { send({ type:'duelAnswer', fromId:state.invite.id, accept:true }); $('#prompt').hidden = true; }); $('#reject').addEventListener('click', () => { send({ type:'duelAnswer', fromId:state.invite.id, accept:false }); $('#prompt').hidden = true; }); $('#raid-join').addEventListener('click', () => send({ type:'joinRaid' })); $('#leave-duel').addEventListener('click', () => { send({ type:'duelForfeit' }); state.duel = null; $('#battle').hidden = true; });

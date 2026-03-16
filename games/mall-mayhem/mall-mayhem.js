(function () {
	'use strict';

	var KEY = 'sugarchain_mall_mayhem_99_progress';
	var W = 960;
	var H = 540;
	var ZONES = [
		{ label: 'Food Court', a: '#3f2440', b: '#2c1a33', c: '#ffd388' },
		{ label: 'Arcade', a: '#1a1b42', b: '#14143a', c: '#3de0ff' },
		{ label: 'Music Store', a: '#18282f', b: '#112027', c: '#ffe788' },
		{ label: 'Toy Store', a: '#1f2745', b: '#18213c', c: '#ffd45b' },
		{ label: 'Video Rental', a: '#25213c', b: '#1d1933', c: '#fe8f5b' },
		{ label: 'Electronics', a: '#1a2638', b: '#132134', c: '#8ce8ff' },
		{ label: 'Parking Garage', a: '#252b38', b: '#1b2130', c: '#84b0ff' }
	];
	var CHARS = [
		{ id: 'skate-kid', name: 'Skate Kid', note: 'Default speedster.', unlock: 0, color: '#5cd6ff', accent: '#ffdc66', speed: 275, atk: 1 },
		{ id: 'mall-cop', name: 'Mall Cop', note: 'Unlock 8,000 score.', unlock: 8000, color: '#78a8ff', accent: '#ff5f66', speed: 250, atk: 1.2 },
		{ id: 'movie-clerk', name: 'Movie Clerk', note: 'Unlock 15,000 score.', unlock: 15000, color: '#b09cff', accent: '#ffd56e', speed: 258, atk: 1.05 },
		{ id: 'guitar-store-dude', name: 'Guitar Store Dude', note: 'Unlock 24,000 score.', unlock: 24000, color: '#ff7f9d', accent: '#7cffc9', speed: 262, atk: 1.1 },
		{ id: 'food-court-cashier', name: 'Food Court Cashier', note: 'Unlock 34,000 score.', unlock: 34000, color: '#ffb35f', accent: '#73fff5', speed: 268, atk: 1.05 },
		{ id: 'arcade-champ', name: 'Arcade Champ', note: 'Unlock 48,000 score.', unlock: 48000, color: '#ff6cf4', accent: '#69d8ff', speed: 278, atk: 1.2 }
	];
	var ENEMIES = [
		{ id: 'security-bot', hp: 4, speed: 85, size: 17, color: '#8fc0ff', score: 110 },
		{ id: 'rc-swarmer', hp: 2, speed: 125, size: 13, color: '#ff8b8b', score: 95 },
		{ id: 'prize-gremlin', hp: 3, speed: 95, size: 15, color: '#ffe88f', score: 120 },
		{ id: 'roller-punk', hp: 4, speed: 118, size: 16, color: '#adffbd', score: 140 },
		{ id: 'vhs-bat', hp: 3, speed: 132, size: 14, color: '#cbafff', score: 130 },
		{ id: 'grease-slime', hp: 2, speed: 96, size: 14, color: '#8effff', score: 90 }
	];
	var BOSSES = [
		{ name: 'Food Court King', hp: 120, color: '#ffbd76' },
		{ name: 'The Claw', hp: 150, color: '#8be2ff' },
		{ name: 'VHS Hydra', hp: 175, color: '#ce9cff' },
		{ name: 'Mega Security Chief', hp: 210, color: '#ff8f8f' }
	];
	var S = {
		inited: false, visible: false, open: false, running: false, paused: false, gameOver: false, t0: 0,
		stage: 1, zone: 0, stageTimer: 45, runTimer: 0, lives: 3, score: 0, high: 0, combo: 1, comboClock: 0, tokens: 0, totalTokens: 0, secrets: 0,
		atkCd: 0, dmgCd: 0, selected: CHARS[0].id, unlocks: {}, enemies: [], proj: [], pickups: [], fx: [], decor: [], secret: null, boss: null,
		keys: {}, touch: { up: false, down: false, left: false, right: false }, p: { x: W / 2, y: H / 2, r: 15, vx: 0, vy: 0 }
	};
	var U = {};

	function rnd(a, b) { return a + Math.random() * (b - a); }
	function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
	function dist(a, b) { var dx = a.x - b.x; var dy = a.y - b.y; return Math.sqrt(dx * dx + dy * dy); }
	function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
	function byId(id) { for (var i = 0; i < CHARS.length; i++) if (CHARS[i].id === id) return CHARS[i]; return CHARS[0]; }

	function tone(f, d, type, g) {
		try {
			if (!window.AudioContext && !window.webkitAudioContext) { return; }
			if (!S.ac) { S.ac = new (window.AudioContext || window.webkitAudioContext)(); }
			var c = S.ac;
			var o = c.createOscillator();
			var k = c.createGain();
			o.type = type || 'square';
			o.frequency.value = f;
			k.gain.value = 0.0001;
			o.connect(k);
			k.connect(c.destination);
			var n = c.currentTime;
			k.gain.exponentialRampToValueAtTime(g || 0.06, n + 0.01);
			k.gain.exponentialRampToValueAtTime(0.0001, n + d);
			o.start(n);
			o.stop(n + d + 0.02);
		} catch (e) {}
	}

	function status(msg, variant) {
		if (!U.status) { return; }
		U.status.textContent = msg;
		U.status.className = 'mall99-status' + (variant ? ' ' + variant : '');
	}
	function ticker(msg, variant) {
		if (!U.ticker) { return; }
		U.ticker.textContent = msg;
		U.ticker.className = 'mall99-ticker' + (variant ? ' ' + variant : '');
	}

	function readProgress() {
		var def = { high: 0, totalTokens: 0, unlocks: { 'skate-kid': true }, selected: 'skate-kid' };
		try {
			var raw = window.localStorage.getItem(KEY);
			if (!raw) { return def; }
			var p = JSON.parse(raw);
			p.unlocks = p.unlocks || { 'skate-kid': true };
			p.unlocks['skate-kid'] = true;
			if (!p.unlocks[p.selected]) { p.selected = 'skate-kid'; }
			return { high: p.high || 0, totalTokens: p.totalTokens || 0, unlocks: p.unlocks, selected: p.selected };
		} catch (e) { return def; }
	}
	function writeProgress() {
		try { window.localStorage.setItem(KEY, JSON.stringify({ high: S.high, totalTokens: S.totalTokens, unlocks: S.unlocks, selected: S.selected })); } catch (e) {}
	}
	function unlockEligible() {
		var now = [];
		for (var i = 0; i < CHARS.length; i++) {
			if (S.score >= CHARS[i].unlock && !S.unlocks[CHARS[i].id]) { S.unlocks[CHARS[i].id] = true; now.push(CHARS[i].name); }
		}
		if (now.length) { ticker('Unlocked: ' + now.join(', ') + '.', 'warning'); buildCharCards(); writeProgress(); }
	}
	function addScore(n) {
		S.score += Math.floor(n * S.combo);
		if (S.score > S.high) { S.high = S.score; writeProgress(); }
		S.comboClock = 2.7;
		S.combo = clamp(S.combo + 0.12, 1, 8);
		unlockEligible();
	}

	function makeEnemy(type) {
		var e = Math.floor(Math.random() * 4);
		return {
			id: type.id,
			x: e === 0 ? rnd(24, W - 24) : (e === 1 ? W - 14 : (e === 2 ? rnd(24, W - 24) : 14)),
			y: e === 2 ? H - 14 : (e === 3 ? rnd(24, H - 24) : (e === 0 ? 14 : rnd(24, H - 24))),
			size: type.size, hp: type.hp + Math.floor(S.stage * 0.45), maxHp: type.hp + Math.floor(S.stage * 0.45),
			speed: type.speed + Math.min(55, S.stage * 3.2), color: type.color, score: type.score, wobble: rnd(0, Math.PI * 2), shot: rnd(0.6, 1.6)
		};
	}
	function makeBoss() {
		var t = BOSSES[Math.floor((S.stage / 4 - 1) % BOSSES.length)];
		var hp = t.hp + S.stage * 14;
		return { name: t.name, x: W / 2, y: 120, size: 52, hp: hp, maxHp: hp, color: t.color, speed: 68 + S.stage * 0.9, shot: 1.2, dash: 0, phase: 0 };
	}
	function buildDecor() {
		var pool = ['bench', 'planter', 'vending', 'directory', 'poster', 'kiosk', 'escalator', 'payphone', 'gumball', 'mall-sign'];
		if (S.zone === 0) { pool = pool.concat(['pizza-table', 'tray', 'trash-can']); }
		if (S.zone === 1) { pool = pool.concat(['arcade-cabinet', 'prize-shelf', 'crt-stack']); }
		if (S.zone === 2) { pool = pool.concat(['guitar-rack', 'cd-bin']); }
		if (S.zone === 3) { pool = pool.concat(['toy-shelf', 'plush-bin']); }
		if (S.zone === 4) { pool = pool.concat(['vhs-wall', 'rewind-desk']); }
		if (S.zone === 5) { pool = pool.concat(['console-kiosk', 'boombox-stack']); }
		if (S.zone === 6) { pool = pool.concat(['traffic-cone', 'cart', 'pillar']); }
		S.decor = [];
		for (var i = 0; i < 34; i++) { S.decor.push({ type: pick(pool), x: rnd(36, W - 36), y: rnd(36, H - 36), s: rnd(0.8, 1.15), seed: Math.random(), hint: Math.random() > 0.93 }); }
		S.secret = { x: rnd(90, W - 90), y: rnd(90, H - 90), r: 18, found: false, hint: pick(['Napkin note', 'Hidden vent', 'Mystery hotline', 'Cabinet glyph', 'Scribbled map']) };
	}

	function spawnStage(n) {
		S.stage = n;
		S.stageTimer = clamp(40 - n * 0.8, 25, 45);
		S.zone = (n - 1) % ZONES.length;
		S.enemies = []; S.proj = []; S.pickups = []; S.fx = []; S.boss = null;
		buildDecor();
		if (n % 4 === 0) {
			S.boss = makeBoss();
			status('Boss: ' + S.boss.name + '. Dodge and burst.', 'danger');
			ticker('Boss incoming. Keep moving.', 'danger');
			tone(196, 0.3, 'sawtooth', 0.1);
		} else {
			var total = 8 + n * 2;
			for (var i = 0; i < total; i++) { S.enemies.push(makeEnemy(pick(ENEMIES))); }
			status('Stage ' + n + ' live. Chain combos and find secrets.', '');
		}
		S.p.x = W / 2; S.p.y = H / 2; S.dmgCd = 0; S.comboClock = 2.5;
	}
	function resetRun() {
		S.running = true; S.paused = false; S.gameOver = false; S.stage = 1; S.runTimer = 0; S.lives = 3; S.score = 0; S.combo = 1; S.comboClock = 0; S.tokens = 0; S.secrets = 0; S.atkCd = 0;
		spawnStage(1); overlay(false); ticker('Mall gates down. Go for one more run.', ''); hud();
	}
	function spawnPickup(x, y, t) {
		var r = Math.random();
		var kind = t || (r < 0.65 ? 'token' : (r < 0.86 ? 'combo' : 'life'));
		S.pickups.push({ x: x, y: y, type: kind, age: 0, r: kind === 'life' ? 12 : 10 });
	}
	function hurtPlayer(n) {
		if (S.dmgCd > 0 || !S.running) { return; }
		S.lives -= n; S.dmgCd = 1.0; S.combo = Math.max(1, S.combo - 0.7); tone(181, 0.09, 'square', 0.07); ticker('Hit taken. Stay in motion.', 'danger');
		if (S.lives <= 0) { endRun(); }
	}
	function endRun() {
		S.running = false; S.paused = false; S.gameOver = true; S.totalTokens += S.tokens; writeProgress(); tone(122, 0.22, 'sawtooth', 0.1);
		status('Run complete. Press Play Again immediately.', 'warning');
		overlay(true, 'Run Over', 'Score ' + S.score + ' | Stage ' + S.stage + ' | Tokens +' + S.tokens + ' | Secrets ' + S.secrets + '.');
	}
	function attack() {
		if (!S.running || S.paused || S.atkCd > 0) { return; }
		S.atkCd = 0.45;
		var c = byId(S.selected);
		var range = 72 + (c.id === 'guitar-store-dude' ? 14 : 0);
		var dmg = 2.6 * c.atk;
		var kills = 0;
		for (var i = S.enemies.length - 1; i >= 0; i--) {
			var e = S.enemies[i];
			if (dist(S.p, e) <= range + e.size) {
				e.hp -= dmg;
				if (e.hp <= 0) {
					S.enemies.splice(i, 1); addScore(e.score); S.fx.push({ x: e.x, y: e.y, color: e.color, age: 0, life: 0.35, size: 12 + Math.random() * 8 }); if (Math.random() < 0.55) { spawnPickup(e.x, e.y); } kills++;
				}
			}
		}
		if (S.boss && dist(S.p, S.boss) <= range + S.boss.size + 10) { S.boss.hp -= dmg * (c.id === 'arcade-champ' ? 1.2 : 1); S.fx.push({ x: S.boss.x + rnd(-16, 16), y: S.boss.y + rnd(-16, 16), color: '#ffd08e', age: 0, life: 0.32, size: 16 }); addScore(45); }
		S.fx.push({ x: S.p.x, y: S.p.y, color: '#8ef8ff', age: 0, life: 0.24, size: range }); tone(512, 0.1, 'triangle', 0.07); if (kills >= 3) { ticker('Clean sweep. Combo climbing.', 'warning'); }
	}

	function update(dt) {
		if (!S.running || S.paused || S.gameOver) { return; }
		S.runTimer += dt; S.stageTimer -= dt; if (S.stageTimer <= 0) { hurtPlayer(1); S.stageTimer = 10; ticker('Lockdown pulse. Move faster.', 'danger'); }
		var c = byId(S.selected); var x = 0; var y = 0;
		if (S.keys.ArrowLeft || S.keys.KeyA || S.touch.left) { x -= 1; } if (S.keys.ArrowRight || S.keys.KeyD || S.touch.right) { x += 1; } if (S.keys.ArrowUp || S.keys.KeyW || S.touch.up) { y -= 1; } if (S.keys.ArrowDown || S.keys.KeyS || S.touch.down) { y += 1; }
		var l = Math.sqrt(x * x + y * y); if (l > 0) { x /= l; y /= l; }
		S.p.vx = x * c.speed; S.p.vy = y * c.speed; S.p.x = clamp(S.p.x + S.p.vx * dt, 14, W - 14); S.p.y = clamp(S.p.y + S.p.vy * dt, 14, H - 14);
		if (S.atkCd > 0) { S.atkCd -= dt; } if (S.dmgCd > 0) { S.dmgCd -= dt; } if (S.comboClock > 0) { S.comboClock -= dt; } else { S.combo = Math.max(1, S.combo - dt * 0.6); }

		for (var i = S.enemies.length - 1; i >= 0; i--) {
			var e = S.enemies[i]; e.wobble += dt * 2.2; var dx = S.p.x - e.x; var dy = S.p.y - e.y; var d = Math.max(1, Math.sqrt(dx * dx + dy * dy)); e.x += (dx / d) * e.speed * dt + Math.sin(e.wobble) * 12 * dt; e.y += (dy / d) * e.speed * dt + Math.cos(e.wobble * 1.1) * 12 * dt; e.x = clamp(e.x, 20, W - 20); e.y = clamp(e.y, 20, H - 20); e.shot -= dt;
			if (e.id === 'vhs-bat' && e.shot <= 0) { e.shot = rnd(1.2, 2.3); S.proj.push({ x: e.x, y: e.y, vx: (dx / d) * 190, vy: (dy / d) * 190, r: 7, age: 0, color: '#c8a8ff' }); }
			if (dist(S.p, e) < S.p.r + e.size - 2) { hurtPlayer(1); }
		}
		if (S.boss) {
			var b = S.boss; var bdx = S.p.x - b.x; var bdy = S.p.y - b.y; var bd = Math.max(1, Math.sqrt(bdx * bdx + bdy * bdy)); b.shot -= dt; b.dash -= dt; if (b.dash <= 0) { b.dash = rnd(1.8, 3.2); b.phase = 0.35; }
			if (b.phase > 0) { b.phase -= dt; b.x += (bdx / bd) * (b.speed * 2.6) * dt; b.y += (bdy / bd) * (b.speed * 2.6) * dt; } else { b.x += (bdx / bd) * b.speed * dt; b.y += (bdy / bd) * b.speed * dt; }
			b.x = clamp(b.x, 54, W - 54); b.y = clamp(b.y, 54, H - 54);
			if (b.shot <= 0) { b.shot = rnd(0.65, 1.2); for (var k = 0; k < 3; k++) { var a = Math.atan2(bdy, bdx) + (k - 1) * 0.22; S.proj.push({ x: b.x, y: b.y, vx: Math.cos(a) * (220 + S.stage * 6), vy: Math.sin(a) * (220 + S.stage * 6), r: 9, age: 0, color: b.color }); } }
			if (dist(S.p, b) < S.p.r + b.size - 4) { hurtPlayer(1); }
			if (b.hp <= 0) { addScore(1700); S.tokens += 6; for (var m = 0; m < 6; m++) { spawnPickup(b.x + rnd(-26, 26), b.y + rnd(-26, 26), m % 2 === 0 ? 'token' : 'combo'); } S.fx.push({ x: b.x, y: b.y, color: b.color, age: 0, life: 0.6, size: 88 }); S.boss = null; ticker('Boss down. Stage clear.', 'warning'); tone(523, 0.16, 'sawtooth', 0.08); tone(659, 0.2, 'sawtooth', 0.08); spawnStage(S.stage + 1); }
		}
		if (!S.boss && S.enemies.length === 0) { ticker('Stage clear. Escalator opening.', 'warning'); tone(523, 0.16, 'sawtooth', 0.08); tone(659, 0.2, 'sawtooth', 0.08); spawnStage(S.stage + 1); }

		for (i = S.proj.length - 1; i >= 0; i--) { var p = S.proj[i]; p.x += p.vx * dt; p.y += p.vy * dt; p.age += dt; if (p.age > 5 || p.x < -30 || p.x > W + 30 || p.y < -30 || p.y > H + 30) { S.proj.splice(i, 1); continue; } if (dist(S.p, p) < S.p.r + p.r) { hurtPlayer(1); S.proj.splice(i, 1); } }
		for (i = S.pickups.length - 1; i >= 0; i--) { p = S.pickups[i]; p.age += dt; if (p.age > 8) { S.pickups.splice(i, 1); continue; } if (dist(S.p, p) < S.p.r + p.r + 5) { if (p.type === 'token') { S.tokens += 1; addScore(55); ticker('+1 Token.', ''); } else if (p.type === 'combo') { S.combo = clamp(S.combo + 0.8, 1, 8); S.comboClock = 3; addScore(35); } else { S.lives = clamp(S.lives + 1, 0, 6); ticker('Extra life.', 'warning'); addScore(60); } tone(892, 0.08, 'triangle', 0.05); S.pickups.splice(i, 1); } }
		if (S.secret && !S.secret.found && dist(S.p, { x: S.secret.x, y: S.secret.y }) < 28) { S.secret.found = true; S.secrets += 1; S.tokens += 3; addScore(420); spawnPickup(S.secret.x, S.secret.y, 'life'); ticker('Secret found: ' + S.secret.hint + '.', 'warning'); tone(660, 0.16, 'triangle', 0.08); tone(980, 0.22, 'triangle', 0.08); }
		for (i = S.fx.length - 1; i >= 0; i--) { S.fx[i].age += dt; if (S.fx[i].age > S.fx[i].life) { S.fx.splice(i, 1); } }
		hud();
	}

	function rounded(ctx, x, y, w, h, r, fill, stroke) {
		ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 2; ctx.stroke(); }
	}
	function drawDecor(ctx, d, z) {
		ctx.save(); ctx.translate(d.x, d.y); ctx.scale(d.s, d.s); ctx.rotate((d.seed - 0.5) * 0.12); ctx.shadowBlur = 10; ctx.shadowColor = 'rgba(80,220,255,0.15)';
		if (d.type === 'arcade-cabinet') { rounded(ctx, -18, -24, 36, 48, 4, '#25203f', '#5ce3ff'); ctx.fillStyle = '#69f0ff'; ctx.fillRect(-13, -18, 26, 14); ctx.fillStyle = '#f6c04d'; ctx.fillRect(-14, -2, 28, 8); }
		else if (d.type === 'vending') { rounded(ctx, -16, -26, 32, 52, 5, '#182d4e', '#79d5ff'); ctx.fillStyle = '#9ff7ff'; ctx.fillRect(-11, -20, 22, 14); ctx.fillStyle = '#fdd665'; ctx.fillRect(-9, -2, 18, 8); }
		else if (d.type === 'bench') { rounded(ctx, -20, -7, 40, 12, 4, '#925f45', '#c49773'); ctx.fillStyle = '#c7c8d2'; ctx.fillRect(-18, 5, 4, 8); ctx.fillRect(14, 5, 4, 8); }
		else if (d.type === 'planter') { rounded(ctx, -14, -10, 28, 20, 4, '#6e5a4d', '#bc9b88'); ctx.fillStyle = '#7ff2a9'; ctx.beginPath(); ctx.arc(-5, -13, 6, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(5, -14, 7, 0, Math.PI * 2); ctx.fill(); }
		else { rounded(ctx, -15, -15, 30, 30, 5, '#3a4768', z.c); ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.fillRect(-10, -9, 20, 5); ctx.fillStyle = 'rgba(20,20,28,0.45)'; ctx.fillRect(-9, 0, 18, 7); }
		if (d.hint && S.secret && !S.secret.found) { ctx.fillStyle = 'rgba(255,239,109,0.8)'; ctx.fillRect(8, -14, 5, 2); }
		ctx.restore();
	}
	function draw() {
		if (!U.ctx) { return; }
		var ctx = U.ctx; var z = ZONES[S.zone];
		ctx.fillStyle = z.a; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 0.25; for (var x = 0; x < W; x += 48) { for (var y = 0; y < H; y += 48) { ctx.fillStyle = (Math.floor((x + y) / 48) % 2 === 0) ? z.b : z.a; ctx.fillRect(x, y, 48, 48); } } ctx.globalAlpha = 1;
		var g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, 'rgba(255,255,255,0.07)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,0.24)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
		for (var i = 0; i < S.decor.length; i++) { drawDecor(ctx, S.decor[i], z); }
		if (S.secret && !S.secret.found) { ctx.strokeStyle = 'rgba(255,248,122,0.42)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(S.secret.x, S.secret.y, S.secret.r + Math.sin(S.runTimer * 4) * 2, 0, Math.PI * 2); ctx.stroke(); }
		for (i = 0; i < S.pickups.length; i++) { var p = S.pickups[i]; ctx.save(); ctx.translate(p.x, p.y); var pulse = 1 + Math.sin((S.runTimer + p.age) * 8) * 0.08; ctx.scale(pulse, pulse); if (p.type === 'token') { ctx.fillStyle = '#ffd667'; ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2); ctx.fill(); } else if (p.type === 'combo') { ctx.fillStyle = '#6ff0ff'; ctx.beginPath(); ctx.moveTo(0, -p.r); ctx.lineTo(p.r, 0); ctx.lineTo(0, p.r); ctx.lineTo(-p.r, 0); ctx.closePath(); ctx.fill(); } else { ctx.fillStyle = '#ff8e9f'; ctx.beginPath(); ctx.arc(-4, -2, p.r * 0.6, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.arc(4, -2, p.r * 0.6, 0, Math.PI * 2); ctx.fill(); } ctx.restore(); }
		for (i = 0; i < S.enemies.length; i++) { var e = S.enemies[i]; ctx.save(); ctx.translate(e.x, e.y); ctx.fillStyle = e.color; ctx.beginPath(); ctx.arc(0, 0, e.size, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#222'; ctx.fillRect(-e.size * 0.45, -3, e.size * 0.9, 6); ctx.fillStyle = '#fff'; ctx.fillRect(-e.size * 0.3, -e.size * 0.2, 4, 4); ctx.fillRect(e.size * 0.15, -e.size * 0.2, 4, 4); ctx.fillStyle = 'rgba(6,10,22,0.8)'; ctx.fillRect(-e.size, -e.size - 10, e.size * 2, 4); ctx.fillStyle = '#7dffa8'; ctx.fillRect(-e.size, -e.size - 10, e.size * 2 * clamp(e.hp / e.maxHp, 0, 1), 4); ctx.restore(); }
		if (S.boss) { var b = S.boss; ctx.save(); ctx.translate(b.x, b.y); ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(0, 0, b.size, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#fff2ba'; ctx.lineWidth = 4; ctx.stroke(); ctx.fillStyle = '#ff5f63'; ctx.fillRect(-12, -5, 8, 8); ctx.fillRect(4, -5, 8, 8); ctx.fillStyle = 'rgba(6,10,22,0.8)'; ctx.fillRect(-90, -b.size - 18, 180, 7); ctx.fillStyle = '#ff908f'; ctx.fillRect(-90, -b.size - 18, 180 * clamp(b.hp / b.maxHp, 0, 1), 7); ctx.restore(); }
		for (i = 0; i < S.proj.length; i++) { p = S.proj[i]; ctx.fillStyle = p.color || '#ffc47f'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
		var c = byId(S.selected); ctx.save(); ctx.translate(S.p.x, S.p.y); ctx.translate(0, Math.sin(S.runTimer * 7.5) * 1.3); ctx.fillStyle = c.color; ctx.beginPath(); ctx.arc(0, 0, S.p.r, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = c.accent; ctx.fillRect(-7, -13, 14, 6); ctx.fillStyle = '#fff'; ctx.fillRect(-6, -3, 4, 4); ctx.fillRect(2, -3, 4, 4); if (S.dmgCd > 0) { ctx.strokeStyle = 'rgba(255,100,100,0.9)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, S.p.r + 4, 0, Math.PI * 2); ctx.stroke(); } ctx.restore();
		for (i = 0; i < S.fx.length; i++) { var f = S.fx[i]; var r = 1 - (f.age / f.life); ctx.save(); ctx.globalAlpha = clamp(r, 0, 1) * 0.75; ctx.strokeStyle = f.color; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(f.x, f.y, f.size * (1 - r * 0.25), 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
		ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, H - 38, W, 38); ctx.fillStyle = '#b1f1ff'; ctx.font = '15px Trebuchet MS, sans-serif'; ctx.fillText('Zone: ' + z.label + ' | Time ' + Math.max(0, S.stageTimer).toFixed(1) + 's', 14, H - 14);
	}
	function hud() {
		if (!U.hudScore) { return; }
		U.hudScore.textContent = Math.floor(S.score).toString();
		U.hudHigh.textContent = Math.floor(S.high).toString();
		U.hudLives.textContent = S.lives.toString();
		U.hudCombo.textContent = S.combo.toFixed(1) + 'x';
		U.hudTimer.textContent = S.runTimer.toFixed(1) + 's';
		U.hudStage.textContent = S.stage.toString();
		U.hudZone.textContent = ZONES[S.zone].label;
		U.hudTokens.textContent = S.tokens.toString() + ' (Total ' + S.totalTokens + ')';
		U.hudSecrets.textContent = S.secrets.toString();
	}
	function loop(ts) {
		if (!S.inited) { return; }
		if (!S.t0) { S.t0 = ts; }
		var dt = Math.min((ts - S.t0) / 1000, 0.05);
		S.t0 = ts;
		if (S.visible && S.open) { update(dt); draw(); }
		window.requestAnimationFrame(loop);
	}

	function overlay(show, title, copy) {
		if (!U.overlay) { return; }
		if (!show) { U.overlay.classList.add('d-none'); return; }
		U.overlay.classList.remove('d-none');
		U.overlayTitle.textContent = title || 'Paused';
		U.overlayCopy.textContent = copy || 'Take a breath and jump back in.';
	}
	function openArcade() { S.open = true; if (U.arcade) { U.arcade.classList.remove('d-none'); } if (U.launch) { U.launch.classList.add('d-none'); } status('Arcade cabinet online. Press Start Run.', ''); }
	function closeArcade() { S.open = false; S.running = false; S.paused = false; if (U.arcade) { U.arcade.classList.add('d-none'); } if (U.launch) { U.launch.classList.remove('d-none'); } overlay(false); ticker('Exited cabinet. The mall still hums.', ''); status('Cabinet closed. Launch again for another run.', ''); }
	function pause(v) { if (!S.running || S.gameOver) { return; } S.paused = v; if (v) { overlay(true, 'Paused', 'Combo timer frozen. Resume for one more run.'); } else { overlay(false); ticker('Back in motion.', ''); } }

	function bindTouch(id, key, action) {
		var el = document.getElementById(id);
		if (!el) { return; }
		var down = function (e) { e.preventDefault(); if (key) { S.touch[key] = true; } if (action) { action(); } };
		var up = function (e) { e.preventDefault(); if (key) { S.touch[key] = false; } };
		el.addEventListener('touchstart', down, { passive: false }); el.addEventListener('touchend', up, { passive: false });
		el.addEventListener('mousedown', down); el.addEventListener('mouseup', up); el.addEventListener('mouseleave', up);
	}
	function bindBtns() {
		function on(id, cb) { var el = document.getElementById(id); if (el) { el.addEventListener('click', function (e) { e.preventDefault(); cb(); }); } }
		on('mall99-open-arcade-btn', function () { openArcade(); });
		on('mall99-start-run-btn', function () { openArcade(); resetRun(); });
		on('mall99-quick-restart-btn', function () { openArcade(); resetRun(); });
		on('mall99-close-arcade-btn', function () { closeArcade(); });
		on('mall99-pause-btn', function () { pause(true); });
		on('mall99-resume-btn', function () { pause(false); });
		on('mall99-exit-btn', function () { closeArcade(); });
		on('mall99-newrun-btn', function () { resetRun(); });
		if (U.overlayPrimary) { U.overlayPrimary.addEventListener('click', function (e) { e.preventDefault(); resetRun(); }); }
		if (U.overlaySecondary) { U.overlaySecondary.addEventListener('click', function (e) { e.preventDefault(); closeArcade(); }); }
		bindTouch('mall99-touch-up', 'up'); bindTouch('mall99-touch-down', 'down'); bindTouch('mall99-touch-left', 'left'); bindTouch('mall99-touch-right', 'right');
		bindTouch('mall99-touch-attack', null, function () { attack(); }); bindTouch('mall99-touch-pause', null, function () { pause(!S.paused); });
		window.addEventListener('keydown', function (e) { S.keys[e.code] = true; if (e.code === 'Space') { attack(); e.preventDefault(); } if (e.code === 'KeyP') { pause(!S.paused); e.preventDefault(); } });
		window.addEventListener('keyup', function (e) { S.keys[e.code] = false; });
	}
	function buildCharCards() {
		if (!U.charList) { return; }
		U.charList.innerHTML = '';
		for (var i = 0; i < CHARS.length; i++) {
			(function (c) {
				var unlocked = !!S.unlocks[c.id];
				var card = document.createElement('button');
				card.type = 'button';
				card.className = 'mall99-character' + (S.selected === c.id ? ' active' : '') + (unlocked ? '' : ' locked');
				card.innerHTML = '<div class=\"mall99-character-name\">' + c.name + '</div><div class=\"mall99-character-note\">' + c.note + '</div>';
				card.disabled = !unlocked;
				card.addEventListener('click', function () { if (!S.unlocks[c.id]) { return; } S.selected = c.id; writeProgress(); buildCharCards(); status(c.name + ' selected. Ready for mayhem.', ''); });
				U.charList.appendChild(card);
			})(CHARS[i]);
		}
	}

	function attach(rootId) {
		U.root = document.getElementById(rootId || 'mall99-root');
		if (!U.root) { return false; }
		U.launch = document.getElementById('mall99-launch'); U.arcade = document.getElementById('mall99-arcade'); U.status = document.getElementById('mall99-status'); U.ticker = document.getElementById('mall99-ticker'); U.canvas = document.getElementById('mall99-canvas');
		U.overlay = document.getElementById('mall99-overlay'); U.overlayTitle = document.getElementById('mall99-overlay-title'); U.overlayCopy = document.getElementById('mall99-overlay-copy'); U.overlayPrimary = document.getElementById('mall99-overlay-primary'); U.overlaySecondary = document.getElementById('mall99-overlay-secondary');
		U.hudScore = document.getElementById('mall99-hud-score'); U.hudHigh = document.getElementById('mall99-hud-high-score'); U.hudLives = document.getElementById('mall99-hud-lives'); U.hudCombo = document.getElementById('mall99-hud-combo'); U.hudTimer = document.getElementById('mall99-hud-timer'); U.hudStage = document.getElementById('mall99-hud-stage'); U.hudZone = document.getElementById('mall99-hud-zone'); U.hudTokens = document.getElementById('mall99-hud-tokens'); U.hudSecrets = document.getElementById('mall99-hud-secrets'); U.charList = document.getElementById('mall99-character-list');
		if (!U.canvas) { return false; }
		U.canvas.width = W; U.canvas.height = H; U.ctx = U.canvas.getContext('2d'); return true;
	}

	function init(rootId) {
		if (S.inited) { return; }
		if (!attach(rootId)) { return; }
		var p = readProgress(); S.high = p.high; S.totalTokens = p.totalTokens; S.unlocks = p.unlocks; S.selected = p.selected;
		buildCharCards(); bindBtns(); hud();
		overlay(true, 'MALL MAYHEM 99', 'Launch your run, chain combos, and hunt neon mall secrets.');
		status('Loadout ready. Launch the cabinet to begin.', '');
		ticker('After-hours mall energy online. Find every hidden detail.', '');
		S.inited = true; S.visible = false;
		window.requestAnimationFrame(loop);
	}
	function onPanelVisibilityChange(name) { S.visible = name === 'games-mall-mayhem'; if (!S.visible && S.running) { pause(true); } }
	function resetSession() {
		S.running = false; S.paused = false; S.open = false; S.gameOver = false; S.t0 = 0;
		if (U.arcade) { U.arcade.classList.add('d-none'); } if (U.launch) { U.launch.classList.remove('d-none'); }
		overlay(true, 'MALL MAYHEM 99', 'Session reset. Pick a character and hit Start Run.');
		status('Session reset. Wallet systems untouched.', ''); ticker('Cabinet reset complete. One more run?', ''); hud();
	}

	window.MallMayhemGameModule = { init: init, onPanelVisibilityChange: onPanelVisibilityChange, resetSession: resetSession, handleActionButton: attack };
})();

(function(window) {
	'use strict';

	if (window.BombermanGameModule) {
		return;
	}

	var TILE_EMPTY = 0;
	var TILE_SOLID = 1;
	var TILE_BREAKABLE = 2;

	var DEFAULT_ECONOMY = {
		ENTRY_COST: 1,
		CONTINUE_COST: 1,
		STARTING_LIVES: 3,
		STARTING_STAGE: 1,
		MAX_CONTINUES_PER_RUN: 2,
		CONTINUE_LIVES: 1,
		MAX_STAGE: 25,
		CONTINUE_POLICY: 'restart-current-stage-preserve-score-and-powerups',
		BONUS_RULES: {
			crateScore: 15,
			enemyScore: 120,
			stageClearScore: 350,
			powerupScore: 50,
			survivalScorePerSecond: 2,
			chainBonus: 25,
			tokenRewardTiers: [
				{ minScore: 1500, tokens: 0.05 },
				{ minScore: 3500, tokens: 0.15 },
				{ minScore: 6000, tokens: 0.35 }
			],
			payoutMode: 'secure-backend-required'
		}
	};

	var ASSET_PATHS = {
		tileFloor: 'assets/games/bomberman/floor-tile.svg',
		tileSolid: 'assets/games/bomberman/solid-wall.svg',
		tileCrate: 'assets/games/bomberman/breakable-crate.svg',
		player: 'assets/games/bomberman/player.svg',
		enemy: 'assets/games/bomberman/enemy.svg',
		bomb: 'assets/games/bomberman/bomb.svg',
		explosionCenter: 'assets/games/bomberman/explosion-center.svg',
		explosionArm: 'assets/games/bomberman/explosion-arm.svg',
		exit: 'assets/games/bomberman/exit-tile.svg',
		powerBomb: 'assets/games/bomberman/power-bomb.svg',
		powerFlame: 'assets/games/bomberman/power-flame.svg',
		powerSpeed: 'assets/games/bomberman/power-speed.svg',
		powerLife: 'assets/games/bomberman/power-life.svg'
	};

	var deps = {
		getWalletBalance: function() { return 0; },
		getTicker: function() { return 'SUGAR'; },
		formatAmount: function(value) { return value.toFixed(8); },
		isWalletReady: function() { return false; }
	};

	var economy = deepClone(DEFAULT_ECONOMY);
	var elements = {};
	var canvas = null;
	var ctx = null;
	var assets = {};
	var rafId = 0;
	var audioContext = null;
	var stageToastTimer = 0;

	var state = createInitialState();

	function deepClone(value) {
		return JSON.parse(JSON.stringify(value));
	}

	function mergeEconomy(base, override) {
		var merged = deepClone(base);
		if (!override) {
			return merged;
		}
		for (var key in override) {
			if (!Object.prototype.hasOwnProperty.call(override, key)) {
				continue;
			}
			if (key === 'BONUS_RULES' && override.BONUS_RULES) {
				for (var bonusKey in override.BONUS_RULES) {
					if (Object.prototype.hasOwnProperty.call(override.BONUS_RULES, bonusKey)) {
						merged.BONUS_RULES[bonusKey] = deepClone(override.BONUS_RULES[bonusKey]);
					}
				}
			} else {
				merged[key] = deepClone(override[key]);
			}
		}
		return merged;
	}

	function createInitialState() {
		return {
			initialized: false,
			status: 'idle',
			walletBalance: 0,
			gameBalance: 0,
			gameBalanceInitialized: false,
			score: 0,
			stage: 1,
			lives: 3,
			continuesUsed: 0,
			autoPaused: false,
			spendPending: false,
			pendingSpendContext: null,
			runId: 0,
			survivalSeconds: 0,
			rewardEvents: [],
			rewardSummaryText: 'No active run yet. Bonus payouts remain pending secure server verification.',
			grid: [],
			rows: 11,
			cols: 13,
			tile: 32,
			exit: { x: 11, y: 9, revealed: false },
			player: {
				x: 1,
				y: 1,
				moveCooldown: 0,
				invuln: 0,
				placedBombs: 0,
				bombCapacity: 1,
				bombRange: 2,
				moveDelay: 0.11,
				wallPass: false,
				bombPass: false
			},
			enemies: [],
			bombs: [],
			flames: [],
			powerups: [],
			input: { up: false, down: false, left: false, right: false, bomb: false },
			bombInputLatch: false,
			lastFrameTime: 0,
			panelVisible: false,
			soundSuspended: false
		};
	}

	function init(options) {
		if (state.initialized) {
			refreshWalletBalance();
			return;
		}

		if (options) {
			for (var key in deps) {
				if (Object.prototype.hasOwnProperty.call(options, key)) {
					deps[key] = options[key];
				}
			}
			if (options.economy) {
				economy = mergeEconomy(DEFAULT_ECONOMY, options.economy);
			}
		}

		cacheElements();
		if (!canvas || !ctx) {
			return;
		}

		state = createInitialState();
		state.stage = economy.STARTING_STAGE;
		state.lives = economy.STARTING_LIVES;
		state.initialized = true;

		bindUi();
		bindAutoPause();
		preloadAssets();
		showStageMessage('Tap Play to start a run. Entry cost is ' + economy.ENTRY_COST + ' ' + deps.getTicker() + '.');
		refreshWalletBalance();
		startLoop();
	}

	function cacheElements() {
		elements.root = document.getElementById('bomberman-root');
		elements.walletBalance = document.getElementById('bomberman-wallet-balance');
		elements.gameBalance = document.getElementById('bomberman-game-balance');
		elements.sessionState = document.getElementById('bomberman-session-state');
		elements.continuesLeft = document.getElementById('bomberman-continues-left');
		elements.play = document.getElementById('bomberman-play-btn');
		elements.pause = document.getElementById('bomberman-pause-btn');
		elements.resume = document.getElementById('bomberman-resume-btn');
		elements.exitRun = document.getElementById('bomberman-exit-run-btn');
		elements.status = document.getElementById('bomberman-spend-status');
		elements.hudLives = document.getElementById('bomberman-hud-lives');
		elements.hudScore = document.getElementById('bomberman-hud-score');
		elements.hudStage = document.getElementById('bomberman-hud-stage');
		elements.hudState = document.getElementById('bomberman-hud-state');
		elements.hudPowerups = document.getElementById('bomberman-hud-powerups');
		elements.pauseOverlay = document.getElementById('bomberman-paused-overlay');
		elements.pauseReason = document.getElementById('bomberman-pause-reason');
		elements.stageToast = document.getElementById('bomberman-stage-message');
		elements.touchUp = document.getElementById('bomberman-touch-up');
		elements.touchDown = document.getElementById('bomberman-touch-down');
		elements.touchLeft = document.getElementById('bomberman-touch-left');
		elements.touchRight = document.getElementById('bomberman-touch-right');
		elements.touchBomb = document.getElementById('bomberman-touch-bomb');
		elements.rewardSummary = document.getElementById('bomberman-reward-summary');
		elements.claim = document.getElementById('bomberman-claim-btn');
		elements.spendModal = document.getElementById('bomberman-spend-modal');
		elements.spendCopy = document.getElementById('bomberman-spend-copy');
		elements.spendError = document.getElementById('bomberman-spend-error');
		elements.spendCancel = document.getElementById('bomberman-spend-cancel');
		elements.spendConfirm = document.getElementById('bomberman-spend-confirm');
		elements.gameOverModal = document.getElementById('bomberman-gameover-modal');
		elements.gameOverCopy = document.getElementById('bomberman-gameover-copy');
		elements.continueBtn = document.getElementById('bomberman-continue-btn');
		elements.exitBtn = document.getElementById('bomberman-exit-btn');
		canvas = document.getElementById('bomberman-canvas');
		ctx = canvas ? canvas.getContext('2d') : null;
	}

	function bindUi() {
		elements.play.addEventListener('click', requestEntrySpend);
		elements.pause.addEventListener('click', function() { pauseRun('Paused by player.', false); });
		elements.resume.addEventListener('click', resumeRun);
		elements.exitRun.addEventListener('click', exitRunToIdle);
		elements.spendCancel.addEventListener('click', closeSpendModal);
		elements.spendConfirm.addEventListener('click', confirmSpend);
		elements.continueBtn.addEventListener('click', requestContinueSpend);
		elements.exitBtn.addEventListener('click', function() { hideGameOverModal(); exitRunToIdle(); });
		elements.claim.addEventListener('click', function() {
			showStatus('Bonus payout submission needs secure server verification before token issuance.', 'info');
		});
		elements.touchBomb.addEventListener('click', function() {
			if (state.status === 'running') {
				placeBomb();
			}
		});
		bindTouchDirection(elements.touchUp, 'up');
		bindTouchDirection(elements.touchDown, 'down');
		bindTouchDirection(elements.touchLeft, 'left');
		bindTouchDirection(elements.touchRight, 'right');
		window.addEventListener('keydown', onKeyDown);
		window.addEventListener('keyup', onKeyUp);
	}

	function bindTouchDirection(element, directionKey) {
		element.addEventListener('touchstart', function(e) { e.preventDefault(); state.input[directionKey] = true; }, { passive: false });
		element.addEventListener('touchend', function(e) { e.preventDefault(); state.input[directionKey] = false; }, { passive: false });
		element.addEventListener('mousedown', function(e) { e.preventDefault(); state.input[directionKey] = true; });
		element.addEventListener('mouseup', function(e) { e.preventDefault(); state.input[directionKey] = false; });
		element.addEventListener('mouseleave', function() { state.input[directionKey] = false; });
	}

	function bindAutoPause() {
		document.addEventListener('visibilitychange', function() {
			if (document.hidden) {
				pauseRun('Paused automatically because this tab is hidden.', true);
			}
		});
		window.addEventListener('blur', function() {
			pauseRun('Paused automatically because wallet focus was lost.', true);
		});
	}

	function onKeyDown(e) {
		if (!state.panelVisible) {
			return;
		}
		if (e.code === 'ArrowUp' || e.code === 'KeyW') { state.input.up = true; e.preventDefault(); }
		if (e.code === 'ArrowDown' || e.code === 'KeyS') { state.input.down = true; e.preventDefault(); }
		if (e.code === 'ArrowLeft' || e.code === 'KeyA') { state.input.left = true; e.preventDefault(); }
		if (e.code === 'ArrowRight' || e.code === 'KeyD') { state.input.right = true; e.preventDefault(); }
		if (e.code === 'Space') { state.input.bomb = true; e.preventDefault(); }
		if (e.code === 'KeyP') {
			e.preventDefault();
			if (state.status === 'running') {
				pauseRun('Paused by player.', false);
			} else if (state.status === 'paused') {
				resumeRun();
			}
		}
	}

	function onKeyUp(e) {
		if (e.code === 'ArrowUp' || e.code === 'KeyW') { state.input.up = false; }
		if (e.code === 'ArrowDown' || e.code === 'KeyS') { state.input.down = false; }
		if (e.code === 'ArrowLeft' || e.code === 'KeyA') { state.input.left = false; }
		if (e.code === 'ArrowRight' || e.code === 'KeyD') { state.input.right = false; }
		if (e.code === 'Space') { state.input.bomb = false; }
	}

	function preloadAssets() {
		for (var key in ASSET_PATHS) {
			if (!Object.prototype.hasOwnProperty.call(ASSET_PATHS, key)) {
				continue;
			}
			var image = new Image();
			assets[key] = { image: image, loaded: false };
			image.onload = (function(assetKey) { return function() { assets[assetKey].loaded = true; }; })(key);
			image.onerror = (function(assetKey) { return function() { assets[assetKey].loaded = false; }; })(key);
			image.src = ASSET_PATHS[key];
		}
	}

	function startLoop() {
		if (rafId) {
			return;
		}
		rafId = window.requestAnimationFrame(loop);
	}

	function loop(timestamp) {
		if (!state.lastFrameTime) {
			state.lastFrameTime = timestamp;
		}
		var dt = Math.min((timestamp - state.lastFrameTime) / 1000, 0.05);
		state.lastFrameTime = timestamp;
		if (state.status === 'running') {
			update(dt);
		}
		render();
		rafId = window.requestAnimationFrame(loop);
	}
	function update(dt) {
		state.survivalSeconds += dt;
		state.player.moveCooldown = Math.max(0, state.player.moveCooldown - dt);
		state.player.invuln = Math.max(0, state.player.invuln - dt);
		accrueSurvivalBonus(dt);
		handleMovementInput();
		handleBombInput();
		updateBombs(dt);
		updateFlames(dt);
		updateEnemies(dt);
		collectPowerups();
		checkExitCondition();
	}

	function accrueSurvivalBonus(dt) {
		var bonus = economy.BONUS_RULES.survivalScorePerSecond || 0;
		if (bonus > 0) {
			state.score += (bonus * dt);
		}
	}

	function handleMovementInput() {
		if (state.player.moveCooldown > 0) {
			return;
		}
		var direction = null;
		if (state.input.left) { direction = { x: -1, y: 0 }; }
		else if (state.input.right) { direction = { x: 1, y: 0 }; }
		else if (state.input.up) { direction = { x: 0, y: -1 }; }
		else if (state.input.down) { direction = { x: 0, y: 1 }; }
		if (!direction) {
			return;
		}
		var nx = state.player.x + direction.x;
		var ny = state.player.y + direction.y;
		if (isPassableForPlayer(nx, ny)) {
			state.player.x = nx;
			state.player.y = ny;
			state.player.moveCooldown = state.player.moveDelay;
		}
	}

	function handleBombInput() {
		if (!state.input.bomb) {
			state.bombInputLatch = false;
			return;
		}
		if (state.bombInputLatch) {
			return;
		}
		state.bombInputLatch = true;
		placeBomb();
	}

	function placeBomb() {
		if (state.status !== 'running') {
			return;
		}
		if (state.player.placedBombs >= state.player.bombCapacity) {
			return;
		}
		if (findBombAt(state.player.x, state.player.y)) {
			return;
		}
		state.bombs.push({ x: state.player.x, y: state.player.y, timer: 2.1, range: state.player.bombRange, ownerCanPass: true });
		state.player.placedBombs += 1;
		playSfx('bomb');
	}

	function updateBombs(dt) {
		for (var i = state.bombs.length - 1; i >= 0; i--) {
			var bomb = state.bombs[i];
			if (bomb.ownerCanPass && (bomb.x !== state.player.x || bomb.y !== state.player.y)) {
				bomb.ownerCanPass = false;
			}
			bomb.timer -= dt;
			if (bomb.timer <= 0) {
				state.bombs.splice(i, 1);
				state.player.placedBombs = Math.max(0, state.player.placedBombs - 1);
				explodeBomb(bomb);
			}
		}
	}

	function explodeBomb(bomb) {
		var cells = [{ x: bomb.x, y: bomb.y }];
		var dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
		for (var d = 0; d < dirs.length; d++) {
			for (var step = 1; step <= bomb.range; step++) {
				var nx = bomb.x + dirs[d].x * step;
				var ny = bomb.y + dirs[d].y * step;
				if (!isInside(nx, ny) || state.grid[ny][nx] === TILE_SOLID) {
					break;
				}
				cells.push({ x: nx, y: ny });
				if (state.grid[ny][nx] === TILE_BREAKABLE) {
					break;
				}
			}
		}

		var enemyDefeats = 0;
		for (var c = 0; c < cells.length; c++) {
			var cell = cells[c];
			state.flames.push({ x: cell.x, y: cell.y, timer: 0.56 });
			if (state.grid[cell.y][cell.x] === TILE_BREAKABLE) {
				state.grid[cell.y][cell.x] = TILE_EMPTY;
				addScore(economy.BONUS_RULES.crateScore, 'crate_destroyed');
				maybeDropPowerup(cell.x, cell.y);
				if (state.exit.x === cell.x && state.exit.y === cell.y) {
					state.exit.revealed = true;
				}
			}
			var chainBomb = findBombAt(cell.x, cell.y);
			if (chainBomb) {
				chainBomb.timer = Math.min(0.02, chainBomb.timer);
			}
			for (var ei = state.enemies.length - 1; ei >= 0; ei--) {
				if (state.enemies[ei].x === cell.x && state.enemies[ei].y === cell.y) {
					state.enemies.splice(ei, 1);
					enemyDefeats += 1;
					addScore(economy.BONUS_RULES.enemyScore, 'enemy_defeated');
					playSfx('enemy');
				}
			}
			if (state.player.x === cell.x && state.player.y === cell.y && state.player.invuln <= 0) {
				handlePlayerDeath('explosion');
			}
		}
		if (enemyDefeats > 1) {
			addScore((enemyDefeats - 1) * economy.BONUS_RULES.chainBonus, 'chain_bonus');
		}
		playSfx('explosion');
	}

	function updateFlames(dt) {
		for (var i = state.flames.length - 1; i >= 0; i--) {
			state.flames[i].timer -= dt;
			if (state.flames[i].timer <= 0) {
				state.flames.splice(i, 1);
			}
		}
	}

	function updateEnemies(dt) {
		for (var i = 0; i < state.enemies.length; i++) {
			var enemy = state.enemies[i];
			enemy.cooldown -= dt;
			if (enemy.cooldown <= 0) {
				moveEnemy(enemy);
				enemy.cooldown = enemy.stepDelay;
			}
			if (enemy.x === state.player.x && enemy.y === state.player.y && state.player.invuln <= 0) {
				handlePlayerDeath('enemy_contact');
			}
		}
	}

	function moveEnemy(enemy) {
		var dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
		var options = [];
		for (var i = 0; i < dirs.length; i++) {
			var nx = enemy.x + dirs[i].x;
			var ny = enemy.y + dirs[i].y;
			if (isPassableForEnemy(nx, ny)) {
				options.push(dirs[i]);
			}
		}
		if (!options.length) {
			return;
		}
		var pick = options[Math.floor(Math.random() * options.length)];
		enemy.x += pick.x;
		enemy.y += pick.y;
	}

	function handlePlayerDeath(reason) {
		if (state.status !== 'running') {
			return;
		}
		state.lives -= 1;
		playSfx('death');
		showStageMessage('Life lost: ' + reason.replace('_', ' ') + '.');
		if (state.lives > 0) {
			state.status = 'respawn';
			window.setTimeout(function() {
				if (state.status === 'respawn') {
					restartCurrentStage();
				}
			}, 750);
			return;
		}
		state.status = 'game-over';
		openGameOverModal();
		updateRewardSummary();
	}

	function restartCurrentStage() {
		startStage(state.stage, true);
		state.status = 'running';
	}

	function maybeDropPowerup(x, y) {
		if (Math.random() > 0.28) {
			return;
		}
		var bag = ['bomb', 'flame', 'speed', 'life'];
		state.powerups.push({ x: x, y: y, type: bag[Math.floor(Math.random() * bag.length)] });
	}

	function collectPowerups() {
		for (var i = state.powerups.length - 1; i >= 0; i--) {
			var powerup = state.powerups[i];
			if (powerup.x !== state.player.x || powerup.y !== state.player.y) {
				continue;
			}
			applyPowerup(powerup.type);
			state.powerups.splice(i, 1);
			addScore(economy.BONUS_RULES.powerupScore, 'powerup_collected');
			playSfx('pickup');
		}
	}

	function applyPowerup(type) {
		if (type === 'bomb') { state.player.bombCapacity = Math.min(6, state.player.bombCapacity + 1); }
		if (type === 'flame') { state.player.bombRange = Math.min(7, state.player.bombRange + 1); }
		if (type === 'speed') { state.player.moveDelay = Math.max(0.06, state.player.moveDelay - 0.01); }
		if (type === 'life') { state.lives += 1; }
	}

	function checkExitCondition() {
		if (!state.exit.revealed || state.enemies.length > 0) {
			return;
		}
		if (state.player.x === state.exit.x && state.player.y === state.exit.y) {
			advanceStage();
		}
	}

	function advanceStage() {
		if (state.status !== 'running') {
			return;
		}
		state.status = 'stage-clear';
		addScore(economy.BONUS_RULES.stageClearScore, 'stage_clear');
		showStageMessage('Stage ' + state.stage + ' clear!');
		playSfx('stageclear');
		window.setTimeout(function() {
			if (state.status === 'stage-clear') {
				state.stage = Math.min(economy.MAX_STAGE, state.stage + 1);
				startStage(state.stage, false);
				state.status = 'running';
			}
		}, 1200);
	}

	function startStage(stageNumber) {
		state.grid = [];
		for (var y = 0; y < state.rows; y++) {
			var row = [];
			for (var x = 0; x < state.cols; x++) {
				if (x === 0 || y === 0 || x === state.cols - 1 || y === state.rows - 1) { row.push(TILE_SOLID); }
				else if (x % 2 === 0 && y % 2 === 0) { row.push(TILE_SOLID); }
				else { row.push(TILE_EMPTY); }
			}
			state.grid.push(row);
		}

		var safe = { '1,1': true, '1,2': true, '2,1': true, '2,2': true };
		var crateCells = [];
		var crateRate = Math.max(0.20, 0.43 - stageNumber * 0.01);
		for (var cy = 1; cy < state.rows - 1; cy++) {
			for (var cx = 1; cx < state.cols - 1; cx++) {
				if (state.grid[cy][cx] !== TILE_EMPTY || safe[cx + ',' + cy]) {
					continue;
				}
				if (Math.random() < crateRate) {
					state.grid[cy][cx] = TILE_BREAKABLE;
					crateCells.push({ x: cx, y: cy });
				}
			}
		}
		if (!crateCells.length) {
			crateCells.push({ x: state.cols - 2, y: state.rows - 2 });
			state.grid[state.rows - 2][state.cols - 2] = TILE_BREAKABLE;
		}
		state.exit = deepClone(crateCells[Math.floor(Math.random() * crateCells.length)]);
		state.exit.revealed = false;

		state.player.x = 1;
		state.player.y = 1;
		state.player.moveCooldown = 0;
		state.player.invuln = 1.1;
		state.player.placedBombs = 0;
		state.bombs = [];
		state.flames = [];
		state.powerups = [];
		state.enemies = [];

		var enemyCount = Math.min(8, 2 + stageNumber);
		var candidates = [];
		for (var ey = 1; ey < state.rows - 1; ey++) {
			for (var ex = 1; ex < state.cols - 1; ex++) {
				if (state.grid[ey][ex] === TILE_EMPTY && Math.abs(ex - 1) + Math.abs(ey - 1) >= 4) {
					candidates.push({ x: ex, y: ey });
				}
			}
		}
		for (var i = 0; i < enemyCount && candidates.length; i++) {
			var idx = Math.floor(Math.random() * candidates.length);
			var pick = candidates.splice(idx, 1)[0];
			state.enemies.push({ x: pick.x, y: pick.y, cooldown: 0.35, stepDelay: Math.max(0.12, 0.42 - stageNumber * 0.01) });
		}
	}

	function isInside(x, y) {
		return x >= 0 && y >= 0 && x < state.cols && y < state.rows;
	}

	function isPassableForPlayer(x, y) {
		if (!isInside(x, y) || state.grid[y][x] === TILE_SOLID) {
			return false;
		}
		if (state.grid[y][x] === TILE_BREAKABLE && !state.player.wallPass) {
			return false;
		}
		var bomb = findBombAt(x, y);
		if (!bomb) {
			return true;
		}
		if (bomb.ownerCanPass && bomb.x === state.player.x && bomb.y === state.player.y) {
			return true;
		}
		return state.player.bombPass;
	}

	function isPassableForEnemy(x, y) {
		return isInside(x, y) && state.grid[y][x] === TILE_EMPTY && !findBombAt(x, y);
	}

	function findBombAt(x, y) {
		for (var i = 0; i < state.bombs.length; i++) {
			if (state.bombs[i].x === x && state.bombs[i].y === y) {
				return state.bombs[i];
			}
		}
		return null;
	}

	function addScore(points, reason) {
		if (!points) {
			return;
		}
		state.score += points;
		state.rewardEvents.push({ reason: reason, points: points, at: Date.now() });
	}
	function render() {
		if (!ctx || !canvas) {
			return;
		}
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		for (var y = 0; y < state.rows; y++) {
			for (var x = 0; x < state.cols; x++) {
				drawTile('tileFloor', x, y);
				if (state.grid[y] && state.grid[y][x] === TILE_SOLID) { drawTile('tileSolid', x, y); }
				if (state.grid[y] && state.grid[y][x] === TILE_BREAKABLE) { drawTile('tileCrate', x, y); }
			}
		}
		if (state.exit.revealed) { drawTile('exit', state.exit.x, state.exit.y); }
		for (var p = 0; p < state.powerups.length; p++) { drawPowerup(state.powerups[p]); }
		for (var b = 0; b < state.bombs.length; b++) { drawTile('bomb', state.bombs[b].x, state.bombs[b].y); }
		for (var f = 0; f < state.flames.length; f++) { drawTile((f % 2 === 0) ? 'explosionCenter' : 'explosionArm', state.flames[f].x, state.flames[f].y); }
		for (var e = 0; e < state.enemies.length; e++) { drawTile('enemy', state.enemies[e].x, state.enemies[e].y); }
		drawTile('player', state.player.x, state.player.y);
		renderHud();
	}

	function drawPowerup(powerup) {
		if (powerup.type === 'bomb') { drawTile('powerBomb', powerup.x, powerup.y); }
		if (powerup.type === 'flame') { drawTile('powerFlame', powerup.x, powerup.y); }
		if (powerup.type === 'speed') { drawTile('powerSpeed', powerup.x, powerup.y); }
		if (powerup.type === 'life') { drawTile('powerLife', powerup.x, powerup.y); }
	}

	function drawTile(key, gridX, gridY) {
		var px = gridX * state.tile;
		var py = gridY * state.tile;
		var entry = assets[key];
		if (entry && entry.loaded) {
			ctx.drawImage(entry.image, px, py, state.tile, state.tile);
			return;
		}
		drawFallback(key, px, py);
	}

	function drawFallback(key, px, py) {
		if (key === 'tileFloor') { ctx.fillStyle = '#215f31'; ctx.fillRect(px, py, state.tile, state.tile); return; }
		if (key === 'tileSolid') { ctx.fillStyle = '#4e656a'; ctx.fillRect(px, py, state.tile, state.tile); return; }
		if (key === 'tileCrate') { ctx.fillStyle = '#956736'; ctx.fillRect(px, py, state.tile, state.tile); return; }
		if (key === 'player') { ctx.fillStyle = '#3cbf6a'; ctx.fillRect(px + 5, py + 5, state.tile - 10, state.tile - 10); return; }
		if (key === 'enemy') { ctx.fillStyle = '#de5757'; ctx.fillRect(px + 5, py + 5, state.tile - 10, state.tile - 10); return; }
		if (key === 'bomb') { ctx.fillStyle = '#111111'; ctx.beginPath(); ctx.arc(px + state.tile / 2, py + state.tile / 2, state.tile * 0.30, 0, Math.PI * 2); ctx.fill(); return; }
		if (key === 'explosionCenter' || key === 'explosionArm') { ctx.fillStyle = 'rgba(255,183,0,0.88)'; ctx.fillRect(px + 2, py + 2, state.tile - 4, state.tile - 4); return; }
		if (key === 'exit') { ctx.fillStyle = '#304660'; ctx.fillRect(px + 3, py + 3, state.tile - 6, state.tile - 6); return; }
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(px + 6, py + 6, state.tile - 12, state.tile - 12);
	}

	function renderHud() {
		elements.walletBalance.textContent = deps.formatAmount(state.walletBalance) + ' ' + deps.getTicker();
		elements.gameBalance.textContent = deps.formatAmount(state.gameBalance) + ' ' + deps.getTicker();
		elements.sessionState.textContent = readableStateLabel(state.status);
		elements.continuesLeft.textContent = String(Math.max(0, economy.MAX_CONTINUES_PER_RUN - state.continuesUsed));
		elements.hudLives.textContent = String(state.lives);
		elements.hudScore.textContent = String(Math.floor(state.score));
		elements.hudStage.textContent = String(state.stage);
		elements.hudState.textContent = readableStateLabel(state.status);
		elements.hudPowerups.textContent = 'Bombs ' + state.player.bombCapacity + ' | Range ' + state.player.bombRange + ' | Speed x' + (0.11 / state.player.moveDelay).toFixed(2);
		elements.rewardSummary.textContent = state.rewardSummaryText;
		updateButtonStates();
	}

	function updateButtonStates() {
		var running = state.status === 'running';
		var paused = state.status === 'paused';
		elements.play.disabled = state.status !== 'idle' || state.spendPending;
		elements.pause.disabled = !running;
		elements.resume.disabled = !paused;
		elements.exitRun.disabled = !(running || paused || state.status === 'game-over' || state.status === 'stage-clear');
		elements.continueBtn.disabled = !canContinue() || state.spendPending;
	}

	function readableStateLabel(value) {
		if (value === 'idle') { return 'Idle'; }
		if (value === 'running') { return 'Running'; }
		if (value === 'paused') { return 'Paused'; }
		if (value === 'game-over') { return 'Game Over'; }
		if (value === 'stage-clear') { return 'Stage Clear'; }
		if (value === 'respawn') { return 'Respawning'; }
		return value;
	}

	function requestEntrySpend() {
		if (!deps.isWalletReady()) {
			showStatus('Open your wallet first before starting Bomberman.', 'error');
			return;
		}
		refreshWalletBalance();
		if (state.walletBalance < economy.ENTRY_COST) {
			showStatus('Not enough balance for entry. Need ' + economy.ENTRY_COST + ' ' + deps.getTicker() + '.', 'error');
			return;
		}
		openSpendModal({ type: 'entry', cost: economy.ENTRY_COST, title: 'Start Bomberman Run', description: 'Starting a run spends ' + economy.ENTRY_COST + ' ' + deps.getTicker() + '. Continue charges are separate and always require a new confirmation.' });
	}

	function requestContinueSpend() {
		if (!canContinue()) {
			showStatus('No continues left for this run.', 'error');
			return;
		}
		refreshWalletBalance();
		if (state.walletBalance < economy.CONTINUE_COST) {
			showStatus('Not enough balance to continue. Need ' + economy.CONTINUE_COST + ' ' + deps.getTicker() + '.', 'error');
			return;
		}
		openSpendModal({ type: 'continue', cost: economy.CONTINUE_COST, title: 'Continue Run', description: 'Continue policy: ' + economy.CONTINUE_POLICY + '. This restarts the current stage with preserved score/powerups.' });
	}

	function canContinue() {
		return state.status === 'game-over' && state.continuesUsed < economy.MAX_CONTINUES_PER_RUN;
	}

	function openSpendModal(context) {
		state.pendingSpendContext = context;
		state.spendPending = false;
		elements.spendError.classList.add('d-none');
		elements.spendError.textContent = '';
		elements.spendConfirm.disabled = false;
		elements.spendCancel.disabled = false;
		var projectedWalletBalance = Math.max(0, state.walletBalance - context.cost);
		var projectedGameBalance = Math.max(0, state.gameBalance - context.cost);
		elements.spendCopy.innerHTML = '<b>' + context.title + '</b><br>' + context.description + '<br><br>Wallet balance: ' + deps.formatAmount(state.walletBalance) + ' ' + deps.getTicker() + '<br>Game balance: ' + deps.formatAmount(state.gameBalance) + ' ' + deps.getTicker() + '<br>After spend (wallet): ' + deps.formatAmount(projectedWalletBalance) + ' ' + deps.getTicker() + '<br>After spend (game): ' + deps.formatAmount(projectedGameBalance) + ' ' + deps.getTicker() + '<br>Spend now?';
		elements.spendModal.classList.remove('d-none');
	}

	function closeSpendModal() {
		if (state.spendPending) {
			return;
		}
		state.pendingSpendContext = null;
		elements.spendModal.classList.add('d-none');
	}

	// Entertainment-only balance flow: entry/continue spends are local session deductions.
	// This does not submit blockchain transactions and resets when wallet session resets.
	function confirmSpend() {
		if (!state.pendingSpendContext || state.spendPending) {
			return;
		}
		state.spendPending = true;
		elements.spendConfirm.disabled = true;
		elements.spendCancel.disabled = true;
		showStatus('Applying local ' + state.pendingSpendContext.type + ' spend...', 'info');

		if (state.walletBalance < state.pendingSpendContext.cost || state.gameBalance < state.pendingSpendContext.cost) {
			state.spendPending = false;
			elements.spendConfirm.disabled = false;
			elements.spendCancel.disabled = false;
			elements.spendError.classList.remove('d-none');
			elements.spendError.textContent = 'Insufficient in-memory balance for this spend.';
			showStatus('Spend failed. No run state changed.', 'error');
			return;
		}

		state.walletBalance = roundToGameAmount(state.walletBalance - state.pendingSpendContext.cost);
		state.gameBalance = roundToGameAmount(state.gameBalance - state.pendingSpendContext.cost);
		state.spendPending = false;
		showStatus('Local spend applied: -' + deps.formatAmount(state.pendingSpendContext.cost) + ' ' + deps.getTicker() + '.', 'success');
		closeSpendModal();
		if (state.pendingSpendContext && state.pendingSpendContext.type === 'entry') { startRunAfterEntry(); }
		if (state.pendingSpendContext && state.pendingSpendContext.type === 'continue') { resumeFromContinue(); }
		state.pendingSpendContext = null;
	}

	function startRunAfterEntry() {
		state.runId += 1;
		state.score = 0;
		state.stage = economy.STARTING_STAGE;
		state.lives = economy.STARTING_LIVES;
		state.continuesUsed = 0;
		state.survivalSeconds = 0;
		state.rewardEvents = [];
		state.rewardSummaryText = 'Run active. Bonus payouts are pending secure backend verification.';
		state.player.bombCapacity = 1;
		state.player.bombRange = 2;
		state.player.moveDelay = 0.11;
		state.player.wallPass = false;
		state.player.bombPass = false;
		state.status = 'running';
		startStage(state.stage);
		playSfx('resume');
		showStageMessage('Run started. Entry cost deducted from in-memory wallet balance.');
	}

	function resumeFromContinue() {
		state.continuesUsed += 1;
		state.lives = economy.CONTINUE_LIVES;
		hideGameOverModal();
		state.status = 'running';
		restartCurrentStage();
		playSfx('resume');
		showStageMessage('Continue accepted. In-memory wallet balance updated.');
	}

	function openGameOverModal() {
		var left = Math.max(0, economy.MAX_CONTINUES_PER_RUN - state.continuesUsed);
		elements.gameOverCopy.textContent = 'Score: ' + Math.floor(state.score) + '. Stage reached: ' + state.stage + '. Continues left: ' + left + '.';
		elements.continueBtn.disabled = !canContinue();
		elements.gameOverModal.classList.remove('d-none');
	}

	function hideGameOverModal() {
		elements.gameOverModal.classList.add('d-none');
	}

	function pauseRun(reason, automatic) {
		if (state.status !== 'running') {
			return;
		}
		state.status = 'paused';
		state.autoPaused = !!automatic;
		state.soundSuspended = true;
		elements.pauseReason.textContent = reason || 'Paused.';
		elements.pauseOverlay.classList.remove('d-none');
		showStatus(reason || 'Paused.', 'info');
		playSfx('pause');
	}

	function resumeRun() {
		if (state.status !== 'paused') {
			return;
		}
		state.status = 'running';
		state.autoPaused = false;
		state.soundSuspended = false;
		elements.pauseOverlay.classList.add('d-none');
		showStatus('Run resumed.', 'success');
		playSfx('resume');
	}

	function showStageMessage(message) {
		elements.stageToast.textContent = message;
		elements.stageToast.classList.remove('d-none');
		if (stageToastTimer) {
			window.clearTimeout(stageToastTimer);
		}
		stageToastTimer = window.setTimeout(function() {
			elements.stageToast.classList.add('d-none');
		}, 2400);
	}

	function showStatus(text, variant) {
		elements.status.textContent = text;
		elements.status.classList.remove('d-none', 'info', 'success', 'error');
		elements.status.classList.add(variant || 'info');
	}

	function hideStatus() {
		elements.status.classList.add('d-none');
	}

	// Reward math is intentionally client-side display only until a secure verifier is available.
	function updateRewardSummary() {
		var score = Math.floor(state.score);
		var crates = 0;
		var enemies = 0;
		var stageClear = 0;
		for (var i = 0; i < state.rewardEvents.length; i++) {
			if (state.rewardEvents[i].reason === 'crate_destroyed') { crates += 1; }
			if (state.rewardEvents[i].reason === 'enemy_defeated') { enemies += 1; }
			if (state.rewardEvents[i].reason === 'stage_clear') { stageClear += 1; }
		}
		var estimatedReward = 0;
		var tiers = economy.BONUS_RULES.tokenRewardTiers || [];
		for (var t = 0; t < tiers.length; t++) {
			if (score >= tiers[t].minScore) {
				estimatedReward = tiers[t].tokens;
			}
		}
		state.rewardSummaryText = 'Run score: ' + score + ' | Crates: ' + crates + ' | Enemies: ' + enemies + ' | Stage clears: ' + stageClear + ' | Estimated bonus: ' + estimatedReward + ' ' + deps.getTicker() + ' (client-side display only; secure verification required before payout).';
	}

	function exitRunToIdle() {
		hideGameOverModal();
		closeSpendModal();
		state.status = 'idle';
		state.autoPaused = false;
		state.soundSuspended = false;
		state.score = 0;
		state.stage = economy.STARTING_STAGE;
		state.lives = economy.STARTING_LIVES;
		state.continuesUsed = 0;
		state.survivalSeconds = 0;
		state.player.bombCapacity = 1;
		state.player.bombRange = 2;
		state.player.moveDelay = 0.11;
		state.player.wallPass = false;
		state.player.bombPass = false;
		state.grid = [];
		state.enemies = [];
		state.bombs = [];
		state.flames = [];
		state.powerups = [];
		elements.pauseOverlay.classList.add('d-none');
		updateRewardSummary();
		showStageMessage('Run ended. Tap Play to start again.');
		hideStatus();
	}

	function refreshWalletBalance() {
		var value = Number(deps.getWalletBalance());
		if (!isFinite(value) || value < 0) {
			value = 0;
		}
		if (!state.gameBalanceInitialized) {
			state.walletBalance = value;
			state.gameBalance = value;
			state.gameBalanceInitialized = true;
		}
	}

	function onPanelVisibilityChange(contentName) {
		state.panelVisible = contentName === 'games-bomberman';
		if (!state.panelVisible && state.status === 'running') {
			pauseRun('Paused automatically because you switched away from Bomberman.', true);
		}
	}

	function resetSession() {
		exitRunToIdle();
		state.walletBalance = 0;
		state.gameBalance = 0;
		state.gameBalanceInitialized = false;
	}

	function roundToGameAmount(value) {
		return Math.round(Number(value) * 100000000) / 100000000;
	}

	function playSfx(kind) {
		if (state.soundSuspended) {
			return;
		}
		try {
			if (!audioContext) {
				audioContext = new (window.AudioContext || window.webkitAudioContext)();
			}
			var palette = {
				bomb: [180, 140],
				explosion: [110, 80, 65],
				enemy: [420, 280],
				pickup: [700, 900],
				death: [240, 120],
				stageclear: [520, 660, 840],
				resume: [500, 640],
				pause: [250, 180]
			};
			var notes = palette[kind] || [440];
			for (var i = 0; i < notes.length; i++) {
				var osc = audioContext.createOscillator();
				var gain = audioContext.createGain();
				var start = audioContext.currentTime + (i * 0.06);
				osc.type = 'triangle';
				osc.frequency.value = notes[i];
				gain.gain.value = 0.0001;
				osc.connect(gain);
				gain.connect(audioContext.destination);
				gain.gain.exponentialRampToValueAtTime(0.10, start + 0.01);
				gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.13);
				osc.start(start);
				osc.stop(start + 0.14);
			}
		} catch (error) {
			// Ignore audio errors on restricted browsers.
		}
	}

	window.BombermanGameModule = {
		init: init,
		refreshWalletBalance: refreshWalletBalance,
		resetSession: resetSession,
		onPanelVisibilityChange: onPanelVisibilityChange,
		getEconomyConfig: function() { return deepClone(economy); }
	};
})(window);



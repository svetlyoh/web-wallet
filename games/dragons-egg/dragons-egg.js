(function () {
	'use strict';

	if (window.DragonsEggGameModule) {
		return;
	}

	var TICK_MS = 240;
	var LANE_POSITIONS = [
		{ x: 13, y: 77.5 },
		{ x: 25, y: 76.8 },
		{ x: 39, y: 76.8 },
		{ x: 53, y: 76.5 },
		{ x: 67, y: 76.5 },
		{ x: 79, y: 76.5 }
	];
	var TOP_TRACKS = [
		{ x: 34, groundIndex: 1 },
		{ x: 48, groundIndex: 2 },
		{ x: 61, groundIndex: 3 }
	];
	var JUMP_OFFSET = { 0: 0, 1: -10, 2: -20, 3: -10 };

	var SPRITES = {
		cavemanRunA:
			'<svg viewBox="0 0 88 88" aria-hidden="true">' +
				'<path d="M38 10c8-4 20 2 20 12 0 8-7 13-14 13-7 0-13-5-13-12 0-5 2-10 7-13z"></path>' +
				'<path d="M29 18c6-8 20-10 29-2l6 7-8-1-3 4-7-6-6 5-4-4-8 2z"></path>' +
				'<path d="M27 36c4-5 11-6 17-4l8 5c5 2 8 8 7 13l-2 9-8-1 1-7-6-3-4 8-8-1 3-10-5-5 5-4z"></path>' +
				'<path d="M22 52l9 3-9 12-7-2z"></path>' +
				'<path d="M49 54l10 2 8 14-9 2z"></path>' +
				'<circle cx="45" cy="27.5" r="2.2" fill="#c3ccbf"></circle>' +
				'<path d="M50 30c2 1 3 2 3 4h-6c0-2 1-3 3-4z" fill="#c3ccbf"></path>' +
			'</svg>',
		cavemanRunB:
			'<svg viewBox="0 0 88 88" aria-hidden="true">' +
				'<path d="M38 10c8-4 20 2 20 12 0 8-7 13-14 13-7 0-13-5-13-12 0-5 2-10 7-13z"></path>' +
				'<path d="M29 18c6-8 20-10 29-2l6 7-8-1-3 4-7-6-6 5-4-4-8 2z"></path>' +
				'<path d="M26 38c4-5 11-7 17-5l8 5c5 2 7 8 6 12l-3 8-8-2 1-6-6-3-4 8-8-1 4-9-4-6 5-1z"></path>' +
				'<path d="M25 55l9 2 4 14-8 2z"></path>' +
				'<path d="M48 55l10 2-10 11-8-2z"></path>' +
				'<circle cx="45" cy="27.5" r="2.2" fill="#c3ccbf"></circle>' +
				'<path d="M50 30c2 1 3 2 3 4h-6c0-2 1-3 3-4z" fill="#c3ccbf"></path>' +
			'</svg>',
		cavemanJump:
			'<svg viewBox="0 0 88 88" aria-hidden="true">' +
				'<path d="M38 10c8-4 20 2 20 12 0 8-7 13-14 13-7 0-13-5-13-12 0-5 2-10 7-13z"></path>' +
				'<path d="M29 18c6-8 20-10 29-2l6 7-8-1-3 4-7-6-6 5-4-4-8 2z"></path>' +
				'<path d="M25 39c4-6 13-7 19-4l8 5c4 2 7 8 5 12l-3 8-8-2 2-6-7-3-7 5-8-2 2-7-3-6z"></path>' +
				'<path d="M30 57l8 3-2 11-8-2z"></path>' +
				'<path d="M48 56l8 2 2 11-8 1z"></path>' +
				'<circle cx="45" cy="27.5" r="2.2" fill="#c3ccbf"></circle>' +
				'<path d="M50 30c2 1 3 2 3 4h-6c0-2 1-3 3-4z" fill="#c3ccbf"></path>' +
			'</svg>',
		cavemanFail:
			'<svg viewBox="0 0 88 88" aria-hidden="true">' +
				'<path d="M39 12c8-4 19 2 19 11 0 8-6 13-13 13s-13-5-13-12c0-5 2-9 7-12z"></path>' +
				'<path d="M30 19c6-8 20-10 28-2l5 6-8-1-3 4-7-6-5 4-5-4-8 3z"></path>' +
				'<path d="M23 44c5-7 14-10 23-7l10 4c5 2 8 8 7 13l-3 8-8-1 1-6-8-2-7 5-8-2-3-8 4-4z"></path>' +
				'<path d="M21 57l10 2 8 10-10 3z"></path>' +
				'<path d="M45 56l10 1 9 10-10 2z"></path>' +
				'<circle cx="45" cy="27.5" r="2.2" fill="#c3ccbf"></circle>' +
				'<path d="M41 31l3 4 4-4" fill="none" stroke="#c3ccbf" stroke-width="2.4" stroke-linecap="round"></path>' +
			'</svg>',
		cavemanFallen:
			'<svg viewBox="0 0 88 88" aria-hidden="true">' +
				'<path d="M19 54c4-8 15-13 29-12 15 1 25 8 28 17-5 8-15 12-29 12-14 0-23-6-28-17z"></path>' +
				'<path d="M31 35c7-6 20-6 27 1 6 6 5 14-1 19-8 7-20 7-28 1-7-6-6-14 2-21z"></path>' +
				'<circle cx="46" cy="43" r="2.2" fill="#c3ccbf"></circle>' +
				'<path d="M42 47l4-2 3 3" fill="none" stroke="#c3ccbf" stroke-width="2.2" stroke-linecap="round"></path>' +
			'</svg>',
		dragonOpen:
			'<svg viewBox="0 0 120 92" aria-hidden="true">' +
				'<path d="M25 67c-12-11-12-32 2-43 14-10 42-12 59 2 17 14 19 38 2 49-10 6-26 8-39 5l-9 7-5-9c-3-2-7-5-10-11z"></path>' +
				'<path d="M52 34c5-5 17-7 24-3 6 4 4 11-3 13-7 2-18 2-24-2-4-3-3-6 3-8z" fill="#c3ccbf"></path>' +
				'<path d="M74 45l11 7-9 4-8-3z" fill="#c3ccbf"></path>' +
				'<circle cx="67" cy="34" r="2.8" fill="#1a231f"></circle>' +
				'<path d="M20 67l10-1 7 12-11 2z"></path>' +
				'<path d="M74 66l11 0 7 12-11 2z"></path>' +
				'<path d="M88 48l19 6-10 6-13-3z"></path>' +
			'</svg>',
		dragonClosed:
			'<svg viewBox="0 0 120 92" aria-hidden="true">' +
				'<path d="M25 67c-12-11-12-32 2-43 14-10 42-12 59 2 17 14 19 38 2 49-10 6-26 8-39 5l-9 7-5-9c-3-2-7-5-10-11z"></path>' +
				'<path d="M54 35c5-4 16-6 22-2 5 3 3 9-3 10-6 2-16 2-22-1-3-2-2-5 3-7z" fill="#c3ccbf"></path>' +
				'<circle cx="66" cy="34" r="2.8" fill="#1a231f"></circle>' +
				'<path d="M20 67l10-1 7 12-11 2z"></path>' +
				'<path d="M74 66l11 0 7 12-11 2z"></path>' +
				'<path d="M89 49l18 5-10 5-13-3z"></path>' +
			'</svg>',
		egg:
			'<svg viewBox="0 0 52 68" aria-hidden="true">' +
				'<path d="M26 5c10 0 19 13 19 30s-8 28-19 28S7 53 7 35 16 5 26 5z"></path>' +
				'<path d="M24 19l-4 7 5 4-4 6 6 1-2 7" fill="none" stroke="#c3ccbf" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path>' +
				'<circle cx="32" cy="30" r="2.2" fill="#c3ccbf"></circle>' +
			'</svg>',
		nestEgg:
			'<svg viewBox="0 0 56 50" aria-hidden="true">' +
				'<path d="M4 35c6-7 15-12 24-12s17 4 24 12c-7 6-16 10-24 10s-18-4-24-10z"></path>' +
				'<path d="M28 11c8 0 12 9 12 15 0 5-5 9-12 9s-12-4-12-9c0-6 4-15 12-15z"></path>' +
				'<path d="M26 18l-3 6 4 3-3 5" fill="none" stroke="#c3ccbf" stroke-width="2.8" stroke-linecap="round"></path>' +
			'</svg>',
		obstacle:
			'<svg viewBox="0 0 82 40" aria-hidden="true">' +
				'<path d="M10 30c0-8 7-14 14-14 7 0 14 6 14 14z"></path>' +
				'<path d="M28 30c0-8 7-14 14-14s14 6 14 14z"></path>' +
				'<path d="M46 30c0-8 7-14 14-14s14 6 14 14z"></path>' +
			'</svg>',
		burst:
			'<svg viewBox="0 0 54 54" aria-hidden="true">' +
				'<path d="M27 2l6 12 13-5-4 13 12 5-12 5 4 13-13-5-6 12-6-12-13 5 4-13-12-5 12-5-4-13 13 5z"></path>' +
			'</svg>'
	};

	var S = {
		inited: false,
		visible: false,
		running: false,
		paused: false,
		score: 0,
		cavemanIndex: 1,
		runFrame: 0,
		dragonFrame: 0,
		jumpPhase: 0,
		jumpQueue: [],
		failState: 'none',
		failTimer: 0,
		failReason: '',
		eggMode: 'hidden',
		eggTimer: 4,
		topTrackIndex: 1,
		eggGroundIndex: 2,
		hasEgg: false,
		stageMajor: 1,
		stageMinor: 1,
		statusMessage: 'START/ON begins. RUN/BACK move one segment. JUMP swaps airborne segments. P toggles pause.',
		loopId: null,
		tickCount: 0,
		keyboardAttached: false,
		obstacleIndex: 2,
		obstaclePattern: [2, 2, 3, 2, 1, 2],
		obstaclePatternIndex: 0,
		dragonIndex: 4,
		audioContext: null
	};

	var U = {};

	function clamp(v, min, max) {
		return Math.max(min, Math.min(max, v));
	}

	function formatScore(score) {
		var n = Math.max(0, Math.floor(score % 10000));
		var s = String(n);
		while (s.length < 4) {
			s = '0' + s;
		}
		return s;
	}

	function formatStage() {
		return String(S.stageMajor) + '-' + String(S.stageMinor);
	}

	function setHidden(node, hidden) {
		if (!node) {
			return;
		}
		if (hidden) {
			node.classList.add('d-none');
		} else {
			node.classList.remove('d-none');
		}
	}

	function setSpritePosition(node, x, y) {
		if (!node) {
			return;
		}
		node.style.left = x + '%';
		node.style.top = y + '%';
	}

	function isJumping() {
		return S.jumpPhase !== 0;
	}

	function setStatus(message) {
		S.statusMessage = message;
		renderStatus();
	}

	function renderStatus() {
		if (!U.status) {
			return;
		}
		var mode = 'IDLE';
		if (S.failState !== 'none') {
			mode = 'FAIL';
		} else if (S.running && !S.paused) {
			mode = 'RUNNING';
		} else if (S.running && S.paused) {
			mode = 'PAUSED';
		}
		U.status.textContent = mode + ': ' + S.statusMessage;
	}

	function renderCaveman() {
		if (!U.caveman) {
			return;
		}
		var lane = LANE_POSITIONS[S.cavemanIndex];
		var y = lane.y + (JUMP_OFFSET[S.jumpPhase] || 0);
		var poseKey = 'run-' + S.runFrame;
		var sprite = S.runFrame ? SPRITES.cavemanRunB : SPRITES.cavemanRunA;
		if (S.failState !== 'none') {
			poseKey = 'fail-' + S.failState;
			sprite = S.failState === 'fallen' ? SPRITES.cavemanFallen : SPRITES.cavemanFail;
		} else if (isJumping()) {
			poseKey = 'jump';
			sprite = SPRITES.cavemanJump;
		}
		if (U.caveman.dataset.pose !== poseKey) {
			U.caveman.innerHTML = sprite;
			U.caveman.dataset.pose = poseKey;
		}
		setSpritePosition(U.caveman, lane.x, y);

		if (U.carryEgg) {
			if (S.hasEgg && S.failState === 'none') {
				setHidden(U.carryEgg, false);
				setSpritePosition(U.carryEgg, lane.x + 3, y - 7);
			} else {
				setHidden(U.carryEgg, true);
			}
		}
	}

	function renderDragon() {
		if (!U.dragon) {
			return;
		}
		var dragonPose = S.dragonFrame ? 'open' : 'closed';
		if (U.dragon.dataset.pose !== dragonPose) {
			U.dragon.innerHTML = S.dragonFrame ? SPRITES.dragonOpen : SPRITES.dragonClosed;
			U.dragon.dataset.pose = dragonPose;
		}
		setSpritePosition(U.dragon, 74.5, 76.2);
	}

	function renderObstacle() {
		if (!U.obstacle) {
			return;
		}
		if (!U.obstacle.dataset.ready) {
			U.obstacle.innerHTML = SPRITES.obstacle;
			U.obstacle.dataset.ready = '1';
		}
		var lane = LANE_POSITIONS[S.obstacleIndex];
		setSpritePosition(U.obstacle, lane.x + 1.7, lane.y + 1.4);
	}

	function renderEggs() {
		if (!U.egg || !U.nestEgg) {
			return;
		}
		if (!U.egg.dataset.ready) {
			U.egg.innerHTML = SPRITES.egg;
			U.egg.dataset.ready = '1';
		}
		if (!U.nestEgg.dataset.ready) {
			U.nestEgg.innerHTML = SPRITES.nestEgg;
			U.nestEgg.dataset.ready = '1';
		}

		setHidden(U.nestEgg, S.eggMode !== 'deposited');
		if (S.eggMode === 'deposited') {
			setSpritePosition(U.nestEgg, 8.5, 83.4);
		}

		if (S.eggMode === 'top') {
			var topTrack = TOP_TRACKS[S.topTrackIndex];
			setHidden(U.egg, false);
			setSpritePosition(U.egg, topTrack.x, 26.5);
			return;
		}
		if (S.eggMode === 'fall1') {
			var fallTrack1 = TOP_TRACKS[S.topTrackIndex];
			setHidden(U.egg, false);
			setSpritePosition(U.egg, fallTrack1.x, 43.5);
			return;
		}
		if (S.eggMode === 'fall2') {
			var fallTrack2 = TOP_TRACKS[S.topTrackIndex];
			setHidden(U.egg, false);
			setSpritePosition(U.egg, fallTrack2.x, 58.5);
			return;
		}
		if (S.eggMode === 'ground') {
			var groundLane = LANE_POSITIONS[S.eggGroundIndex];
			setHidden(U.egg, false);
			setSpritePosition(U.egg, groundLane.x + 0.5, 75.5);
			return;
		}
		setHidden(U.egg, true);
	}

	function renderFailureBurst() {
		if (!U.failBurst) {
			return;
		}
		if (!U.failBurst.dataset.ready) {
			U.failBurst.innerHTML = SPRITES.burst;
			U.failBurst.dataset.ready = '1';
		}
		if (S.failState === 'shock') {
			var lane = LANE_POSITIONS[S.cavemanIndex];
			setHidden(U.failBurst, false);
			setSpritePosition(U.failBurst, lane.x + 5.5, lane.y - 17.5);
			return;
		}
		setHidden(U.failBurst, true);
	}

	function render() {
		if (!S.inited) {
			return;
		}
		if (U.score) {
			U.score.textContent = formatScore(S.score);
		}
		if (U.stage) {
			U.stage.textContent = formatStage();
		}
		renderStatus();
		renderCaveman();
		renderDragon();
		renderObstacle();
		renderEggs();
		renderFailureBurst();
	}

	function startNewRun() {
		S.running = true;
		S.paused = false;
		S.score = 0;
		S.stageMajor = 1;
		S.stageMinor = 1;
		S.cavemanIndex = 1;
		S.runFrame = 0;
		S.dragonFrame = 0;
		S.jumpPhase = 0;
		S.jumpQueue = [];
		S.failState = 'none';
		S.failTimer = 0;
		S.failReason = '';
		S.hasEgg = false;
		S.eggMode = 'hidden';
		S.eggTimer = 3;
		S.topTrackIndex = 1;
		S.eggGroundIndex = 2;
		S.obstaclePatternIndex = 0;
		S.obstacleIndex = S.obstaclePattern[S.obstaclePatternIndex];
		S.tickCount = 0;
		setStatus('START/ON pressed. Fixed-step LCD movement active. Stage 1-1.');
		render();
	}

	function togglePause() {
		if (!S.running) {
			setStatus('Press START/ON first.');
			return;
		}
		S.paused = !S.paused;
		if (S.paused) {
			setStatus('Paused via P button.');
		} else {
			setStatus('Run resumed.');
		}
		render();
	}

	function dropCarriedEgg() {
		if (!S.hasEgg) {
			return;
		}
		S.hasEgg = false;
		S.eggMode = 'ground';
		S.eggGroundIndex = 3;
		S.eggTimer = 8;
	}

	function playFailTone() {
		try {
			if (!S.audioContext) {
				S.audioContext = new (window.AudioContext || window.webkitAudioContext)();
			}
			var ctx = S.audioContext;
			var t = ctx.currentTime;
			var gain = ctx.createGain();
			gain.gain.setValueAtTime(0.001, t);
			gain.gain.exponentialRampToValueAtTime(0.07, t + 0.015);
			gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
			gain.connect(ctx.destination);
			var osc1 = ctx.createOscillator();
			osc1.type = 'square';
			osc1.frequency.setValueAtTime(630, t);
			osc1.frequency.setValueAtTime(300, t + 0.08);
			osc1.connect(gain);
			osc1.start(t);
			osc1.stop(t + 0.19);
		} catch (error) {
			return;
		}
	}

	function advanceStageAfterScore() {
		if (S.stageMinor === 1) {
			S.stageMinor = 2;
			return;
		}
		S.stageMinor = 1;
		S.stageMajor = Math.min(9, S.stageMajor + 1);
	}

	function enterFailState(reason, message) {
		if (S.failState !== 'none') {
			return;
		}
		S.failState = 'shock';
		S.failTimer = 3;
		S.failReason = reason || 'mistime';
		S.jumpQueue = [];
		S.jumpPhase = 0;
		dropCarriedEgg();
		setStatus(message || 'Mistimed move.');
		playFailTone();
	}

	function advanceFailState() {
		if (S.failState === 'none') {
			return false;
		}
		S.failTimer -= 1;
		if (S.failState === 'shock' && S.failTimer <= 0) {
			S.failState = 'fallen';
			S.failTimer = 2;
			setStatus('Recovering from impact.');
			return true;
		}
		if (S.failState === 'fallen' && S.failTimer <= 0) {
			S.failState = 'none';
			S.failReason = '';
			S.cavemanIndex = 1;
			S.runFrame = 0;
			S.jumpQueue = [];
			S.jumpPhase = 0;
			setStatus('Run resumed. Keep fixed-step timing.');
			return true;
		}
		return true;
	}

	function updateObstaclePattern() {
		if (S.tickCount % 6 !== 0) {
			return;
		}
		S.obstaclePatternIndex = (S.obstaclePatternIndex + 1) % S.obstaclePattern.length;
		S.obstacleIndex = S.obstaclePattern[S.obstaclePatternIndex];
	}

	function checkDeposit() {
		if (!S.hasEgg) {
			return;
		}
		if (S.cavemanIndex === 0 && !isJumping()) {
			S.hasEgg = false;
			S.score += 1;
			advanceStageAfterScore();
			S.eggMode = 'deposited';
			S.eggTimer = 5;
			setStatus('Egg secured in the nest. SCORE +1.');
		}
	}

	function checkDragonThreat() {
		if (S.cavemanIndex < S.dragonIndex || isJumping()) {
			return;
		}
		enterFailState('dragon', 'Dragon attack. Failure segment triggered.');
	}

	function checkObstacleThreat() {
		if (S.cavemanIndex !== S.obstacleIndex || isJumping()) {
			return;
		}
		enterFailState('rock', 'Rock impact. Failure segment triggered.');
	}

	function canCatchFallingEgg() {
		if (S.cavemanIndex !== S.eggGroundIndex) {
			return false;
		}
		if (S.eggMode === 'fall1') {
			return S.jumpPhase >= 2;
		}
		if (S.eggMode === 'fall2') {
			return S.jumpPhase >= 1;
		}
		return false;
	}

	function pickUpEgg(msg) {
		S.hasEgg = true;
		S.eggMode = 'carried';
		S.eggTimer = 0;
		setStatus(msg || 'Egg collected. Bring it left.');
	}

	function spawnEggOnTop() {
		S.topTrackIndex = Math.floor(Math.random() * TOP_TRACKS.length);
		S.eggGroundIndex = TOP_TRACKS[S.topTrackIndex].groundIndex;
		S.eggMode = 'top';
		S.eggTimer = 6;
	}

	function advanceEggState() {
		if (S.hasEgg) {
			S.eggMode = 'carried';
			return;
		}

		if (S.eggMode === 'hidden') {
			S.eggTimer -= 1;
			if (S.eggTimer <= 0) {
				spawnEggOnTop();
			}
			return;
		}

		if (S.eggMode === 'top') {
			S.eggTimer -= 1;
			if (S.eggTimer <= 0) {
				S.eggMode = 'fall1';
				S.eggTimer = 1;
			}
			return;
		}

		if (S.eggMode === 'fall1') {
			if (canCatchFallingEgg()) {
				pickUpEgg('Caught the egg in midair.');
				return;
			}
			S.eggMode = 'fall2';
			S.eggTimer = 1;
			return;
		}

		if (S.eggMode === 'fall2') {
			if (canCatchFallingEgg()) {
				pickUpEgg('Caught the egg before it hit the floor.');
				return;
			}
			S.eggMode = 'ground';
			S.eggTimer = 10;
			return;
		}

		if (S.eggMode === 'ground') {
			if (S.cavemanIndex === S.eggGroundIndex && !isJumping()) {
				pickUpEgg('Egg picked up. Carry it to the nest on the left.');
				return;
			}
			S.eggTimer -= 1;
			if (S.eggTimer <= 0) {
				S.eggMode = 'hidden';
				S.eggTimer = 4;
				setStatus('The egg vanished. Watch the top track for the next drop.');
			}
			return;
		}

		if (S.eggMode === 'deposited') {
			S.eggTimer -= 1;
			if (S.eggTimer <= 0) {
				S.eggMode = 'hidden';
				S.eggTimer = 4;
			}
		}
	}

	function stepCaveman(delta) {
		if (!S.running) {
			startNewRun();
		}
		if (S.paused) {
			setStatus('Unpause with P before moving.');
			return;
		}
		if (S.failState !== 'none') {
			return;
		}
		var target = clamp(S.cavemanIndex + delta, 0, LANE_POSITIONS.length - 1);
		if (target === S.cavemanIndex) {
			return;
		}
		if (target === S.obstacleIndex && !isJumping()) {
			S.cavemanIndex = target;
			S.runFrame = S.runFrame ? 0 : 1;
			enterFailState('rock', 'Rock impact. Failure segment triggered.');
			render();
			return;
		}
		S.cavemanIndex = target;
		S.runFrame = S.runFrame ? 0 : 1;
		if (S.eggMode === 'ground' && S.cavemanIndex === S.eggGroundIndex && !isJumping()) {
			pickUpEgg('Egg picked up. Carry it to the nest on the left.');
		}
		checkObstacleThreat();
		checkDragonThreat();
		checkDeposit();
		render();
	}

	function jumpCaveman() {
		if (!S.running) {
			startNewRun();
		}
		if (S.paused) {
			setStatus('Unpause with P before jumping.');
			return;
		}
		if (S.failState !== 'none') {
			return;
		}
		if (isJumping() || S.jumpQueue.length) {
			return;
		}
		S.jumpQueue = [1, 2, 3, 0];
		S.runFrame = S.runFrame ? 0 : 1;
		setStatus('Jump executed (LCD segment step).');
		render();
	}

	function tick() {
		if (!S.inited || !S.visible || !S.running || S.paused) {
			return;
		}

		S.tickCount += 1;
		if (S.tickCount % 2 === 0) {
			S.dragonFrame = S.dragonFrame ? 0 : 1;
		}
		updateObstaclePattern();

		if (S.jumpQueue.length) {
			S.jumpPhase = S.jumpQueue.shift();
		} else {
			S.jumpPhase = 0;
		}

		if (advanceFailState()) {
			render();
			return;
		}

		advanceEggState();
		checkObstacleThreat();
		checkDragonThreat();
		checkDeposit();
		render();
	}

	function onKeyDown(e) {
		if (!S.visible) {
			return;
		}
		var handled = true;
		switch (e.code) {
			case 'ArrowRight':
			case 'KeyD':
				stepCaveman(1);
				break;
			case 'ArrowLeft':
			case 'KeyA':
				stepCaveman(-1);
				break;
			case 'ArrowUp':
			case 'Space':
			case 'KeyW':
				jumpCaveman();
				break;
			case 'Enter':
				startNewRun();
				break;
			case 'KeyP':
				togglePause();
				break;
			default:
				handled = false;
				break;
		}
		if (handled) {
			e.preventDefault();
		}
	}

	function attachKeyboard() {
		if (S.keyboardAttached) {
			return;
		}
		window.addEventListener('keydown', onKeyDown);
		S.keyboardAttached = true;
	}

	function detachKeyboard() {
		if (!S.keyboardAttached) {
			return;
		}
		window.removeEventListener('keydown', onKeyDown);
		S.keyboardAttached = false;
	}

	function bindControls() {
		if (!U.btnRun) {
			return;
		}
		U.btnRun.addEventListener('click', function () {
			stepCaveman(1);
		});
		U.btnBack.addEventListener('click', function () {
			stepCaveman(-1);
		});
		U.btnJump.addEventListener('click', function () {
			jumpCaveman();
		});
		U.btnStart.addEventListener('click', function () {
			startNewRun();
		});
		U.btnPause.addEventListener('click', function () {
			togglePause();
		});
	}

	function buildLcdStaticLayer() {
		return '' +
			'<svg class="degg-lcd-static" viewBox="0 0 100 70" preserveAspectRatio="none" aria-hidden="true">' +
				'<rect x="0" y="0" width="100" height="70" fill="#c3ccbf"></rect>' +
				'<path d="M0 21 C8 20 12 22 20 21 C28 20 32 22 40 21 C48 20 52 22 60 21 C68 20 72 22 100 21" fill="none" stroke="#58645a" stroke-width="0.55" stroke-linecap="round"></path>' +
				'<path d="M71 0 L70 8 L68.4 12 L69.4 21 L100 21 L100 0 Z" fill="#b8c2b5" stroke="#59655b" stroke-width="0.5"></path>' +
				'<path d="M73 21 L73 25 M76 21 L76 25 M80 21 L80 25 M84 21 L84 25 M88 21 L88 25" stroke="#59655b" stroke-width="0.8"></path>' +
				'<path d="M4 6.2c0-1.6 1.4-2.8 3-2.6 1-1.5 3.7-1.8 5-0.4 1.6-0.3 2.9 0.9 2.9 2.4 0 1.7-1.6 2.8-3.3 2.5-1.4 1-3.9 1-5.2-0.2-1.4 0.3-2.4-0.7-2.4-1.7z" fill="none" stroke="#4c5a50" stroke-width="0.45"></path>' +
				'<path d="M25 6.6c0-1.5 1.2-2.7 2.8-2.5 0.9-1.5 3.3-1.8 4.7-0.5 1.5-0.3 2.7 0.8 2.7 2.2 0 1.6-1.4 2.7-3.1 2.4-1.3 1-3.6 1-4.8-0.1-1.3 0.3-2.3-0.6-2.3-1.5z" fill="none" stroke="#4c5a50" stroke-width="0.45"></path>' +
				'<path d="M46 6.4c0-1.5 1.3-2.7 2.9-2.6 1-1.4 3.5-1.7 4.8-0.4 1.6-0.3 2.8 0.8 2.8 2.3 0 1.6-1.5 2.7-3.2 2.4-1.3 1-3.7 0.9-5-0.2-1.3 0.4-2.3-0.6-2.3-1.5z" fill="none" stroke="#4c5a50" stroke-width="0.45"></path>' +
			'</svg>';
	}

	function buildPrintedArt() {
		return '' +
			'<div class="degg-printed-art" aria-hidden="true">' +
				'<svg viewBox="0 0 1000 260" preserveAspectRatio="none">' +
					'<path class="degg-art-strong" d="M14 136c58-56 106-71 180-46-39 13-56 30-65 53 22-8 36-5 50 8-27 1-43 12-57 29-48 4-75-14-108-44z"></path>' +
					'<path class="degg-art-strong" d="M58 238c39-24 95-24 133 2-47 19-93 19-133-2z"></path>' +
					'<path class="degg-art-strong" d="M352 71c48-11 97 8 109 53 9 35-8 70-48 94-46 27-105 22-141-11-41-37-36-92 13-120 20-11 46-16 67-16z"></path>' +
					'<ellipse class="degg-art-soft" cx="360" cy="97" rx="34" ry="28"></ellipse>' +
					'<path class="degg-art-soft" d="M314 146c26-19 66-18 93 2-15 15-40 24-66 23-17 0-28-9-27-25z"></path>' +
					'<path class="degg-art-soft" d="M580 76c73-16 153 19 176 83 14 40 2 78-37 102-49 30-122 26-173-10-58-41-62-104-10-148 14-12 28-20 44-27z"></path>' +
					'<ellipse class="degg-art-strong" cx="638" cy="115" rx="45" ry="28"></ellipse>' +
					'<circle class="degg-art-strong" cx="667" cy="107" r="6"></circle>' +
					'<path class="degg-art-strong" d="M595 170c33-13 75-11 103 5-18 16-42 25-67 24-18 0-32-9-36-29z"></path>' +
					'<path class="degg-art-soft" d="M266 92l56-33-10 45 36-4-34 31-47-8z"></path>' +
					'<ellipse class="degg-art-soft" cx="330" cy="138" rx="19" ry="24"></ellipse>' +
				'</svg>' +
			'</div>';
	}

	function buildLayout() {
		return [
			'<div class="degg-panel">',
				'<div class="degg-device">',
					'<div class="degg-brand-row">',
						'<div class="degg-casio">CASIO</div>',
						'<div class="degg-model">CG-122A</div>',
					'</div>',
					'<div class="degg-screen-bezel">',
						'<div class="degg-lcd" role="img" aria-label="Dragon\'s Egg LCD recreation with score, clouds, cave ledge, caveman, egg, dragon, and rock obstacle">',
							buildLcdStaticLayer(),
							'<div class="degg-score">SCORE<span id="degg-score-value" class="degg-score-value">0000</span><span id="degg-stage-value" class="degg-stage-value">1-1</span></div>',
							'<div class="degg-lcd-layer">',
								'<div id="degg-obstacle" class="degg-sprite degg-obstacle"></div>',
								'<div id="degg-dragon" class="degg-sprite degg-dragon"></div>',
								'<div id="degg-caveman" class="degg-sprite degg-caveman"></div>',
								'<div id="degg-carry-egg" class="degg-sprite degg-carry-egg d-none"></div>',
								'<div id="degg-egg" class="degg-sprite degg-egg d-none"></div>',
								'<div id="degg-nest-egg" class="degg-sprite degg-nest-egg d-none"></div>',
								'<div id="degg-fail-burst" class="degg-sprite degg-fail-burst d-none"></div>',
							'</div>',
						'</div>',
					'</div>',
					'<div class="degg-title">DRAGON\'S EGG</div>',
					'<div class="degg-controls">',
						'<div class="degg-btn-slot">',
							'<button id="degg-btn-run" type="button" class="degg-btn" data-action="run" aria-label="RUN"></button>',
							'<div class="degg-btn-label">RUN</div>',
						'</div>',
						'<div class="degg-btn-slot">',
							'<button id="degg-btn-start" type="button" class="degg-btn degg-btn-start" data-action="start" aria-label="START/ON"></button>',
							'<div class="degg-btn-label">START/ON</div>',
						'</div>',
						'<div class="degg-btn-slot">',
							'<button id="degg-btn-p" type="button" class="degg-btn degg-btn-p" data-action="pause" aria-label="P"></button>',
							'<div class="degg-btn-label">P</div>',
						'</div>',
						'<div class="degg-btn-slot">',
							'<button id="degg-btn-jump" type="button" class="degg-btn" data-action="jump" aria-label="JUMP"></button>',
							'<div class="degg-btn-label">JUMP</div>',
						'</div>',
						'<div class="degg-btn-slot">',
							'<button id="degg-btn-back" type="button" class="degg-btn" data-action="back" aria-label="BACK"></button>',
							'<div class="degg-btn-label">BACK</div>',
						'</div>',
					'</div>',
					buildPrintedArt(),
					'<div id="degg-status" class="degg-status">IDLE: START/ON begins. RUN/BACK move one segment. JUMP swaps airborne segments. P toggles pause.</div>',
				'</div>',
			'</div>'
		].join('');
	}

	function init(rootId) {
		if (S.inited) {
			return;
		}
		U.root = document.getElementById(rootId);
		if (!U.root) {
			return;
		}
		U.root.innerHTML = buildLayout();

		U.score = document.getElementById('degg-score-value');
		U.stage = document.getElementById('degg-stage-value');
		U.status = document.getElementById('degg-status');
		U.caveman = document.getElementById('degg-caveman');
		U.carryEgg = document.getElementById('degg-carry-egg');
		U.dragon = document.getElementById('degg-dragon');
		U.obstacle = document.getElementById('degg-obstacle');
		U.egg = document.getElementById('degg-egg');
		U.nestEgg = document.getElementById('degg-nest-egg');
		U.failBurst = document.getElementById('degg-fail-burst');

		U.btnRun = document.getElementById('degg-btn-run');
		U.btnStart = document.getElementById('degg-btn-start');
		U.btnPause = document.getElementById('degg-btn-p');
		U.btnJump = document.getElementById('degg-btn-jump');
		U.btnBack = document.getElementById('degg-btn-back');

		if (U.carryEgg) {
			U.carryEgg.innerHTML = SPRITES.egg;
		}

		bindControls();

		S.inited = true;
		S.loopId = window.setInterval(tick, TICK_MS);
		render();
	}

	function resetSession() {
		S.running = false;
		S.paused = false;
		S.score = 0;
		S.stageMajor = 1;
		S.stageMinor = 1;
		S.cavemanIndex = 1;
		S.runFrame = 0;
		S.dragonFrame = 0;
		S.jumpPhase = 0;
		S.jumpQueue = [];
		S.failState = 'none';
		S.failTimer = 0;
		S.failReason = '';
		S.eggMode = 'hidden';
		S.eggTimer = 4;
		S.topTrackIndex = 1;
		S.eggGroundIndex = 2;
		S.hasEgg = false;
		S.tickCount = 0;
		S.obstaclePatternIndex = 0;
		S.obstacleIndex = S.obstaclePattern[S.obstaclePatternIndex];
		S.statusMessage = 'START/ON begins. RUN/BACK move one segment. JUMP swaps airborne segments. P toggles pause.';
		render();
	}

	function onPanelVisibilityChange(contentName) {
		S.visible = contentName === 'games-dragons-egg';
		if (S.visible) {
			attachKeyboard();
			render();
			return;
		}
		detachKeyboard();
		if (S.running && !S.paused) {
			S.paused = true;
			S.statusMessage = 'Auto-paused because you switched away from Dragon\'s Egg.';
			renderStatus();
		}
	}

	window.DragonsEggGameModule = {
		init: init,
		resetSession: resetSession,
		onPanelVisibilityChange: onPanelVisibilityChange
	};
})();

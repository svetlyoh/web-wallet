(function(window) {
	'use strict';

	var STORAGE_KEY = 'sugarchain_bomberman_context';
	var context = {
		walletBalance: 0,
		ticker: 'SUGAR',
		decimals: 8,
		walletReady: false
	};
	var syncTimer = 0;

	function safeReadFromOpener() {
		if (!window.opener || window.opener.closed) {
			return null;
		}
		try {
			if (!window.opener.globalData || !window.opener.getConfig || !window.opener.amountFormat) {
				return null;
			}
			var cfg = window.opener.getConfig();
			return {
				walletBalance: Number(window.opener.amountFormat(window.opener.globalData.balance) || 0),
				ticker: cfg['ticker'] || 'SUGAR',
				decimals: Number(cfg['decimals'] || 8),
				walletReady: window.opener.globalData.keys != undefined && window.opener.globalData.address != undefined && window.opener.globalData.address != ''
			};
		} catch (error) {
			console.warn('Bomberman opener context unavailable:', error);
			return null;
		}
	}

	function safeReadFromStorage() {
		try {
			var raw = window.localStorage.getItem(STORAGE_KEY);
			if (!raw) {
				return null;
			}
			var parsed = JSON.parse(raw);
			return {
				walletBalance: Number(parsed.walletBalance || 0),
				ticker: parsed.ticker || 'SUGAR',
				decimals: Number(parsed.decimals || 8),
				walletReady: !!parsed.walletReady
			};
		} catch (error) {
			console.warn('Bomberman storage context unavailable:', error);
			return null;
		}
	}

	function refreshContext() {
		var openerContext = safeReadFromOpener();
		var source = openerContext || safeReadFromStorage();
		if (!source) {
			return;
		}
		context.walletBalance = isFinite(source.walletBalance) ? source.walletBalance : 0;
		context.ticker = source.ticker || 'SUGAR';
		context.decimals = isFinite(source.decimals) ? source.decimals : 8;
		context.walletReady = !!source.walletReady;
	}

	function formatAmount(value) {
		var amount = Number(value || 0);
		if (!isFinite(amount)) {
			amount = 0;
		}
		return amount.toFixed(context.decimals);
	}

	function showBootStatus(message, variant) {
		var node = document.getElementById('bomberman-spend-status');
		if (!node) {
			return;
		}
		node.classList.remove('d-none', 'info', 'success', 'error');
		node.classList.add(variant || 'info');
		node.textContent = message;
	}

	function initStandaloneBomberman() {
		if (!window.BombermanGameModule) {
			console.error('Bomberman module was not loaded on play page.');
			showBootStatus('Bomberman script missing. Refresh this page.', 'error');
			return;
		}
		refreshContext();
		window.BombermanGameModule.init({
			getWalletBalance: function() {
				return context.walletBalance;
			},
			getTicker: function() {
				return context.ticker;
			},
			formatAmount: formatAmount,
			isWalletReady: function() {
				return context.walletReady;
			},
			economy: {
				ENTRY_COST: 1,
				CONTINUE_COST: 1,
				STARTING_LIVES: 3,
				STARTING_STAGE: 1,
				MAX_CONTINUES_PER_RUN: 2,
				CONTINUE_LIVES: 1,
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
			}
		});
		window.BombermanGameModule.onPanelVisibilityChange('games-bomberman');
		window.BombermanGameModule.refreshWalletBalance();

		if (!context.walletReady) {
			showBootStatus('Wallet context was not detected. Open Bomberman from the wallet Games tab for live balance sync.', 'info');
		} else {
			showBootStatus('Live wallet context connected. Game balance starts equal to wallet balance for this session.', 'success');
		}

		syncTimer = window.setInterval(function() {
			refreshContext();
			window.BombermanGameModule.refreshWalletBalance();
		}, 2500);
	}

	document.addEventListener('DOMContentLoaded', initStandaloneBomberman);
	window.addEventListener('focus', function() {
		refreshContext();
		if (window.BombermanGameModule) {
			window.BombermanGameModule.onPanelVisibilityChange('games-bomberman');
			window.BombermanGameModule.refreshWalletBalance();
		}
	});
	window.addEventListener('beforeunload', function() {
		if (syncTimer) {
			window.clearInterval(syncTimer);
			syncTimer = 0;
		}
	});
})(window);

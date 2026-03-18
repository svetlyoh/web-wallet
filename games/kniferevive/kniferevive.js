
(function () {
	'use strict';

	var STAGES = ['booked', 'blade check', 'queued', 'sharpening', 'hone/test', 'ready', 'handoff complete'];
	var CONDITION_TIERS = ['Mint', 'Excellent', 'Good', 'Fair', 'Project'];
	var MODEL_BANK = [
		{ code: 'SPY-PM2-S45', brand: 'Spyderco Paramilitary', model: 'PM2 S45VN' },
		{ code: 'BEN-940-OSB', brand: 'Benchmade Osborne', model: '940-2' },
		{ code: 'WUS-8CL-IKN', brand: 'Wusthof Classic', model: '8 Inch Chef' },
		{ code: 'KAI-SHN-DM', brand: 'Shun Classic', model: 'DM0706' },
		{ code: 'MRC-UTL-SR', brand: 'Mercer Genesis', model: 'Utility Serrated' },
		{ code: 'VIC-FIB-PRG', brand: 'Victorinox Fibrox', model: 'Paring 3.25' }
	];

	var S = {
		inited: false,
		visible: false,
		activeScreen: 'home',
		day: 1,
		walletBalance: 0,
		cash: 2400,
		reputation: 56,
		reliability: 52,
		modelMastery: 34,
		workshop: 1,
		logistics: 1,
		trust: 55,
		selectedProductId: null,
		selectedSharpenOrderId: null,
		selectedRole: 'seller',
		sellerDirectorySort: 'top-rated',
		browseFilters: { type: 'all', brand: 'all', model: '', condition: 'all', maxPrice: '' },
		mini: {
			photo: 65,
			verify: 0,
			gradingHonesty: 0,
			belt: 0,
			hone: 0,
			route: 0
		},
		loaners: {
			chefTotal: 8,
			paringTotal: 8,
			chefUsed: 0,
			paringUsed: 0
		},
		kpi: {
			sessions: 1,
			d1: 0.72,
			d7: 0.39,
			d30: 0.2,
			roleSplit: { seller: 34, buyer: 33, sharpener: 33 },
			sessionLength: 9.4,
			tutorialCompletion: 0,
			browseToDetail: 0,
			detailToBuy: 0,
			returnRateByCondition: {},
			returnRateByTag: {},
			sharpenCompletionRate: 0,
			onTimeRate: 0,
			reviewAverage: 4.2,
			disputeRate: 0,
			deepLinkCTR: 0,
			rewardRedeemRate: 0
		},
		db: {
			users: [],
			stores: [],
			products: [],
			productImages: [],
			tags: [],
			orders: [],
			orderItems: [],
			reviews: [],
			returns: [],
			disputes: [],
			sharpeningOrders: [],
			sharpeningItems: [],
			handoffs: [],
			loanerReservations: [],
			payments: [],
			addresses: []
		},
		ids: { n: 1 },
		status: 'KnifeRevive systems online. Trust and craftsmanship first.'
	};

	var U = {};

	function uid(prefix) {
		S.ids.n += 1;
		return prefix + '-' + S.ids.n;
	}

	function clamp(v, min, max) {
		return Math.max(min, Math.min(max, v));
	}

	function pct(n) {
		return (n * 100).toFixed(1) + '%';
	}

	function money(n) {
		return '$' + Number(n || 0).toFixed(2);
	}

	function chance() {
		return Math.random();
	}

	function safeWalletBalance() {
		if (window.globalData && !isNaN(window.globalData.balance)) {
			return Number(window.globalData.balance);
		}
		return 0;
	}

	function storeById(id) {
		for (var i = 0; i < S.db.stores.length; i++) {
			if (S.db.stores[i].id === id) {
				return S.db.stores[i];
			}
		}
		return null;
	}

	function productById(id) {
		for (var i = 0; i < S.db.products.length; i++) {
			if (S.db.products[i].id === id) {
				return S.db.products[i];
			}
		}
		return null;
	}

	function sharpenOrderById(id) {
		for (var i = 0; i < S.db.sharpeningOrders.length; i++) {
			if (S.db.sharpeningOrders[i].id === id) {
				return S.db.sharpeningOrders[i];
			}
		}
		return null;
	}

	function seed() {
		if (S.db.stores.length) {
			return;
		}
		var playerUserId = uid('user');
		var playerStoreId = uid('store');

		S.db.users.push({ id: playerUserId, name: 'You', role: 'multi', joinedDay: 1, reputation: 56 });
		S.db.stores.push({ id: playerStoreId, userId: playerUserId, name: 'KnifeRevive Local Bench', rating: 4.6, trusted: true, reviews: 42, reliability: 92, popularity: 74, recent: 98, featured: true });
		S.db.stores.push({ id: uid('store'), userId: uid('user'), name: 'Edge Borough Supply', rating: 4.3, trusted: true, reviews: 28, reliability: 87, popularity: 66, recent: 72 });
		S.db.stores.push({ id: uid('store'), userId: uid('user'), name: 'Second Life Steel', rating: 4.0, trusted: false, reviews: 15, reliability: 76, popularity: 49, recent: 65 });

		var p1 = {
			id: uid('prod'), storeId: playerStoreId, title: 'Wusthof Classic 8 Inch Chef', knifeType: 'Chef', brand: 'Wusthof', series: 'Classic', model: '8 Inch Chef', sku: 'WUS-8CL-IKN',
			condition: 'Good', returnTag: 'Free Returns', price: 86, flaws: 'light spine scratches', verifiedModel: true, trustedSeller: true, listingQuality: 82, createdDay: 1
		};
		var p2 = {
			id: uid('prod'), storeId: S.db.stores[1].id, title: 'Benchmade Osborne 940-2', knifeType: 'EDC', brand: 'Benchmade', series: 'Osborne', model: '940-2', sku: 'BEN-940-OSB',
			condition: 'Excellent', returnTag: '$5 Returns', price: 169, flaws: 'small clip wear', verifiedModel: true, trustedSeller: true, listingQuality: 78, createdDay: 1
		};
		var p3 = {
			id: uid('prod'), storeId: S.db.stores[2].id, title: 'Victorinox Fibrox Paring', knifeType: 'Paring', brand: 'Victorinox', series: 'Fibrox', model: 'Paring 3.25', sku: 'VIC-FIB-PRG',
			condition: 'Fair', returnTag: 'Free Returns', price: 22, flaws: 'visible handle wear', verifiedModel: false, trustedSeller: false, listingQuality: 58, createdDay: 1
		};
		S.db.products.push(p1, p2, p3);

		for (var i = 0; i < S.db.products.length; i++) {
			S.db.productImages.push({ id: uid('img'), productId: S.db.products[i].id, side: 'front', quality: 80 });
			S.db.productImages.push({ id: uid('img'), productId: S.db.products[i].id, side: 'back', quality: 80 });
			S.db.productImages.push({ id: uid('img'), productId: S.db.products[i].id, side: 'stamp', quality: 75 });
			S.db.productImages.push({ id: uid('img'), productId: S.db.products[i].id, side: 'flaw', quality: 70 });
		}
	}
	function filteredProducts() {
		var f = S.browseFilters;
		return S.db.products.filter(function (p) {
			if (f.type !== 'all' && p.knifeType !== f.type) { return false; }
			if (f.brand !== 'all' && p.brand !== f.brand) { return false; }
			if (f.condition !== 'all' && p.condition !== f.condition) { return false; }
			if (f.model && p.model.toLowerCase().indexOf(f.model.toLowerCase()) === -1 && p.sku.toLowerCase().indexOf(f.model.toLowerCase()) === -1) { return false; }
			if (f.maxPrice && Number(f.maxPrice) > 0 && p.price > Number(f.maxPrice)) { return false; }
			return true;
		});
	}

	function listingChips(p, s) {
		var out = [];
		out.push('<span class="knr-chip ' + (p.returnTag === 'Free Returns' ? 'good' : 'warn') + '">' + p.returnTag + '</span>');
		out.push('<span class="knr-chip">' + p.condition + '</span>');
		out.push('<span class="knr-chip ' + (p.verifiedModel ? 'good' : 'warn') + '">' + (p.verifiedModel ? 'Verified Model' : 'Model Unverified') + '</span>');
		if (s && s.trusted) { out.push('<span class="knr-chip good">Trusted Seller</span>'); }
		if (s && s.rating >= 4.5) { out.push('<span class="knr-chip good">Top Rated</span>'); }
		if (S.reliability >= 70) { out.push('<span class="knr-chip good">Fast Turnaround</span>'); }
		return out.join('');
	}

	function navBtn(id, label) {
		return '<button class="knr-tab ' + (S.activeScreen === id ? 'active' : '') + ' knr-nav-btn" data-screen="' + id + '">' + label + '</button>';
	}

	function screen(id, inner) {
		return '<section class="knr-screen ' + (S.activeScreen === id ? 'active' : '') + '" data-screen="' + id + '">' + inner + '</section>';
	}

	function kpiMarkup() {
		var k = S.kpi;
		return '<div class="knr-kpi">'
			+ '<div class="k">D1/D7/D30 Retention: ' + pct(k.d1) + ' / ' + pct(k.d7) + ' / ' + pct(k.d30) + '</div>'
			+ '<div class="k">Role Split S/B/Sh: ' + k.roleSplit.seller + '/' + k.roleSplit.buyer + '/' + k.roleSplit.sharpener + '</div>'
			+ '<div class="k">Session Length: ' + k.sessionLength.toFixed(1) + 'm</div>'
			+ '<div class="k">Mini-game Tutorial Completion: ' + pct(k.tutorialCompletion) + '</div>'
			+ '<div class="k">Browse->Detail: ' + k.browseToDetail + ' | Detail->Buy: ' + k.detailToBuy + '</div>'
			+ '<div class="k">Return Rate by Condition: ' + JSON.stringify(k.returnRateByCondition) + '</div>'
			+ '<div class="k">Return Rate by Tag: ' + JSON.stringify(k.returnRateByTag) + '</div>'
			+ '<div class="k">Sharpen Completion: ' + pct(k.sharpenCompletionRate) + ' | On-time SLA: ' + pct(k.onTimeRate) + '</div>'
			+ '<div class="k">Review Avg: ' + k.reviewAverage.toFixed(2) + ' | Dispute Rate: ' + pct(k.disputeRate) + '</div>'
			+ '<div class="k">Deep-link CTR: ' + pct(k.deepLinkCTR) + ' | Reward Redeem: ' + pct(k.rewardRedeemRate) + '</div>'
			+ '</div>';
	}

	function miniGameBlocks() {
		return ''
			+ '<div class="knr-mini"><h5>1) Listing Photographer Mini-Game</h5><div class="knr-grid-2"><label>Both sides framing <input id="knr-photo-sides" type="range" min="0" max="100" value="70"></label><label>Model stamp clarity <input id="knr-photo-stamp" type="range" min="0" max="100" value="70"></label><label>Flaw visibility <input id="knr-photo-flaw" type="range" min="0" max="100" value="70"></label><label>Light/composition <input id="knr-photo-light" type="range" min="0" max="100" value="70"></label></div><div class="knr-actions"><button class="btn btn-outline-dark knr-play-photo">Submit Shot</button></div></div>'
			+ '<div class="knr-mini"><h5>2) Model Number Verification Puzzle</h5><div id="knr-verify-prompt" class="knr-note"></div><div id="knr-verify-options" class="knr-actions"></div></div>'
			+ '<div class="knr-mini"><h5>3) Condition Grading Mini-Game</h5><div id="knr-grade-prompt" class="knr-note"></div><div class="knr-actions">' + CONDITION_TIERS.map(function (c) { return '<button class="btn btn-outline-dark knr-grade" data-tier="' + c + '">' + c + '</button>'; }).join('') + '</div></div>'
			+ '<div class="knr-mini"><h5>4) Belt Sharpening Mini-Game</h5><div class="knr-grid-2"><label>Angle control <input id="knr-belt-angle" type="range" min="10" max="25" value="17"></label><label>Pressure control <input id="knr-belt-pressure" type="range" min="0" max="100" value="55"></label><label>Heat management <input id="knr-belt-heat" type="range" min="0" max="100" value="45"></label><label>Blade type <select id="knr-belt-type" class="knr-select"><option>smooth</option><option>serrated</option></select></label></div><div class="knr-actions"><button class="btn btn-outline-dark knr-play-belt">Run Belt Pass</button></div></div>'
			+ '<div class="knr-mini"><h5>5) Hone & Test Mini-Game</h5><div class="knr-grid-2"><select id="knr-hone-edge" class="knr-select"><option>smooth</option><option>serrated</option></select><select id="knr-hone-test" class="knr-select"><option>paper slice</option><option>tomato skin</option><option>rope cut</option><option>visual burr check</option></select></div><div class="knr-actions"><button class="btn btn-outline-dark knr-play-hone">Run Hone/Test</button></div></div>'
			+ '<div class="knr-mini"><h5>6) Handoff / Route Optimization Mini-Game</h5><div class="knr-note">Choose the route that balances pickup/drop-off speed and loaner swaps.</div><div class="knr-actions"><button class="btn btn-outline-dark knr-route" data-id="A" data-score="62">Route A (8 stops, safer)</button><button class="btn btn-outline-dark knr-route" data-id="B" data-score="78">Route B (6 stops, balanced)</button><button class="btn btn-outline-dark knr-route" data-id="C" data-score="52">Route C (5 stops, risky)</button></div></div>';
	}

	function render() {
		if (!U.root) { return; }
		var products = filteredProducts();
		var selected = S.selectedProductId ? productById(S.selectedProductId) : (products[0] || S.db.products[0] || null);
		if (selected && !S.selectedProductId) { S.selectedProductId = selected.id; }
		var selectedStore = selected ? storeById(selected.storeId) : null;
		var selectedSharpen = S.selectedSharpenOrderId ? sharpenOrderById(S.selectedSharpenOrderId) : (S.db.sharpeningOrders[0] || null);
		if (selectedSharpen && !S.selectedSharpenOrderId) { S.selectedSharpenOrderId = selectedSharpen.id; }

		var marketplaceCards = products.map(function (p) {
			var store = storeById(p.storeId);
			return '<div class="knr-listing">'
				+ '<div class="knr-listing-title">' + p.title + '</div>'
				+ '<div class="knr-listing-meta">' + p.brand + ' / ' + p.series + ' / ' + p.sku + ' | ' + money(p.price) + '</div>'
				+ '<div>' + listingChips(p, store) + '</div>'
				+ '<div class="knr-actions"><button class="btn btn-outline-dark knr-open-product" data-id="' + p.id + '">Inspect Detail</button></div>'
				+ '</div>';
		}).join('');

		var sellerRows = S.db.stores.slice().sort(function (a, b) {
			if (S.sellerDirectorySort === 'most-recent') { return (b.recent || 0) - (a.recent || 0); }
			if (S.sellerDirectorySort === 'most-popular') { return (b.popularity || 0) - (a.popularity || 0); }
			if (S.sellerDirectorySort === 'most-reviewed') { return (b.reviews || 0) - (a.reviews || 0); }
			return (b.rating || 0) - (a.rating || 0);
		}).map(function (s) {
			return '<div class="knr-listing">'
				+ '<div class="knr-listing-title">' + s.name + '</div>'
				+ '<div class="knr-listing-meta">Rating ' + s.rating.toFixed(1) + ' | Reviews ' + s.reviews + ' | Reliability ' + s.reliability + '%</div>'
				+ '<div>' + (s.trusted ? '<span class="knr-chip good">Trusted Seller</span>' : '<span class="knr-chip warn">Building Trust</span>') + (s.featured ? '<span class="knr-chip good">Featured Store</span>' : '') + '</div>'
				+ '</div>';
		}).join('');

		var sharpenRows = S.db.sharpeningOrders.map(function (o) {
			var late = S.day > o.dueDay && o.stageIndex < STAGES.length - 1;
			return '<div class="knr-listing">'
				+ '<div class="knr-listing-title">' + o.service + ' | ' + o.customer + ' | due Day ' + o.dueDay + '</div>'
				+ '<div class="knr-listing-meta">Handoff ' + o.handoff + ' | Edge ' + o.edgeType + ' | Stage: ' + STAGES[o.stageIndex] + '</div>'
				+ '<div>' + (late ? '<span class="knr-chip bad">Late Risk</span>' : '<span class="knr-chip good">On Track</span>') + (o.loanerChef || o.loanerParing ? '<span class="knr-chip">Loaner Reserved</span>' : '<span class="knr-chip warn">No Loaner</span>') + '</div>'
				+ '<div class="knr-actions"><button class="btn btn-outline-dark knr-open-sharpen" data-id="' + o.id + '">Open Job</button></div>'
				+ '</div>';
		}).join('') || '<div class="knr-note">No active orders yet. Accept a sharpening booking to start the 4-6 day workflow.</div>';

		var orderRows = S.db.orders.map(function (o) {
			var tag = o.returnTag;
			return '<div class="knr-listing">'
				+ '<div class="knr-listing-title">Order ' + o.id + ' | ' + o.productTitle + ' | ' + money(o.total) + '</div>'
				+ '<div class="knr-listing-meta">Tag ' + tag + ' | As described: ' + (o.asDescribed === null ? 'pending' : (o.asDescribed ? 'yes' : 'no')) + ' | Review: ' + (o.reviewStars || '-') + '</div>'
				+ '<div class="knr-actions">'
				+ '<button class="btn btn-outline-success knr-order-described" data-id="' + o.id + '" data-ok="1">As Described</button>'
				+ '<button class="btn btn-outline-warning knr-order-described" data-id="' + o.id + '" data-ok="0">Not As Described</button>'
				+ '<button class="btn btn-outline-dark knr-order-review" data-id="' + o.id + '" data-stars="5">Leave 5-Star</button>'
				+ '</div></div>';
		}).join('') || '<div class="knr-note">No buyer orders yet.</div>';
		var stepper = '';
		if (selectedSharpen) {
			stepper = STAGES.map(function (step, i) {
				var cls = i < selectedSharpen.stageIndex ? 'done' : (i === selectedSharpen.stageIndex ? 'current' : '');
				return '<span class="knr-step ' + cls + '">' + step + '</span>';
			}).join('');
		}

		var miniStats = '<div class="knr-kpi">'
			+ '<div class="k">Photo quality: ' + S.mini.photo + '</div>'
			+ '<div class="k">Model verify: ' + S.mini.verify + '</div>'
			+ '<div class="k">Grading honesty: ' + S.mini.gradingHonesty + '</div>'
			+ '<div class="k">Belt score: ' + S.mini.belt + '</div>'
			+ '<div class="k">Hone score: ' + S.mini.hone + '</div>'
			+ '<div class="k">Route score: ' + S.mini.route + '</div>'
			+ '</div>';

		U.root.innerHTML = ''
			+ '<div class="knr-header">'
			+ '<div><div class="knr-title">KnifeRevive: Marketplace + Sharpening</div><div class="knr-sub">Official KnifeRevive trust-and-quality simulation. Virtual economy only. Real wallet balance is shown but never modified by this game.</div></div>'
			+ '<div class="knr-status">Day ' + S.day + ' | ' + S.status + '</div>'
			+ '</div>'
			+ '<div class="knr-economy">'
			+ '<div class="knr-stat"><div class="label">Wallet Balance (Real)</div><div class="value" id="knr-wallet-balance">' + safeWalletBalance().toFixed(8) + '</div></div>'
			+ '<div class="knr-stat"><div class="label">Game Cash (Virtual)</div><div class="value">' + money(S.cash) + '</div></div>'
			+ '<div class="knr-stat"><div class="label">Reputation / Trust</div><div class="value">' + Math.round(S.reputation) + ' / ' + Math.round(S.trust) + '</div></div>'
			+ '<div class="knr-stat"><div class="label">Model / Workshop / Logistics</div><div class="value">' + Math.round(S.modelMastery) + ' / L' + S.workshop + ' / L' + S.logistics + '</div></div>'
			+ '</div>'
			+ '<div class="knr-nav">'
			+ navBtn('home', 'Home/Title') + navBtn('roles', 'Role Selection') + navBtn('market', 'Marketplace Browse') + navBtn('detail', 'Product Detail')
			+ navBtn('create', 'Create Listing') + navBtn('dashboard', 'Seller Dashboard') + navBtn('desk', 'Sharpening Desk') + navBtn('queue', 'Active Queue')
			+ navBtn('returns', 'Review/Return Center') + navBtn('directory', 'Seller Directory') + navBtn('models', 'Model Directory') + navBtn('reputation', 'Reputation/Progression') + navBtn('settings', 'Settings')
			+ '</div>'
			+ screen('home', '<div class="knr-card"><h4>Product Vision</h4><div class="knr-note">Revive blades, run your shop, verify model data, grade honestly, meet service SLAs, and build trust. This is a trust-and-craftsmanship sim, not an idle tapper.</div><div class="knr-actions"><button class="btn btn-success knr-go" data-screen="roles">Choose Your Role</button><button class="btn btn-outline-dark knr-next-day">Advance Day</button><button class="btn btn-outline-primary knr-generate-npc">Generate Market Activity</button></div></div><div class="knr-card"><h4>Core Loops</h4><div class="knr-grid-2"><div><strong>Marketplace:</strong> source inventory, publish listings, buy/sell, manage returns/disputes, earn trust.</div><div><strong>Sharpening:</strong> accept jobs, blade check, sharpen, hone/test, hit 4-6 day promise, complete handoff.</div></div></div><div class="knr-card"><h4>Simulation Guardrails</h4><div class="knr-chip good">5% Seller Fee</div><div class="knr-chip good">3% Buyer Marketplace Fee</div><div class="knr-chip warn">Free Returns vs $5 Returns</div><div class="knr-chip">Real-commerce links are external</div></div>')
			+ screen('roles', '<div class="knr-card"><h4>Role Selection</h4><div class="knr-note">You can play all roles. Current focus impacts event weighting and KPI role split.</div><div class="knr-actions"><button class="btn btn-outline-dark knr-role" data-role="seller">Seller</button><button class="btn btn-outline-dark knr-role" data-role="buyer">Buyer</button><button class="btn btn-outline-dark knr-role" data-role="sharpener">Sharpener</button></div><div class="knr-status">Active role: ' + S.selectedRole + '</div></div><div class="knr-card"><h4>Mandatory Mini-Game Hub</h4>' + miniStats + '</div>' + miniGameBlocks())
			+ screen('market', '<div class="knr-card"><h4>Filter-First Discovery</h4><div class="knr-grid-3"><select class="knr-select" id="knr-filter-type"><option value="all">Knife Type</option><option>Chef</option><option>Paring</option><option>EDC</option><option>Utility</option></select><select class="knr-select" id="knr-filter-brand"><option value="all">Brand/Series</option><option>Wusthof</option><option>Benchmade</option><option>Victorinox</option><option>Spyderco</option><option>Shun</option></select><select class="knr-select" id="knr-filter-condition"><option value="all">Condition</option><option>Mint</option><option>Excellent</option><option>Good</option><option>Fair</option><option>Project</option></select><input id="knr-filter-model" class="knr-input" placeholder="Model or SKU"><input id="knr-filter-price" class="knr-input" type="number" min="0" step="1" placeholder="Max Price"><button class="btn btn-outline-dark knr-apply-filters">Apply Filters</button></div></div><div class="knr-card"><h4>Marketplace Listings</h4>' + marketplaceCards + '</div>')
			+ screen('detail', '<div class="knr-card"><h4>Product Detail</h4>' + (selected ? '<div class="knr-listing-title">' + selected.title + '</div><div class="knr-listing-meta">' + selected.brand + ' / ' + selected.series + ' / Model ' + selected.model + ' / SKU ' + selected.sku + '</div><div>' + listingChips(selected, selectedStore) + '</div><div class="knr-note">Description: ' + selected.flaws + '. Condition: ' + selected.condition + '. Seller may be reviewed and specs may be adjusted by KnifeRevive verification for accuracy.</div><div class="knr-card" style="margin-top:8px"><h4>Pricing + Fees</h4><div class="knr-grid-2"><div>Item Price: ' + money(selected.price) + '</div><div>Buyer Marketplace Fee (3%): ' + money(selected.price * 0.03) + '</div><div>Checkout Total: <strong>' + money(selected.price * 1.03) + '</strong></div><div>Seller Fee at Settlement (5%): ' + money(selected.price * 0.05) + '</div></div></div><div class="knr-actions"><button class="btn btn-success knr-buy" data-id="' + selected.id + '">Buy Item</button><button class="btn btn-outline-dark knr-go" data-screen="returns">Review/Return Center</button></div>' : '<div class="knr-note">No product selected.</div>') + '</div>')
			+ screen('create', '<div class="knr-card"><h4>Create Listing (Seller Flow)</h4><div class="knr-grid-2"><input id="knr-create-title" class="knr-input" placeholder="Listing title"><select id="knr-create-type" class="knr-select"><option>Chef</option><option>Paring</option><option>EDC</option><option>Utility</option></select><input id="knr-create-brand" class="knr-input" placeholder="Brand / Series"><input id="knr-create-model" class="knr-input" placeholder="Model / SKU"><select id="knr-create-condition" class="knr-select"><option>Mint</option><option>Excellent</option><option>Good</option><option>Fair</option><option>Project</option></select><select id="knr-create-return" class="knr-select"><option>Free Returns</option><option>$5 Returns</option></select><input id="knr-create-price" class="knr-input" type="number" min="1" step="1" placeholder="List price"><textarea id="knr-create-flaws" placeholder="Visible flaws and imperfections"></textarea></div><div class="knr-note">Required capture checklist: both sides, model stamp, visible flaws. Listing quality is boosted by Photographer + Verification + Grading mini-games.</div><div class="knr-actions"><button class="btn btn-outline-dark knr-go" data-screen="roles">Run Mini-Games</button><button class="btn btn-success knr-publish">Publish Listing</button></div></div>')
			+ screen('dashboard', '<div class="knr-card"><h4>Seller Dashboard</h4><div class="knr-grid-2"><div>Total Listings: ' + S.db.products.length + '</div><div>Reviews: ' + S.db.reviews.length + '</div><div>Return Requests: ' + S.db.returns.length + '</div><div>Disputes: ' + S.db.disputes.length + '</div></div><div class="knr-actions"><button class="btn btn-outline-primary knr-run-market">Run Market Day</button><button class="btn btn-outline-dark knr-go" data-screen="create">Create Listing</button></div><div class="knr-note">Free Returns improves conversion but increases refund exposure. $5 Returns lowers seller cost but can reduce conversion.</div></div>')
			+ screen('desk', '<div class="knr-card"><h4>Sharpening Desk</h4><div class="knr-grid-2"><input id="knr-sharp-customer" class="knr-input" placeholder="Customer name"><select id="knr-sharp-service" class="knr-select"><option>Small Knife Sharpening</option><option>Large Knife Sharpening</option></select><select id="knr-sharp-handoff" class="knr-select"><option>pickup</option><option>drop-off</option></select><select id="knr-sharp-edge" class="knr-select"><option>smooth</option><option>serrated</option><option>micro-serrated (coming soon)</option></select></div><div class="knr-note">Workflow: Select service, choose handoff, blade check, queue, sharpen, hone/test, ready in 4-6 days, complete handoff.</div><div class="knr-actions"><button class="btn btn-success knr-accept-sharpen">Accept Job</button><button class="btn btn-outline-dark knr-go" data-screen="queue">Open Queue</button></div><div class="knr-status">Loaners available: chef ' + (S.loaners.chefTotal - S.loaners.chefUsed) + ' / paring ' + (S.loaners.paringTotal - S.loaners.paringUsed) + '</div></div>')
			+ screen('queue', '<div class="knr-card"><h4>Active Queue</h4>' + sharpenRows + '</div><div class="knr-card"><h4>Selected Job Stepper</h4>' + (selectedSharpen ? '<div class="knr-stepper">' + stepper + '</div><div class="knr-note">Current stage: ' + STAGES[selectedSharpen.stageIndex] + '. Promise window: Day ' + selectedSharpen.startDay + ' to Day ' + selectedSharpen.dueDay + '.</div><div class="knr-actions"><button class="btn btn-outline-dark knr-advance-stage" data-id="' + selectedSharpen.id + '">Advance Stage</button><button class="btn btn-outline-info knr-go" data-screen="roles">Run Mini-Games</button><button class="btn btn-outline-dark knr-next-day">Advance Day</button></div>' : '<div class="knr-note">No selected order.</div>') + '</div>')
			+ screen('returns', '<div class="knr-card"><h4>Review / Return Center</h4><div class="knr-note">"Item not as described" strongly favors buyer return success in this simulation.</div>' + orderRows + '</div>')
			+ screen('directory', '<div class="knr-card"><h4>Seller Directory</h4><div class="knr-actions"><button class="btn btn-outline-dark knr-sort" data-sort="most-recent">Most Recent</button><button class="btn btn-outline-dark knr-sort" data-sort="most-popular">Most Popular</button><button class="btn btn-outline-dark knr-sort" data-sort="top-rated">Top Rated</button><button class="btn btn-outline-dark knr-sort" data-sort="most-reviewed">Most Reviewed</button></div>' + sellerRows + '</div>')
			+ screen('models', '<div class="knr-card"><h4>Model Directory / Knowledge</h4><div class="knr-note">Mastery improves verification speed, pricing confidence, authenticity badges, and collector demand.</div><div class="knr-kpi">' + MODEL_BANK.map(function (m) { return '<div class="k">' + m.code + ' -> ' + m.model + '</div>'; }).join('') + '</div><div class="knr-actions"><button class="btn btn-outline-dark knr-go" data-screen="roles">Open Verification Mini-Game</button></div></div>')
			+ screen('reputation', '<div class="knr-card"><h4>Progression Axes</h4><div class="knr-grid-3"><div><strong>Reputation & Reliability:</strong> ' + Math.round(S.reputation) + ' / ' + Math.round(S.reliability) + '</div><div><strong>Model Mastery:</strong> ' + Math.round(S.modelMastery) + '</div><div><strong>Workshop/Logistics:</strong> L' + S.workshop + ' / L' + S.logistics + '</div></div><div class="knr-actions"><button class="btn btn-outline-success knr-upgrade" data-type="workshop">Upgrade Workshop</button><button class="btn btn-outline-success knr-upgrade" data-type="logistics">Upgrade Logistics</button></div></div><div class="knr-card"><h4>Instrumentation / KPIs</h4>' + kpiMarkup() + '</div>')
			+ screen('settings', '<div class="knr-card"><h4>Settings & Integrations</h4><div class="knr-note">Virtual cash is separate from real KnifeRevive commerce. Outbound actions are clearly labeled and open KnifeRevive website.</div><div class="knr-actions"><a class="btn btn-outline-primary" href="https://kniferevive.com" target="_blank" rel="noopener">Open KnifeRevive Website</a><a class="btn btn-outline-primary" href="https://kniferevive.com/shop" target="_blank" rel="noopener">Open KnifeRevive Store</a><a class="btn btn-outline-primary" href="https://kniferevive.com/sharpening" target="_blank" rel="noopener">Open KnifeRevive Sharpening</a></div><div class="knr-actions"><button class="btn btn-outline-dark knr-deeplink">Track Deep-Link CTR</button><button class="btn btn-outline-warning knr-reset">Reset Session</button></div></div>');

		applyFilterUI();
	}

	function applyFilterUI() {
		var node;
		node = document.getElementById('knr-filter-type'); if (node) { node.value = S.browseFilters.type; }
		node = document.getElementById('knr-filter-brand'); if (node) { node.value = S.browseFilters.brand; }
		node = document.getElementById('knr-filter-condition'); if (node) { node.value = S.browseFilters.condition; }
		node = document.getElementById('knr-filter-model'); if (node) { node.value = S.browseFilters.model; }
		node = document.getElementById('knr-filter-price'); if (node) { node.value = S.browseFilters.maxPrice; }
		buildVerifyPrompt();
		buildGradePrompt();
	}

	function setStatus(text) {
		S.status = text;
	}
	function buildVerifyPrompt() {
		var slot = document.getElementById('knr-verify-prompt');
		var opts = document.getElementById('knr-verify-options');
		if (!slot || !opts) { return; }
		var target = MODEL_BANK[Math.floor(Math.random() * MODEL_BANK.length)];
		S.currentVerify = target;
		slot.textContent = 'Match partial stamp "' + target.code.slice(0, 7) + '..." to the right model.';
		var candidates = [target.model];
		while (candidates.length < 3) {
			var pick = MODEL_BANK[Math.floor(Math.random() * MODEL_BANK.length)].model;
			if (candidates.indexOf(pick) === -1) { candidates.push(pick); }
		}
		candidates.sort(function () { return Math.random() - 0.5; });
		opts.innerHTML = candidates.map(function (m) {
			return '<button class="btn btn-outline-dark knr-verify-choice" data-correct="' + (m === target.model ? 1 : 0) + '">' + m + '</button>';
		}).join('');
	}

	function buildGradePrompt() {
		var slot = document.getElementById('knr-grade-prompt');
		if (!slot) { return; }
		var cases = [
			{ text: 'Light hairline scratches, clean edge, handle intact.', truth: 'Excellent' },
			{ text: 'Visible chips near tip, prior uneven sharpening marks.', truth: 'Fair' },
			{ text: 'Factory edge, no visible flaws, minimal use.', truth: 'Mint' },
			{ text: 'Daily use wear, minor chips, stable handle.', truth: 'Good' },
			{ text: 'Crack near bolster, deep rust spots, heavy reprofile needed.', truth: 'Project' }
		];
		S.currentGradeCase = cases[Math.floor(Math.random() * cases.length)];
		slot.textContent = S.currentGradeCase.text;
	}

	function val(id) {
		var el = document.getElementById(id);
		return el ? el.value : '';
	}

	function updateReturnKPIs(order) {
		var p = productById(order.productId);
		if (!p) { return; }
		var condKey = p.condition;
		if (!S.kpi.returnRateByCondition[condKey]) { S.kpi.returnRateByCondition[condKey] = { count: 0, returns: 0 }; }
		S.kpi.returnRateByCondition[condKey].count += 1;
		if (S.db.returns.some(function (r) { return r.orderId === order.id; })) { S.kpi.returnRateByCondition[condKey].returns += 1; }
		var tag = order.returnTag;
		if (!S.kpi.returnRateByTag[tag]) { S.kpi.returnRateByTag[tag] = { count: 0, returns: 0 }; }
		S.kpi.returnRateByTag[tag].count += 1;
		if (S.db.returns.some(function (r2) { return r2.orderId === order.id; })) { S.kpi.returnRateByTag[tag].returns += 1; }
		S.kpi.disputeRate = S.db.orders.length ? (S.db.disputes.length / S.db.orders.length) : 0;
	}

	function buyProduct(productId) {
		var p = productById(productId);
		if (!p) { return; }
		var total = p.price * 1.03;
		if (S.cash < total) {
			setStatus('Not enough game cash for checkout total ' + money(total) + '.');
			render();
			return;
		}
		S.cash -= total;
		var o = {
			id: uid('order'), productId: p.id, productTitle: p.title, salePrice: p.price, buyerFee: p.price * 0.03, total: total, sellerFee: p.price * 0.05,
			returnTag: p.returnTag, asDescribed: null, reviewStars: null, day: S.day, status: 'paid'
		};
		S.db.orders.push(o);
		S.db.orderItems.push({ id: uid('oi'), orderId: o.id, productId: p.id, qty: 1, unitPrice: p.price });
		S.db.payments.push({ id: uid('pay'), orderId: o.id, amount: total, type: 'buyer-checkout', day: S.day });
		S.kpi.detailToBuy += 1;
		S.trust += 0.5;
		setStatus('Purchase completed. Buyer fee 3% applied. Review in the return center.');
		render();
	}

	function settleOrder(orderId, describedOk) {
		var i;
		var o = null;
		for (i = 0; i < S.db.orders.length; i++) {
			if (S.db.orders[i].id === orderId) { o = S.db.orders[i]; break; }
		}
		if (!o) { return; }
		o.asDescribed = !!describedOk;
		var baseReturnChance = o.returnTag === 'Free Returns' ? 0.2 : 0.12;
		if (!o.asDescribed) { baseReturnChance += 0.6; }
		baseReturnChance += (S.reputation < 50 ? 0.1 : -0.05);
		if (chance() < baseReturnChance) {
			var fee = (o.returnTag === '$5 Returns' && o.asDescribed) ? 5 : 0;
			var refund = Math.max(0, o.total - fee);
			S.cash += refund;
			S.db.returns.push({ id: uid('ret'), orderId: o.id, policyTag: o.returnTag, reason: o.asDescribed ? 'changed mind' : 'item not as described', buyerWins: !o.asDescribed || chance() > 0.35, refund: refund, day: S.day });
			if (!o.asDescribed && chance() > 0.4) {
				S.db.disputes.push({ id: uid('dsp'), orderId: o.id, outcome: 'buyer-favored', note: 'Item not as described', day: S.day });
				S.trust -= 2;
				S.reputation -= 2;
			}
			setStatus('Return requested. ' + o.returnTag + ' policy affected economics.');
		} else {
			setStatus('Order retained with no return request.');
			S.reputation += 0.6;
		}
		updateReturnKPIs(o);
		render();
	}

	function reviewOrder(orderId, stars) {
		var o;
		for (var i = 0; i < S.db.orders.length; i++) {
			if (S.db.orders[i].id === orderId) { o = S.db.orders[i]; break; }
		}
		if (!o) { return; }
		o.reviewStars = Number(stars);
		S.db.reviews.push({ id: uid('rev'), orderId: o.id, stars: Number(stars), text: 'Trustworthy flow and clear condition details.', day: S.day });
		var total = 0;
		for (i = 0; i < S.db.reviews.length; i++) { total += S.db.reviews[i].stars; }
		S.kpi.reviewAverage = total / S.db.reviews.length;
		S.reputation += (stars >= 4 ? 1 : -1);
		S.trust += (stars >= 4 ? 0.7 : -0.7);
		setStatus('Review submitted.');
		render();
	}

	function publishListing() {
		var title = val('knr-create-title');
		var type = val('knr-create-type');
		var brandSeries = val('knr-create-brand');
		var modelSku = val('knr-create-model');
		var condition = val('knr-create-condition');
		var returnTag = val('knr-create-return');
		var price = Number(val('knr-create-price'));
		var flaws = val('knr-create-flaws');
		if (!title || !brandSeries || !modelSku || !price) {
			setStatus('Listing requires title, brand/series, model/SKU, and price.');
			render();
			return;
		}
		var parts = brandSeries.split(' ');
		var brand = parts[0] || brandSeries;
		var series = parts.slice(1).join(' ') || brandSeries;
		var verifiedModel = S.mini.verify >= 60;
		var listingQuality = Math.round((S.mini.photo + S.mini.verify + S.mini.gradingHonesty) / 3);
		var p = {
			id: uid('prod'), storeId: S.db.stores[0].id, title: title, knifeType: type, brand: brand, series: series, model: modelSku, sku: modelSku,
			condition: condition, returnTag: returnTag, price: price, flaws: flaws || 'none listed', verifiedModel: verifiedModel, trustedSeller: true,
			listingQuality: listingQuality, createdDay: S.day
		};
		S.db.products.unshift(p);
		S.db.productImages.push({ id: uid('img'), productId: p.id, side: 'front', quality: S.mini.photo });
		S.db.productImages.push({ id: uid('img'), productId: p.id, side: 'back', quality: S.mini.photo });
		S.db.productImages.push({ id: uid('img'), productId: p.id, side: 'stamp', quality: S.mini.verify });
		S.db.productImages.push({ id: uid('img'), productId: p.id, side: 'flaw', quality: S.mini.gradingHonesty });
		S.reputation += 0.9;
		S.kpi.tutorialCompletion = clamp(S.kpi.tutorialCompletion + 0.07, 0, 1);
		setStatus('Listing published. KnifeRevive verification may adjust specs for accuracy.');
		S.activeScreen = 'market';
		render();
	}
	function allocateLoaners(order) {
		var canChef = S.loaners.chefUsed < S.loaners.chefTotal;
		var canParing = S.loaners.paringUsed < S.loaners.paringTotal;
		if (canChef) { order.loanerChef = true; S.loaners.chefUsed += 1; }
		if (canParing) { order.loanerParing = true; S.loaners.paringUsed += 1; }
		S.db.loanerReservations.push({
			id: uid('loan'), sharpenOrderId: order.id, customer: order.customer, chef: order.loanerChef, paring: order.loanerParing, day: S.day,
			limitRule: 'max 1 chef + 1 paring per customer per service'
		});
	}

	function acceptSharpenOrder() {
		var customer = val('knr-sharp-customer') || ('Walk-in #' + (S.db.sharpeningOrders.length + 1));
		var service = val('knr-sharp-service') || 'Small Knife Sharpening';
		var handoff = val('knr-sharp-handoff') || 'pickup';
		var edge = val('knr-sharp-edge') || 'smooth';
		var due = S.day + 4 + Math.floor(Math.random() * 3);
		var ord = {
			id: uid('sho'), customer: customer, service: service, handoff: handoff, edgeType: edge,
			startDay: S.day, dueDay: due, stageIndex: 0, beltScore: 0, honeScore: 0, routeScore: 0,
			loanerChef: false, loanerParing: false, completed: false
		};
		allocateLoaners(ord);
		S.db.sharpeningOrders.unshift(ord);
		S.db.sharpeningItems.push({ id: uid('shi'), sharpenOrderId: ord.id, type: service.indexOf('Large') >= 0 ? 'large' : 'small', edgeType: edge });
		S.db.handoffs.push({ id: uid('han'), sharpenOrderId: ord.id, method: handoff, etaDay: due, status: 'booked' });
		S.selectedSharpenOrderId = ord.id;
		setStatus('Sharpening job accepted with 4-6 day promise.');
		S.activeScreen = 'queue';
		render();
	}

	function releaseLoaners(order) {
		if (order.loanerChef) { S.loaners.chefUsed = Math.max(0, S.loaners.chefUsed - 1); }
		if (order.loanerParing) { S.loaners.paringUsed = Math.max(0, S.loaners.paringUsed - 1); }
	}

	function finalizeSharpenOrder(o) {
		var base = o.service.indexOf('Large') >= 0 ? 28 : 18;
		var quality = Math.max(50, (S.mini.belt + S.mini.hone) / 2);
		var onTime = S.day <= o.dueDay;
		var payout = base + ((quality - 50) * 0.2);
		if (!onTime) { payout -= 4; }
		S.cash += payout;
		S.reliability += onTime ? 1.6 : -2;
		S.reputation += onTime ? 1.2 : -1.8;
		S.trust += onTime ? 1 : -1.3;
		S.workshop += (quality > 84 ? 1 : 0);
		releaseLoaners(o);
		S.kpi.sharpenCompletionRate = S.db.sharpeningOrders.length ? (S.db.sharpeningOrders.filter(function (x) { return x.completed; }).length / S.db.sharpeningOrders.length) : 0;
		S.kpi.onTimeRate = S.db.sharpeningOrders.length ? (S.db.sharpeningOrders.filter(function (x) { return x.completed && x.startDay <= x.dueDay; }).length / S.db.sharpeningOrders.length) : 0;
		S.db.reviews.push({ id: uid('rev'), sharpenOrderId: o.id, stars: onTime ? 5 : 3, text: onTime ? 'Fast and accurate edge work.' : 'Late handoff but acceptable edge.', day: S.day });
		S.db.payments.push({ id: uid('pay'), sharpenOrderId: o.id, amount: payout, type: 'service-close', day: S.day });
	}

	function advanceSharpenStage(orderId) {
		var o = sharpenOrderById(orderId);
		if (!o || o.completed) { return; }
		if (o.stageIndex >= STAGES.length - 1) { return; }
		if (STAGES[o.stageIndex] === 'sharpening' && S.mini.belt < 45) {
			setStatus('Run belt sharpening mini-game first for acceptable edge quality.');
			render();
			return;
		}
		if (STAGES[o.stageIndex] === 'hone/test' && S.mini.hone < 45) {
			setStatus('Run hone/test mini-game before marking ready.');
			render();
			return;
		}
		o.stageIndex += 1;
		if (o.stageIndex >= STAGES.length - 1) {
			o.completed = true;
			finalizeSharpenOrder(o);
		}
		setStatus('Advanced to ' + STAGES[o.stageIndex] + '.');
		render();
	}

	function runNpcMarketDay() {
		var playerStoreId = S.db.stores[0].id;
		var playerListings = S.db.products.filter(function (p) { return p.storeId === playerStoreId; });
		if (!playerListings.length) {
			setStatus('No player listings to sell today.');
			render();
			return;
		}
		var conversions = 0;
		for (var i = 0; i < playerListings.length; i++) {
			var p = playerListings[i];
			var conv = 0.22 + (S.trust / 300) + (p.listingQuality / 500);
			if (p.returnTag === 'Free Returns') { conv += 0.06; } else { conv -= 0.03; }
			if (chance() < conv) {
				conversions += 1;
				var sellerNet = p.price - p.price * 0.05;
				S.cash += sellerNet;
				S.db.orders.push({ id: uid('order'), productId: p.id, productTitle: p.title, salePrice: p.price, buyerFee: p.price * 0.03, total: p.price * 1.03, sellerFee: p.price * 0.05, returnTag: p.returnTag, asDescribed: true, reviewStars: 5, day: S.day, status: 'settled-npc' });
			}
		}
		S.reputation += conversions * 0.4;
		S.trust += conversions * 0.3;
		setStatus('Market day complete. Conversions: ' + conversions + '. Seller 5% fee applied to each sale.');
		render();
	}

	function applyFilters() {
		S.browseFilters.type = val('knr-filter-type') || 'all';
		S.browseFilters.brand = val('knr-filter-brand') || 'all';
		S.browseFilters.condition = val('knr-filter-condition') || 'all';
		S.browseFilters.model = val('knr-filter-model') || '';
		S.browseFilters.maxPrice = val('knr-filter-price') || '';
		S.kpi.browseToDetail += 1;
		render();
	}

	function nextDay() {
		S.day += 1;
		for (var i = 0; i < S.db.sharpeningOrders.length; i++) {
			var o = S.db.sharpeningOrders[i];
			if (!o.completed && S.day > o.dueDay && chance() > 0.55) {
				S.reliability -= 0.9;
				S.trust -= 0.6;
			}
		}
		setStatus('Advanced to day ' + S.day + '. SLA pressure updated.');
		render();
	}
	function runMiniPhoto() {
		var sides = Number(val('knr-photo-sides'));
		var stamp = Number(val('knr-photo-stamp'));
		var flaw = Number(val('knr-photo-flaw'));
		var light = Number(val('knr-photo-light'));
		S.mini.photo = Math.round((sides + stamp + flaw + light) / 4);
		S.reputation += (S.mini.photo > 80 ? 1 : 0.2);
		setStatus('Photo set scored ' + S.mini.photo + '. Better photos reduce return risk and improve conversion.');
		render();
	}

	function verifyChoice(correct) {
		S.mini.verify = correct ? clamp(S.mini.verify + 22, 0, 100) : clamp(S.mini.verify - 10, 0, 100);
		S.modelMastery += correct ? 3 : 0.5;
		S.trust += correct ? 0.8 : -0.4;
		setStatus(correct ? 'Model verified. Badge confidence increased.' : 'Mismatch. Mislabel risk increased.');
		render();
	}

	function gradeChoice(tier) {
		if (!S.currentGradeCase) { return; }
		var honest = tier === S.currentGradeCase.truth;
		S.mini.gradingHonesty = honest ? clamp(S.mini.gradingHonesty + 20, 0, 100) : clamp(S.mini.gradingHonesty - 12, 0, 100);
		S.trust += honest ? 1 : -1.2;
		S.reputation += honest ? 0.8 : -1;
		setStatus(honest ? 'Condition grading matched evidence.' : 'Over/under grading raises return and dispute risk.');
		render();
	}

	function runMiniBelt() {
		var angle = Number(val('knr-belt-angle'));
		var pressure = Number(val('knr-belt-pressure'));
		var heat = Number(val('knr-belt-heat'));
		var edge = val('knr-belt-type');
		var score = 100 - Math.abs(17 - angle) * 8 - Math.abs(55 - pressure) * 0.45 - Math.max(0, heat - 45) * 0.8;
		if (edge === 'serrated') { score -= 8; }
		S.mini.belt = clamp(Math.round(score), 0, 100);
		S.workshop += (S.mini.belt > 85 ? 1 : 0);
		setStatus('Belt pass complete. Sharpness profile score: ' + S.mini.belt + '.');
		render();
	}

	function runMiniHone() {
		var edge = val('knr-hone-edge');
		var test = val('knr-hone-test');
		var score = 64;
		if (edge === 'smooth' && (test === 'paper slice' || test === 'tomato skin')) { score += 24; }
		if (edge === 'serrated' && (test === 'rope cut' || test === 'visual burr check')) { score += 24; }
		if (test === 'visual burr check') { score += 6; }
		S.mini.hone = clamp(score, 0, 100);
		S.reliability += (S.mini.hone > 80 ? 1 : 0);
		setStatus('Hone/test score: ' + S.mini.hone + '. Complaint risk updated.');
		render();
	}

	function runMiniRoute(score, id) {
		S.mini.route = Number(score);
		S.logistics += (S.mini.route > 70 ? 1 : 0);
		S.reliability += (S.mini.route > 70 ? 1 : -0.4);
		setStatus('Route ' + id + ' selected. Reliability impact applied.');
		render();
	}

	function resetSession() {
		S.day = 1;
		S.cash = 2400;
		S.reputation = 56;
		S.reliability = 52;
		S.modelMastery = 34;
		S.workshop = 1;
		S.logistics = 1;
		S.trust = 55;
		S.db.orders = [];
		S.db.reviews = [];
		S.db.returns = [];
		S.db.disputes = [];
		S.db.sharpeningOrders = [];
		S.db.sharpeningItems = [];
		S.db.handoffs = [];
		S.db.loanerReservations = [];
		S.db.payments = [];
		S.loaners.chefUsed = 0;
		S.loaners.paringUsed = 0;
		S.mini.photo = 65;
		S.mini.verify = 0;
		S.mini.gradingHonesty = 0;
		S.mini.belt = 0;
		S.mini.hone = 0;
		S.mini.route = 0;
		setStatus('Session reset. Game economy synced to KnifeRevive simulation defaults.');
		render();
	}

	function upgrade(type) {
		var cost = type === 'workshop' ? 280 : 240;
		if (S.cash < cost) {
			setStatus('Not enough cash for ' + type + ' upgrade (' + money(cost) + ').');
			render();
			return;
		}
		S.cash -= cost;
		if (type === 'workshop') { S.workshop += 1; }
		if (type === 'logistics') { S.logistics += 1; }
		S.reliability += 1.1;
		setStatus(type + ' upgraded. Throughput and SLA control improved.');
		render();
	}

	function bind() {
		if (!U.root || U.bound) { return; }
		U.bound = true;
		U.root.addEventListener('click', function (e) {
			var t = e.target;
			if (!t) { return; }
			if (t.classList.contains('knr-nav-btn')) { S.activeScreen = t.getAttribute('data-screen'); render(); return; }
			if (t.classList.contains('knr-go')) { S.activeScreen = t.getAttribute('data-screen'); render(); return; }
			if (t.classList.contains('knr-role')) { S.selectedRole = t.getAttribute('data-role'); S.kpi.roleSplit[S.selectedRole] += 1; setStatus('Role focus switched to ' + S.selectedRole + '.'); render(); return; }
			if (t.classList.contains('knr-play-photo')) { runMiniPhoto(); return; }
			if (t.classList.contains('knr-verify-choice')) { verifyChoice(t.getAttribute('data-correct') === '1'); return; }
			if (t.classList.contains('knr-grade')) { gradeChoice(t.getAttribute('data-tier')); return; }
			if (t.classList.contains('knr-play-belt')) { runMiniBelt(); return; }
			if (t.classList.contains('knr-play-hone')) { runMiniHone(); return; }
			if (t.classList.contains('knr-route')) { runMiniRoute(t.getAttribute('data-score'), t.getAttribute('data-id')); return; }
			if (t.classList.contains('knr-apply-filters')) { applyFilters(); return; }
			if (t.classList.contains('knr-open-product')) { S.selectedProductId = t.getAttribute('data-id'); S.activeScreen = 'detail'; S.kpi.browseToDetail += 1; render(); return; }
			if (t.classList.contains('knr-buy')) { buyProduct(t.getAttribute('data-id')); return; }
			if (t.classList.contains('knr-publish')) { publishListing(); return; }
			if (t.classList.contains('knr-accept-sharpen')) { acceptSharpenOrder(); return; }
			if (t.classList.contains('knr-open-sharpen')) { S.selectedSharpenOrderId = t.getAttribute('data-id'); render(); return; }
			if (t.classList.contains('knr-advance-stage')) { advanceSharpenStage(t.getAttribute('data-id')); return; }
			if (t.classList.contains('knr-order-described')) { settleOrder(t.getAttribute('data-id'), t.getAttribute('data-ok') === '1'); return; }
			if (t.classList.contains('knr-order-review')) { reviewOrder(t.getAttribute('data-id'), Number(t.getAttribute('data-stars'))); return; }
			if (t.classList.contains('knr-sort')) { S.sellerDirectorySort = t.getAttribute('data-sort'); render(); return; }
			if (t.classList.contains('knr-run-market')) { runNpcMarketDay(); return; }
			if (t.classList.contains('knr-next-day')) { nextDay(); return; }
			if (t.classList.contains('knr-reset')) { resetSession(); return; }
			if (t.classList.contains('knr-upgrade')) { upgrade(t.getAttribute('data-type')); return; }
			if (t.classList.contains('knr-generate-npc')) { runNpcMarketDay(); return; }
			if (t.classList.contains('knr-deeplink')) { S.kpi.deepLinkCTR = clamp(S.kpi.deepLinkCTR + 0.03, 0, 1); setStatus('Deep-link hook invoked.'); render(); return; }
		});
	}

	function tickWallet() {
		if (!S.inited) { return; }
		S.walletBalance = safeWalletBalance();
		var el = document.getElementById('knr-wallet-balance');
		if (el) { el.textContent = S.walletBalance.toFixed(8); }
	}

	function init(rootId) {
		if (S.inited) { return; }
		U.root = document.getElementById(rootId);
		if (!U.root) { return; }
		seed();
		bind();
		render();
		S.inited = true;
		window.setInterval(tickWallet, 2500);
	}

	function onPanelVisibilityChange(contentName) {
		S.visible = contentName === 'games-kniferevive';
		if (S.visible && S.inited) { tickWallet(); }
	}

	window.KnifeReviveGameModule = {
		init: init,
		onPanelVisibilityChange: onPanelVisibilityChange,
		resetSession: resetSession
	};
})();

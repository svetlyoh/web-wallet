(function() {
	'use strict'

	var DB_NAME = 'lingry-secure-auth-v1'
	var DB_VERSION = 1
	var STORE_NAME = 'secure'
	var DEVICE_KEY_ID = 'device-key'
	var VAULT_ID = 'wallet-vault'
	var PENDING_VAULT_ID = 'wallet-vault-pending'
	var THROTTLE_ID = 'pin-throttle'
	var PBKDF2_ITERATIONS = 250000
	var AUTO_LOCK_MS = 5 * 60 * 1000
	var LEGACY_WALLET_KEYS = ['lingry.wallet.v1', 'lingry.wallet', 'lingry.wallet.wif']
	var bridge = null
	var databasePromise = null
	var savedVault = null
	var pendingIdentity = null
	var firstPin = ''
	var authScreen = 'welcome'
	var autoLockTimer = null
	var retryTimer = null
	var lastActivityReset = 0

	function randomBytes(length) {
		var bytes = new Uint8Array(length)
		crypto.getRandomValues(bytes)
		return bytes
	}

	function bytesToBase64(value) {
		var bytes = value instanceof Uint8Array ? value : new Uint8Array(value)
		var binary = ''
		for (var i = 0; i < bytes.length; i += 1) {
			binary += String.fromCharCode(bytes[i])
		}
		return btoa(binary)
	}

	function base64ToBytes(value) {
		var binary = atob(String(value || ''))
		var bytes = new Uint8Array(binary.length)
		for (var i = 0; i < binary.length; i += 1) {
			bytes[i] = binary.charCodeAt(i)
		}
		return bytes
	}

	function openDatabase() {
		if (databasePromise) {
			return databasePromise
		}
		databasePromise = new Promise(function(resolve, reject) {
			var request = indexedDB.open(DB_NAME, DB_VERSION)
			request.onupgradeneeded = function() {
				var db = request.result
				if (!db.objectStoreNames.contains(STORE_NAME)) {
					db.createObjectStore(STORE_NAME)
				}
			}
			request.onsuccess = function() {
				resolve(request.result)
			}
			request.onerror = function() {
				reject(request.error || new Error('Secure browser storage is unavailable.'))
			}
		})
		return databasePromise
	}

	async function idbGet(key) {
		var db = await openDatabase()
		return new Promise(function(resolve, reject) {
			var request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key)
			request.onsuccess = function() { resolve(request.result) }
			request.onerror = function() { reject(request.error) }
		})
	}

	async function idbPut(key, value) {
		var db = await openDatabase()
		return new Promise(function(resolve, reject) {
			var transaction = db.transaction(STORE_NAME, 'readwrite')
			transaction.objectStore(STORE_NAME).put(value, key)
			transaction.oncomplete = function() { resolve() }
			transaction.onerror = function() { reject(transaction.error) }
			transaction.onabort = function() { reject(transaction.error || new Error('Secure storage write was interrupted.')) }
		})
	}

	async function idbDelete(key) {
		var db = await openDatabase()
		return new Promise(function(resolve, reject) {
			var transaction = db.transaction(STORE_NAME, 'readwrite')
			transaction.objectStore(STORE_NAME).delete(key)
			transaction.oncomplete = function() { resolve() }
			transaction.onerror = function() { reject(transaction.error) }
		})
	}

	async function getDeviceKey() {
		var existing = await idbGet(DEVICE_KEY_ID)
		if (existing) {
			return existing
		}
		var key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
		await idbPut(DEVICE_KEY_ID, key)
		return key
	}

	async function derivePinKey(pin, salt) {
		var material = await crypto.subtle.importKey(
			'raw',
			new TextEncoder().encode(pin),
			'PBKDF2',
			false,
			['deriveKey']
		)
		return crypto.subtle.deriveKey({
			name: 'PBKDF2',
			hash: 'SHA-256',
			salt: salt,
			iterations: PBKDF2_ITERATIONS
		}, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
	}

	async function encryptVault(pin, payload) {
		var deviceKey = await getDeviceKey()
		var deviceIv = randomBytes(12)
		var pinIv = randomBytes(12)
		var pinSalt = randomBytes(16)
		var plaintext = new TextEncoder().encode(JSON.stringify(payload))
		var deviceCiphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: deviceIv }, deviceKey, plaintext)
		var pinKey = await derivePinKey(pin, pinSalt)
		var ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: pinIv }, pinKey, deviceCiphertext)
		return {
			version: 1,
			address: payload.address,
			pin_kdf: 'PBKDF2-SHA256',
			pin_iterations: PBKDF2_ITERATIONS,
			pin_salt: bytesToBase64(pinSalt),
			pin_iv: bytesToBase64(pinIv),
			device_iv: bytesToBase64(deviceIv),
			ciphertext: bytesToBase64(ciphertext),
			updated_at: new Date().toISOString()
		}
	}

	async function decryptVault(pin, vault) {
		if (!vault || vault.version !== 1) {
			throw new Error('Unsupported local vault.')
		}
		var deviceKey = await idbGet(DEVICE_KEY_ID)
		if (!deviceKey) {
			throw new Error('This device key is unavailable.')
		}
		var pinKey = await derivePinKey(pin, base64ToBytes(vault.pin_salt))
		var deviceCiphertext = await crypto.subtle.decrypt(
			{ name: 'AES-GCM', iv: base64ToBytes(vault.pin_iv) },
			pinKey,
			base64ToBytes(vault.ciphertext)
		)
		var plaintext = await crypto.subtle.decrypt(
			{ name: 'AES-GCM', iv: base64ToBytes(vault.device_iv) },
			deviceKey,
			deviceCiphertext
		)
		return JSON.parse(new TextDecoder().decode(plaintext))
	}

	async function saveVault(pin, identity) {
		var payload = {
			version: 1,
			address: bridge.address(identity.keys),
			wif: bridge.wif(identity.keys),
			public_key: bridge.publicKey(identity.keys),
			user_id: identity.userId || '',
			session_token: identity.sessionToken || '',
			session_expires_at: identity.sessionExpiresAt || '',
			created_at: identity.createdAt || new Date().toISOString()
		}
		var encrypted = await encryptVault(pin, payload)
		await idbPut(PENDING_VAULT_ID, encrypted)
		var verified = await decryptVault(pin, encrypted)
		if (!verified || verified.address !== payload.address || verified.wif !== payload.wif) {
			throw new Error('The secure wallet verification failed.')
		}
		await idbPut(VAULT_ID, encrypted)
		await idbDelete(PENDING_VAULT_ID)
		savedVault = encrypted
		if (identity.legacyStorageKey) {
			window.localStorage.removeItem(identity.legacyStorageKey)
		}
		return verified
	}

	function authCard(html) {
		$('#lingry-auth-card').attr('data-lingry-auth-screen', authScreen).html(html)
	}

	function setStatus(message, variant) {
		$('#lingry-auth-status').attr('class', 'lingry-auth-status' + (variant ? ' ' + variant : '')).text(message || '')
	}

	function showWelcome(message) {
		authScreen = 'welcome'
		firstPin = ''
		pendingIdentity = null
		authCard(
			'<h2>Welcome to Lingry</h2>' +
			'<p class="lingry-auth-copy">Start new or bring back your existing Lingry.</p>' +
			'<div class="lingry-auth-actions">' +
				'<button type="button" class="lingry-auth-button" data-lingry-start-new>Start New</button>' +
				'<button type="button" class="lingry-auth-button secondary" data-lingry-recover>I already have Lingry</button>' +
			'</div>' +
			'<div id="lingry-auth-status" class="lingry-auth-status" role="status" aria-live="polite"></div>'
		)
		if (message) {
			setStatus(message)
		}
	}

	function showBusy(title, message) {
		authScreen = 'busy'
		authCard(
			'<h2>' + title + '</h2>' +
			'<div class="lingry-auth-progress" role="status" aria-live="polite">' + message + '</div>'
		)
	}

	function showRecovery(message) {
		authScreen = 'recovery'
		firstPin = ''
		pendingIdentity = null
		authCard(
			'<h2>Bring Back Lingry</h2>' +
			'<p class="lingry-auth-copy">Enter the private key from your Lingry Sugarchain wallet.</p>' +
			'<form id="lingry-recovery-form">' +
				'<label class="lingry-auth-field-label" for="lingry-recovery-key">Lingry Private Key</label>' +
				'<input id="lingry-recovery-key" class="lingry-recovery-input" type="password" autocomplete="off" autocapitalize="none" spellcheck="false" required>' +
				'<p class="lingry-auth-note">Your private key stays on this device.</p>' +
				'<div class="lingry-auth-actions">' +
					'<button type="submit" class="lingry-auth-button">Continue</button>' +
					'<button type="button" class="lingry-auth-button secondary" data-lingry-auth-back>Back</button>' +
				'</div>' +
			'</form>' +
			'<div id="lingry-auth-status" class="lingry-auth-status" role="status" aria-live="polite"></div>'
		)
		if (message) {
			setStatus(message)
		}
		window.setTimeout(function() { $('#lingry-recovery-key').trigger('focus') }, 0)
	}

	function showBackup() {
		if (!pendingIdentity || !pendingIdentity.keys) {
			showWelcome()
			return
		}
		authScreen = 'backup'
		authCard(
			'<h2>Save your Lingry Private Key</h2>' +
			'<p class="lingry-auth-copy">You\'ll need this to bring Lingry back on another device.</p>' +
			'<input id="lingry-backup-key" class="lingry-backup-input" type="password" readonly autocomplete="off" spellcheck="false" aria-label="Lingry Private Key">' +
			'<p class="lingry-auth-note lingry-auth-warning">Keep it private. Anyone with this key can control your Lingry wallet.</p>' +
			'<div class="lingry-auth-actions">' +
				'<button type="button" class="lingry-auth-button secondary" data-lingry-show-backup>Show Private Key</button>' +
				'<button type="button" class="lingry-auth-button secondary" data-lingry-copy-backup>Copy Private Key</button>' +
				'<button type="button" class="lingry-auth-button" data-lingry-backup-saved>I\'ve Saved It</button>' +
				'<button type="button" class="lingry-auth-link" data-lingry-cancel-setup>Cancel</button>' +
			'</div>' +
			'<div id="lingry-auth-status" class="lingry-auth-status" role="status" aria-live="polite"></div>'
		)
		$('#lingry-backup-key').val(bridge.wif(pendingIdentity.keys))
	}

	function pinTemplate(title, copy, recoveryLink, cancelLink) {
		return '<h2>' + title + '</h2>' +
			'<p class="lingry-auth-copy">' + copy + '</p>' +
			'<div class="lingry-pin-wrap">' +
				'<div class="lingry-pin-cells" data-lingry-pin-focus>' +
					'<span class="lingry-pin-cell" aria-hidden="true"></span>' +
					'<span class="lingry-pin-cell" aria-hidden="true"></span>' +
					'<span class="lingry-pin-cell" aria-hidden="true"></span>' +
					'<span class="lingry-pin-cell" aria-hidden="true"></span>' +
					'<input id="lingry-pin-input" class="lingry-pin-native" type="password" inputmode="numeric" pattern="[0-9]*" autocomplete="one-time-code" maxlength="4" aria-label="4-digit PIN">' +
				'</div>' +
			'</div>' +
			'<div id="lingry-auth-status" class="lingry-auth-status" role="status" aria-live="polite"></div>' +
			(recoveryLink ? '<button type="button" class="lingry-auth-link" data-lingry-recover>I already have Lingry</button>' : '') +
			(cancelLink ? '<button type="button" class="lingry-auth-link" data-lingry-cancel-setup>Cancel</button>' : '')
	}

	function focusPin() {
		window.setTimeout(function() { $('#lingry-pin-input').trigger('focus') }, 0)
	}

	function updatePinCells(value) {
		$('.lingry-pin-cell').each(function(index) {
			$(this).toggleClass('filled', index < value.length).text(index < value.length ? '\u2022' : '')
		})
	}

	async function currentThrottle() {
		return await idbGet(THROTTLE_ID) || { failures: 0, blocked_until: 0 }
	}

	async function showUnlock(message) {
		authScreen = 'unlock'
		authCard(pinTemplate('Welcome back', 'Enter your PIN', true, false))
		if (message) {
			setStatus(message)
		}
		var throttle = await currentThrottle()
		if (Number(throttle.blocked_until || 0) > Date.now()) {
			startRetryCountdown(Number(throttle.blocked_until))
		} else {
			focusPin()
		}
	}

	function showPinSetup(confirming, message) {
		authScreen = confirming ? 'pin-confirm' : 'pin-create'
		authCard(pinTemplate(
			confirming ? 'Confirm your PIN' : 'Protect this device',
			confirming ? 'Enter the same 4 digits again.' : 'Create a 4-digit PIN',
			false,
			true
		))
		if (message) {
			setStatus(message)
		}
		focusPin()
	}

	function startRetryCountdown(blockedUntil) {
		window.clearInterval(retryTimer)
		function tick() {
			var remaining = Math.max(0, Math.ceil((blockedUntil - Date.now()) / 1000))
			var input = $('#lingry-pin-input')
			if (!remaining) {
				window.clearInterval(retryTimer)
				input.prop('disabled', false)
				setStatus('Try again', 'info')
				focusPin()
				return
			}
			input.prop('disabled', true)
			setStatus('Incorrect PIN. Try again in ' + remaining + 's.')
		}
		tick()
		retryTimer = window.setInterval(tick, 250)
	}

	async function recordPinFailure() {
		var throttle = await currentThrottle()
		var failures = Math.min(12, Number(throttle.failures || 0) + 1)
		var delaySeconds = Math.min(30, Math.pow(2, Math.min(5, failures - 1)))
		var blockedUntil = Date.now() + delaySeconds * 1000
		await idbPut(THROTTLE_ID, { failures: failures, blocked_until: blockedUntil })
		return blockedUntil
	}

	async function resetPinFailures() {
		await idbPut(THROTTLE_ID, { failures: 0, blocked_until: 0 })
	}

	async function apiRequest(path, body) {
		var response = await fetch(path, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'idempotency-key': 'lingry-browser-' + crypto.randomUUID()
			},
			body: JSON.stringify(body)
		})
		var json = await response.json().catch(function() { return null })
		if (!response.ok || !json || json.ok === false) {
			var error = new Error(json && json.error && json.error.message || 'Lingry wallet authentication failed.')
			error.code = json && json.error && json.error.code || 'wallet_auth_failed'
			throw error
		}
		return json.data || json
	}

	async function authenticateWallet(keys, action) {
		var address = bridge.address(keys)
		var publicKey = bridge.publicKey(keys)
		var challenge = await apiRequest('/v1/auth/challenge', {
			address: address,
			public_key: publicKey,
			auth_action: action,
			client_name: 'Lingry browser wallet',
			requested_scopes: ['identity:read', 'wallet:read', 'words:create']
		})
		var signature = bridge.sign(keys, challenge.message)
		return apiRequest('/v1/auth/wallet', {
			challenge_id: challenge.challenge_id,
			address: address,
			public_key: publicKey,
			signature: signature,
			auth_action: action
		})
	}

	async function startNew() {
		showBusy('Creating your Lingry', 'Generating your wallet locally and proving ownership\u2026')
		try {
			var keys = bridge.createKeys()
			var auth = await authenticateWallet(keys, 'start-new')
			pendingIdentity = {
				keys: keys,
				flow: 'new',
				userId: auth.identity && auth.identity.user_id || '',
				sessionToken: auth.session_token || '',
				sessionExpiresAt: auth.expires_at || ''
			}
			showBackup()
		} catch (error) {
			showWelcome(error && error.message ? error.message : 'Lingry could not create this wallet identity.')
		}
	}

	async function recoverExisting() {
		var input = $('#lingry-recovery-key')
		var rawKey = String(input.val() || '').trim()
		input.val('')
		var keys
		try {
			keys = bridge.keysFromWif(rawKey)
		} catch (error) {
			showRecovery("That private key doesn't look valid.")
			return
		} finally {
			rawKey = ''
		}
		showBusy('Bringing back Lingry', 'Verifying wallet ownership\u2026')
		try {
			var auth = await authenticateWallet(keys, 'recover')
			pendingIdentity = {
				keys: keys,
				flow: 'recover',
				userId: auth.identity && auth.identity.user_id || '',
				sessionToken: auth.session_token || '',
				sessionExpiresAt: auth.expires_at || ''
			}
			showPinSetup(false)
		} catch (error) {
			showRecovery(error && error.message ? error.message : 'Lingry could not restore this wallet identity.')
		}
	}

	async function unlock(pin) {
		var throttle = await currentThrottle()
		if (Number(throttle.blocked_until || 0) > Date.now()) {
			startRetryCountdown(Number(throttle.blocked_until))
			return
		}
		try {
			var payload = await decryptVault(pin, savedVault)
			var keys = bridge.keysFromWif(payload.wif)
			await resetPinFailures()
			showBusy('Opening Lingry', 'Unlocking this device\u2026')
			bridge.open(keys, { appSessionToken: payload.session_token || '' })
			resetAutoLock()
		} catch (error) {
			updatePinCells('')
			$('#lingry-pin-input').val('')
			startRetryCountdown(await recordPinFailure())
		}
	}

	async function completePinSetup(pin) {
		if (!pendingIdentity || !pendingIdentity.keys) {
			showWelcome('Start again to protect this device.')
			return
		}
		showBusy('Protecting this device', 'Encrypting your local Lingry wallet\u2026')
		try {
			await saveVault(pin, pendingIdentity)
			await resetPinFailures()
			var keys = pendingIdentity.keys
			var sessionToken = pendingIdentity.sessionToken || ''
			pendingIdentity = null
			firstPin = ''
			bridge.open(keys, { appSessionToken: sessionToken })
			resetAutoLock()
		} catch (error) {
			firstPin = ''
			showPinSetup(false, error && error.message ? error.message : 'This device could not save the encrypted wallet.')
		}
	}

	async function handlePinComplete(pin) {
		if (!/^\d{4}$/.test(pin)) {
			return
		}
		if (authScreen === 'unlock') {
			await unlock(pin)
			return
		}
		if (authScreen === 'pin-create') {
			firstPin = pin
			showPinSetup(true)
			return
		}
		if (authScreen === 'pin-confirm') {
			if (pin !== firstPin) {
				firstPin = ''
				showPinSetup(false, "PINs don't match. Try again.")
				return
			}
			await completePinSetup(pin)
		}
	}

	function clearPendingAndReturn() {
		firstPin = ''
		pendingIdentity = null
		if (savedVault) {
			showUnlock()
		} else {
			showWelcome()
		}
	}

	function loadLegacyWallet() {
		for (var i = 0; i < LEGACY_WALLET_KEYS.length; i += 1) {
			var storageKey = LEGACY_WALLET_KEYS[i]
			var raw = window.localStorage.getItem(storageKey)
			if (!raw) {
				continue
			}
			try {
				var parsed = JSON.parse(raw)
				raw = parsed && (parsed.wif || parsed.privateKey || parsed.private_key) || ''
			} catch (error) {
				// A legacy record may be the WIF string itself.
			}
			try {
				return { keys: bridge.keysFromWif(String(raw || '').trim()), legacyStorageKey: storageKey }
			} catch (error) {
				// Leave an unrecognized legacy record untouched.
			}
		}
		return null
	}

	async function initialize() {
		bridge = window.LingryWalletBridge
		if (!bridge || !window.crypto || !window.crypto.subtle || !window.indexedDB) {
			showWelcome('Secure browser storage is required to protect a Lingry wallet on this device.')
			return
		}
		try {
			savedVault = await idbGet(VAULT_ID)
			await idbDelete(PENDING_VAULT_ID)
			if (savedVault) {
				await showUnlock()
				return
			}
			var legacy = loadLegacyWallet()
			if (legacy) {
				pendingIdentity = {
					keys: legacy.keys,
					flow: 'legacy-migration',
					legacyStorageKey: legacy.legacyStorageKey
				}
				showPinSetup(false)
				return
			}
			showWelcome()
		} catch (error) {
			showWelcome('Secure browser storage could not be opened on this device.')
		}
	}

	function resetAutoLock() {
		window.clearTimeout(autoLockTimer)
		if (!bridge || !bridge.isOpen()) {
			return
		}
		autoLockTimer = window.setTimeout(function() {
			lock('Lingry locked after inactivity.')
		}, AUTO_LOCK_MS)
	}

	async function lock(message) {
		window.clearTimeout(autoLockTimer)
		if (bridge) {
			bridge.close({ authManaged: true })
		}
		pendingIdentity = null
		firstPin = ''
		savedVault = savedVault || await idbGet(VAULT_ID)
		if (savedVault) {
			await showUnlock(message || '')
		} else {
			showWelcome()
		}
	}

	function noteActivity() {
		var now = Date.now()
		if (now - lastActivityReset < 1000) {
			return
		}
		lastActivityReset = now
		resetAutoLock()
	}

	$(function() {
		$(document).on('click', '[data-lingry-start-new]', function() {
			startNew()
		})
		$(document).on('click', '[data-lingry-recover]', function() {
			showRecovery()
		})
		$(document).on('click', '[data-lingry-auth-back]', function() {
			clearPendingAndReturn()
		})
		$(document).on('click', '[data-lingry-cancel-setup]', function() {
			clearPendingAndReturn()
		})
		$(document).on('submit', '#lingry-recovery-form', function(event) {
			event.preventDefault()
			recoverExisting()
		})
		$(document).on('click', '[data-lingry-show-backup]', function() {
			var input = $('#lingry-backup-key')
			var show = input.attr('type') === 'password'
			input.attr('type', show ? 'text' : 'password')
			$(this).text(show ? 'Hide Private Key' : 'Show Private Key')
		})
		$(document).on('click', '[data-lingry-copy-backup]', function() {
			var input = $('#lingry-backup-key')
			var value = String(input.val() || '')
			if (!value) {
				return
			}
			if (navigator.clipboard && navigator.clipboard.writeText) {
				navigator.clipboard.writeText(value).then(function() {
					setStatus('Private key copied.', 'info')
				}).catch(function() {
					input.trigger('focus').trigger('select')
					setStatus('Copy failed. Select and copy the key.', 'info')
				})
			} else {
				input.trigger('focus').trigger('select')
				setStatus('Key selected. Copy it now.', 'info')
			}
		})
		$(document).on('click', '[data-lingry-backup-saved]', function() {
			showPinSetup(false)
		})
		$(document).on('click', '[data-lingry-pin-focus]', function() {
			focusPin()
		})
		$(document).on('input', '#lingry-pin-input', function() {
			var input = $(this)
			var value = String(input.val() || '').replace(/\D/g, '').slice(0, 4)
			input.val(value)
			updatePinCells(value)
			if (value.length === 4) {
				input.prop('disabled', true)
				window.setTimeout(function() { handlePinComplete(value) }, 60)
			}
		})
		$(document).on('pointerdown keydown touchstart', noteActivity)
		document.addEventListener('visibilitychange', function() {
			if (document.hidden && bridge && bridge.isOpen()) {
				lock()
			}
		})
		initialize()
	})

	window.LingryAuthController = {
		lock: lock,
		openEntry: async function() {
			savedVault = savedVault || await idbGet(VAULT_ID)
			if (savedVault) {
				await showUnlock()
			} else {
				showWelcome()
			}
		},
		resetAutoLock: resetAutoLock
	}
})()

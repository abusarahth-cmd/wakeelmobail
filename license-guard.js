/**
 * نظام حماية الترخيص والفترة التجريبية والتفعيل الدائم
 * License Guard System - Wakeel 11
 * برمجة وتطوير: أبو حمد (نظام الوكيل الرقمي)
 */
(function() {
    'use strict';

    const PROGRAM_SALT = "ALTHAWWAB_WAKEEL11_2026_PRO";
    const BASE_TRIAL_MS = 5 * 24 * 60 * 60 * 1000; // 5 days = 120 hours (432,000,000 ms)
    const EXTENSION_MS = 5 * 24 * 60 * 60 * 1000;  // 5 days extension (120 hours)

    const DB_NAME = 'WakeelLicenseDB';
    const DB_VERSION = 1;
    const STORE_NAME = 'license_meta';

    // وحدات Node.js
    let os = null, crypto = null, fs = null, path = null, electron = null;
    try {
        if (typeof require === 'function') {
            os = require('os');
            crypto = require('crypto');
            fs = require('fs');
            path = require('path');
            electron = require('electron');
        }
    } catch (e) {
        console.warn('[LicenseGuard] Node modules require warning:', e);
    }

    // -------------------------------------------------------------
    // محرك IndexedDB للتخزين الدائم لرمز الجهاز وحالة الترخيص
    // -------------------------------------------------------------
    function openLicenseDB() {
        return new Promise((resolve) => {
            if (typeof indexedDB === 'undefined') return resolve(null);
            try {
                const req = indexedDB.open(DB_NAME, DB_VERSION);
                req.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains(STORE_NAME)) {
                        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                    }
                };
                req.onsuccess = (e) => resolve(e.target.result);
                req.onerror = () => resolve(null);
            } catch (e) {
                resolve(null);
            }
        });
    }

    async function getFromIndexedDB(key) {
        try {
            const db = await openLicenseDB();
            if (!db) return null;
            return new Promise((resolve) => {
                const tx = db.transaction(STORE_NAME, 'readonly');
                const store = tx.objectStore(STORE_NAME);
                const req = store.get(key);
                req.onsuccess = () => resolve(req.result ? req.result.value : null);
                req.onerror = () => resolve(null);
            });
        } catch (e) {
            return null;
        }
    }

    async function saveToIndexedDB(key, val) {
        try {
            const db = await openLicenseDB();
            if (!db) return;
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            store.put({ id: key, value: val });
        } catch (e) {}
    }

    // -------------------------------------------------------------
    // استخراج أول عنوان MAC حقيقي
    // -------------------------------------------------------------
    function getFirstRealMac() {
        if (!os) return '00:11:22:33:44:55';
        try {
            const nets = os.networkInterfaces();
            const keys = Object.keys(nets).sort();
            for (const key of keys) {
                const ifaces = nets[key];
                if (!ifaces) continue;
                for (const iface of ifaces) {
                    if (!iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00') {
                        return iface.mac.toUpperCase();
                    }
                }
            }
        } catch (e) {}
        return '00:11:22:33:44:55';
    }

    // -------------------------------------------------------------
    // حساب بصمة الجهاز الثابتة بصيغة SCH-XXXX-XXXX
    // -------------------------------------------------------------
    function generateMobileDeviceId() {
        try {
            if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
                const arr = new Uint8Array(4);
                crypto.getRandomValues(arr);
                const hex = Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
                return 'SCH-' + hex.substring(0, 4) + '-' + hex.substring(4, 8);
            }
        } catch(e) {}
        const r1 = Math.floor(Math.random() * 0xFFFF).toString(16).padStart(4, '0').toUpperCase();
        const r2 = Math.floor(Math.random() * 0xFFFF).toString(16).padStart(4, '0').toUpperCase();
        return 'SCH-' + r1 + '-' + r2;
    }

    function computeHardwareFingerprint() {
        try {
            if (typeof localStorage !== 'undefined') {
                const saved = localStorage.getItem('wakeel11_device_id');
                if (saved && saved.startsWith('SCH-')) return saved;
            }
            if (os && crypto && typeof crypto.createHash === 'function') {
                const hostname = os.hostname().trim();
                let cpuModel = (os.cpus() && os.cpus().length > 0) ? (os.cpus()[0].model || '').trim() : 'STANDARD_CPU';
                const mac = getFirstRealMac();
                const raw = `${hostname}|${cpuModel}|${mac}`;
                const hash = crypto.createHash('sha256').update(raw).digest('hex').toUpperCase();
                return 'SCH-' + hash.substring(0, 4) + '-' + hash.substring(4, 8);
            }
            return generateMobileDeviceId();
        } catch (e) {
            return generateMobileDeviceId();
        }
    }

    // -------------------------------------------------------------
    // تحديد مسار مجلد userData وملف الترخيص المخفي
    // -------------------------------------------------------------
    function getUserDataDir() {
        try {
            if (electron && electron.ipcRenderer) {
                const p = electron.ipcRenderer.sendSync('get-user-data-path-sync');
                if (p) return p;
            }
        } catch (e) {}
        try {
            if (process && process.env) {
                if (process.env.PORTABLE_EXECUTABLE_DIR && path) {
                    return path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'wakeel_portable_data');
                }
                if (process.env.APPDATA && path) {
                    return path.join(process.env.APPDATA, 'wakeel-student-behavior');
                }
            }
        } catch (e) {}
        return '';
    }

    function getLicenseFilePath() {
        const uDir = getUserDataDir();
        if (uDir && path) {
            return path.join(uDir, '.wakeel11_lic_guard.json');
        }
        return '';
    }

    // -------------------------------------------------------------
    // معادلات التفعيل والتمديد (متوافقة 100% مع المولّد)
    // -------------------------------------------------------------
    let cachedExpectedPermanentKey = '';
    let cachedExpectedExtensionKey = '';

    async function sha256Hex(str) {
        if (typeof crypto !== 'undefined' && crypto.subtle && typeof crypto.subtle.digest === 'function') {
            const buffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
            return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
        }
        if (crypto && typeof crypto.createHash === 'function') {
            return crypto.createHash('sha256').update(str).digest('hex');
        }
        return '';
    }

    async function precalculateExpectedKeys(devId) {
        if (!devId) return;
        try {
            const permHex = await sha256Hex(devId + PROGRAM_SALT);
            if (permHex) {
                cachedExpectedPermanentKey = permHex.substring(0, 10).toUpperCase();
            }
            const extHex = await sha256Hex(devId + PROGRAM_SALT + "_EXT5");
            if (extHex) {
                cachedExpectedExtensionKey = "EXT5-" + extHex.substring(0, 8).toUpperCase();
            }
        } catch (e) {
            console.warn('[LicenseGuard] Key precalculation warning:', e);
        }
    }

    function computePermanentKey(devId) {
        if (devId === currentDeviceId && cachedExpectedPermanentKey) {
            return cachedExpectedPermanentKey;
        }
        if (crypto && typeof crypto.createHash === 'function') {
            return crypto.createHash('sha256')
                .update(devId + PROGRAM_SALT)
                .digest('hex')
                .substring(0, 10)
                .toUpperCase();
        }
        return cachedExpectedPermanentKey || '';
    }

    function computeExtensionKey(devId) {
        if (devId === currentDeviceId && cachedExpectedExtensionKey) {
            return cachedExpectedExtensionKey;
        }
        if (crypto && typeof crypto.createHash === 'function') {
            return "EXT5-" + crypto.createHash('sha256')
                .update(devId + PROGRAM_SALT + "_EXT5")
                .digest('hex')
                .substring(0, 8)
                .toUpperCase();
        }
        return cachedExpectedExtensionKey || '';
    }

    function verifyPermanentKey(devId, inputKey) {
        const clean = inputKey.trim().toUpperCase();
        if (cachedExpectedPermanentKey && (devId === currentDeviceId || !devId)) {
            if (clean === cachedExpectedPermanentKey) return true;
        }
        const expected = computePermanentKey(devId);
        return expected ? clean === expected : false;
    }

    function verifyExtensionKey(devId, inputKey) {
        const clean = inputKey.trim().toUpperCase();
        if (cachedExpectedExtensionKey && (devId === currentDeviceId || !devId)) {
            if (clean === cachedExpectedExtensionKey) return true;
        }
        const expected = computeExtensionKey(devId);
        return expected ? clean === expected : false;
    }

    // -------------------------------------------------------------
    // تنسيق الوقت المتبقي بالأيام والساعات
    // مثال: ⏳ فترة تجريبية: متبقي 4 أيام و 23 ساعة
    // -------------------------------------------------------------
    function formatRemainingTime(ms) {
        if (ms <= 0) return "0 ساعة";
        const totalHours = Math.floor(ms / (1000 * 60 * 60));
        const days = Math.floor(totalHours / 24);
        const hours = totalHours % 24;

        if (days > 0) {
            let daysStr = days === 1 ? "يوم واحد" : (days === 2 ? "يومان" : (days >= 3 && days <= 10 ? `${days} أيام` : `${days} يوماً`));
            let hoursStr = hours === 1 ? "ساعة واحدة" : (hours === 2 ? "ساعتان" : (hours >= 3 && hours <= 10 ? `${hours} ساعات` : `${hours} ساعة`));
            return `${daysStr} و ${hoursStr}`;
        } else {
            if (hours === 0) {
                const minutes = Math.floor(ms / (1000 * 60));
                return minutes > 0 ? `${minutes} دقيقة` : "أقل من دقيقة";
            }
            return hours === 1 ? "ساعة واحدة" : (hours === 2 ? "ساعتان" : (hours >= 3 && hours <= 10 ? `${hours} ساعات` : `${hours} ساعة`));
        }
    }

    // -------------------------------------------------------------
    // قراءة وحفظ الحالة في (IndexedDB + localStorage + userData)
    // -------------------------------------------------------------
    function readStoredStateSync() {
        let state = {
            wakeel11_device_id: '',
            wakeel11_first_run: null,
            wakeel11_last_seen: null,
            wakeel11_extra_ms: 0,
            wakeel11_used_ext_codes: [],
            wakeel11_activated: false,
            wakeel11_license_key: ''
        };

        // 1. القراءة من الملف المخفي في userData
        try {
            const filePath = getLicenseFilePath();
            if (filePath && fs && fs.existsSync(filePath)) {
                const rawData = fs.readFileSync(filePath, 'utf8');
                const data = JSON.parse(rawData);
                if (data && typeof data === 'object') {
                    if (data.deviceId) state.wakeel11_device_id = String(data.deviceId);
                    if (data.wakeel11_first_run) state.wakeel11_first_run = Number(data.wakeel11_first_run);
                    if (data.wakeel11_last_seen) state.wakeel11_last_seen = Number(data.wakeel11_last_seen);
                    if (data.wakeel11_extra_ms) state.wakeel11_extra_ms = Number(data.wakeel11_extra_ms);
                    if (Array.isArray(data.wakeel11_used_ext_codes)) state.wakeel11_used_ext_codes = data.wakeel11_used_ext_codes;
                    if (data.wakeel11_activated === true || data.wakeel11_activated === 'true') state.wakeel11_activated = true;
                    if (data.wakeel11_license_key) state.wakeel11_license_key = String(data.wakeel11_license_key);
                }
            }
        } catch (e) {
            console.warn('[LicenseGuard] Error reading license file:', e);
        }

        // 2. القراءة من localStorage كطبقة متزامنة
        if (typeof localStorage !== 'undefined') {
            try {
                const localDevId = localStorage.getItem('wakeel11_device_id');
                const localFirst = localStorage.getItem('wakeel11_first_run');
                const localLast = localStorage.getItem('wakeel11_last_seen');
                const localExtra = localStorage.getItem('wakeel11_extra_ms');
                const localUsed = localStorage.getItem('wakeel11_used_ext_codes');
                const localAct = localStorage.getItem('wakeel11_activated');
                const localKey = localStorage.getItem('wakeel11_license_key');

                if (localDevId && !state.wakeel11_device_id) state.wakeel11_device_id = localDevId;
                if (localFirst && !isNaN(Number(localFirst))) {
                    const n = Number(localFirst);
                    state.wakeel11_first_run = state.wakeel11_first_run ? Math.min(state.wakeel11_first_run, n) : n;
                }
                if (localLast && !isNaN(Number(localLast))) {
                    const n = Number(localLast);
                    state.wakeel11_last_seen = state.wakeel11_last_seen ? Math.max(state.wakeel11_last_seen, n) : n;
                }
                if (localExtra && !isNaN(Number(localExtra))) {
                    state.wakeel11_extra_ms = Math.max(state.wakeel11_extra_ms, Number(localExtra));
                }
                if (localUsed) {
                    try {
                        const parsed = JSON.parse(localUsed);
                        if (Array.isArray(parsed)) {
                            state.wakeel11_used_ext_codes = Array.from(new Set([...state.wakeel11_used_ext_codes, ...parsed]));
                        }
                    } catch (e) {}
                }
                const alwakeelAct = localStorage.getItem('alwakeel_activated');
                if (alwakeelAct === 'true' || alwakeelAct === true) {
                    state.wakeel11_activated = true;
                    state.alwakeel_activated = true;
                }
                const alwakeelDevId = localStorage.getItem('alwakeel_device_id');
                if (alwakeelDevId && !state.wakeel11_device_id) {
                    state.wakeel11_device_id = alwakeelDevId;
                }

                if (localAct === 'true' || localAct === true) state.wakeel11_activated = true;
                if (localKey && !state.wakeel11_license_key) state.wakeel11_license_key = localKey;
            } catch (e) {
                console.warn('[LicenseGuard] Error reading localStorage:', e);
            }
        }

        return state;
    }

    function saveState(state) {
        // 1. الحفظ في localStorage
        if (typeof localStorage !== 'undefined') {
            try {
                if (state.wakeel11_device_id) {
                    localStorage.setItem('wakeel11_device_id', state.wakeel11_device_id);
                    localStorage.setItem('alwakeel_device_id', state.wakeel11_device_id);
                }
                if (state.wakeel11_first_run) localStorage.setItem('wakeel11_first_run', String(state.wakeel11_first_run));
                if (state.wakeel11_last_seen) localStorage.setItem('wakeel11_last_seen', String(state.wakeel11_last_seen));
                localStorage.setItem('wakeel11_extra_ms', String(state.wakeel11_extra_ms || 0));
                localStorage.setItem('wakeel11_used_ext_codes', JSON.stringify(state.wakeel11_used_ext_codes || []));
                localStorage.setItem('wakeel11_activated', state.wakeel11_activated ? 'true' : 'false');
                if (state.wakeel11_activated || state.alwakeel_activated) {
                    localStorage.setItem('alwakeel_activated', 'true');
                }
                if (state.wakeel11_license_key) localStorage.setItem('wakeel11_license_key', state.wakeel11_license_key);
            } catch (e) {}
        }

        // 2. الحفظ في IndexedDB (تخزين دائم لا يتأثر بتنظيف الكاش)
        saveToIndexedDB('license_state', state);
        if (state.wakeel11_activated || state.alwakeel_activated) {
            saveToIndexedDB('alwakeel_activated', true);
        }
        if (state.wakeel11_device_id) {
            saveToIndexedDB('alwakeel_device_id', state.wakeel11_device_id);
        }

        // 3. الحفظ في الملف المخفي داخل userData
        try {
            const filePath = getLicenseFilePath();
            if (filePath && fs && path) {
                const dir = path.dirname(filePath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                fs.writeFileSync(filePath, JSON.stringify({
                    deviceId: state.wakeel11_device_id,
                    wakeel11_first_run: state.wakeel11_first_run,
                    wakeel11_last_seen: state.wakeel11_last_seen,
                    wakeel11_extra_ms: state.wakeel11_extra_ms || 0,
                    wakeel11_used_ext_codes: state.wakeel11_used_ext_codes || [],
                    wakeel11_activated: state.wakeel11_activated,
                    alwakeel_activated: state.alwakeel_activated || state.wakeel11_activated,
                    wakeel11_license_key: state.wakeel11_license_key,
                    updated_at: new Date().toISOString()
                }, null, 2), 'utf8');
            }
        } catch (e) {
            console.warn('[LicenseGuard] Error writing license file:', e);
        }
    }

    // -------------------------------------------------------------
    // متغيرات الحالة العامة
    // -------------------------------------------------------------
    let currentState = readStoredStateSync();
    let currentDeviceId = currentState.wakeel11_device_id || computeHardwareFingerprint();
    currentState.wakeel11_device_id = currentDeviceId;
    let isActivated = false;
    let isExpired = false;
    let clockTampered = false;
    let remainingMs = 0;

    // تهيئة وتثبيت رمز الجهاز
    async function initDeviceId() {
        // فحص IndexedDB أولاً لمفتاح alwakeel_activated و alwakeel_device_id
        try {
            const idbAct = await getFromIndexedDB('alwakeel_activated');
            if (idbAct === true || idbAct === 'true') {
                currentState.wakeel11_activated = true;
                currentState.alwakeel_activated = true;
                isActivated = true;
                try { localStorage.setItem('alwakeel_activated', 'true'); } catch(e) {}
            }

            const idbDevId = await getFromIndexedDB('alwakeel_device_id');
            if (idbDevId && typeof idbDevId === 'string' && idbDevId.startsWith('SCH-')) {
                currentDeviceId = idbDevId;
            }

            const idbVal = await getFromIndexedDB('license_state');
            if (idbVal) {
                if (idbVal.wakeel11_device_id && !currentDeviceId) {
                    currentDeviceId = idbVal.wakeel11_device_id;
                }
                if (idbVal.wakeel11_activated || idbVal.alwakeel_activated) {
                    currentState.wakeel11_activated = true;
                    currentState.alwakeel_activated = true;
                    isActivated = true;
                }
            }
        } catch(e) {}

        if (!currentDeviceId && currentState.wakeel11_device_id) {
            currentDeviceId = currentState.wakeel11_device_id;
        }

        if (!currentDeviceId) {
            currentDeviceId = computeHardwareFingerprint();
        }

        currentState.wakeel11_device_id = currentDeviceId;
        saveState(currentState);
        return currentDeviceId;
    }

    // -------------------------------------------------------------
    // تقييم وفحص الترخيص والوقت المتبقي
    // -------------------------------------------------------------
    function evaluateLicense() {
        const now = Date.now();
        currentState = readStoredStateSync();
        if (!currentState.wakeel11_device_id && currentDeviceId) {
            currentState.wakeel11_device_id = currentDeviceId;
        }

        // 1. التحقق من التفعيل الدائم مسبقاً عبر alwakeel_activated أو المفتاح الدائم
        const isLocallyActivated = (typeof localStorage !== 'undefined' && localStorage.getItem('alwakeel_activated') === 'true');
        if (isLocallyActivated || currentState.alwakeel_activated || (currentState.wakeel11_activated && currentState.wakeel11_license_key)) {
            if (isLocallyActivated || currentState.alwakeel_activated || verifyPermanentKey(currentDeviceId, currentState.wakeel11_license_key)) {
                isActivated = true;
                isExpired = false;
                clockTampered = false;
                remainingMs = Infinity;
                currentState.wakeel11_activated = true;
                currentState.alwakeel_activated = true;
                try { localStorage.setItem('alwakeel_activated', 'true'); } catch(e) {}
                saveToIndexedDB('alwakeel_activated', true);
                saveState(currentState);
                updateUI();
                return;
            }
        }

        isActivated = false;

        // 2. ضبط بداية التجربة إن كانت أول تشغيل
        if (!currentState.wakeel11_first_run) {
            currentState.wakeel11_first_run = now;
        }

        // 3. التحقق من التلاعب بساعة النظام (إرجاع الوقت للوراء أكثر من 60 ثانية)
        if (!currentState.wakeel11_last_seen) {
            currentState.wakeel11_last_seen = now;
        } else {
            if (now < currentState.wakeel11_last_seen - 60000) {
                clockTampered = true;
                isExpired = true;
                remainingMs = 0;
                saveState(currentState);
                updateUI();
                lockApplication();
                return;
            }
        }

        // 4. حساب المدة المتبقية بدقة (مدة الأساس 120 ساعة + ساعات التمديد الإضافية)
        const totalAllowedDuration = BASE_TRIAL_MS + (currentState.wakeel11_extra_ms || 0);
        const elapsed = now - currentState.wakeel11_first_run;

        if (elapsed >= totalAllowedDuration || elapsed < 0) {
            isExpired = true;
            remainingMs = 0;
            currentState.wakeel11_last_seen = Math.max(currentState.wakeel11_last_seen, now);
            saveState(currentState);
            updateUI();
            lockApplication();
            return;
        }

        // التجربة ما زالت سارية
        isExpired = false;
        clockTampered = false;
        remainingMs = totalAllowedDuration - elapsed;

        currentState.wakeel11_last_seen = Math.max(currentState.wakeel11_last_seen, now);
        saveState(currentState);
        updateUI();
    }

    // -------------------------------------------------------------
    // قفل البرنامج الإجباري
    // -------------------------------------------------------------
    function lockApplication() {
        showActivationModal(true);
    }

    // -------------------------------------------------------------
    // تحديث الواجهة (شارة الشريط العلوي + بطاقة تبويب الاشتراك)
    // -------------------------------------------------------------
    function updateUI() {
        if (typeof document === 'undefined') return;

        const timeStr = formatRemainingTime(remainingMs);

        // 1. تحديث شارة الشريط العلوي (Header)
        const badge = document.getElementById('license-header-badge');
        if (badge) {
            // الضغط على الشارة ينقل المستخدم دائماً إلى تبويب الاشتراك
            badge.setAttribute('onclick', "switchTab('subscription')");

            if (isActivated) {
                badge.className = "cursor-pointer transition-all duration-200 hover:scale-105 select-none px-3 py-1.5 rounded-xl border-2 border-emerald-400 bg-emerald-500/20 text-emerald-300 font-black text-xs md:text-sm whitespace-nowrap shadow-sm flex items-center gap-1.5";
                badge.title = "البرنامج مفعل بالكامل بترخيص دائم - انقر للانتقال لتبويب الاشتراك";
                badge.innerHTML = '<i class="fa-solid fa-circle-check text-emerald-400 text-sm"></i><span>✅ نسخة مفعّلة مدى الحياة</span>';
            } else if (isExpired || clockTampered) {
                badge.className = "cursor-pointer transition-all duration-200 hover:scale-105 select-none px-3 py-1.5 rounded-xl border-2 border-rose-500 bg-rose-500/25 text-rose-300 font-black text-xs md:text-sm whitespace-nowrap shadow-sm flex items-center gap-1.5 animate-pulse";
                badge.title = "انتهت الفترة التجريبية - انقر للانتقال لتبويب الاشتراك والتفعيل";
                badge.innerHTML = '<i class="fa-solid fa-triangle-exclamation text-rose-400 text-sm"></i><span>⚠️ انتهت التجربة (انقر للتفعيل)</span>';
            } else {
                badge.className = "cursor-pointer transition-all duration-200 hover:scale-105 select-none px-3 py-1.5 rounded-xl border-2 border-amber-400 bg-amber-400/20 text-amber-300 font-black text-xs md:text-sm whitespace-nowrap shadow-sm flex items-center gap-1.5";
                badge.title = "انقر للانتقال لتبويب الاشتراك والتفعيل";
                badge.innerHTML = `<i class="fa-solid fa-clock text-amber-400 text-sm"></i><span>⏳ فترة تجريبية: متبقي ${timeStr}</span>`;
            }
        }

        // 2. تحديث بطاقة تبويب الاشتراك
        const subDevId = document.getElementById('sub-device-id-text');
        if (subDevId) {
            subDevId.textContent = currentDeviceId || 'SCH-XXXX-XXXX';
        }

        const subStatusBadge = document.getElementById('sub-license-status-badge');
        if (subStatusBadge) {
            if (isActivated) {
                subStatusBadge.className = "px-4 py-1.5 rounded-xl border-2 border-emerald-400 bg-emerald-500/20 text-emerald-300 font-black text-xs md:text-sm whitespace-nowrap shadow-sm flex items-center gap-2";
                subStatusBadge.innerHTML = '<i class="fa-solid fa-circle-check text-emerald-400"></i><span>✅ نسخة مفعّلة مدى الحياة</span>';
            } else if (isExpired || clockTampered) {
                subStatusBadge.className = "px-4 py-1.5 rounded-xl border-2 border-rose-500 bg-rose-500/20 text-rose-300 font-black text-xs md:text-sm whitespace-nowrap shadow-sm flex items-center gap-2 animate-pulse";
                subStatusBadge.innerHTML = '<i class="fa-solid fa-triangle-exclamation text-rose-400"></i><span>⚠️ انتهت الفترة التجريبية</span>';
            } else {
                subStatusBadge.className = "px-4 py-1.5 rounded-xl border-2 border-amber-400 bg-amber-400/20 text-amber-300 font-black text-xs md:text-sm whitespace-nowrap shadow-sm flex items-center gap-2";
                subStatusBadge.innerHTML = `<i class="fa-solid fa-clock text-amber-400"></i><span>⏳ فترة تجريبية: متبقي ${timeStr}</span>`;
            }
        }
    }

    // -------------------------------------------------------------
    // معالجة أكواد التفعيل (دائم أو تمديد 5 أيام)
    // -------------------------------------------------------------
    async function processActivationCode(inputRaw) {
        const code = (inputRaw || '').trim().toUpperCase();
        if (!code) {
            return { success: false, message: "يرجى كتابة رمز التفعيل أو التمديد أولاً." };
        }

        if (!cachedExpectedPermanentKey || !cachedExpectedExtensionKey) {
            await precalculateExpectedKeys(currentDeviceId);
        }

        // الحالة الأولى: كود تمديد 5 أيام (يبدأ بـ EXT5-)
        if (code.startsWith('EXT5-') || code.startsWith('EXT5')) {
            let formattedCode = code;
            if (!formattedCode.startsWith('EXT5-')) {
                formattedCode = 'EXT5-' + formattedCode.substring(4);
            }

            if (verifyExtensionKey(currentDeviceId, formattedCode)) {
                const used = currentState.wakeel11_used_ext_codes || [];
                if (used.includes(formattedCode)) {
                    return { success: false, message: "❌ تم استخدام كود التمديد هذا مسبقاً على هذا الجهاز!" };
                }

                used.push(formattedCode);
                currentState.wakeel11_used_ext_codes = used;

                const now = Date.now();
                const totalAllowed = BASE_TRIAL_MS + (currentState.wakeel11_extra_ms || 0);
                const currentRemaining = totalAllowed - (now - currentState.wakeel11_first_run);

                if (currentRemaining <= 0) {
                    // إذا كانت منتهية، يُمنح 5 أيام (120 ساعة) كاملة تبدأ من الآن
                    currentState.wakeel11_first_run = now;
                    currentState.wakeel11_extra_ms = 0;
                } else {
                    // إذا لم تنتهِ بعد، تُضاف 120 ساعة كاملة للوقت المتبقي
                    currentState.wakeel11_extra_ms = (currentState.wakeel11_extra_ms || 0) + EXTENSION_MS;
                }

                currentState.wakeel11_last_seen = now;
                isExpired = false;
                clockTampered = false;

                saveState(currentState);
                evaluateLicense();
                closeActivationModal();

                return {
                    success: true,
                    type: 'extension',
                    message: "🎉 تم تمديد الفترة التجريبية بنجاح لمدة 5 أيام إضافية (120 ساعة)!"
                };
            } else {
                return { success: false, message: "❌ كود التمديد غير صحيح! يرجى التأكد من الرمز والمحاولة مجدداً." };
            }
        }

        // الحالة الثانية: كود التفعيل الدائم (10 خانات)
        if (verifyPermanentKey(currentDeviceId, code) || (cachedExpectedPermanentKey && code === cachedExpectedPermanentKey)) {
            currentState.wakeel11_activated = true;
            currentState.wakeel11_license_key = code;
            currentState.wakeel11_last_seen = Date.now();
            currentState.alwakeel_activated = true;

            try {
                localStorage.setItem('alwakeel_activated', 'true');
                localStorage.setItem('alwakeel_device_id', currentDeviceId);
            } catch(e) {}
            saveToIndexedDB('alwakeel_activated', true);
            saveToIndexedDB('alwakeel_device_id', currentDeviceId);

            isActivated = true;
            isExpired = false;
            clockTampered = false;
            remainingMs = Infinity;

            saveState(currentState);
            evaluateLicense();

            setTimeout(() => {
                closeActivationModal();
            }, 1600);

            return {
                success: true,
                type: 'permanent',
                message: "🎉 تم تفعيل النسخة الدائمة لبرنامج الوكيل الرقمي بنجاح مدى الحياة! شكراً لثقتكم."
            };
        }

        return { success: false, message: "❌ كود التفعيل غير صحيح! يرجى التأكد من الرمز أو التواصل مع المطور عبر واتساب." };
    }

    // إرسال كود التفعيل من أي حقل إدخال
    async function submitActivationFromInput(inputId, alertId) {
        const input = document.getElementById(inputId);
        const alertBox = document.getElementById(alertId);
        if (!input) return;

        const res = await processActivationCode(input.value);

        if (alertBox) {
            alertBox.classList.remove('hidden');
            if (res.success) {
                alertBox.className = "text-xs font-bold text-center py-2 px-4 rounded-xl mt-2 bg-emerald-500/25 text-emerald-300 border border-emerald-500/50 shadow-sm";
                alertBox.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${res.message}`;
            } else {
                alertBox.className = "text-xs font-bold text-center py-2 px-4 rounded-xl mt-2 bg-rose-500/25 text-rose-300 border border-rose-500/50 shadow-sm";
                alertBox.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> ${res.message}`;
            }
        }
    }

    // -------------------------------------------------------------
    // شاشة الحجب والقفل الإجباري (Modal Overlay غير قابل للإغلاق عند الانتهاء)
    // -------------------------------------------------------------
    function showActivationModal(mandatoryLock = false) {
        if (typeof document === 'undefined') return;
        let overlay = document.getElementById('license-guard-overlay');
        if (!overlay) {
            createActivationModalDOM();
            overlay = document.getElementById('license-guard-overlay');
        }

        const isLocked = mandatoryLock || isExpired || clockTampered;
        const closeBtn = document.getElementById('lic-modal-close-btn');
        if (closeBtn) {
            // ممنوع إظهار زر الإغلاق إطلاقاً عند انتهاء الفترة أو قفل البرنامج
            if (isLocked) {
                closeBtn.classList.add('hidden');
            } else {
                closeBtn.classList.remove('hidden');
            }
        }

        const devIdEl = document.getElementById('lic-device-id-text');
        if (devIdEl) {
            devIdEl.textContent = currentDeviceId;
        }

        const msgAlert = document.getElementById('lic-activation-alert');
        if (msgAlert) {
            msgAlert.classList.add('hidden');
            msgAlert.textContent = '';
        }

        const keyInput = document.getElementById('lic-activation-input');
        if (keyInput) {
            keyInput.value = '';
            setTimeout(() => keyInput.focus(), 150);
        }

        overlay.classList.remove('hidden');
        overlay.classList.add('flex');
    }

    function closeActivationModal() {
        if (typeof document === 'undefined') return;
        if (isExpired || clockTampered) {
            // قفل إجباري صارم - لا يمكن الإغلاق إلا بعد التفعيل أو التمديد الصحيح
            return;
        }
        const overlay = document.getElementById('license-guard-overlay');
        if (overlay) {
            overlay.classList.add('hidden');
            overlay.classList.remove('flex');
        }
    }

    // إنشاء واجهة الـ Overlay ديناميكياً
    function createActivationModalDOM() {
        if (typeof document === 'undefined') return;
        if (document.getElementById('license-guard-overlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'license-guard-overlay';
        overlay.className = "fixed inset-0 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 hidden no-print";
        overlay.style.zIndex = "999999";

        overlay.innerHTML = `
            <div class="bg-indigo-950 border-2 border-amber-500/90 rounded-2xl shadow-2xl max-w-xl w-full p-6 text-white relative overflow-y-auto max-h-[92vh] flex flex-col gap-4">
                
                <!-- رأس النافذة -->
                <div class="flex items-center justify-between border-b border-indigo-800/80 pb-3">
                    <div class="flex items-center gap-3">
                        <div class="w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-400 text-2xl shadow-inner shrink-0">
                            <i class="fa-solid fa-lock"></i>
                        </div>
                        <div>
                            <h2 class="text-base md:text-lg font-black text-amber-300">ترخيص وتفعيل برنامج الوكيل الرقمي 11</h2>
                            <p class="text-xs text-rose-300 font-bold mt-0.5">⚠️ انتهت الفترة التجريبية المجانية للبرنامج</p>
                        </div>
                    </div>
                    <button type="button" id="lic-modal-close-btn" onclick="window.LicenseGuard.closeActivationModal()" class="w-8 h-8 rounded-lg bg-indigo-900/80 hover:bg-rose-600/80 text-slate-300 hover:text-white flex items-center justify-center transition cursor-pointer hidden" title="إغلاق">
                        <i class="fa-solid fa-xmark text-sm"></i>
                    </button>
                </div>

                <!-- نص الرسالة الحرفي الصارم المطلوب -->
                <div class="bg-indigo-900/70 border border-amber-400/30 rounded-xl p-4 text-xs md:text-sm text-slate-200 leading-relaxed text-justify font-medium">
                    انتهت الفترة التجريبية المجانية (5 أيام). نأمل أن تكون تجربتكم للبرنامج قد نالت استحسانكم وأسهمت في تيسير أعمالكم الإدارية والتعليمية بكل كفاءة. للاستمرار في استخدام البرنامج والاستفادة من كافة مميزاته بترخيص دائم، يسعدنا تواصلكم مع مطور البرنامج وتزويده برمز الجهاز الموضح أدناه ليتم تفعيل نسختكم فوراً:
                </div>

                <!-- صندوق رمز الجهاز وأزرار النسخ -->
                <div class="bg-slate-900/95 border-2 border-indigo-700/80 rounded-xl p-4 flex flex-col gap-3">
                    <div class="flex items-center justify-between flex-wrap gap-2">
                        <span class="text-xs font-bold text-slate-400">رمز جهازك الفريد (Device ID):</span>
                        <span id="lic-copy-feedback" class="text-xs font-bold text-emerald-400 hidden"></span>
                    </div>
                    <div class="flex items-center justify-center py-2.5 px-3 bg-black/50 border border-indigo-800 rounded-lg">
                        <span id="lic-device-id-text" class="text-2xl md:text-3xl font-mono font-black text-amber-400 tracking-widest select-all"></span>
                    </div>
                    
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                        <button type="button" onclick="window.LicenseGuard.copyDeviceId('lic-copy-feedback')" class="flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-indigo-800 hover:bg-indigo-700 active:bg-indigo-900 text-white text-xs font-bold border border-indigo-600 transition cursor-pointer">
                            <i class="fa-regular fa-copy text-amber-400"></i>
                            <span>📋 نسخ رمز الجهاز</span>
                        </button>
                        <button type="button" onclick="window.LicenseGuard.copyRequestMessage('lic-copy-feedback')" class="flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg bg-emerald-800 hover:bg-emerald-700 active:bg-emerald-900 text-white text-xs font-bold border border-emerald-600 transition cursor-pointer">
                            <i class="fa-solid fa-comment-dots text-emerald-300"></i>
                            <span>💬 نسخ رسالة طلب التفعيل</span>
                        </button>
                    </div>
                </div>

                <!-- حقل إدخال رمز التفعيل أو التمديد -->
                <div class="flex flex-col gap-2 pt-1">
                    <label for="lic-activation-input" class="text-xs font-bold text-slate-300">أدخل كود التفعيل الدائم أو كود التمديد (EXT5-...):</label>
                    <div class="flex flex-col sm:flex-row gap-2">
                        <input type="text" id="lic-activation-input" maxlength="25" placeholder="أدخل الكود هنا (مثال: XXXXXXXXXX أو EXT5-XXXXXXXX)" class="flex-1 px-4 py-2.5 rounded-xl bg-slate-900/90 border-2 border-indigo-600 text-amber-300 font-mono text-center font-black tracking-widest text-base focus:outline-none focus:border-amber-400 placeholder:text-slate-600 placeholder:font-sans uppercase">
                        <button type="button" onclick="window.LicenseGuard.submitActivationFromInput('lic-activation-input', 'lic-activation-alert')" class="py-2.5 px-6 rounded-xl bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-indigo-950 font-black text-sm shadow-lg flex items-center justify-center gap-2 transition cursor-pointer shrink-0">
                            <i class="fa-solid fa-unlock-keyhole"></i>
                            <span>تفعيل الآن</span>
                        </button>
                    </div>
                    <div id="lic-activation-alert" class="text-xs font-bold text-center hidden py-1.5 px-3 rounded-lg"></div>
                </div>

                <!-- بيانات التحويل البنكي لمصرف الراجحي والتواصل واتساب -->
                <div class="bg-indigo-900/60 border border-indigo-800 rounded-xl p-3.5 space-y-2.5 text-xs text-slate-200">
                    <div class="flex items-center justify-between border-b border-indigo-800/80 pb-2">
                        <span class="font-bold text-amber-300 flex items-center gap-1.5">
                            <i class="fa-solid fa-building-columns"></i> بيانات مصرف الراجحي (رسوم الاشتراك: 70 ريال):
                        </span>
                    </div>
                    <div class="flex items-center justify-between bg-black/30 p-2 rounded-lg">
                        <span class="text-slate-400">رقم الحساب:</span>
                        <span class="font-mono font-bold text-amber-300 select-all">372000010006080092153</span>
                    </div>
                    <div class="flex items-center justify-between bg-black/30 p-2 rounded-lg">
                        <span class="text-slate-400">الآيبان (IBAN):</span>
                        <span class="font-mono font-bold text-emerald-300 select-all text-[11px] sm:text-xs">SA8580000372608010092153</span>
                    </div>
                    <div class="pt-1">
                        <a href="https://wa.me/966538783381" target="_blank" rel="noopener noreferrer" class="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-md transition flex items-center justify-center gap-2 cursor-pointer">
                            <i class="fa-brands fa-whatsapp text-lg"></i>
                            <span>تواصل عبر واتساب للتفعيل الفوري (0538783381)</span>
                        </a>
                    </div>
                </div>

                <!-- زر إغلاق التطبيق لتمكين الخروج النظيف -->
                <div class="flex items-center justify-between border-t border-indigo-800/60 pt-2 text-xs text-slate-400">
                    <span class="text-[11px]">برنامج الوكيل الرقمي • الترخيص والتفعيل</span>
                    <button type="button" onclick="window.LicenseGuard.exitApp()" class="text-rose-400 hover:text-rose-300 underline font-bold cursor-pointer">
                        إغلاق البرنامج
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const input = document.getElementById('lic-activation-input');
        if (input) {
            input.addEventListener('keyup', function(e) {
                if (e.key === 'Enter') {
                    submitActivationFromInput('lic-activation-input', 'lic-activation-alert');
                }
            });
        }
    }

    // نسخ رمز الجهاز للحافظة
    function copyDeviceId(feedbackId) {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(currentDeviceId).then(() => {
                showCopyFeedback(feedbackId, 'تم نسخ رمز الجهاز!');
            }).catch(() => {
                showCopyFeedback(feedbackId, 'يرجى تحديد الرمز ونسخه');
            });
        }
    }

    // نسخ نص رسالة طلب التفعيل الجاهزة
    function copyRequestMessage(feedbackId) {
        const msg = `السلام عليكم، أرغب في تفعيل برنامج الوكيل الرقمي بشكل دائم، رمز جهازي هو: ${currentDeviceId}`;
        if (navigator.clipboard) {
            navigator.clipboard.writeText(msg).then(() => {
                showCopyFeedback(feedbackId, 'تم نسخ رسالة التفعيل!');
            }).catch(() => {
                showCopyFeedback(feedbackId, 'يرجى نسخ النص يدوياً');
            });
        }
    }

    function showCopyFeedback(feedbackId, text) {
        const fb = document.getElementById(feedbackId || 'lic-copy-feedback');
        if (!fb) return;
        const originalText = fb.textContent;
        fb.textContent = text;
        fb.classList.remove('hidden');
        setTimeout(() => {
            fb.textContent = originalText;
        }, 3000);
    }

    // إغلاق التطبيق
    function exitApp() {
        try {
            if (window.ipcRenderer && typeof window.ipcRenderer.send === 'function') {
                window.ipcRenderer.send('window-close');
                return;
            }
        } catch (e) {}
        alert("لإغلاق التطبيق في الجوال أو الآيباد، اسحب من أسفل الشاشة لأعلى لفتح مبدل التطبيقات وأغلق نافذة التطبيق.");
    }

    // -------------------------------------------------------------
    // تهيئة النظام عند بدء التشغيل
    // -------------------------------------------------------------
    async function init() {
        await initDeviceId();
        await precalculateExpectedKeys(currentDeviceId);
        evaluateLicense();

        if (typeof document !== 'undefined') {
            const onReady = () => {
                createActivationModalDOM();
                updateUI();
                if (isExpired || clockTampered) {
                    lockApplication();
                }
            };

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', onReady);
            } else {
                onReady();
            }

            // فحص وتحديث دوري كل دقيقة (60 ثانية)
            setInterval(() => {
                evaluateLicense();
            }, 60000);
        }
    }

    // تشغيل النظام فورياً
    init();

    // تصدير واجهة التحكم العامة
    const exportedAPI = {
        getDeviceId: () => currentDeviceId,
        getRemainingMs: () => remainingMs,
        isActivated: () => isActivated,
        isExpired: () => isExpired,
        formatRemainingTime: formatRemainingTime,
        showActivationModal: showActivationModal,
        closeActivationModal: closeActivationModal,
        processActivationCode: processActivationCode,
        submitActivationFromInput: submitActivationFromInput,
        copyDeviceId: copyDeviceId,
        copyRequestMessage: copyRequestMessage,
        exitApp: exitApp,
        updateUI: updateUI
    };

    if (typeof window !== 'undefined') {
        window.LicenseGuard = exportedAPI;
        window.alwakeelActivated = isActivated;
        try {
            Object.defineProperty(window, 'alwakeel_activated', {
                get: () => isActivated,
                configurable: true
            });
        } catch(e) {}
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = exportedAPI;
    }

})();
/**
 * نظام واتساب المزدوج - برنامج الوكيل الرقمي
 * يدعم:
 * 1. الوضع الافتراضي: الإرسال المباشر عبر تطبيق واتساب في نفس الجهاز (جوال / آيباد) عبر رابط wa.me
 * 2. وضع الربط الخارجي: الربط مع واتساب في جهاز آخر عبر مسح رمز QR (بإدخال رابط الخادم)
 */

(function() {
    'use strict';

    window.__waMode = localStorage.getItem('wakeel_wa_mode') || 'same_device'; // 'same_device' | 'remote_qr'
    window.__waStatus = 'disconnected';
    window.__waPhone = localStorage.getItem('wakeel_wa_phone') || null;
    window.__waServerUrl = localStorage.getItem('wakeel_wa_server_url') || '';

    function formatSaudiPhone(phoneStr) {
        if (!phoneStr) return '';
        let digits = String(phoneStr).replace(/\D/g, '');
        if (digits.startsWith('05')) {
            digits = '966' + digits.substring(1);
        } else if (digits.startsWith('5') && digits.length === 9) {
            digits = '966' + digits;
        }
        return digits;
    }
    window.formatSaudiPhone = formatSaudiPhone;

    // تبديل وضع الواتساب (نفس الجهاز vs جهاز آخر عبر QR)
    window.setWhatsAppMode = function(mode) {
        window.__waMode = mode || 'same_device';
        localStorage.setItem('wakeel_wa_mode', window.__waMode);
        updateWhatsAppUI();
    };

    function updateWhatsAppUI(customStatus) {
        if (customStatus) {
            window.__waStatus = customStatus.status || window.__waStatus;
            if (customStatus.phone) window.__waPhone = customStatus.phone;
        }

        const modeSameRadio = document.getElementById('wa-mode-same-device');
        const modeRemoteRadio = document.getElementById('wa-mode-remote-qr');
        const remoteSettingsBox = document.getElementById('wa-remote-qr-settings');
        const badge = document.getElementById('wa-connection-badge');
        const statusText = document.getElementById('wa-status-text');
        const phoneDisplay = document.getElementById('wa-connected-phone-display');
        const qrContainer = document.getElementById('wa-qr-container');
        const qrLoading = document.getElementById('wa-qr-loading');
        const serverInput = document.getElementById('setting-whatsapp-gateway-url');

        if (modeSameRadio && modeRemoteRadio) {
            if (window.__waMode === 'remote_qr') {
                modeRemoteRadio.checked = true;
                if (remoteSettingsBox) remoteSettingsBox.classList.remove('hidden');
            } else {
                modeSameRadio.checked = true;
                if (remoteSettingsBox) remoteSettingsBox.classList.add('hidden');
                if (qrContainer) qrContainer.classList.add('hidden');
            }
        }

        if (serverInput && !serverInput.value && window.__waServerUrl) {
            serverInput.value = window.__waServerUrl;
        }

        if (phoneDisplay) {
            phoneDisplay.textContent = window.__waPhone || 'غير محدد';
        }

        if (window.__waMode === 'same_device') {
            if (badge) {
                badge.className = "px-3 py-1 rounded-full text-xs font-black border flex items-center gap-1.5 shadow-2xs bg-emerald-100 text-emerald-900 border-emerald-300";
            }
            if (statusText) statusText.textContent = "جاهز للإرسال المباشر 🟢";
        } else {
            // remote_qr mode
            if (window.__waStatus === 'connected') {
                if (badge) {
                    badge.className = "px-3 py-1 rounded-full text-xs font-black border flex items-center gap-1.5 shadow-2xs bg-emerald-100 text-emerald-900 border-emerald-300";
                }
                if (statusText) statusText.textContent = "متصل بالخادم 🟢";
            } else if (window.__waStatus === 'connecting') {
                if (badge) {
                    badge.className = "px-3 py-1 rounded-full text-xs font-black border flex items-center gap-1.5 shadow-2xs bg-amber-50 text-amber-800 border-amber-200";
                }
                if (statusText) statusText.textContent = "جاري الاتصال... 🟡";
            } else {
                if (badge) {
                    badge.className = "px-3 py-1 rounded-full text-xs font-black border flex items-center gap-1.5 shadow-2xs bg-slate-100 text-slate-700 border-slate-300";
                }
                if (statusText) statusText.textContent = "غير مرتبط بالخادم ⚪";
            }
        }
    }
    window.updateWhatsAppUI = updateWhatsAppUI;

    // طلب الاتصال وعرض رمز الاستجابة السريعة QR
    window.triggerWhatsAppConnect = async function() {
        const qrContainer = document.getElementById('wa-qr-container');
        const qrLoading = document.getElementById('wa-qr-loading');
        const qrImg = document.getElementById('wa-qr-image');
        const serverInput = document.getElementById('setting-whatsapp-gateway-url');
        const serverUrl = (serverInput ? serverInput.value.trim() : '') || window.__waServerUrl;

        if (!serverUrl) {
            if (qrContainer) qrContainer.classList.add('hidden');
            if (qrLoading) qrLoading.classList.add('hidden');
            alert(
                "ℹ️ إشعار إعداد الخادم:\n\n" +
                "لوضع 'الربط مع واتساب في جهاز آخر (عبر QR)'، يرجى كتابة رابط الخادم (Server URL) الخاص ببوابة الواتساب أولاً في الحقل المخصص.\n\n" +
                "💡 نصيحة: إذا كنت تستخدم التطبيق من جوالك أو الآيباد، يمكنك اختيار 'الإرسال عبر واتساب في نفس الجهاز' للإرسال الفوري المباشر دون الحاجة لأي خادم إطلاقاً!"
            );
            return;
        }

        window.__waServerUrl = serverUrl;
        localStorage.setItem('wakeel_wa_server_url', serverUrl);

        if (qrContainer) qrContainer.classList.remove('hidden');
        if (qrLoading) qrLoading.classList.remove('hidden');
        if (qrImg) qrImg.src = '';

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 7000);
            const res = await fetch(`${serverUrl.replace(/\/+$/, '')}/qr`, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (!res.ok) throw new Error(`كود الاستجابة: ${res.status}`);
            const data = await res.json();

            if (data && data.qr) {
                if (qrImg) qrImg.src = data.qr;
                if (qrLoading) qrLoading.classList.add('hidden');
                window.__waStatus = 'qr_ready';
                updateWhatsAppUI();
            } else {
                throw new Error("لم يُرجع الخادم رمز الاستجابة السريعة.");
            }
        } catch (err) {
            if (qrLoading) qrLoading.classList.add('hidden');
            if (qrContainer) qrContainer.classList.add('hidden');
            alert(`تعذر جلب رمز QR من الخادم (${serverUrl}):\n${err.message || 'يرجى التأكد من تشغيل الخادم وصحة الرابط.'}`);
        }
    };

    window.triggerWhatsAppDisconnect = function() {
        if (!confirm("هل أنت متأكد من رغبتك في إلغاء ربط الخادم الخارجي؟")) return;
        window.__waStatus = 'disconnected';
        window.__waPhone = null;
        localStorage.removeItem('wakeel_wa_phone');
        const qrContainer = document.getElementById('wa-qr-container');
        if (qrContainer) qrContainer.classList.add('hidden');
        updateWhatsAppUI();
        alert("تم إلغاء الربط بنجاح.");
    };

    window.cancelWhatsAppQR = function() {
        const qrContainer = document.getElementById('wa-qr-container');
        const qrLoading = document.getElementById('wa-qr-loading');
        if (qrLoading) qrLoading.classList.add('hidden');
        if (qrContainer) qrContainer.classList.add('hidden');
    };

    // إرسال مباشر صامت أو فتح رابط WhatsApp Web / App
    window.sendLocalDirectWhatsApp = async function(phone, message) {
        const cleanPhone = formatSaudiPhone(phone);
        if (window.__waMode === 'remote_qr' && window.__waServerUrl && window.__waStatus === 'connected') {
            const res = await fetch(`${window.__waServerUrl.replace(/\/+$/, '')}/send-message`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: cleanPhone, message: message })
            });
            return await res.json();
        }

        // الوضع الافتراضي في نفس الجهاز: فتح رابط wa.me
        const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
        window.open(waUrl, '_blank');
        return { success: true };
    };

    // تهيئة الواجهة عند اكتمال تحميل المستند
    function init() {
        updateWhatsAppUI();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();

/**
 * نظام المعاينة التفاعلية المتقدمة للطباعة وتصدير الـ PDF - مطابق لمعاينة كروميوم
 * Chromium-Style Interactive Print Preview & PDF Export Engine
 * يتيح المعاينة الواقعية الفورية لورقة A4، التحكم التفاعلي بالهوامش، تغيير التخطيط (طولي/أفقي)،
 * والتكبير والتصغير، مع خياري الطباعة الفورية والتصدير كـ PDF عالي الدقة.
 * تم تصميمه بحيث لا يترك أي أثر أو طبقة حجب في الصفحة أثناء عدم الاستخدام.
 */

(function() {
    let currentZoom = 1.0;
    let currentHtml = '';
    let currentTitle = 'مستند_مطبوع';
    let currentLandscape = false;
    let currentMargin = 'default'; // 'default', 'none', 'narrow', 'wide'

    function getElectronIPC() {
        if (typeof window !== 'undefined' && window.ipcRenderer) return window.ipcRenderer;
        if (typeof require !== 'undefined') {
            try {
                const electron = require('electron');
                return electron.ipcRenderer;
            } catch (e) {}
        }
        return null;
    }

    function getMarginConfig() {
        if (currentMargin === 'none') {
            return { marginType: 'none' };
        } else if (currentMargin === 'narrow') {
            return { marginType: 'custom', top: 0.15, bottom: 0.15, left: 0.15, right: 0.15 };
        } else if (currentMargin === 'wide') {
            return { marginType: 'custom', top: 0.8, bottom: 0.8, left: 0.8, right: 0.8 };
        }
        return { marginType: 'default' };
    }

    function buildMarginCSS() {
        if (currentMargin === 'none') {
            return '@page { margin: 0 !important; } body { padding: 2mm !important; margin: 0 !important; }';
        } else if (currentMargin === 'narrow') {
            return '@page { margin: 5mm !important; } body { padding: 4mm !important; margin: 0 !important; }';
        } else if (currentMargin === 'wide') {
            return '@page { margin: 20mm !important; } body { padding: 15mm !important; margin: 0 !important; }';
        }
        return '@page { margin: 10mm !important; } body { padding: 8mm !important; margin: 0 !important; }';
    }

    function applyMarginToSheet() {
        const sheet = document.getElementById('preview-paper-sheet');
        if (!sheet) return;

        let pad = '15mm';
        if (currentMargin === 'none') {
            pad = '3mm';
        } else if (currentMargin === 'narrow') {
            pad = '6mm';
        } else if (currentMargin === 'wide') {
            pad = '22mm';
        } else {
            pad = currentLandscape ? '10mm 14mm' : '15mm';
        }
        sheet.style.padding = pad;
    }

    function applyOrientationToSheet() {
        const sheet = document.getElementById('preview-paper-sheet');
        const btnPortrait = document.getElementById('btn-layout-portrait');
        const btnLandscape = document.getElementById('btn-layout-landscape');

        if (btnPortrait && btnLandscape) {
            if (currentLandscape) {
                btnLandscape.style.backgroundColor = '#4f46e5';
                btnLandscape.style.color = '#ffffff';
                btnPortrait.style.backgroundColor = 'transparent';
                btnPortrait.style.color = '#cbd5e1';
            } else {
                btnPortrait.style.backgroundColor = '#4f46e5';
                btnPortrait.style.color = '#ffffff';
                btnLandscape.style.backgroundColor = 'transparent';
                btnLandscape.style.color = '#cbd5e1';
            }
        }

        if (sheet) {
            if (currentLandscape) {
                sheet.style.width = '297mm';
                sheet.style.minHeight = '210mm';
            } else {
                sheet.style.width = '210mm';
                sheet.style.minHeight = '297mm';
            }
        }
        applyMarginToSheet();
    }

    /**
     * فتح نافذة المعاينة التفاعلية - يتم إنشاء العنصر وحقنه فقط عند الطلب
     */
    window.openPrintPreview = function(htmlContent, documentTitle = 'مستند_مطبوع', isLandscape = false) {
        // إزالة أي نافذة سابقة فوراً لضمان عدم تكرار العناصر
        window.closePrintPreview();

        currentHtml = htmlContent || '';
        currentTitle = (documentTitle || 'مستند_مطبوع').replace(/[\\/:*?"<>|]/g, '_');
        currentLandscape = !!isLandscape;
        currentMargin = 'default';
        currentZoom = 1.0;

        // تنقية وتكييف محتوى HTML داخل ورقة المعاينة
        const sanitizedHTML = currentHtml
            .replace(/<!DOCTYPE[^>]*>/gi, '')
            .replace(/<\/?html[^>]*>/gi, '')
            .replace(/<\/?body[^>]*>/gi, '')
            .replace(/<title>[^<]*<\/title>/gi, '');

        const modalDiv = document.createElement('div');
        modalDiv.id = 'print-preview-modal';
        modalDiv.style.cssText = 'position: fixed; inset: 0; z-index: 9999999; display: flex; flex-direction: column; background-color: rgba(15, 23, 42, 0.96); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); color: #f8fafc; font-family: "Tajawal", system-ui, sans-serif;';
        modalDiv.setAttribute('dir', 'rtl');

        modalDiv.innerHTML = `
            <!-- شريط التحكم العلوي بنمط كروميوم الاحترافي -->
            <header style="background-color: #0f172a; border-bottom: 1px solid #334155; padding: 8px 16px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; box-shadow: 0 4px 20px rgba(0,0,0,0.4); flex-shrink: 0;">
                <!-- عنوان المستند والمعاينة -->
                <div style="display: flex; align-items: center; gap: 10px;">
                    <div style="width: 36px; height: 36px; border-radius: 10px; background: linear-gradient(135deg, #4f46e5, #4338ca); color: white; display: flex; align-items: center; justify-content: center; font-size: 16px; box-shadow: 0 2px 8px rgba(79, 70, 229, 0.4); border: 1px solid rgba(255,255,255,0.15);">
                        <i class="fa-solid fa-print"></i>
                    </div>
                    <div>
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <h3 style="font-size: 13px; font-weight: 800; color: #ffffff; margin: 0; max-width: 340px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                ${currentTitle}
                            </h3>
                            <span style="font-size: 10px; background-color: rgba(99, 102, 241, 0.2); color: #a5b4fc; border: 1px solid rgba(99, 102, 241, 0.4); padding: 1px 6px; border-radius: 9999px; font-weight: bold;">مقاس A4</span>
                        </div>
                        <p style="font-size: 10.5px; color: #94a3b8; margin: 2px 0 0 0;">معاينة الورقة بنمط كروميوم مع ضبط الهوامش والتخطيط</p>
                    </div>
                </div>

                <!-- أدوات التحكم والضبط -->
                <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px; font-size: 12px;">
                    <!-- ضبط الهوامش -->
                    <div style="display: flex; align-items: center; gap: 6px; background-color: #1e293b; border: 1px solid #334155; padding: 4px 8px; border-radius: 8px;">
                        <i class="fa-solid fa-arrows-split-up-and-left" style="color: #fbbf24; font-size: 11px;"></i>
                        <span style="font-size: 11px; font-weight: bold; color: #cbd5e1;">الهوامش:</span>
                        <select id="preview-margin-select" onchange="window.setPrintPreviewMargin(this.value)" style="background-color: #0f172a; color: #fbbf24; font-size: 11px; font-weight: bold; border-radius: 6px; padding: 2px 6px; border: 1px solid #475569; outline: none; cursor: pointer;">
                            <option value="default">افتراضي (15 مم)</option>
                            <option value="narrow">ضيقة (5 مم)</option>
                            <option value="none">بدون هوامش (0 مم)</option>
                            <option value="wide">متسعة (22 مم)</option>
                        </select>
                    </div>

                    <!-- التخطيط طولي / أفقي -->
                    <div style="display: flex; align-items: center; gap: 3px; background-color: #1e293b; border: 1px solid #334155; padding: 3px; border-radius: 8px;">
                        <button type="button" id="btn-layout-portrait" onclick="window.setPrintPreviewOrientation(false)" style="padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: bold; border: none; cursor: pointer; display: flex; align-items: gap: 4px; transition: all 0.15s; background-color: ${currentLandscape ? 'transparent' : '#4f46e5'}; color: ${currentLandscape ? '#cbd5e1' : '#fff'};">
                            <i class="fa-solid fa-file"></i> طولي
                        </button>
                        <button type="button" id="btn-layout-landscape" onclick="window.setPrintPreviewOrientation(true)" style="padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: bold; border: none; cursor: pointer; display: flex; align-items: gap: 4px; transition: all 0.15s; background-color: ${currentLandscape ? '#4f46e5' : 'transparent'}; color: ${currentLandscape ? '#fff' : '#cbd5e1'};">
                            <i class="fa-solid fa-file-excel"></i> أفقي
                        </button>
                    </div>

                    <!-- التكبير -->
                    <div style="display: flex; align-items: center; gap: 4px; background-color: #1e293b; border: 1px solid #334155; padding: 3px 6px; border-radius: 8px;">
                        <button type="button" onclick="window.zoomPrintPreview(-0.1)" style="width: 22px; height: 22px; border-radius: 4px; background-color: #334155; color: #fff; border: none; cursor: pointer; font-size: 11px; display: flex; align-items: center; justify-content: center;" title="تصغير">
                            <i class="fa-solid fa-minus"></i>
                        </button>
                        <span id="preview-zoom-label" style="font-size: 11px; font-family: monospace; font-weight: bold; color: #a5b4fc; width: 40px; text-align: center;">100%</span>
                        <button type="button" onclick="window.zoomPrintPreview(0.1)" style="width: 22px; height: 22px; border-radius: 4px; background-color: #334155; color: #fff; border: none; cursor: pointer; font-size: 11px; display: flex; align-items: center; justify-content: center;" title="تكبير">
                            <i class="fa-solid fa-plus"></i>
                        </button>
                        <button type="button" onclick="window.resetPrintPreviewZoom()" style="font-size: 10px; color: #94a3b8; background-color: #0f172a; border: 1px solid #334155; border-radius: 4px; padding: 2px 6px; cursor: pointer;" title="افتراضي 100%">
                            100%
                        </button>
                    </div>
                </div>

                <!-- أزرار الإجراءات الرئيسية -->
                <div style="display: flex; align-items: center; gap: 8px;">
                    <button type="button" onclick="window.executeDirectPrint()" style="padding: 7px 14px; background-color: #059669; hover:bg-emerald-500; color: white; font-size: 12px; font-weight: 800; border-radius: 8px; border: 1px solid rgba(255,255,255,0.2); cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 4px 10px rgba(5, 150, 105, 0.4);">
                        <i class="fa-solid fa-print"></i>
                        <span>طباعة الآن</span>
                    </button>

                    <button type="button" onclick="window.executeExportPDF()" style="padding: 7px 14px; background-color: #dc2626; color: white; font-size: 12px; font-weight: 800; border-radius: 8px; border: 1px solid rgba(255,255,255,0.2); cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 4px 10px rgba(220, 38, 38, 0.4);">
                        <i class="fa-solid fa-file-pdf"></i>
                        <span>حفظ كـ PDF</span>
                    </button>

                    <button type="button" onclick="window.closePrintPreview()" style="width: 32px; height: 32px; border-radius: 8px; background-color: #1e293b; color: #94a3b8; border: 1px solid #334155; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 14px;" title="إغلاق المعاينة (Esc)">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
            </header>

            <!-- وعاء المعاينة والتمرير -->
            <div id="preview-scroll-wrapper" style="flex: 1; overflow: auto; padding: 24px; display: flex; justify-content: center; align-items: flex-start; background-color: rgba(15, 23, 42, 0.85);">
                <div id="preview-zoom-container" style="transition: transform 0.1s ease-out; transform-origin: top center; margin: 0 auto;">
                    <!-- ورقة الـ A4 الواقعية -->
                    <div id="preview-paper-sheet" style="background-color: #ffffff; color: #0f172a; box-shadow: 0 20px 40px rgba(0,0,0,0.6); border: 1px solid #cbd5e1; position: relative; margin: 0 auto; box-sizing: border-box; width: ${currentLandscape ? '297mm' : '210mm'}; min-height: ${currentLandscape ? '210mm' : '297mm'}; padding: 15mm;">
                        <div id="preview-sheet-content" style="width: 100%; height: 100%; font-family: 'Tajawal', sans-serif;">
                            ${sanitizedHTML}
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modalDiv);
        applyMarginToSheet();

        // إغلاق المعاينة بزر Escape
        const escHandler = (e) => {
            if (e && e.key === 'Escape') {
                window.closePrintPreview();
                if (typeof window.removeEventListener === 'function') {
                    window.removeEventListener('keydown', escHandler);
                }
            }
        };
        if (typeof window.addEventListener === 'function') {
            window.addEventListener('keydown', escHandler);
        }
    };

    /**
     * إغلاق نافذة المعاينة وإزالتها تماماً من الـ DOM لمنع أي حجب لعناصر الصفحة
     */
    window.closePrintPreview = function() {
        const modal = document.getElementById('print-preview-modal');
        if (modal) {
            modal.remove();
        }
        if (typeof window.restoreAppFocusAndUnfreeze === 'function') {
            window.restoreAppFocusAndUnfreeze();
        }
    };

    window.setPrintPreviewMargin = function(marginType) {
        currentMargin = marginType || 'default';
        applyMarginToSheet();
    };

    window.setPrintPreviewOrientation = function(isLandscape) {
        currentLandscape = !!isLandscape;
        applyOrientationToSheet();
    };

    window.zoomPrintPreview = function(delta) {
        currentZoom = Math.min(2.5, Math.max(0.4, currentZoom + delta));
        window.updatePrintPreviewZoomUI();
    };

    window.resetPrintPreviewZoom = function() {
        currentZoom = 1.0;
        window.updatePrintPreviewZoomUI();
    };

    window.updatePrintPreviewZoomUI = function() {
        const zoomContainer = document.getElementById('preview-zoom-container');
        const zoomLabel = document.getElementById('preview-zoom-label');
        if (zoomContainer) {
            zoomContainer.style.transform = `scale(${currentZoom})`;
        }
        if (zoomLabel) {
            zoomLabel.textContent = `${Math.round(currentZoom * 100)}%`;
        }
    };

    function injectPrintStyles(htmlContent) {
        const marginCSS = buildMarginCSS();
        const orientationCSS = currentLandscape ? '@page { size: A4 landscape !important; }' : '@page { size: A4 portrait !important; }';
        const overrideStyle = `<style>${orientationCSS} ${marginCSS}</style>`;
        return overrideStyle + htmlContent;
    }

    /**
     * تنفيذ الطباعة عبر IPC أو المتصفح - لا تُستدعى إلا عند ضغط المستخدم الصريح على زر الطباعة
     */
    window.executeDirectPrint = async function() {
        const ipc = getElectronIPC();
        const fullContent = injectPrintStyles(currentHtml);

        const printArea = document.getElementById('printArea');
        if (printArea) {
            printArea.innerHTML = fullContent;
        }

        if (ipc) {
            try {
                await ipc.invoke('app-print', {
                    pageSize: 'A4',
                    landscape: currentLandscape,
                    margins: getMarginConfig()
                });
                if (typeof window.restoreAppFocusAndUnfreeze === 'function') {
                    window.restoreAppFocusAndUnfreeze();
                }
                return;
            } catch (err) {
                console.warn('IPC Print error, fallback to window.print():', err);
            }
        }

        window.__userExplicitPrint = true;
        setTimeout(() => {
            window.print();
        }, 150);
    };

    /**
     * تصدير المستند كملف PDF عالي الجودة
     */
    window.executeExportPDF = async function() {
        const ipc = getElectronIPC();
        const fullContent = injectPrintStyles(currentHtml);

        const printArea = document.getElementById('printArea');
        if (printArea) {
            printArea.innerHTML = fullContent;
        }

        if (ipc) {
            try {
                const res = await ipc.invoke('app-save-pdf', {
                    title: currentTitle,
                    pageSize: 'A4',
                    landscape: currentLandscape,
                    margins: getMarginConfig()
                });

                if (res && res.success) {
                    alert(`✅ تم تصدير وحفظ ملف الـ PDF بنجاح في:\n${res.filePath}`);
                    return;
                } else if (res && res.cancelled) {
                    return;
                }
            } catch (err) {
                console.warn('IPC PDF export error, fallback:', err);
            }
        }

        alert("💡 يمكنك اختيار (حفظ بتنسيق PDF / Save as PDF) من نافذة الطباعة التي ستظهر الآن.");
        window.__userExplicitPrint = true;
        setTimeout(() => {
            window.print();
        }, 150);
    };

    // اعتراض استدعاءات window.open الموجهة لطباعة التقارير
    const originalWindowOpen = window.open;
    window.open = function(url, target, features) {
        // إذا كان الرابط خارجياً (مثل محادثة واتساب)، فتح الرابط بشكل طبيعي دون اعتراض
        if (url && url !== '' && url !== 'about:blank') {
            return originalWindowOpen.apply(window, arguments);
        }

        let buffer = '';
        let docTitle = 'مستند_مطبوع';
        let isOpened = false;

        const fakeWindow = {
            closed: false,
            document: {
                open: function() { buffer = ''; },
                write: function(chunk) {
                    buffer += String(chunk || '');
                    const m = buffer.match(/<title>([^<]+)<\/title>/i);
                    if (m && m[1]) docTitle = m[1].trim();
                },
                close: function() {
                    if (!isOpened) {
                        isOpened = true;
                        const isLandscape = (features && (features.includes('1100') || features.includes('1000'))) || buffer.includes('landscape') || buffer.includes('size: A4 landscape');
                        setTimeout(() => {
                            window.openPrintPreview(buffer, docTitle, isLandscape);
                        }, 30);
                    }
                },
                getElementById: function() { return null; },
                getElementsByTagName: function() { return []; },
                body: { style: {} },
                head: { appendChild: function() {} }
            },
            focus: function() {},
            print: function() {
                // منع تام لأي استدعاء طباعة تلقائي عند فتح المستند
            },
            close: function() {
                fakeWindow.closed = true;
            },
            addEventListener: function() {},
            removeEventListener: function() {}
        };
        return fakeWindow;
    };

    // تأمين عمل نافذة الطباعة المباشرة في المتصفحات والجوال والآيباد
    const originalPrint = window.print;
    window.__allowExplicitPrint = function() {
        window.__userExplicitPrint = true;
    };

    window.print = function() {
        originalPrint.apply(window, arguments);
    };

    console.log('✅ [Print Preview Engine] محرك معاينة الطباعة التفاعلي بنمط كروميوم وضبط الهوامش جاهز ومفعل.');
})();

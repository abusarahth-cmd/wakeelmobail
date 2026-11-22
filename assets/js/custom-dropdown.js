/**
 * Universal In-Page Custom Dropdown Polyfill for Electron / Desktop
 * 
 * يستبدل القوائم المنبثقة الافتراضية للنظام (Native OS Select Popup)
 * بقائمة منسدلة داخلية تفاعلية وسلسة (In-Page HTML Dropdown)
 * تعمل بكفاءة 100% داخل Electron على ويندوز دون أي تجميد أو إعاقة.
 */
(function() {
    'use strict';

    let activeSelect = null;
    let dropdownPanel = null;
    let searchInput = null;
    let listContainer = null;
    let highlightedIndex = -1;

    function getOrCreateDropdownPanel() {
        if (dropdownPanel && document.body.contains(dropdownPanel)) {
            return dropdownPanel;
        }

        dropdownPanel = document.createElement('div');
        dropdownPanel.id = 'app-custom-dropdown-panel';
        dropdownPanel.style.cssText = `
            position: fixed;
            z-index: 2147483647;
            background: #ffffff;
            border: 2px solid #6366f1;
            border-radius: 12px;
            box-shadow: 0 16px 36px -4px rgba(15, 23, 42, 0.3), 0 6px 16px rgba(0, 0, 0, 0.12);
            display: none;
            flex-direction: column;
            overflow: hidden;
            font-family: 'Tajawal', system-ui, sans-serif;
            direction: rtl;
            text-align: right;
            box-sizing: border-box;
            max-width: 95vw;
            animation: customDropdownFadeIn 0.12s ease-out;
        `;

        // إضافة ستايل حركة الظهور السلسة وشريط التمرير الأنيق
        if (!document.getElementById('custom-dropdown-styles')) {
            const style = document.createElement('style');
            style.id = 'custom-dropdown-styles';
            style.textContent = `
                @keyframes customDropdownFadeIn {
                    from { opacity: 0; transform: translateY(-4px) scale(0.99); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
                #app-custom-dropdown-panel .dropdown-list::-webkit-scrollbar {
                    width: 7px;
                }
                #app-custom-dropdown-panel .dropdown-list::-webkit-scrollbar-track {
                    background: #f1f5f9;
                    border-radius: 8px;
                }
                #app-custom-dropdown-panel .dropdown-list::-webkit-scrollbar-thumb {
                    background: #cbd5e1;
                    border-radius: 8px;
                }
                #app-custom-dropdown-panel .dropdown-list::-webkit-scrollbar-thumb:hover {
                    background: #94a3b8;
                }
                .custom-dropdown-item {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 8px 12px;
                    font-size: 13px;
                    font-weight: 600;
                    color: #1e293b;
                    cursor: pointer;
                    transition: background-color 0.08s ease, color 0.08s ease;
                    user-select: none;
                    border-bottom: 1px solid #f8fafc;
                }
                .custom-dropdown-item:last-child {
                    border-bottom: none;
                }
                .custom-dropdown-item:hover, .custom-dropdown-item.is-highlighted {
                    background-color: #eef2ff !important;
                    color: #4338ca !important;
                }
                .custom-dropdown-item.is-selected {
                    background-color: #f5f3ff;
                    color: #4f46e5;
                    font-weight: 800;
                }
                .custom-dropdown-item.is-disabled {
                    opacity: 0.45;
                    cursor: not-allowed;
                    background: transparent !important;
                    color: #94a3b8 !important;
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(dropdownPanel);
        return dropdownPanel;
    }

    function closeCustomDropdown() {
        if (dropdownPanel) {
            dropdownPanel.style.display = 'none';
            dropdownPanel.innerHTML = '';
        }
        if (activeSelect) {
            activeSelect.classList.remove('custom-dropdown-active');
            activeSelect = null;
        }
        highlightedIndex = -1;
    }

    function positionDropdown(select, panel) {
        const rect = select.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // حساب العرض المناسب
        const minWidth = Math.max(rect.width, 240);
        const panelWidth = Math.min(minWidth, viewportWidth - 24);
        panel.style.width = panelWidth + 'px';

        // محاذاة أفقية مع الـ select مع احترام حدود الشاشة
        let left = rect.left;
        if (left + panelWidth > viewportWidth - 12) {
            left = viewportWidth - panelWidth - 12;
        }
        if (left < 12) left = 12;
        panel.style.left = left + 'px';

        // حساب المساحة الرأسية المتاحة (فوق وتحت)
        const spaceBelow = viewportHeight - rect.bottom - 12;
        const spaceAbove = rect.top - 12;

        if (spaceBelow >= 180 || spaceBelow >= spaceAbove) {
            // فتح للأسفل
            panel.style.top = (rect.bottom + 4) + 'px';
            panel.style.bottom = 'auto';
            const maxHeight = Math.min(320, spaceBelow);
            panel.style.maxHeight = maxHeight + 'px';
        } else {
            // فتح للأعلى
            panel.style.top = 'auto';
            panel.style.bottom = (viewportHeight - rect.top + 4) + 'px';
            const maxHeight = Math.min(320, spaceAbove);
            panel.style.maxHeight = maxHeight + 'px';
        }
    }

    function renderOptions(options, selectedValue, filterText = '') {
        listContainer.innerHTML = '';
        const searchNormalized = filterText.trim().toLowerCase();

        let visibleCount = 0;
        const items = [];

        Array.from(options).forEach((opt, idx) => {
            const text = opt.text || '';
            const val = opt.value;
            const isMatch = !searchNormalized || text.toLowerCase().includes(searchNormalized) || val.toLowerCase().includes(searchNormalized);

            if (!isMatch) return;
            visibleCount++;

            const item = document.createElement('div');
            item.className = 'custom-dropdown-item';
            item.dataset.index = idx;
            item.dataset.value = val;

            const isSelected = (val === selectedValue) || (idx === activeSelect.selectedIndex);
            if (isSelected) {
                item.classList.add('is-selected');
            }
            if (opt.disabled) {
                item.classList.add('is-disabled');
            }

            // النص وعلامة الاختيار
            item.innerHTML = `
                <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;">${escapeHTML(text)}</span>
                ${isSelected ? '<i class="fa-solid fa-check text-indigo-600 mr-2 shrink-0" style="font-size: 11px;"></i>' : ''}
            `;

            item.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (opt.disabled) return;
                selectOption(opt, idx);
            });

            listContainer.appendChild(item);
            items.push(item);
        });

        if (visibleCount === 0) {
            const emptyNotice = document.createElement('div');
            emptyNotice.style.cssText = 'padding: 14px; text-align: center; color: #94a3b8; font-size: 12px; font-weight: bold;';
            emptyNotice.textContent = 'لا توجد نتائج مطابقة للبحث';
            listContainer.appendChild(emptyNotice);
        }

        // تمرير إلى العنصر المحدد تلقائياً
        setTimeout(() => {
            const selectedItem = listContainer.querySelector('.is-selected');
            if (selectedItem) {
                selectedItem.scrollIntoView({ block: 'nearest' });
            }
        }, 10);
    }

    function escapeHTML(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function selectOption(opt, idx) {
        if (!activeSelect) return;
        const targetSelect = activeSelect;

        targetSelect.selectedIndex = idx;
        targetSelect.value = opt.value;

        // إطلاق الأحداث القياسية للمتصفح ليتم تفعيل كل منطق النظام
        targetSelect.dispatchEvent(new Event('input', { bubbles: true }));
        targetSelect.dispatchEvent(new Event('change', { bubbles: true }));

        if (typeof targetSelect.onchange === 'function') {
            try {
                targetSelect.onchange(new Event('change'));
            } catch (err) {
                console.error("onchange trigger error:", err);
            }
        }

        closeCustomDropdown();
        try { targetSelect.focus(); } catch(e) {}
    }

    function openCustomDropdown(select) {
        if (!select || select.disabled) return;

        // إذا كانت نفس القائمة مفتوحة، يتم إغلاقها (Toggle)
        if (activeSelect === select && dropdownPanel && dropdownPanel.style.display !== 'none') {
            closeCustomDropdown();
            return;
        }

        closeCustomDropdown();
        activeSelect = select;
        activeSelect.classList.add('custom-dropdown-active');

        const panel = getOrCreateDropdownPanel();
        panel.innerHTML = '';

        const options = select.options;
        const hasManyOptions = options.length > 8;

        // صندوق بحث سريع مدمج إذا كانت القائمة تحتوي على خيارات كثيرة (مثل قائمة الطلاب)
        if (hasManyOptions) {
            const searchBoxWrapper = document.createElement('div');
            searchBoxWrapper.style.cssText = 'padding: 8px 10px; border-bottom: 1px solid #e2e8f0; background: #f8fafc; position: sticky; top: 0; z-index: 2;';

            searchInput = document.createElement('input');
            searchInput.type = 'text';
            searchInput.placeholder = '🔍 ابحث في الخيارات...';
            searchInput.style.cssText = `
                width: 100%;
                border: 1.5px solid #cbd5e1;
                border-radius: 8px;
                padding: 6px 10px;
                font-size: 12px;
                font-weight: bold;
                background: #ffffff;
                color: #0f172a;
                outline: none;
                box-sizing: border-box;
                font-family: 'Tajawal', sans-serif;
                direction: rtl;
                text-align: right;
            `;

            searchInput.addEventListener('input', () => {
                renderOptions(options, select.value, searchInput.value);
            });

            // منع إغلاق القائمة عند النقر داخل مربع البحث
            searchInput.addEventListener('click', (e) => e.stopPropagation());
            searchInput.addEventListener('mousedown', (e) => e.stopPropagation());

            searchBoxWrapper.appendChild(searchInput);
            panel.appendChild(searchBoxWrapper);
        }

        // وعاء قائمة الخيارات مع تمرير أنيق
        listContainer = document.createElement('div');
        listContainer.className = 'dropdown-list';
        listContainer.style.cssText = 'flex: 1; overflow-y: auto; max-height: 260px; -webkit-overflow-scrolling: touch;';
        panel.appendChild(listContainer);

        // تعبئة الخيارات
        renderOptions(options, select.value);

        // ضبط موضع القائمة وإظهارها
        positionDropdown(select, panel);
        panel.style.display = 'flex';

        // تركيز المؤشر في مربع البحث إذا وجد
        if (searchInput) {
            setTimeout(() => searchInput.focus(), 30);
        }
    }

    // المعالج العام للنقر على أي عنصر select
    function handleSelectClickOrMousedown(e) {
        const target = e.target;
        if (!target) return;

        const select = (target.tagName === 'SELECT') ? target : (target.closest ? target.closest('select') : null);
        if (!select || select.disabled) return;

        // اعتراض الحدث بالكامل لمنع محاولة Chromium الفاشلة لفتح نافذة النظام
        e.preventDefault();
        e.stopPropagation();

        openCustomDropdown(select);
    }

    // الاستماع للنقر في مرحلة الالتقاط (Capture phase) لضمان الأسبقية
    document.addEventListener('mousedown', (e) => {
        const target = e.target;
        const select = target ? ((target.tagName === 'SELECT') ? target : (target.closest ? target.closest('select') : null)) : null;

        if (select) {
            handleSelectClickOrMousedown(e);
            return;
        }

        // إغلاق القائمة عند النقر خارجها
        if (dropdownPanel && dropdownPanel.style.display !== 'none') {
            if (!dropdownPanel.contains(target)) {
                closeCustomDropdown();
            }
        }
    }, true);

    document.addEventListener('click', (e) => {
        const target = e.target;
        const select = target ? ((target.tagName === 'SELECT') ? target : (target.closest ? target.closest('select') : null)) : null;
        if (select) {
            e.preventDefault();
            e.stopPropagation();
        }
    }, true);

    // إغلاق القائمة بالضغط على Escape والتنقل بالأسهم
    document.addEventListener('keydown', (e) => {
        if (!dropdownPanel || dropdownPanel.style.display === 'none') return;

        if (e.key === 'Escape') {
            closeCustomDropdown();
            return;
        }

        const items = Array.from(listContainer.querySelectorAll('.custom-dropdown-item:not(.is-disabled)'));
        if (items.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            highlightedIndex = (highlightedIndex + 1) % items.length;
            updateHighlight(items);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            highlightedIndex = (highlightedIndex - 1 + items.length) % items.length;
            updateHighlight(items);
        } else if (e.key === 'Enter') {
            if (highlightedIndex >= 0 && highlightedIndex < items.length) {
                e.preventDefault();
                items[highlightedIndex].click();
            }
        }
    });

    function updateHighlight(items) {
        items.forEach((it, idx) => {
            if (idx === highlightedIndex) {
                it.classList.add('is-highlighted');
                it.scrollIntoView({ block: 'nearest' });
            } else {
                it.classList.remove('is-highlighted');
            }
        });
    }

    // إعادة ضبط موضع القائمة أو إغلاقها عند التمرير أو تغيير أبعاد النافذة
    window.addEventListener('resize', () => {
        if (activeSelect && dropdownPanel && dropdownPanel.style.display !== 'none') {
            positionDropdown(activeSelect, dropdownPanel);
        }
    }, { passive: true });

    window.addEventListener('scroll', () => {
        if (activeSelect && dropdownPanel && dropdownPanel.style.display !== 'none') {
            positionDropdown(activeSelect, dropdownPanel);
        }
    }, { passive: true, capture: true });

    // إتاحة الدالة في النطاق العام إذا دعت الحاجة لفتحها برمجياً
    window.openCustomDropdown = openCustomDropdown;
    window.closeCustomDropdown = closeCustomDropdown;

    console.log("✅ [Custom Dropdown Polyfill] تم تفعيل محرك القوائم المنسدلة الداخلي بنجاح.");
})();

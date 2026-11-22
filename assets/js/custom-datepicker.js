/**
 * Universal In-Page Custom DatePicker Polyfill for Electron / Desktop
 * 
 * يتيح اختيار التاريخ بسلاسة عبر تقويم داخلي تفاعلي مستقل بنمط HTML/CSS/JS
 * يحل مشكلة تعطل نافذة التقويم الافتراضية (Native Date Picker) داخل Electron على ويندوز.
 */
(function() {
    'use strict';

    let activeInput = null;
    let calendarPanel = null;
    let viewYear = new Date().getFullYear();
    let viewMonth = new Date().getMonth(); // 0-11

    const AR_MONTHS = [
        'يناير (1)', 'فبراير (2)', 'مارس (3)', 'أبريل (4)',
        'مايو (5)', 'يونيو (6)', 'يوليو (7)', 'أغسطس (8)',
        'سبتمبر (9)', 'أكتوبر (10)', 'نوفمبر (11)', 'ديسمبر (12)'
    ];

    const AR_WEEKDAYS = ['أحد', 'إثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];

    function getOrCreateCalendarPanel() {
        if (calendarPanel && document.body.contains(calendarPanel)) {
            return calendarPanel;
        }

        calendarPanel = document.createElement('div');
        calendarPanel.id = 'app-custom-datepicker-panel';
        calendarPanel.style.cssText = `
            position: fixed;
            z-index: 2147483640;
            background: #ffffff;
            border: 2px solid #6366f1;
            border-radius: 14px;
            box-shadow: 0 18px 40px -4px rgba(15, 23, 42, 0.35), 0 8px 18px rgba(0, 0, 0, 0.15);
            display: none;
            flex-direction: column;
            width: 290px;
            max-width: 95vw;
            padding: 12px;
            font-family: 'Tajawal', system-ui, sans-serif;
            direction: rtl;
            text-align: right;
            box-sizing: border-box;
            animation: datePickerFadeIn 0.12s ease-out;
            user-select: none;
        `;

        if (!document.getElementById('custom-datepicker-styles')) {
            const style = document.createElement('style');
            style.id = 'custom-datepicker-styles';
            style.textContent = `
                @keyframes datePickerFadeIn {
                    from { opacity: 0; transform: translateY(-4px) scale(0.98); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
                .datepicker-nav-btn {
                    width: 28px;
                    height: 28px;
                    border-radius: 8px;
                    border: 1px solid #e2e8f0;
                    background: #f8fafc;
                    color: #475569;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    font-size: 11px;
                    transition: all 0.1s ease;
                }
                .datepicker-nav-btn:hover {
                    background: #eef2ff;
                    color: #4338ca;
                    border-color: #c7d2fe;
                }
                .datepicker-header-select {
                    border: 1px solid #cbd5e1;
                    border-radius: 7px;
                    padding: 3px 6px;
                    font-size: 12px;
                    font-weight: 700;
                    background: #ffffff;
                    color: #0f172a;
                    font-family: 'Tajawal', sans-serif;
                    outline: none;
                    cursor: pointer;
                }
                .datepicker-day-cell {
                    height: 32px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 12px;
                    font-weight: 700;
                    border-radius: 8px;
                    cursor: pointer;
                    transition: all 0.08s ease;
                    color: #1e293b;
                }
                .datepicker-day-cell:hover:not(.is-empty):not(.is-disabled) {
                    background: #e0e7ff;
                    color: #3730a3;
                }
                .datepicker-day-cell.is-selected {
                    background: #4f46e5 !important;
                    color: #ffffff !important;
                    box-shadow: 0 2px 6px rgba(79, 70, 229, 0.4);
                }
                .datepicker-day-cell.is-today:not(.is-selected) {
                    border: 1.5px solid #6366f1;
                    color: #4338ca;
                    background: #f5f3ff;
                }
                .datepicker-day-cell.is-empty {
                    cursor: default;
                    opacity: 0;
                    pointer-events: none;
                }
                .datepicker-day-cell.is-disabled {
                    opacity: 0.3;
                    cursor: not-allowed;
                    pointer-events: none;
                }
                .datepicker-quick-btn {
                    padding: 4px 10px;
                    font-size: 11px;
                    font-weight: 700;
                    border-radius: 6px;
                    border: none;
                    cursor: pointer;
                    transition: background-color 0.1s ease;
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(calendarPanel);
        return calendarPanel;
    }

    function closeCustomDatePicker() {
        if (calendarPanel) {
            calendarPanel.style.display = 'none';
            calendarPanel.innerHTML = '';
        }
        if (activeInput) {
            activeInput.classList.remove('custom-datepicker-active');
            activeInput = null;
        }
    }

    function positionDatePicker(input, panel) {
        const rect = input.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const panelWidth = 290;

        let left = rect.left;
        if (left + panelWidth > viewportWidth - 12) {
            left = viewportWidth - panelWidth - 12;
        }
        if (left < 12) left = 12;
        panel.style.left = left + 'px';

        const spaceBelow = viewportHeight - rect.bottom - 12;
        const spaceAbove = rect.top - 12;

        if (spaceBelow >= 300 || spaceBelow >= spaceAbove) {
            panel.style.top = (rect.bottom + 4) + 'px';
            panel.style.bottom = 'auto';
        } else {
            panel.style.top = 'auto';
            panel.style.bottom = (viewportHeight - rect.top + 4) + 'px';
        }
    }

    function padZero(num) {
        return num < 10 ? '0' + num : String(num);
    }

    function parseInputDate(val) {
        if (!val || typeof val !== 'string') return null;
        const parts = val.trim().split('-');
        if (parts.length === 3) {
            const y = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10) - 1;
            const d = parseInt(parts[2], 10);
            if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
                return { year: y, month: m, day: d };
            }
        }
        return null;
    }

    function selectDate(year, month, day) {
        if (!activeInput) return;
        const targetInput = activeInput;

        const dateStr = `${year}-${padZero(month + 1)}-${padZero(day)}`;
        targetInput.value = dateStr;

        targetInput.dispatchEvent(new Event('input', { bubbles: true }));
        targetInput.dispatchEvent(new Event('change', { bubbles: true }));

        if (typeof targetInput.oninput === 'function') {
            try { targetInput.oninput(new Event('input')); } catch(e) {}
        }
        if (typeof targetInput.onchange === 'function') {
            try { targetInput.onchange(new Event('change')); } catch(e) {}
        }

        closeCustomDatePicker();
        try { targetInput.focus(); } catch(e) {}
    }

    function renderCalendar() {
        if (!calendarPanel || !activeInput) return;
        calendarPanel.innerHTML = '';

        const selectedDate = parseInputDate(activeInput.value);
        const today = new Date();
        const todayYear = today.getFullYear();
        const todayMonth = today.getMonth();
        const todayDay = today.getDate();

        // 1. الشريط العلوي: أزرار التنقل واختيار الشهر والسنة
        const header = document.createElement('div');
        header.style.cssText = 'display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; gap: 4px;';

        // زر الشهر التالي (يسار في RTL)
        const nextBtn = document.createElement('button');
        nextBtn.type = 'button';
        nextBtn.className = 'datepicker-nav-btn';
        nextBtn.title = 'الشهر التالي';
        nextBtn.innerHTML = '<i class="fa-solid fa-chevron-left"></i>';
        nextBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            viewMonth++;
            if (viewMonth > 11) {
                viewMonth = 0;
                viewYear++;
            }
            renderCalendar();
        });

        // وعاء اختيار الشهر والسنة
        const selectsWrap = document.createElement('div');
        selectsWrap.style.cssText = 'display: flex; align-items: center; gap: 4px;';

        const monthSelect = document.createElement('select');
        monthSelect.className = 'datepicker-header-select';
        AR_MONTHS.forEach((mName, idx) => {
            const opt = document.createElement('option');
            opt.value = idx;
            opt.textContent = mName;
            if (idx === viewMonth) opt.selected = true;
            monthSelect.appendChild(opt);
        });
        monthSelect.value = String(viewMonth);

        const applyMonthSelection = (val) => {
            const selectedMonthIndex = parseInt(val, 10);
            if (!isNaN(selectedMonthIndex) && selectedMonthIndex >= 0 && selectedMonthIndex <= 11) {
                viewMonth = selectedMonthIndex;
                if (typeof window.closeCustomDropdown === 'function') {
                    try { window.closeCustomDropdown(); } catch (err) {}
                }
                renderCalendar();
            }
        };

        monthSelect.addEventListener('change', (e) => {
            if (e && e.stopPropagation) e.stopPropagation();
            applyMonthSelection(monthSelect.value);
        });
        monthSelect.addEventListener('input', (e) => {
            if (e && e.stopPropagation) e.stopPropagation();
            applyMonthSelection(monthSelect.value);
        });
        monthSelect.onchange = (e) => {
            if (e && e.stopPropagation) e.stopPropagation();
            applyMonthSelection(monthSelect.value);
        };
        monthSelect.addEventListener('click', (e) => e.stopPropagation());
        monthSelect.addEventListener('mousedown', (e) => e.stopPropagation());

        const yearSelect = document.createElement('select');
        yearSelect.className = 'datepicker-header-select';
        const curYear = new Date().getFullYear();
        const startYear = Math.min(viewYear - 5, curYear - 15);
        const endYear = Math.max(viewYear + 5, curYear + 15);
        for (let y = startYear; y <= endYear; y++) {
            const opt = document.createElement('option');
            opt.value = y;
            opt.textContent = y;
            if (y === viewYear) opt.selected = true;
            yearSelect.appendChild(opt);
        }
        yearSelect.value = String(viewYear);

        const applyYearSelection = (val) => {
            const selectedYear = parseInt(val, 10);
            if (!isNaN(selectedYear) && selectedYear > 1900 && selectedYear < 2200) {
                viewYear = selectedYear;
                if (typeof window.closeCustomDropdown === 'function') {
                    try { window.closeCustomDropdown(); } catch (err) {}
                }
                renderCalendar();
            }
        };

        yearSelect.addEventListener('change', (e) => {
            if (e && e.stopPropagation) e.stopPropagation();
            applyYearSelection(yearSelect.value);
        });
        yearSelect.addEventListener('input', (e) => {
            if (e && e.stopPropagation) e.stopPropagation();
            applyYearSelection(yearSelect.value);
        });
        yearSelect.onchange = (e) => {
            if (e && e.stopPropagation) e.stopPropagation();
            applyYearSelection(yearSelect.value);
        };
        yearSelect.addEventListener('click', (e) => e.stopPropagation());
        yearSelect.addEventListener('mousedown', (e) => e.stopPropagation());

        selectsWrap.appendChild(monthSelect);
        selectsWrap.appendChild(yearSelect);

        // زر الشهر السابق (يمين في RTL)
        const prevBtn = document.createElement('button');
        prevBtn.type = 'button';
        prevBtn.className = 'datepicker-nav-btn';
        prevBtn.title = 'الشهر السابق';
        prevBtn.innerHTML = '<i class="fa-solid fa-chevron-right"></i>';
        prevBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            viewMonth--;
            if (viewMonth < 0) {
                viewMonth = 11;
                viewYear--;
            }
            renderCalendar();
        });

        header.appendChild(prevBtn);
        header.appendChild(selectsWrap);
        header.appendChild(nextBtn);
        calendarPanel.appendChild(header);

        // 2. أسماء أيام الأسبوع
        const weekdaysGrid = document.createElement('div');
        weekdaysGrid.style.cssText = 'display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; margin-bottom: 6px; text-align: center;';
        AR_WEEKDAYS.forEach(w => {
            const el = document.createElement('div');
            el.style.cssText = 'font-size: 11px; font-weight: 800; color: #64748b; padding: 4px 0;';
            el.textContent = w;
            weekdaysGrid.appendChild(el);
        });
        calendarPanel.appendChild(weekdaysGrid);

        // 3. شبكة أيام الشهر
        const daysGrid = document.createElement('div');
        daysGrid.style.cssText = 'display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px; margin-bottom: 10px;';

        const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay(); // 0 (Sun) - 6 (Sat)
        const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

        // خلايا فارغة قبل بداية الشهر
        for (let i = 0; i < firstDayOfWeek; i++) {
            const emptyCell = document.createElement('div');
            emptyCell.className = 'datepicker-day-cell is-empty';
            daysGrid.appendChild(emptyCell);
        }

        // أيام الشهر
        for (let day = 1; day <= daysInMonth; day++) {
            const dayCell = document.createElement('div');
            dayCell.className = 'datepicker-day-cell';
            dayCell.textContent = day;

            const isSelected = selectedDate && (selectedDate.year === viewYear && selectedDate.month === viewMonth && selectedDate.day === day);
            const isToday = (todayYear === viewYear && todayMonth === viewMonth && todayDay === day);

            if (isSelected) dayCell.classList.add('is-selected');
            if (isToday) dayCell.classList.add('is-today');

            // التحقق من min / max إن وجد (مع استثناء حقول تواريخ الإجراءات للسماح بالتواريخ السابقة بحرية)
            const thisDateStr = `${viewYear}-${padZero(viewMonth + 1)}-${padZero(day)}`;
            const isActionDateInput = activeInput.id && activeInput.id.startsWith('act-date-');
            if (!isActionDateInput && activeInput.min && thisDateStr < activeInput.min) {
                dayCell.classList.add('is-disabled');
            }
            if (!isActionDateInput && activeInput.max && thisDateStr > activeInput.max) {
                dayCell.classList.add('is-disabled');
            }

            dayCell.addEventListener('click', (e) => {
                e.stopPropagation();
                selectDate(viewYear, viewMonth, day);
            });

            daysGrid.appendChild(dayCell);
        }
        calendarPanel.appendChild(daysGrid);

        // 4. أزرار الإجراءات السريعة (اليوم / مسح / إغلاق)
        const footer = document.createElement('div');
        footer.style.cssText = 'display: flex; align-items: center; justify-content: space-between; border-top: 1px solid #f1f5f9; padding-top: 8px; gap: 6px;';

        const todayBtn = document.createElement('button');
        todayBtn.type = 'button';
        todayBtn.className = 'datepicker-quick-btn';
        todayBtn.style.cssText = 'background: #eef2ff; color: #4338ca;';
        todayBtn.innerHTML = '<i class="fa-solid fa-calendar-day ml-1"></i> اليوم';
        todayBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const now = new Date();
            selectDate(now.getFullYear(), now.getMonth(), now.getDate());
        });

        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'datepicker-quick-btn';
        clearBtn.style.cssText = 'background: #fef2f2; color: #b91c1c;';
        clearBtn.innerHTML = '<i class="fa-solid fa-eraser ml-1"></i> مسح';
        clearBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (activeInput) {
                activeInput.value = '';
                activeInput.dispatchEvent(new Event('input', { bubbles: true }));
                activeInput.dispatchEvent(new Event('change', { bubbles: true }));
                if (typeof activeInput.oninput === 'function') activeInput.oninput(new Event('input'));
                if (typeof activeInput.onchange === 'function') activeInput.onchange(new Event('change'));
            }
            closeCustomDatePicker();
        });

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'datepicker-quick-btn';
        closeBtn.style.cssText = 'background: #f1f5f9; color: #475569;';
        closeBtn.textContent = 'إغلاق';
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            closeCustomDatePicker();
        });

        footer.appendChild(todayBtn);
        footer.appendChild(clearBtn);
        footer.appendChild(closeBtn);
        calendarPanel.appendChild(footer);
    }

    function openCustomDatePicker(input) {
        if (!input || input.disabled || input.readOnly) return;

        if (activeInput === input && calendarPanel && calendarPanel.style.display !== 'none') {
            closeCustomDatePicker();
            return;
        }

        closeCustomDatePicker();
        activeInput = input;
        activeInput.classList.add('custom-datepicker-active');

        // استخراج التاريخ الحالي المكتوب بالحقل لتحديد الشهر والسنة
        const parsed = parseInputDate(input.value);
        if (parsed) {
            viewYear = parsed.year;
            viewMonth = parsed.month;
        } else {
            const now = new Date();
            viewYear = now.getFullYear();
            viewMonth = now.getMonth();
        }

        const panel = getOrCreateCalendarPanel();
        renderCalendar();
        positionDatePicker(input, panel);
        panel.style.display = 'flex';
    }

    // اعتراض النقر على حقول التاريخ input[type="date"]
    function handleDateTrigger(e) {
        const target = e.target;
        if (!target) return;

        const input = (target.tagName === 'INPUT' && target.type === 'date') ? target : target.closest('input[type="date"]');
        if (!input || input.disabled || input.readOnly) return;

        e.preventDefault();
        e.stopPropagation();

        openCustomDatePicker(input);
    }

    document.addEventListener('mousedown', (e) => {
        const target = e.target;
        const input = (target && target.tagName === 'INPUT' && target.type === 'date') ? target : (target && target.closest ? target.closest('input[type="date"]') : null);

        if (input) {
            handleDateTrigger(e);
            return;
        }

        if (calendarPanel && calendarPanel.style.display !== 'none') {
            const dropdownPanel = document.getElementById('app-custom-dropdown-panel');
            if (dropdownPanel && dropdownPanel.contains(target)) {
                return; // النقر داخل لوحة القائمة المنسدلة التابعة للتقويم: لا تغلق التقويم!
            }
            if (!calendarPanel.contains(target)) {
                closeCustomDatePicker();
            }
        }
    }, true);

    document.addEventListener('click', (e) => {
        const target = e.target;
        const input = (target && target.tagName === 'INPUT' && target.type === 'date') ? target : (target && target.closest ? target.closest('input[type="date"]') : null);
        if (input) {
            e.preventDefault();
            e.stopPropagation();
        }
    }, true);

    document.addEventListener('keydown', (e) => {
        if (!calendarPanel || calendarPanel.style.display === 'none') return;
        if (e.key === 'Escape') {
            closeCustomDatePicker();
        }
    });

    window.addEventListener('resize', () => {
        if (activeInput && calendarPanel && calendarPanel.style.display !== 'none') {
            positionDatePicker(activeInput, calendarPanel);
        }
    }, { passive: true });

    window.addEventListener('scroll', () => {
        if (activeInput && calendarPanel && calendarPanel.style.display !== 'none') {
            positionDatePicker(activeInput, calendarPanel);
        }
    }, { passive: true, capture: true });

    window.openCustomDatePicker = openCustomDatePicker;
    window.closeCustomDatePicker = closeCustomDatePicker;

    console.log("✅ [Custom DatePicker Polyfill] تم تفعيل محرك اختيار التاريخ والتقويم الداخلي بنجاح.");
})();

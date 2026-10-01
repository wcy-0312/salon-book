/* =========================================
   行事曆 (Calendar) — Admin App 第二個 top-level workspace

   核心概念：選日期 → 看當天完整時間安排（Booking + BlockedTime
   在同一條時間軸上）→ 點 Booking 進 Booking Detail、點「+」
   管理不可預約時間。

   selected date 透過 URL query string（?date=YYYY-MM-DD）保留，
   與 staff_id 一樣是 refresh-safe / deep-link-safe，不依賴
   JavaScript memory state。
========================================= */

const staffSelect =
    document.querySelector("#staff-select");

const staffRole =
    document.querySelector("#staff-role");

const staffAvatar =
    document.querySelector("#staff-avatar");

const calendarMonthLabel =
    document.querySelector("#calendar-month-label");

const weekPrevButton =
    document.querySelector("#week-prev-button");

const weekNextButton =
    document.querySelector("#week-next-button");

const weekTodayButton =
    document.querySelector("#week-today-button");

const weekStrip =
    document.querySelector("#week-strip");

const selectedDateLabel =
    document.querySelector("#selected-date-label");

const addBlockedTimeButton =
    document.querySelector("#add-blocked-time-button");

const closedBanner =
    document.querySelector("#closed-banner");

const closedBannerSubtitle =
    document.querySelector("#closed-banner-subtitle");

const dailyScheduleList =
    document.querySelector("#daily-schedule-list");

const navServices =
    document.querySelector("#nav-services");

const navManagement =
    document.querySelector("#nav-management");


let currentStaffId = null;
let cachedStaffList = [];

// selectedDate / weekStart 都是「該日 00:00」的 Date 物件。
let selectedDate = startOfDay(new Date());
let weekStart = startOfWeek(selectedDate);


const WEEKDAY_LABELS_SHORT = ["日", "一", "二", "三", "四", "五", "六"];
const WEEKDAY_LABELS_FULL = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];


function startOfDay(date) {
    const copy = new Date(date);
    copy.setHours(0, 0, 0, 0);
    return copy;
}


function startOfWeek(date) {
    const copy = startOfDay(date);
    copy.setDate(copy.getDate() - copy.getDay());
    return copy;
}


function formatDateForInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}


function parseDateInput(value) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
}


function isSameDay(a, b) {
    return (
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()
    );
}


function formatTime(dateObject) {
    return `${String(dateObject.getHours()).padStart(2, "0")}:${String(dateObject.getMinutes()).padStart(2, "0")}`;
}


/* =========================================
   URL state（date 與 staff_id 都要 refresh-safe）
========================================= */

function getDateFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const value = params.get("date");

    if (!value) {
        return null;
    }

    const parsed = parseDateInput(value);

    return Number.isNaN(parsed.getTime()) ? null : parsed;
}


function updateUrlDate(date) {
    const url = new URL(window.location.href);
    url.searchParams.set("date", formatDateForInput(date));
    window.history.replaceState(null, "", url);
}


function buildBookingDetailUrl(bookingId) {
    const params = new URLSearchParams({
        booking_id: String(bookingId),
        staff_id: String(currentStaffId),
        from: "calendar",
        date: formatDateForInput(selectedDate),
    });

    return `booking-detail.html?${params}`;
}


function buildBlockedTimeUrl() {
    const params = new URLSearchParams({
        staff_id: String(currentStaffId),
        date: formatDateForInput(selectedDate),
    });

    return `blocked-time.html?${params}`;
}


/* =========================================
   Icons
========================================= */

function injectStaticIcons() {
    document.querySelector("#week-prev-icon").innerHTML = ICONS.chevronLeft();
    document.querySelector("#week-next-icon").innerHTML = ICONS.chevronRight();
    document.querySelector("#add-blocked-time-icon").innerHTML = ICONS.plus();
    document.querySelector("#closed-banner-icon").innerHTML = ICONS.noEntry();

    document.querySelector("#nav-today-icon").innerHTML = ICONS.home();
    document.querySelector("#nav-calendar-icon").innerHTML = ICONS.calendarNav();
    document.querySelector("#nav-services-icon").innerHTML = ICONS.scissors();
    document.querySelector("#nav-management-icon").innerHTML = ICONS.settings();
}


/* =========================================
   Staff switcher（與 admin.js 相同的模式）
========================================= */

async function loadStaffSwitcher() {

    try {

        const staffList = await fetchAdminStaffList();

        cachedStaffList = staffList;

        if (staffList.length === 0) {
            staffSelect.innerHTML = '<option value="">目前沒有設計師</option>';
            return;
        }

        const staffIdFromUrl = getStaffIdFromUrl();

        const defaultStaff =
            staffList.find((staff) => staff.id === staffIdFromUrl)
            ?? pickDefaultStaff(staffList);

        currentStaffId = defaultStaff.id;

        staffSelect.innerHTML = "";

        staffList.forEach((staff) => {
            const option = document.createElement("option");
            option.value = staff.id;
            option.textContent = staff.is_active ? staff.name : `${staff.name}（已停用）`;
            if (staff.id === currentStaffId) {
                option.selected = true;
            }
            staffSelect.appendChild(option);
        });

        staffRole.textContent = defaultStaff.title;
        staffAvatar.textContent = defaultStaff.name.slice(0, 1);

        updateUrlStaffId(currentStaffId);
        updateNavLinks();

    } catch (error) {

        console.error("Failed to load staff list:", error);

        staffSelect.innerHTML = '<option value="">無法載入設計師清單</option>';
    }
}


staffSelect.addEventListener("change", async () => {

    const selectedId = Number(staffSelect.value);

    if (!Number.isInteger(selectedId)) {
        return;
    }

    currentStaffId = selectedId;

    const selectedStaff = cachedStaffList.find((staff) => staff.id === currentStaffId);

    if (selectedStaff) {
        staffRole.textContent = selectedStaff.title;
        staffAvatar.textContent = selectedStaff.name.slice(0, 1);
    }

    updateUrlStaffId(currentStaffId);
    updateNavLinks();

    await loadDailySchedule();

});


function updateNavLinks() {
    if (currentStaffId === null) {
        return;
    }

    navServices.href = buildAdminUrl("services.html", currentStaffId);
    navManagement.href = buildAdminUrl("staff.html", currentStaffId);
}


/* =========================================
   週選擇條
========================================= */

function renderWeekStrip() {

    calendarMonthLabel.textContent =
        `${selectedDate.getFullYear()} 年 ${selectedDate.getMonth() + 1} 月`;

    weekStrip.innerHTML = "";

    const today = startOfDay(new Date());

    for (let i = 0; i < 7; i++) {

        const date = new Date(weekStart);
        date.setDate(date.getDate() + i);

        const isToday = isSameDay(date, today);
        const isSelected = isSameDay(date, selectedDate);

        const dayButton = document.createElement("button");

        dayButton.type = "button";

        dayButton.className = "week-strip-day";
        if (isToday) dayButton.classList.add("is-today");
        if (isSelected) dayButton.classList.add("is-selected");

        dayButton.innerHTML = `
            <span class="week-strip-weekday">${WEEKDAY_LABELS_SHORT[date.getDay()]}</span>
            <span class="week-strip-date">${date.getDate()}</span>
        `;

        dayButton.addEventListener("click", () => {
            selectDate(date);
        });

        weekStrip.appendChild(dayButton);
    }
}


function selectDate(date) {
    selectedDate = startOfDay(date);
    weekStart = startOfWeek(selectedDate);

    updateUrlDate(selectedDate);
    renderWeekStrip();
    loadDailySchedule();
}


weekPrevButton.addEventListener("click", () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() - 7);
    selectDate(newDate);
});


weekNextButton.addEventListener("click", () => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + 7);
    selectDate(newDate);
});


weekTodayButton.addEventListener("click", () => {
    selectDate(new Date());
});


/* =========================================
   當日資料
========================================= */

async function fetchDailyBookings() {

    const params = new URLSearchParams({
        staff_id: String(currentStaffId),
        date: formatDateForInput(selectedDate),
    });

    const response = await fetch(
        `${API_BASE_URL}/bookings?${params}`,
        { headers: { Authorization: `Bearer ${adminIdToken}` } }
    );

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    const bookings = await response.json();

    // Calendar 只需要看得到「還算數」的預約，REJECTED / CANCELLED
    // 不占用時間軸版面。
    return bookings.filter(
        (booking) => booking.status === "pending" || booking.status === "confirmed"
    );
}


async function fetchDailyBlockedTimes() {

    const params = new URLSearchParams({
        staff_id: String(currentStaffId),
        date: formatDateForInput(selectedDate),
    });

    const response = await fetch(
        `${API_BASE_URL}/blocked-times?${params}`,
        { headers: { Authorization: `Bearer ${adminIdToken}` } }
    );

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
}


async function fetchWeekSchedule() {

    const response = await fetch(
        `${API_BASE_URL}/admin/schedule?staff_id=${currentStaffId}`,
        { headers: { Authorization: `Bearer ${adminIdToken}` } }
    );

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    return response.json();
}


/* =========================================
   Render
========================================= */

function renderSelectedDateLabel() {
    selectedDateLabel.textContent =
        `${selectedDate.getMonth() + 1} 月 ${selectedDate.getDate()} 日（${WEEKDAY_LABELS_FULL[selectedDate.getDay()].slice(2)}）`;
}


// Compressed duration tier：三種視覺高度，不是真實 1 分鐘 = N px
// 的比例，避免 180 分鐘的預約造成過長 scrolling。
function durationTier(minutes) {
    if (minutes <= 60) {
        return "tier-short";
    }
    if (minutes <= 120) {
        return "tier-standard";
    }
    return "tier-long";
}


// 只有「夠長、對插入新預約有實際意義」的空檔才顯示低權重提示。
// 30 分鐘等太短的空檔，讓 timeline 本身的疏密自然呈現即可，
// 不需要額外文字——否則會變成 Booking／空檔交替的 list。
const MEANINGFUL_GAP_MINUTES = 45;


function renderDailySchedule(bookings, blockedTimes, workingHours) {

    dailyScheduleList.innerHTML = "";

    const isStaffWorkingToday = Boolean(workingHours);
    const isWholeDayOff = blockedTimes.some((bt) => isWholeDayBlock(bt));

    if (!isStaffWorkingToday) {
        closedBanner.style.display = "flex";
        closedBannerSubtitle.textContent = "尚未設定這天的營業時間";
    } else if (isWholeDayOff) {
        closedBanner.style.display = "flex";
        closedBannerSubtitle.textContent = "這天已設定為整天休假";
    } else {
        closedBanner.style.display = "none";
    }

    const items = [
        ...bookings.map((booking) => ({
            type: "booking",
            startAt: new Date(booking.start_at),
            endAt: new Date(new Date(booking.start_at).getTime() + booking.duration_minutes * 60000),
            data: booking,
        })),
        ...blockedTimes
            .filter((bt) => !isWholeDayBlock(bt))
            .map((bt) => ({
                type: "blocked",
                startAt: new Date(bt.start_at),
                endAt: new Date(bt.end_at),
                data: bt,
            })),
    ].sort((a, b) => a.startAt - b.startAt);

    if (items.length === 0) {

        dailyScheduleList.innerHTML = buildEmptyStateHtml(isStaffWorkingToday, isWholeDayOff);

        return;
    }

    let previousEndAt = workingHours ? workingHours.startAt : null;

    items.forEach((item) => {

        appendGapIfMeaningful(previousEndAt, item.startAt);

        if (item.type === "booking") {
            dailyScheduleList.appendChild(buildBookingRow(item.data, item.startAt));
        } else {
            dailyScheduleList.appendChild(buildBlockedTimeRow(item.data, item.startAt, item.endAt));
        }

        previousEndAt = item.endAt;

    });

    if (workingHours) {
        appendGapIfMeaningful(previousEndAt, workingHours.endAt);
        dailyScheduleList.appendChild(buildEndBoundary(workingHours.endAt));
    }
}


function appendGapIfMeaningful(fromAt, toAt) {

    if (!fromAt || !toAt) {
        return;
    }

    const gapMinutes = Math.round((toAt.getTime() - fromAt.getTime()) / 60000);

    if (gapMinutes < MEANINGFUL_GAP_MINUTES) {
        return;
    }

    const gap = document.createElement("div");

    gap.className = "cal-tl-gap";

    gap.innerHTML = `
        <span class="cal-tl-gap-rail"></span>
        <span class="cal-tl-gap-label">空檔 ${gapMinutes} 分鐘</span>
    `;

    dailyScheduleList.appendChild(gap);
}


function buildEndBoundary(endAt) {

    const boundary = document.createElement("div");

    boundary.className = "cal-tl-end-boundary";
    boundary.textContent = `今日營業時間結束（${formatTime(endAt)}）`;

    return boundary;
}


function isWholeDayBlock(blockedTime) {
    const start = new Date(blockedTime.start_at);
    const end = new Date(blockedTime.end_at);
    return (end.getTime() - start.getTime()) >= 24 * 60 * 60 * 1000;
}


function buildEmptyStateHtml(isStaffWorkingToday, isWholeDayOff) {

    if (!isStaffWorkingToday) {
        return '<p class="state-message">這天不是營業日，沒有排定任何行程</p>';
    }

    if (isWholeDayOff) {
        return '<p class="state-message">今天整天休假，沒有其他行程</p>';
    }

    return '<p class="state-message">今天還沒有任何預約</p>';
}


function buildBookingRow(booking, startAt) {

    const endAt = new Date(startAt.getTime() + booking.duration_minutes * 60000);

    const row = document.createElement("a");

    row.href = buildBookingDetailUrl(booking.id);

    const statusClass = booking.status === "pending" ? "pending" : "confirmed";

    row.className = `cal-tl-item ${statusClass}`;

    row.innerHTML = `
        <span class="cal-tl-time">${formatTime(startAt)}</span>
        <span class="cal-tl-dot is-${statusClass}"></span>
        <span class="cal-tl-surface ${durationTier(booking.duration_minutes)}">
            <span class="cal-tl-row-top">
                <span class="cal-tl-name"></span>
                <span class="cal-tl-end">至 ${formatTime(endAt)}</span>
            </span>
            <span class="cal-tl-meta"></span>
        </span>
    `;

    row.querySelector(".cal-tl-name").textContent = booking.customer_name;
    row.querySelector(".cal-tl-meta").textContent =
        `${booking.service_name} · ${booking.duration_minutes} 分鐘${booking.status === "pending" ? " · 待確認" : ""}`;

    return row;
}


function buildBlockedTimeRow(blockedTime, startAt, endAt) {

    const durationMinutes = Math.round((endAt.getTime() - startAt.getTime()) / 60000);

    const row = document.createElement("div");

    row.className = "cal-tl-item blocked";

    row.innerHTML = `
        <span class="cal-tl-time">${formatTime(startAt)}</span>
        <span class="cal-tl-dot is-blocked"></span>
        <span class="cal-tl-surface ${durationTier(durationMinutes)}">
            <span class="cal-tl-name">不可預約</span>
            <span class="cal-tl-meta"></span>
        </span>
    `;

    row.querySelector(".cal-tl-meta").textContent =
        `至 ${formatTime(endAt)}${blockedTime.reason ? ` · ${blockedTime.reason}` : ""}`;

    return row;
}


async function loadDailySchedule() {

    renderSelectedDateLabel();

    addBlockedTimeButton.href = buildBlockedTimeUrl();

    dailyScheduleList.innerHTML = '<p class="state-message">載入中...</p>';
    closedBanner.style.display = "none";

    try {

        const [bookings, blockedTimes, weekSchedule] = await Promise.all([
            fetchDailyBookings(),
            fetchDailyBlockedTimes(),
            fetchWeekSchedule(),
        ]);

        const todaySchedule = weekSchedule.find(
            (day) => day.weekday === toBackendWeekday(selectedDate)
        );

        const workingHours = buildWorkingHoursRange(todaySchedule);

        renderDailySchedule(bookings, blockedTimes, workingHours);

    } catch (error) {

        console.error("Failed to load daily schedule:", error);

        dailyScheduleList.innerHTML = '<p class="state-message">無法載入當日資料</p>';
    }
}


// backend Schedule.weekday：Monday=0 ... Sunday=6
// JS Date.getDay()：Sunday=0 ... Saturday=6
function toBackendWeekday(date) {
    return (date.getDay() + 6) % 7;
}


// ScheduleDay.start_time / end_time 是 "HH:MM:SS" 字串，轉成
// selectedDate 當天的實際 Date 物件，作為 timeline 的營業時間邊界。
function buildWorkingHoursRange(scheduleDay) {

    if (!scheduleDay?.is_open || !scheduleDay.start_time || !scheduleDay.end_time) {
        return null;
    }

    const [startHour, startMinute] = scheduleDay.start_time.split(":").map(Number);
    const [endHour, endMinute] = scheduleDay.end_time.split(":").map(Number);

    const startAt = new Date(selectedDate);
    startAt.setHours(startHour, startMinute, 0, 0);

    const endAt = new Date(selectedDate);
    endAt.setHours(endHour, endMinute, 0, 0);

    return { startAt, endAt };
}


/* =========================================
   Init
========================================= */

async function initializeCalendarPage() {
    try {

        injectStaticIcons();

        const authenticated = await initializeAdminLiff();

        if (!authenticated) {
            return;
        }

        const dateFromUrl = getDateFromUrl();

        if (dateFromUrl) {
            selectedDate = startOfDay(dateFromUrl);
            weekStart = startOfWeek(selectedDate);
        } else {
            updateUrlDate(selectedDate);
        }

        await loadStaffSwitcher();

        renderWeekStrip();
        await loadDailySchedule();

    } catch (error) {

        console.error("Admin initialization failed:", error);

        dailyScheduleList.innerHTML = '<p class="state-message">無法驗證管理員身分</p>';
    }
}

initializeCalendarPage();

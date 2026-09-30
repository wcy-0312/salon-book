/* =========================================
   今日 (Today) — Admin App 首頁

   資訊層級（對應 mockup）：
   問候 + 設計師切換
   → 需要處理（待確認預約數量，入口到 pending.html）
   → 下一位客人（今天尚未開始的 CONFIRMED 中最近一筆，入口到 booking-detail.html）
   → 今日行程摘要（今天的 CONFIRMED，入口到 booking-detail.html；「查看全部」先導去 pending.html 同等清單頁，見下方說明）
========================================= */

function injectStaticIcons() {
    document.querySelector("#pending-alert-icon").innerHTML = ICONS.clock();
    document.querySelector("#pending-alert-chevron").innerHTML = ICONS.chevronRight();
    document.querySelector("#completion-icon").innerHTML = ICONS.checkCircle();
    document.querySelector("#next-customer-icon").innerHTML = ICONS.calendarNav();
    document.querySelector("#next-customer-chevron").innerHTML = ICONS.chevronRight();

    document.querySelector("#nav-today-icon").innerHTML = ICONS.home();
    document.querySelector("#nav-calendar-icon").innerHTML = ICONS.calendarNav();
    document.querySelector("#nav-services-icon").innerHTML = ICONS.scissors();
    document.querySelector("#nav-management-icon").innerHTML = ICONS.settings();
}


const staffSelect =
    document.querySelector("#staff-select");

const staffRole =
    document.querySelector("#staff-role");

const todayDate =
    document.querySelector("#today-date");

const todaySummary =
    document.querySelector("#today-summary");

const pendingAlertCard =
    document.querySelector("#pending-alert-card");

const pendingAlertCount =
    document.querySelector("#pending-alert-count");

const completionBanner =
    document.querySelector("#completion-banner");

const completionSubtitle =
    document.querySelector("#completion-subtitle");

const completionCount =
    document.querySelector("#completion-count");

const nextCustomerSection =
    document.querySelector("#next-customer-section");

const nextCustomerCard =
    document.querySelector("#next-customer-card");

const nextCustomerTime =
    document.querySelector("#next-customer-time");

const nextCustomerName =
    document.querySelector("#next-customer-name");

const nextCustomerMeta =
    document.querySelector("#next-customer-meta");

const todayScheduleTitle =
    document.querySelector("#today-schedule-title");

const todayScheduleList =
    document.querySelector("#today-schedule-list");

const navCalendar =
    document.querySelector("#nav-calendar");

const navServices =
    document.querySelector("#nav-services");

const navManagement =
    document.querySelector("#nav-management");


let currentStaffId = null;
let cachedStaffList = [];


const WEEKDAY_LABELS = [
    "星期日",
    "星期一",
    "星期二",
    "星期三",
    "星期四",
    "星期五",
    "星期六",
];


function formatDateForInput(date) {
    const year =
        date.getFullYear();

    const month =
        String(date.getMonth() + 1)
            .padStart(2, "0");

    const day =
        String(date.getDate())
            .padStart(2, "0");

    return `${year}-${month}-${day}`;
}


function formatTime(dateObject) {
    return `${String(dateObject.getHours()).padStart(2, "0")}:${String(dateObject.getMinutes()).padStart(2, "0")}`;
}


/* =========================================
   Staff switcher
========================================= */

async function loadStaffSwitcher() {

    try {

        const staffList =
            await fetchAdminStaffList();

        cachedStaffList = staffList;

        if (staffList.length === 0) {
            staffSelect.innerHTML =
                '<option value="">目前沒有設計師</option>';
            return;
        }

        const staffIdFromUrl =
            getStaffIdFromUrl();

        const defaultStaff =
            staffList.find(
                (staff) => staff.id === staffIdFromUrl
            )
            ?? pickDefaultStaff(staffList);

        currentStaffId = defaultStaff.id;

        staffSelect.innerHTML = "";

        staffList.forEach((staff) => {

            const option =
                document.createElement("option");

            option.value = staff.id;

            option.textContent = staff.is_active
                ? staff.name
                : `${staff.name}（已停用）`;

            if (staff.id === currentStaffId) {
                option.selected = true;
            }

            staffSelect.appendChild(option);

        });

        staffRole.textContent =
            defaultStaff.title;

        updateUrlStaffId(currentStaffId);
        updateNavLinks();

    } catch (error) {

        console.error(
            "Failed to load staff list:",
            error
        );

        staffSelect.innerHTML =
            '<option value="">無法載入設計師清單</option>';
    }
}


staffSelect.addEventListener(
    "change",
    async () => {

        const selectedId =
            Number(staffSelect.value);

        if (!Number.isInteger(selectedId)) {
            return;
        }

        currentStaffId = selectedId;

        const selectedStaff =
            cachedStaffList.find(
                (staff) => staff.id === currentStaffId
            );

        if (selectedStaff) {
            staffRole.textContent =
                selectedStaff.title;
        }

        updateUrlStaffId(currentStaffId);
        updateNavLinks();

        await loadToday();

    }
);


function buildBookingDetailUrl(bookingId) {
    const params = new URLSearchParams({
        booking_id: String(bookingId),
        staff_id: String(currentStaffId),
        from: "today",
    });

    return `booking-detail.html?${params}`;
}


function updateNavLinks() {
    if (currentStaffId === null) {
        return;
    }

    navCalendar.href =
        buildAdminUrl("calendar.html", currentStaffId);

    navServices.href =
        buildAdminUrl("services.html", currentStaffId);

    navManagement.href =
        buildAdminUrl("staff.html", currentStaffId);
}


/* =========================================
   今日資料
========================================= */

async function fetchTodayBookings(status, extraParams = {}) {

    const today = new Date();

    const params = new URLSearchParams({
        staff_id: String(currentStaffId),
        status,
        date: formatDateForInput(today),
        ...extraParams,
    });

    const response = await fetch(
        `${API_BASE_URL}/bookings?${params}`,
        {
            headers: {
                Authorization: `Bearer ${adminIdToken}`,
            },
        }
    );

    if (!response.ok) {
        throw new Error(
            `HTTP ${response.status}`
        );
    }

    return response.json();
}


async function fetchPendingCount() {

    const params = new URLSearchParams({
        staff_id: String(currentStaffId),
        status: "pending",
        upcoming_only: "true",
    });

    const response = await fetch(
        `${API_BASE_URL}/bookings?${params}`,
        {
            headers: {
                Authorization: `Bearer ${adminIdToken}`,
            },
        }
    );

    if (!response.ok) {
        throw new Error(
            `HTTP ${response.status}`
        );
    }

    const bookings =
        await response.json();

    return bookings.length;
}


function renderHeader() {

    const today = new Date();

    todayDate.textContent =
        `${today.getMonth() + 1} 月 ${today.getDate()} 日・${WEEKDAY_LABELS[today.getDay()]}`;
}


/**
 * 今日首頁需要在三種狀態間自然切換（純前端從既有資料推導，
 * 沒有新增任何 backend 欄位或統計邏輯）：
 * A. 有待確認 → 顯示「需要處理」提示卡
 * B. 沒待確認、但今天還有尚未開始的 CONFIRMED → 不顯示提示卡，
 *    也不顯示完成狀態，直接讓「下一位客人」自然往上
 * C. 沒待確認、且今天所有 CONFIRMED 都已經過了（或今天沒有
 *    任何 CONFIRMED）→ 顯示「今日已完成」狀態列
 */
function renderPendingAlertAndCompletion(pendingCount, confirmedBookings) {

    if (pendingCount > 0) {
        pendingAlertCard.style.display = "flex";
        pendingAlertCount.textContent = String(pendingCount);
        completionBanner.style.display = "none";
        return;
    }

    pendingAlertCard.style.display = "none";

    const now = new Date();

    const hasUpcoming = confirmedBookings.some(
        (booking) => new Date(booking.start_at) >= now
    );

    if (hasUpcoming) {
        completionBanner.style.display = "none";
        return;
    }

    completionBanner.style.display = "flex";

    completionSubtitle.textContent =
        confirmedBookings.length > 0
            ? "今天的預約都完成了"
            : "今天目前沒有已確認的預約";

    completionCount.textContent =
        `${confirmedBookings.length} / ${confirmedBookings.length}`;
}


function renderNextCustomer(confirmedBookings) {

    const now = new Date();

    const upcoming = confirmedBookings
        .map((booking) => ({
            booking,
            startAt: new Date(booking.start_at),
        }))
        .filter((item) => item.startAt >= now)
        .sort((a, b) => a.startAt - b.startAt);

    if (upcoming.length === 0) {
        nextCustomerSection.style.display = "none";
        return;
    }

    const next = upcoming[0];

    nextCustomerSection.style.display = "block";

    nextCustomerTime.textContent =
        formatTime(next.startAt);

    nextCustomerName.textContent =
        next.booking.customer_name;

    nextCustomerMeta.textContent =
        `${next.booking.service_name} · ${next.booking.duration_minutes} 分鐘 · $${next.booking.price.toLocaleString()}`;

    nextCustomerCard.href =
        buildBookingDetailUrl(next.booking.id);
}


function renderTodaySchedule(confirmedBookings) {

    todayScheduleTitle.textContent =
        `今日行程 (${confirmedBookings.length})`;

    todayScheduleList.innerHTML = "";

    if (confirmedBookings.length === 0) {
        todayScheduleList.innerHTML =
            '<p class="state-message">今天目前沒有已確認的預約</p>';
        return;
    }

    const now = new Date();

    const sorted = [...confirmedBookings].sort(
        (a, b) => new Date(a.start_at) - new Date(b.start_at)
    );

    // 找出「下一位」用來標示時間軸上的重點列
    const nextId = sorted.find(
        (booking) => new Date(booking.start_at) >= now
    )?.id;

    sorted.forEach((booking) => {

        const startAt =
            new Date(booking.start_at);

        const isNext =
            booking.id === nextId;

        const row =
            document.createElement("a");

        row.href =
            buildBookingDetailUrl(booking.id);

        row.className = "timeline-row";

        row.innerHTML = `
            <span class="timeline-dot ${isNext ? "is-next" : "is-confirmed"}"></span>
            <span class="timeline-time">${formatTime(startAt)}</span>
            <span class="timeline-body">
                <span class="timeline-name"></span>
                <span class="timeline-meta"></span>
            </span>
            <span class="timeline-status ${isNext ? "is-next" : "is-confirmed"}">
                <span class="icon">${isNext ? ICONS.clock() : ICONS.check()}</span>
            </span>
        `;

        row.querySelector(".timeline-name").textContent =
            booking.customer_name;

        row.querySelector(".timeline-meta").textContent =
            `${booking.service_name} · ${booking.duration_minutes} 分鐘`;

        todayScheduleList.appendChild(row);

    });
}


async function loadToday() {

    renderHeader();

    todaySummary.textContent = "載入中...";
    todayScheduleList.innerHTML =
        '<p class="state-message">載入中...</p>';

    try {

        const [pendingCount, confirmedBookings] =
            await Promise.all([
                fetchPendingCount(),
                fetchTodayBookings("confirmed"),
            ]);

        todaySummary.textContent =
            `今天有 ${confirmedBookings.length} 位客人`;

        renderPendingAlertAndCompletion(pendingCount, confirmedBookings);
        renderNextCustomer(confirmedBookings);
        renderTodaySchedule(confirmedBookings);

        pendingAlertCard.href =
            buildAdminUrl("pending.html", currentStaffId);

    } catch (error) {

        console.error(
            "Failed to load today's data:",
            error
        );

        todaySummary.textContent = "無法載入今日資料";

        todayScheduleList.innerHTML =
            '<p class="state-message">無法載入今日行程</p>';
    }
}


/* =========================================
   Init
========================================= */

async function initializeToday() {
    try {

        injectStaticIcons();

        const authenticated =
            await initializeAdminLiff();

        if (!authenticated) {
            return;
        }

        await loadStaffSwitcher();
        await loadToday();

    } catch (error) {
        console.error(
            "Admin initialization failed:",
            error
        );

        todaySummary.textContent = "無法驗證管理員身分";
    }
}

initializeToday();

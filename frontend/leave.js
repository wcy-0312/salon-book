/* =========================================
   休假管理

   這是從舊版 admin.html 底部的「休假管理」月曆原封不動搬過來
   的獨立頁面。這次 Admin App 重新設計還沒有做「行事曆」，
   所以先讓這個既有功能維持可用，不重做任何邏輯或畫面。
========================================= */

const leaveStaffTitle =
    document.querySelector("#leave-staff-title");

const backToAdminLink =
    document.querySelector("#back-to-admin-link");

const calendarPrevMonthButton =
    document.querySelector("#calendar-prev-month");

const calendarNextMonthButton =
    document.querySelector("#calendar-next-month");

const calendarMonthLabel =
    document.querySelector("#calendar-month-label");

const calendarGrid =
    document.querySelector("#calendar-grid");


let currentStaffId = null;


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


/* =========================================
   Staff
========================================= */

async function loadCurrentStaff() {

    backToAdminLink.href =
        buildAdminUrl("admin.html", currentStaffId);

    try {

        const staffList =
            await fetchAdminStaffList();

        const staff = staffList.find(
            (item) => item.id === currentStaffId
        );

        leaveStaffTitle.textContent =
            staff
                ? `${staff.name} 的休假管理`
                : "休假管理";

    } catch (error) {

        console.error(
            "Failed to load staff info:",
            error
        );

        leaveStaffTitle.textContent =
            "休假管理";
    }
}


/* =========================================
   Leave calendar
========================================= */

let calendarMonth = new Date(
    new Date().getFullYear(),
    new Date().getMonth(),
    1
);

let dayOffMap = new Map();


function formatMonthLabel(date) {
    return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月`;
}


async function loadCalendarMonth() {

    calendarMonthLabel.textContent =
        formatMonthLabel(calendarMonth);

    calendarGrid.innerHTML =
        '<p class="loading">載入中...</p>';

    const monthStart = new Date(
        calendarMonth.getFullYear(),
        calendarMonth.getMonth(),
        1
    );

    const monthEnd = new Date(
        calendarMonth.getFullYear(),
        calendarMonth.getMonth() + 1,
        0
    );

    try {

        const response = await fetch(
            `${API_BASE_URL}/blocked-times?staff_id=${currentStaffId}&start_date=${formatDateForInput(monthStart)}&end_date=${formatDateForInput(monthEnd)}`,
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

        const blockedTimes =
            await response.json();

        dayOffMap = new Map();

        blockedTimes.forEach((blockedTime) => {
            const dayKey =
                formatDateForInput(
                    new Date(blockedTime.start_at)
                );

            dayOffMap.set(dayKey, blockedTime.id);
        });

        renderCalendar(monthStart, monthEnd);

    } catch (error) {

        console.error(
            "Failed to load leave calendar:",
            error
        );

        calendarGrid.innerHTML =
            '<p class="empty">無法載入休假資料</p>';
    }
}


function renderCalendar(monthStart, monthEnd) {

    calendarGrid.innerHTML = "";

    const leadingBlanks =
        monthStart.getDay();

    for (let i = 0; i < leadingBlanks; i++) {

        const blank =
            document.createElement("span");

        blank.className =
            "calendar-day calendar-day-empty";

        calendarGrid.appendChild(blank);
    }

    for (
        let day = 1;
        day <= monthEnd.getDate();
        day++
    ) {

        const date = new Date(
            calendarMonth.getFullYear(),
            calendarMonth.getMonth(),
            day
        );

        const dayKey =
            formatDateForInput(date);

        const isDayOff =
            dayOffMap.has(dayKey);

        const button =
            document.createElement("button");

        button.type = "button";

        button.className = isDayOff
            ? "calendar-day calendar-day-off"
            : "calendar-day";

        button.textContent = day;

        button.dataset.date = dayKey;

        button.addEventListener(
            "click",
            () => {
                toggleDayOff(dayKey, isDayOff);
            }
        );

        calendarGrid.appendChild(button);
    }
}


async function toggleDayOff(dayKey, isCurrentlyOff) {

    if (isCurrentlyOff) {

        const confirmed = window.confirm(
            `確定要取消 ${dayKey} 的休假嗎？`
        );

        if (!confirmed) {
            return;
        }

        const blockedTimeId =
            dayOffMap.get(dayKey);

        try {

            const response = await fetch(
                `${API_BASE_URL}/blocked-times/${blockedTimeId}`,
                {
                    method: "DELETE",
                    headers: {
                        Authorization: `Bearer ${adminIdToken}`,
                    },
                }
            );

            if (!response.ok) {

                const error =
                    await response.json();

                throw new Error(
                    error.detail
                    ?? `HTTP ${response.status}`
                );
            }

            await loadCalendarMonth();

        } catch (error) {

            console.error(
                "Failed to cancel day off:",
                error
            );

            alert(
                `取消休假失敗：${error.message}`
            );
        }

        return;
    }

    const confirmed = window.confirm(
        `確定要將 ${dayKey} 設為休假嗎？`
    );

    if (!confirmed) {
        return;
    }

    const [year, month, day] =
        dayKey.split("-").map(Number);

    const startAt = new Date(
        year,
        month - 1,
        day
    );

    const nextDay = new Date(startAt);

    nextDay.setDate(nextDay.getDate() + 1);

    try {

        const response = await fetch(
            `${API_BASE_URL}/blocked-times`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${adminIdToken}`,
                },
                body: JSON.stringify({
                    staff_id: currentStaffId,
                    start_at: `${dayKey}T00:00:00`,
                    end_at: `${formatDateForInput(nextDay)}T00:00:00`,
                }),
            }
        );

        if (!response.ok) {

            const error =
                await response.json();

            if (response.status === 409) {
                throw new Error(
                    "當天已有客人預約，請先確認或取消該預約後再設定休假"
                );
            }

            throw new Error(
                error.detail
                ?? `HTTP ${response.status}`
            );
        }

        await loadCalendarMonth();

    } catch (error) {

        console.error(
            "Failed to set day off:",
            error
        );

        alert(
            `設定休假失敗：${error.message}`
        );
    }
}


calendarPrevMonthButton.addEventListener(
    "click",
    () => {
        calendarMonth = new Date(
            calendarMonth.getFullYear(),
            calendarMonth.getMonth() - 1,
            1
        );

        loadCalendarMonth();
    }
);


calendarNextMonthButton.addEventListener(
    "click",
    () => {
        calendarMonth = new Date(
            calendarMonth.getFullYear(),
            calendarMonth.getMonth() + 1,
            1
        );

        loadCalendarMonth();
    }
);


/* =========================================
   Init
========================================= */

async function initializeLeavePage() {
    try {
        const authenticated =
            await initializeAdminLiff();

        if (!authenticated) {
            return;
        }

        currentStaffId =
            await resolveInitialStaffId();

        updateUrlStaffId(currentStaffId);

        await loadCurrentStaff();
        await loadCalendarMonth();

    } catch (error) {
        console.error(
            "Admin initialization failed:",
            error
        );

        calendarGrid.innerHTML =
            '<p class="empty">無法驗證管理員身分</p>';
    }
}

initializeLeavePage();

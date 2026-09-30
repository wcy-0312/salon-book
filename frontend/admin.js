const LIFF_ID = "2011675360-s1xEolBB";

let adminIdToken = null;

async function initializeAdminLiff() {
    await liff.init({
        liffId: LIFF_ID,
    });

    if (!liff.isLoggedIn()) {
        liff.login();
        return false;
    }

    adminIdToken = liff.getIDToken();

    if (!adminIdToken) {
        throw new Error("LINE ID token is unavailable");
    }

    const response = await fetch(
        `${API_BASE_URL}/auth/admin`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                id_token: adminIdToken,
            }),
        }
    );

    if (!response.ok) {
        throw new Error(
            `Admin authentication failed: ${response.status}`
        );
    }

    return true;
}

const API_BASE_URL =
    "https://salon-book-production.up.railway.app";

const bookingList =
    document.querySelector("#booking-list");

const pendingCount =
    document.querySelector("#pending-count");

const refreshButton =
    document.querySelector("#refresh-button");

const previousDateButton =
    document.querySelector("#previous-date-button");

const nextDateButton =
    document.querySelector("#next-date-button");

const currentDateText =
    document.querySelector("#current-date-text");

const datePickerButton =
    document.querySelector("#date-picker-button");

const datePicker =
    document.querySelector("#date-picker");

const scheduleList =
    document.querySelector("#schedule-list");

const scheduleCount =
    document.querySelector("#schedule-count");

const upcomingList =
    document.querySelector("#upcoming-list");

const upcomingCount =
    document.querySelector("#upcoming-count");

const UPCOMING_LIMIT = 10;

const calendarPrevMonthButton =
    document.querySelector("#calendar-prev-month");

const calendarNextMonthButton =
    document.querySelector("#calendar-next-month");

const calendarMonthLabel =
    document.querySelector("#calendar-month-label");

const calendarGrid =
    document.querySelector("#calendar-grid");

const STAFF_ID = 1;


let selectedDate = new Date();

selectedDate.setHours(
    0,
    0,
    0,
    0
);

/* =========================================
   Date navigation
========================================= */

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



function updateDateDisplay() {
    const weekdays = [
        "日",
        "一",
        "二",
        "三",
        "四",
        "五",
        "六",
    ];

    const month =
        selectedDate.getMonth() + 1;

    const day =
        selectedDate.getDate();

    const weekday =
        weekdays[selectedDate.getDay()];

    currentDateText.textContent =
        `${month}/${day}（${weekday}）`;

    datePicker.value =
        formatDateForInput(selectedDate);
}


function changeSelectedDate(days) {
    selectedDate.setDate(
        selectedDate.getDate() + days
    );

    updateDateDisplay();
    loadSchedule();
}


previousDateButton.addEventListener(
    "click",
    () => {
        changeSelectedDate(-1);
    }
);


nextDateButton.addEventListener(
    "click",
    () => {
        changeSelectedDate(1);
    }
);


datePickerButton.addEventListener(
    "click",
    () => {
        if (datePicker.showPicker) {
            datePicker.showPicker();
        } else {
            datePicker.click();
        }
    }
);


datePicker.addEventListener(
    "change",
    () => {
        if (!datePicker.value) {
            return;
        }

        const [
            year,
            month,
            day,
        ] = datePicker.value
            .split("-")
            .map(Number);

        selectedDate =
            new Date(
                year,
                month - 1,
                day
            );

        updateDateDisplay();
        loadSchedule();
    }
);


/* =========================================
   Load bookings
========================================= */

async function fetchBookings(params) {

    const query = new URLSearchParams(params);

    const response = await fetch(
        `${API_BASE_URL}/bookings?${query}`,
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


async function loadPendingBookings() {

    bookingList.innerHTML =
        '<p class="loading">載入中...</p>';

    try {

        const pendingBookings =
            await fetchBookings({
                status: "pending",
                upcoming_only: "true",
            });

        renderBookings(pendingBookings);

    } catch (error) {

        console.error(
            "Failed to load pending bookings:",
            error
        );

        bookingList.innerHTML =
            '<p class="empty">無法載入預約資料</p>';
    }
}


async function loadUpcomingBookings() {

    upcomingList.innerHTML =
        '<p class="loading">載入中...</p>';

    try {

        const upcomingBookings =
            await fetchBookings({
                status: "confirmed",
                upcoming_only: "true",
                limit: String(UPCOMING_LIMIT),
            });

        renderUpcoming(upcomingBookings);

    } catch (error) {

        console.error(
            "Failed to load upcoming bookings:",
            error
        );

        upcomingList.innerHTML =
            '<p class="empty">無法載入近期預約</p>';
    }
}


async function loadSchedule() {

    scheduleList.innerHTML =
        '<p class="loading">載入中...</p>';

    try {

        const confirmedBookings =
            await fetchBookings({
                status: "confirmed",
                date: formatDateForInput(selectedDate),
            });

        renderSchedule(confirmedBookings);

    } catch (error) {

        console.error(
            "Failed to load schedule:",
            error
        );

        scheduleList.innerHTML =
            '<p class="empty">無法載入當日行程</p>';
    }
}


async function loadAllBookingSections() {
    await Promise.all([
        loadPendingBookings(),
        loadUpcomingBookings(),
        loadSchedule(),
    ]);
}


/* =========================================
   Leave calendar
========================================= */

let calendarMonth = new Date(
    selectedDate.getFullYear(),
    selectedDate.getMonth(),
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
            `${API_BASE_URL}/blocked-times?staff_id=${STAFF_ID}&start_date=${formatDateForInput(monthStart)}&end_date=${formatDateForInput(monthEnd)}`,
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

    const today = new Date();

    today.setHours(0, 0, 0, 0);

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
                    staff_id: STAFF_ID,
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
   Render
========================================= */

function renderBookings(bookings) {

    bookingList.innerHTML = "";

    pendingCount.textContent =
        bookings.length;


    if (bookings.length === 0) {

        bookingList.innerHTML =
            '<p class="empty">目前沒有待確認預約</p>';

        return;
    }


    bookings.forEach((booking) => {

        const card =
            document.createElement("article");

        card.className =
            "booking-card";


        const date =
            new Date(booking.start_at);


        const dateText =
            `${date.getMonth() + 1}/${date.getDate()}`;

        const timeText =
            `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;


        card.innerHTML = `
            <div class="booking-time">

                <strong>
                    ${dateText}
                </strong>

                <span>
                    ${timeText}
                </span>

            </div>


            <div class="booking-info">

                <h3>
                    ${escapeHtml(booking.customer_name)}
                </h3>

                <p>
                    ${escapeHtml(booking.service_name)}
                    ·
                    $${booking.price.toLocaleString()}
                </p>

                <p class="phone">
                    ${escapeHtml(booking.customer_phone)}
                </p>

            </div>


            <div class="booking-actions">

                <button
                    type="button"
                    class="reject-button"
                    data-id="${booking.id}"
                >
                    拒絕
                </button>

                <button
                    type="button"
                    class="confirm-button"
                    data-id="${booking.id}"
                >
                    確認預約
                </button>

            </div>
        `;


        bookingList.appendChild(card);

    });


    bindBookingActions();
}


/* =========================================
   Render upcoming
========================================= */

function renderUpcoming(bookings) {

    upcomingList.innerHTML = "";

    upcomingCount.textContent =
        bookings.length;


    if (bookings.length === 0) {

        upcomingList.innerHTML =
            '<p class="empty">目前沒有近期預約</p>';

        return;
    }


    bookings.forEach((booking) => {

        const card =
            document.createElement("article");

        card.className =
            "booking-card";


        const date =
            new Date(booking.start_at);


        const dateText =
            `${date.getMonth() + 1}/${date.getDate()}`;

        const timeText =
            `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;


        card.innerHTML = `
            <div class="booking-time">

                <strong>
                    ${dateText}
                </strong>

                <span>
                    ${timeText}
                </span>

            </div>


            <div class="booking-info">

                <h3>
                    ${escapeHtml(booking.customer_name)}
                </h3>

                <p>
                    ${escapeHtml(booking.service_name)}
                    ·
                    $${booking.price.toLocaleString()}
                </p>

                <p class="phone">
                    ${escapeHtml(booking.customer_phone)}
                </p>

            </div>
        `;


        upcomingList.appendChild(card);

    });
}


/* =========================================
   Render schedule
========================================= */

function renderSchedule(bookings) {

    scheduleList.innerHTML = "";

    scheduleCount.textContent =
        bookings.length;


    if (bookings.length === 0) {

        scheduleList.innerHTML =
            '<p class="empty">當日尚無已確認的預約</p>';

        return;
    }


    bookings.forEach((booking) => {

        const card =
            document.createElement("article");

        card.className =
            "booking-card";


        const date =
            new Date(booking.start_at);


        const timeText =
            `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;


        card.innerHTML = `
            <div class="booking-time">

                <strong>
                    ${timeText}
                </strong>

            </div>


            <div class="booking-info">

                <h3>
                    ${escapeHtml(booking.customer_name)}
                </h3>

                <p>
                    ${escapeHtml(booking.service_name)}
                    ·
                    $${booking.price.toLocaleString()}
                </p>

                <p class="phone">
                    ${escapeHtml(booking.customer_phone)}
                </p>

            </div>


            <div class="booking-actions">

                <button
                    type="button"
                    class="reject-button cancel-button"
                    data-id="${booking.id}"
                >
                    取消預約
                </button>

            </div>
        `;


        scheduleList.appendChild(card);

    });

    bindScheduleActions();
}


/* =========================================
   Schedule buttons
========================================= */

function bindScheduleActions() {

    document
        .querySelectorAll(".cancel-button")
        .forEach((button) => {

            button.addEventListener(
                "click",
                async () => {

                    const confirmed = window.confirm(
                        "確定要取消這筆預約嗎？此操作無法復原，且會通知客人。"
                    );

                    if (!confirmed) {
                        return;
                    }

                    await updateBooking(
                        button.dataset.id,
                        "cancel"
                    );

                }
            );

        });
}


/* =========================================
   Buttons
========================================= */

function bindBookingActions() {

    document
        .querySelectorAll(".confirm-button")
        .forEach((button) => {

            button.addEventListener(
                "click",
                async () => {

                    await updateBooking(
                        button.dataset.id,
                        "confirm"
                    );

                }
            );

        });


    document
        .querySelectorAll(".reject-button")
        .forEach((button) => {

            button.addEventListener(
                "click",
                async () => {

                    await updateBooking(
                        button.dataset.id,
                        "reject"
                    );

                }
            );

        });
}


/* =========================================
   Confirm / Reject
========================================= */

async function updateBooking(
    bookingId,
    action
) {

    try {

        const response = await fetch(
            `${API_BASE_URL}/bookings/${bookingId}/${action}`,
            {
                method: "PATCH",
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


        await loadAllBookingSections();

    } catch (error) {

        console.error(
            "Failed to update booking:",
            error
        );

        alert(
            `操作失敗：${error.message}`
        );
    }
}


/* =========================================
   Escape HTML
========================================= */

function escapeHtml(value) {

    const div =
        document.createElement("div");

    div.textContent =
        value ?? "";

    return div.innerHTML;
}


/* =========================================
   Refresh
========================================= */

refreshButton.addEventListener(
    "click",
    loadAllBookingSections
);


/* =========================================
   Init
========================================= */

async function initializeAdmin() {
    try {
        const authenticated =
            await initializeAdminLiff();

        if (!authenticated) {
            return;
        }

        await loadAllBookingSections();
        await loadCalendarMonth();

    } catch (error) {
        console.error(
            "Admin initialization failed:",
            error
        );

        bookingList.innerHTML =
            '<p class="empty">無法驗證管理員身分</p>';
    }
}
updateDateDisplay();

initializeAdmin();
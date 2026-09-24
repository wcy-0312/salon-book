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

const blockedTimeList =
    document.querySelector("#blocked-time-list");

const blockedTimeCount =
    document.querySelector("#blocked-time-count");

const blockedTimeForm =
    document.querySelector("#blocked-time-form");

const blockedTimeAllDay =
    document.querySelector("#blocked-time-all-day");

const blockedTimeRange =
    document.querySelector("#blocked-time-range");

const blockedTimeStart =
    document.querySelector("#blocked-time-start");

const blockedTimeEnd =
    document.querySelector("#blocked-time-end");

const blockedTimeReason =
    document.querySelector("#blocked-time-reason");

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
    loadBookings();
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
        loadBookings();
    }
);


/* =========================================
   Load bookings
========================================= */

async function fetchBookings(status) {
    const dateParam =
        formatDateForInput(selectedDate);

    const response = await fetch(
        `${API_BASE_URL}/bookings?status=${status}&date=${dateParam}`,
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


async function loadBookings() {

    bookingList.innerHTML =
        '<p class="loading">載入中...</p>';

    scheduleList.innerHTML =
        '<p class="loading">載入中...</p>';

    try {

        const pendingBookings =
            await fetchBookings("pending");

        renderBookings(pendingBookings);

    } catch (error) {

        console.error(
            "Failed to load bookings:",
            error
        );

        bookingList.innerHTML =
            '<p class="empty">無法載入預約資料</p>';
    }

    try {

        const confirmedBookings =
            await fetchBookings("confirmed");

        renderSchedule(confirmedBookings);

    } catch (error) {

        console.error(
            "Failed to load schedule:",
            error
        );

        scheduleList.innerHTML =
            '<p class="empty">無法載入當日行程</p>';
    }

    await loadBlockedTimes();
}


/* =========================================
   Blocked time
========================================= */

async function loadBlockedTimes() {

    blockedTimeList.innerHTML =
        '<p class="loading">載入中...</p>';

    try {

        const dateParam =
            formatDateForInput(selectedDate);

        const response = await fetch(
            `${API_BASE_URL}/blocked-times?staff_id=${STAFF_ID}&date=${dateParam}`,
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

        renderBlockedTimes(blockedTimes);

    } catch (error) {

        console.error(
            "Failed to load blocked times:",
            error
        );

        blockedTimeList.innerHTML =
            '<p class="empty">無法載入封鎖時段</p>';
    }
}


function renderBlockedTimes(blockedTimes) {

    blockedTimeList.innerHTML = "";

    blockedTimeCount.textContent =
        blockedTimes.length;


    if (blockedTimes.length === 0) {

        blockedTimeList.innerHTML =
            '<p class="empty">當日尚無休假或封鎖時段</p>';

        return;
    }


    blockedTimes.forEach((blockedTime) => {

        const card =
            document.createElement("article");

        card.className =
            "blocked-time-card";

        const startAt =
            new Date(blockedTime.start_at);

        const endAt =
            new Date(blockedTime.end_at);

        const isAllDay =
            (endAt - startAt) >= (24 * 60 * 60 * 1000);

        const timeText = isAllDay
            ? "整天休假"
            : `${String(startAt.getHours()).padStart(2, "0")}:${String(startAt.getMinutes()).padStart(2, "0")} - ${String(endAt.getHours()).padStart(2, "0")}:${String(endAt.getMinutes()).padStart(2, "0")}`;

        card.innerHTML = `
            <div class="blocked-time-info">
                <strong>${timeText}</strong>
                ${blockedTime.reason ? `<span>${escapeHtml(blockedTime.reason)}</span>` : ""}
            </div>

            <button
                type="button"
                class="blocked-time-delete"
                data-id="${blockedTime.id}"
            >
                刪除
            </button>
        `;

        blockedTimeList.appendChild(card);

    });

    bindBlockedTimeActions();
}


function bindBlockedTimeActions() {

    document
        .querySelectorAll(".blocked-time-delete")
        .forEach((button) => {

            button.addEventListener(
                "click",
                async () => {

                    const confirmed = window.confirm(
                        "確定要刪除這筆休假 / 封鎖時段嗎？"
                    );

                    if (!confirmed) {
                        return;
                    }

                    await deleteBlockedTime(
                        button.dataset.id
                    );

                }
            );

        });
}


async function deleteBlockedTime(blockedTimeId) {

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

        await loadBlockedTimes();

    } catch (error) {

        console.error(
            "Failed to delete blocked time:",
            error
        );

        alert(
            `刪除失敗：${error.message}`
        );
    }
}


blockedTimeAllDay.addEventListener(
    "change",
    () => {
        blockedTimeRange.hidden =
            blockedTimeAllDay.checked;

        blockedTimeStart.required =
            !blockedTimeAllDay.checked;

        blockedTimeEnd.required =
            !blockedTimeAllDay.checked;
    }
);


blockedTimeForm.addEventListener(
    "submit",
    async (event) => {

        event.preventDefault();

        const dateParam =
            formatDateForInput(selectedDate);

        let startAt;
        let endAt;

        if (blockedTimeAllDay.checked) {

            startAt =
                `${dateParam}T00:00:00`;

            const nextDay =
                new Date(selectedDate);

            nextDay.setDate(
                nextDay.getDate() + 1
            );

            endAt =
                `${formatDateForInput(nextDay)}T00:00:00`;

        } else {

            if (
                !blockedTimeStart.value
                || !blockedTimeEnd.value
            ) {
                return;
            }

            startAt =
                `${dateParam}T${blockedTimeStart.value}:00`;

            endAt =
                `${dateParam}T${blockedTimeEnd.value}:00`;
        }

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
                        start_at: startAt,
                        end_at: endAt,
                        reason:
                            blockedTimeReason.value.trim()
                            || null,
                    }),
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

            blockedTimeForm.reset();

            blockedTimeRange.hidden = false;
            blockedTimeStart.required = true;
            blockedTimeEnd.required = true;

            await loadBlockedTimes();

        } catch (error) {

            console.error(
                "Failed to create blocked time:",
                error
            );

            alert(
                `新增失敗：${error.message}`
            );
        }
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


        await loadBookings();

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
    loadBookings
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

        await loadBookings();

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
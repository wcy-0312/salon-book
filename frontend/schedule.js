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

const STAFF_ID = 1;

const WEEKDAY_LABELS = [
    "星期一",
    "星期二",
    "星期三",
    "星期四",
    "星期五",
    "星期六",
    "星期日",
];

const scheduleList =
    document.querySelector("#schedule-list");

const scheduleEditOverlay =
    document.querySelector("#schedule-edit-overlay");

const scheduleEditForm =
    document.querySelector("#schedule-edit-form");

const scheduleEditTitle =
    document.querySelector("#schedule-edit-title");

const scheduleEditOpenInput =
    document.querySelector("#schedule-edit-open");

const scheduleEditTimeFields =
    document.querySelector("#schedule-edit-time-fields");

const scheduleEditStartInput =
    document.querySelector("#schedule-edit-start");

const scheduleEditEndInput =
    document.querySelector("#schedule-edit-end");

const scheduleEditCancelButton =
    document.querySelector("#schedule-edit-cancel");


let editingWeekday = null;


/* =========================================
   Load schedule
========================================= */

async function loadSchedule() {

    scheduleList.innerHTML =
        '<p class="loading">載入中...</p>';

    try {

        const response = await fetch(
            `${API_BASE_URL}/admin/schedule?staff_id=${STAFF_ID}`,
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

        const week =
            await response.json();

        renderSchedule(week);

    } catch (error) {

        console.error(
            "Failed to load schedule:",
            error
        );

        scheduleList.innerHTML =
            '<p class="empty">無法載入營業時間資料</p>';
    }
}


/* =========================================
   Render
========================================= */

function formatTime(timeString) {
    // "10:00:00" -> "10:00"
    return timeString.slice(0, 5);
}


function renderSchedule(week) {

    scheduleList.innerHTML = "";

    const sortedWeek =
        [...week].sort(
            (a, b) => a.weekday - b.weekday
        );

    sortedWeek.forEach((day) => {

        const row =
            document.createElement("div");

        row.className = day.is_open
            ? "schedule-week-row"
            : "schedule-week-row closed";

        const statusText = day.is_open
            ? `${formatTime(day.start_time)} – ${formatTime(day.end_time)}`
            : "公休";

        row.innerHTML = `
            <div class="schedule-week-info">
                <strong>${WEEKDAY_LABELS[day.weekday]}</strong>
                <span>${statusText}</span>
            </div>

            <button
                type="button"
                class="schedule-edit-button"
                data-weekday="${day.weekday}"
            >
                編輯
            </button>
        `;

        scheduleList.appendChild(row);

    });

    bindScheduleEditButtons(sortedWeek);
}


function bindScheduleEditButtons(week) {

    document
        .querySelectorAll(".schedule-edit-button")
        .forEach((button) => {

            button.addEventListener(
                "click",
                () => {

                    const day = week.find(
                        (item) =>
                            item.weekday === Number(button.dataset.weekday)
                    );

                    if (day) {
                        openScheduleEditDialog(day);
                    }

                }
            );

        });
}


/* =========================================
   Edit dialog
========================================= */

function updateTimeFieldsVisibility() {
    const isOpen =
        scheduleEditOpenInput.checked;

    scheduleEditTimeFields.classList.toggle(
        "hidden",
        !isOpen
    );

    scheduleEditStartInput.required = isOpen;
    scheduleEditEndInput.required = isOpen;
}


scheduleEditOpenInput.addEventListener(
    "change",
    updateTimeFieldsVisibility
);


function openScheduleEditDialog(day) {

    editingWeekday = day.weekday;

    scheduleEditTitle.textContent =
        `編輯${WEEKDAY_LABELS[day.weekday]}營業時間`;

    scheduleEditOpenInput.checked = day.is_open;

    scheduleEditStartInput.value =
        day.is_open ? formatTime(day.start_time) : "10:00";

    scheduleEditEndInput.value =
        day.is_open ? formatTime(day.end_time) : "19:00";

    updateTimeFieldsVisibility();

    scheduleEditOverlay.classList.remove("hidden");
}


function closeScheduleEditDialog() {

    editingWeekday = null;

    scheduleEditOverlay.classList.add("hidden");
}


scheduleEditCancelButton.addEventListener(
    "click",
    closeScheduleEditDialog
);


scheduleEditOverlay.addEventListener(
    "click",
    (event) => {
        if (event.target === scheduleEditOverlay) {
            closeScheduleEditDialog();
        }
    }
);


scheduleEditForm.addEventListener(
    "submit",
    async (event) => {

        event.preventDefault();

        if (editingWeekday === null) {
            return;
        }

        const isOpen =
            scheduleEditOpenInput.checked;

        const payload = {
            staff_id: STAFF_ID,
            is_open: isOpen,
        };

        if (isOpen) {

            if (
                !scheduleEditStartInput.value ||
                !scheduleEditEndInput.value
            ) {
                return;
            }

            payload.start_time =
                `${scheduleEditStartInput.value}:00`;

            payload.end_time =
                `${scheduleEditEndInput.value}:00`;
        }

        try {

            const response = await fetch(
                `${API_BASE_URL}/admin/schedule/${editingWeekday}`,
                {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${adminIdToken}`,
                    },
                    body: JSON.stringify(payload),
                }
            );

            if (!response.ok) {

                const error =
                    await response.json();

                if (response.status === 409) {
                    throw new Error(
                        "這個變更會讓已存在的預約落在營業時間之外，請先處理相關預約"
                    );
                }

                throw new Error(
                    error.detail
                    ?? `HTTP ${response.status}`
                );
            }

            closeScheduleEditDialog();

            await loadSchedule();

        } catch (error) {

            console.error(
                "Failed to update schedule:",
                error
            );

            alert(
                `更新失敗：${error.message}`
            );
        }
    }
);


/* =========================================
   Init
========================================= */

async function initializeSchedulePage() {
    try {
        const authenticated =
            await initializeAdminLiff();

        if (!authenticated) {
            return;
        }

        await loadSchedule();

    } catch (error) {
        console.error(
            "Admin initialization failed:",
            error
        );

        scheduleList.innerHTML =
            '<p class="empty">無法驗證管理員身分</p>';
    }
}

initializeSchedulePage();

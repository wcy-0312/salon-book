/* =========================================
   Admin Booking Detail

   讀取 URL 上的 booking_id + staff_id + from（來源頁面：
   "today" 或 "pending"），決定 Back 應該回到哪裡。

   confirm / reject 沿用既有 API 與 business logic；操作成功後
   不會自動跳轉，而是原地重新渲染最新的 booking 狀態，並顯示
   結果訊息，符合「操作完成後再讓使用者自己按返回」的需求。
========================================= */

const backLink =
    document.querySelector("#back-link");

const backLabel =
    document.querySelector("#back-label");

const detailContent =
    document.querySelector("#detail-content");


let currentStaffId = null;
let bookingId = null;
let fromPage = "today";
let fromDate = null;


const STATUS_LABELS = {
    pending: "待確認",
    confirmed: "已確認",
    rejected: "已拒絕",
    cancelled: "已取消",
};

const STATUS_ICON_FN = {
    pending: ICONS.clock,
    confirmed: ICONS.checkCircle,
    rejected: ICONS.closeCircle,
    cancelled: ICONS.closeCircle,
};


function getBookingIdFromUrl() {
    const params =
        new URLSearchParams(window.location.search);

    const value = params.get("booking_id");

    if (!value) {
        return null;
    }

    const parsed = Number(value);

    return Number.isInteger(parsed) ? parsed : null;
}


function getFromPageFromUrl() {
    const params =
        new URLSearchParams(window.location.search);

    const from = params.get("from");

    if (from === "pending" || from === "calendar") {
        return from;
    }

    return "today";
}


function getFromDateFromUrl() {
    const params =
        new URLSearchParams(window.location.search);

    return params.get("date");
}


function formatDate(dateObject) {
    const weekdayLabels = ["日", "一", "二", "三", "四", "五", "六"];

    return `${dateObject.getMonth() + 1} 月 ${dateObject.getDate()} 日（${weekdayLabels[dateObject.getDay()]}）`;
}


function formatTime(dateObject) {
    return `${String(dateObject.getHours()).padStart(2, "0")}:${String(dateObject.getMinutes()).padStart(2, "0")}`;
}


function setBackTarget() {

    if (fromPage === "pending") {

        backLabel.textContent = "待確認預約";

        const params = new URLSearchParams({
            staff_id: String(currentStaffId),
        });

        backLink.href = `pending.html?${params}`;

    } else if (fromPage === "calendar") {

        backLabel.textContent = "行事曆";

        const params = new URLSearchParams({
            staff_id: String(currentStaffId),
        });

        if (fromDate) {
            params.set("date", fromDate);
        }

        backLink.href = `calendar.html?${params}`;

    } else {

        backLabel.textContent = "今日";

        backLink.href =
            buildAdminUrl("admin.html", currentStaffId);
    }
}


/* =========================================
   Load booking
========================================= */

async function fetchBooking() {

    const response = await fetch(
        `${API_BASE_URL}/bookings/${bookingId}`,
        {
            headers: {
                Authorization: `Bearer ${adminIdToken}`,
            },
        }
    );

    if (response.status === 404) {
        throw new Error("找不到這筆預約");
    }

    if (!response.ok) {
        throw new Error(`載入失敗（HTTP ${response.status}）`);
    }

    return response.json();
}


function renderBooking(booking, resultMessage) {

    const startAt =
        new Date(booking.start_at);

    const endAt =
        new Date(startAt.getTime() + booking.duration_minutes * 60000);

    const statusLabel =
        STATUS_LABELS[booking.status] ?? booking.status;

    const canAct =
        booking.status === "pending";

    let actionsHtml = "";

    if (canAct) {
        actionsHtml = `
            <div class="detail-actions">
                <button
                    type="button"
                    id="reject-button"
                    class="action-button is-reject"
                >
                    <span class="icon">${ICONS.close()}</span>
                    拒絕預約
                </button>

                <button
                    type="button"
                    id="confirm-button"
                    class="action-button is-confirm"
                >
                    <span class="icon">${ICONS.check()}</span>
                    確認預約
                </button>
            </div>
        `;
    }

    let resultHtml = "";

    if (resultMessage) {
        const isRejected = booking.status === "rejected";

        resultHtml = `
            <div class="result-banner ${isRejected ? "is-rejected" : ""}">
                <span class="icon-badge size-sm ${isRejected ? "is-danger" : "is-success"}">
                    <span class="icon icon-16">${isRejected ? ICONS.close() : ICONS.check()}</span>
                </span>
                <span>
                    <div class="result-banner-title">${resultMessage.title}</div>
                    <div class="result-banner-subtitle">${resultMessage.subtitle}</div>
                </span>
            </div>
        `;
    }

    detailContent.innerHTML = `
        <div class="detail-status-row">
            <span class="detail-heading">預約詳情</span>
            <span class="status-pill is-${booking.status}">
                <span class="icon">${STATUS_ICON_FN[booking.status]?.() ?? ""}</span>
                ${statusLabel}
            </span>
        </div>

        <div class="detail-card">

            <div class="detail-row">
                <span class="icon-badge size-md is-customer">
                    <span class="icon icon-18">${ICONS.user()}</span>
                </span>
                <div class="detail-row-body">
                    <div class="detail-row-primary"></div>
                    <div class="detail-row-secondary"></div>
                </div>
            </div>

            <div class="detail-row">
                <span class="icon-badge size-md is-calendar">
                    <span class="icon icon-18">${ICONS.calendarDetail()}</span>
                </span>
                <div class="detail-row-body">
                    <div class="detail-row-primary"></div>
                    <div class="detail-row-secondary"></div>
                </div>
            </div>

            <div class="detail-row">
                <span class="icon-badge size-md is-service">
                    <span class="icon icon-18">${ICONS.scissors()}</span>
                </span>
                <div class="detail-row-body detail-row-value">
                    <div>
                        <div class="detail-row-primary"></div>
                        <div class="detail-row-secondary"></div>
                    </div>
                    <div class="detail-row-primary"></div>
                </div>
            </div>

        </div>

        ${actionsHtml}
        ${resultHtml}
    `;

    const rows =
        detailContent.querySelectorAll(".detail-row");

    // 客戶
    rows[0].querySelector(".detail-row-primary").textContent =
        booking.customer_name;
    rows[0].querySelector(".detail-row-secondary").textContent =
        booking.customer_phone;

    // 日期
    rows[1].querySelector(".detail-row-primary").textContent =
        formatDate(startAt);
    rows[1].querySelector(".detail-row-secondary").textContent =
        `${formatTime(startAt)} – ${formatTime(endAt)}（${booking.duration_minutes} 分鐘）`;

    // 服務
    const serviceValueBlocks =
        rows[2].querySelectorAll(".detail-row-primary");
    rows[2].querySelector(".detail-row-secondary").textContent =
        `${booking.duration_minutes} 分鐘`;
    serviceValueBlocks[0].textContent =
        booking.service_name;
    serviceValueBlocks[1].textContent =
        `$${booking.price.toLocaleString()}`;

    if (canAct) {
        bindActionButtons(booking);
    }
}


function bindActionButtons(booking) {

    const confirmButton =
        document.querySelector("#confirm-button");

    const rejectButton =
        document.querySelector("#reject-button");

    confirmButton.addEventListener(
        "click",
        () => handleBookingAction(booking.id, "confirm")
    );

    rejectButton.addEventListener(
        "click",
        () => handleBookingAction(booking.id, "reject")
    );
}


async function handleBookingAction(id, action) {

    const buttons =
        detailContent.querySelectorAll(".action-button");

    buttons.forEach((button) => {
        button.disabled = true;
    });

    const actingButton =
        document.querySelector(
            action === "confirm" ? "#confirm-button" : "#reject-button"
        );

    if (actingButton) {
        actingButton.textContent = "處理中...";
    }

    try {

        const response = await fetch(
            `${API_BASE_URL}/bookings/${id}/${action}`,
            {
                method: "PATCH",
                headers: {
                    Authorization: `Bearer ${adminIdToken}`,
                },
            }
        );

        if (!response.ok) {
            const error = await response.json();
            throw new Error(
                error.detail ?? `HTTP ${response.status}`
            );
        }

        const updatedBooking =
            await response.json();

        const resultMessage =
            action === "confirm"
                ? { title: "預約已確認", subtitle: "客戶已收到確認通知" }
                : { title: "預約已拒絕", subtitle: "客戶已收到通知" };

        renderBooking(updatedBooking, resultMessage);

    } catch (error) {

        console.error(
            `Failed to ${action} booking:`,
            error
        );

        alert(`操作失敗：${error.message}`);

        buttons.forEach((button) => {
            button.disabled = false;
        });

        if (actingButton) {
            actingButton.textContent =
                action === "confirm" ? "確認預約" : "拒絕預約";
        }
    }
}


/* =========================================
   Init
========================================= */

async function initializeBookingDetailPage() {

    document.querySelector("#back-icon").innerHTML =
        ICONS.chevronLeft();

    bookingId = getBookingIdFromUrl();
    fromPage = getFromPageFromUrl();
    fromDate = getFromDateFromUrl();

    if (bookingId === null) {
        detailContent.innerHTML =
            '<p class="state-message">預約連結無效</p>';
        return;
    }

    try {

        const authenticated =
            await initializeAdminLiff();

        if (!authenticated) {
            return;
        }

        currentStaffId =
            getStaffIdFromUrl()
            ?? await resolveInitialStaffId();

        setBackTarget();

        const booking =
            await fetchBooking();

        renderBooking(booking, null);

    } catch (error) {

        console.error(
            "Failed to load booking detail:",
            error
        );

        detailContent.innerHTML =
            `<p class="state-message">${error.message ?? "無法載入預約資料"}</p>`;
    }
}

initializeBookingDetailPage();

const LIFF_ID = "2011675360-s1xEolBB";

const API_BASE_URL =
    "https://salon-book-production.up.railway.app";

const loadingSection =
    document.querySelector("#loading-section");

const errorSection =
    document.querySelector("#error-section");

const errorMessage =
    document.querySelector("#error-message");

const bookingSection =
    document.querySelector("#booking-section");

const statusBadge =
    document.querySelector("#status-badge");

const bookingStaff =
    document.querySelector("#booking-staff");

const bookingService =
    document.querySelector("#booking-service");

const bookingDate =
    document.querySelector("#booking-date");

const bookingTime =
    document.querySelector("#booking-time");

const bookingPrice =
    document.querySelector("#booking-price");

const cancelButton =
    document.querySelector("#cancel-button");


let lineIdToken = null;
let bookingId = null;
let currentBooking = null;


const STATUS_LABELS = {
    pending: "等待設計師確認",
    confirmed: "已確認",
    rejected: "未成立",
    cancelled: "已取消",
};

const CANCELLABLE_STATUSES = [
    "pending",
    "confirmed",
];


/* -------------------------
   URL 取得 booking id
------------------------- */

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


/* -------------------------
   畫面切換
------------------------- */

function showError(message) {
    loadingSection.classList.add("hidden");
    bookingSection.classList.add("hidden");

    errorSection.classList.remove("hidden");
    errorMessage.textContent = message;
}


function showBooking() {
    loadingSection.classList.add("hidden");
    errorSection.classList.add("hidden");

    bookingSection.classList.remove("hidden");
}


/* -------------------------
   渲染預約資訊
------------------------- */

function renderBooking(booking) {

    currentBooking = booking;

    const startAt =
        new Date(booking.start_at);

    const dateText =
        `${startAt.getFullYear()}/${startAt.getMonth() + 1}/${startAt.getDate()}`;

    const timeText =
        `${String(startAt.getHours()).padStart(2, "0")}:${String(startAt.getMinutes()).padStart(2, "0")}`;

    statusBadge.textContent =
        STATUS_LABELS[booking.status] ?? booking.status;

    bookingStaff.textContent = booking.staff_name;
    bookingService.textContent = booking.service_name;
    bookingDate.textContent = dateText;
    bookingTime.textContent = timeText;
    bookingPrice.textContent =
        `$${booking.price.toLocaleString()}`;

    if (CANCELLABLE_STATUSES.includes(booking.status)) {
        cancelButton.classList.remove("hidden");
        cancelButton.disabled = false;
        cancelButton.textContent = "取消預約";
    } else {
        cancelButton.classList.add("hidden");
    }

    showBooking();
}


/* -------------------------
   取得 Booking
------------------------- */

async function fetchMyBooking() {

    const response = await fetch(
        `${API_BASE_URL}/my-bookings/${bookingId}`,
        {
            headers: {
                Authorization: `Bearer ${lineIdToken}`,
            },
        }
    );

    if (response.status === 404) {
        throw new Error("找不到這筆預約，或您沒有權限查看");
    }

    if (!response.ok) {
        throw new Error(`載入失敗（HTTP ${response.status}）`);
    }

    return response.json();
}


/* -------------------------
   取消 Booking
------------------------- */

cancelButton.addEventListener("click", async () => {

    const confirmed = window.confirm(
        "確定要取消這筆預約嗎？取消後原時段將重新開放預約。"
    );

    if (!confirmed) {
        return;
    }

    cancelButton.disabled = true;
    cancelButton.textContent = "取消中...";

    try {

        const response = await fetch(
            `${API_BASE_URL}/my-bookings/${bookingId}/cancel`,
            {
                method: "PATCH",
                headers: {
                    Authorization: `Bearer ${lineIdToken}`,
                },
            }
        );

        if (!response.ok) {

            let detail = `HTTP ${response.status}`;

            try {
                const errorData = await response.json();
                detail = errorData.detail ?? detail;
            } catch (parseError) {
                // ignore parse failure, use default detail
            }

            throw new Error(detail);
        }

        const updatedBooking = await response.json();

        renderBooking(updatedBooking);

    } catch (error) {

        console.error(
            "Failed to cancel booking:",
            error
        );

        alert(`取消失敗：${error.message}`);

        cancelButton.disabled = false;
        cancelButton.textContent = "取消預約";
    }

});


/* -------------------------
   初始化
------------------------- */

async function initializeBookingPage() {

    bookingId = getBookingIdFromUrl();

    if (bookingId === null) {
        showError("預約連結無效");
        return;
    }

    try {

        await liff.init({
            liffId: LIFF_ID,
        });

        if (!liff.isLoggedIn()) {
            liff.login();
            return;
        }

        lineIdToken = liff.getIDToken();

        if (!lineIdToken) {
            throw new Error("LINE ID token is unavailable");
        }

        const booking = await fetchMyBooking();

        renderBooking(booking);

    } catch (error) {

        console.error(
            "Failed to load booking:",
            error
        );

        showError(error.message ?? "無法載入預約資料");
    }
}

initializeBookingPage();

/* =========================================
   待確認預約列表（今日 App 第二層頁面）

   顯示目前 staff 的所有 PENDING upcoming bookings，整列可點擊，
   點進去到 booking-detail.html。這一層沒有 Bottom Navigation，
   只有「← 今日」返回。
========================================= */

const backLink =
    document.querySelector("#back-link");

const pendingCountBadge =
    document.querySelector("#pending-count-badge");

const pendingList =
    document.querySelector("#pending-list");


let currentStaffId = null;


function formatDisplayDate(dateObject) {
    return `${dateObject.getMonth() + 1}/${dateObject.getDate()}`;
}


function formatTime(dateObject) {
    return `${String(dateObject.getHours()).padStart(2, "0")}:${String(dateObject.getMinutes()).padStart(2, "0")}`;
}


function buildBookingDetailUrl(bookingId) {
    const params = new URLSearchParams({
        booking_id: String(bookingId),
        staff_id: String(currentStaffId),
        from: "pending",
    });

    return `booking-detail.html?${params}`;
}


/* =========================================
   Load
========================================= */

async function loadPendingBookings() {

    pendingList.innerHTML =
        '<p class="state-message">載入中...</p>';

    try {

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

        renderPendingList(bookings);

    } catch (error) {

        console.error(
            "Failed to load pending bookings:",
            error
        );

        pendingList.innerHTML =
            '<p class="state-message">無法載入待確認預約</p>';
    }
}


function renderPendingList(bookings) {

    pendingCountBadge.textContent =
        String(bookings.length);

    pendingList.innerHTML = "";

    if (bookings.length === 0) {
        pendingList.innerHTML =
            '<p class="state-message">目前沒有待確認預約</p>';
        return;
    }

    bookings.forEach((booking) => {

        const startAt =
            new Date(booking.start_at);

        const row =
            document.createElement("a");

        row.href =
            buildBookingDetailUrl(booking.id);

        row.className = "booking-row";

        row.innerHTML = `
            <span class="booking-row-avatar"></span>

            <span class="booking-row-body">
                <span class="booking-row-time"></span>
                <div class="booking-row-name"></div>
                <div class="booking-row-meta"></div>
            </span>

            <span class="icon icon-18 booking-row-chevron">${ICONS.chevronRight()}</span>
        `;

        row.querySelector(".booking-row-avatar").textContent =
            booking.customer_name.charAt(0);

        row.querySelector(".booking-row-time").textContent =
            `${formatDisplayDate(startAt)} (${formatTime(startAt)})`;

        row.querySelector(".booking-row-name").textContent =
            booking.customer_name;

        row.querySelector(".booking-row-meta").textContent =
            `${booking.service_name} · ${booking.duration_minutes} 分鐘 · $${booking.price.toLocaleString()}`;

        pendingList.appendChild(row);

    });
}


/* =========================================
   Init
========================================= */

async function initializePendingPage() {
    try {

        document.querySelector("#back-icon").innerHTML =
            ICONS.chevronLeft();

        const authenticated =
            await initializeAdminLiff();

        if (!authenticated) {
            return;
        }

        currentStaffId =
            await resolveInitialStaffId();

        updateUrlStaffId(currentStaffId);

        backLink.href =
            buildAdminUrl("admin.html", currentStaffId);

        await loadPendingBookings();

    } catch (error) {
        console.error(
            "Admin initialization failed:",
            error
        );

        pendingList.innerHTML =
            '<p class="state-message">無法驗證管理員身分</p>';
    }
}

initializePendingPage();

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


/* =========================================
   Load bookings
========================================= */

async function loadBookings() {

    bookingList.innerHTML =
        '<p class="loading">載入中...</p>';

    try {

        const response = await fetch(
            `${API_BASE_URL}/bookings?status=pending`,
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


        renderBookings(bookings);

    } catch (error) {

        console.error(
            "Failed to load bookings:",
            error
        );

        bookingList.innerHTML =
            '<p class="empty">無法載入預約資料</p>';
    }
}


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

initializeAdmin();
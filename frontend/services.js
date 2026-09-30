const LIFF_ID = "2011675360-s1xEolBB";

let adminIdToken = null;

async function initializeAdminLiff() {
    await liff.init({
        liffId: LIFF_ID,
    });

    if (!liff.isLoggedIn()) {
        liff.login({
            redirectUri: window.location.href,
        });
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

const serviceList =
    document.querySelector("#service-list");

const serviceForm =
    document.querySelector("#service-form");

const serviceNameInput =
    document.querySelector("#service-name");

const servicePriceInput =
    document.querySelector("#service-price");

const serviceDurationInput =
    document.querySelector("#service-duration");

const serviceEditOverlay =
    document.querySelector("#service-edit-overlay");

const serviceEditForm =
    document.querySelector("#service-edit-form");

const editServiceNameInput =
    document.querySelector("#edit-service-name");

const editServicePriceInput =
    document.querySelector("#edit-service-price");

const editServiceDurationInput =
    document.querySelector("#edit-service-duration");

const editServiceActiveInput =
    document.querySelector("#edit-service-active");

const serviceEditCancelButton =
    document.querySelector("#service-edit-cancel");


let editingServiceId = null;


/* =========================================
   Load services
========================================= */

async function loadServices() {

    serviceList.innerHTML =
        '<p class="loading">載入中...</p>';

    try {

        const response = await fetch(
            `${API_BASE_URL}/admin/services`,
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

        const services =
            await response.json();

        renderServices(services);

    } catch (error) {

        console.error(
            "Failed to load services:",
            error
        );

        serviceList.innerHTML =
            '<p class="empty">無法載入服務資料</p>';
    }
}


/* =========================================
   Render
========================================= */

function renderServices(services) {

    serviceList.innerHTML = "";

    if (services.length === 0) {

        serviceList.innerHTML =
            '<p class="empty">尚未建立任何服務</p>';

        return;
    }


    services.forEach((service) => {

        const card =
            document.createElement("article");

        card.className = service.is_active
            ? "service-card"
            : "service-card inactive";


        const durationText =
            service.duration_minutes >= 60
                ? `約 ${Math.floor(service.duration_minutes / 60)} 小時${service.duration_minutes % 60 ? ` ${service.duration_minutes % 60} 分鐘` : ""}`
                : `約 ${service.duration_minutes} 分鐘`;


        card.innerHTML = `
            <div class="service-card-info">

                <h3>
                    ${escapeHtml(service.name)}
                </h3>

                <p>
                    $${service.price.toLocaleString()}
                    ·
                    ${durationText}
                </p>

                <span class="service-status ${service.is_active ? "" : "inactive"}">
                    ${service.is_active ? "啟用中" : "已停用"}
                </span>

            </div>

            <div class="service-card-actions">

                <button
                    type="button"
                    class="service-edit-button"
                    data-id="${service.id}"
                >
                    編輯
                </button>

            </div>
        `;

        serviceList.appendChild(card);

    });

    bindServiceEditButtons(services);
}


function bindServiceEditButtons(services) {

    document
        .querySelectorAll(".service-edit-button")
        .forEach((button) => {

            button.addEventListener(
                "click",
                () => {

                    const service = services.find(
                        (item) => item.id === button.dataset.id
                    );

                    if (service) {
                        openServiceEditDialog(service);
                    }

                }
            );

        });
}


/* =========================================
   Edit dialog
========================================= */

function openServiceEditDialog(service) {

    editingServiceId = service.id;

    editServiceNameInput.value = service.name;
    editServicePriceInput.value = service.price;
    editServiceDurationInput.value = service.duration_minutes;
    editServiceActiveInput.checked = service.is_active;

    serviceEditOverlay.classList.remove("hidden");
}


function closeServiceEditDialog() {

    editingServiceId = null;

    serviceEditOverlay.classList.add("hidden");
}


serviceEditCancelButton.addEventListener(
    "click",
    closeServiceEditDialog
);


serviceEditOverlay.addEventListener(
    "click",
    (event) => {
        if (event.target === serviceEditOverlay) {
            closeServiceEditDialog();
        }
    }
);


serviceEditForm.addEventListener(
    "submit",
    async (event) => {

        event.preventDefault();

        if (!editingServiceId) {
            return;
        }

        const name =
            editServiceNameInput.value.trim();

        const price =
            Number(editServicePriceInput.value);

        const durationMinutes =
            Number(editServiceDurationInput.value);

        if (!name) {
            alert("名稱不可為空");
            return;
        }

        if (
            !Number.isFinite(price) ||
            price < 0
        ) {
            alert("價格必須大於等於 0");
            return;
        }

        if (
            !Number.isFinite(durationMinutes) ||
            durationMinutes <= 0
        ) {
            alert("所需時間必須大於 0");
            return;
        }

        try {

            const response = await fetch(
                `${API_BASE_URL}/admin/services/${editingServiceId}`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${adminIdToken}`,
                    },
                    body: JSON.stringify({
                        name,
                        price,
                        duration_minutes: durationMinutes,
                        is_active: editServiceActiveInput.checked,
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

            closeServiceEditDialog();

            await loadServices();

        } catch (error) {

            console.error(
                "Failed to update service:",
                error
            );

            alert(
                `更新失敗：${error.message}`
            );
        }
    }
);


/* =========================================
   Create service
========================================= */

serviceForm.addEventListener(
    "submit",
    async (event) => {

        event.preventDefault();

        const name =
            serviceNameInput.value.trim();

        const price =
            Number(servicePriceInput.value);

        const durationMinutes =
            Number(serviceDurationInput.value);

        if (!name) {
            alert("名稱不可為空");
            return;
        }

        if (
            !Number.isFinite(price) ||
            price < 0
        ) {
            alert("價格必須大於等於 0");
            return;
        }

        if (
            !Number.isFinite(durationMinutes) ||
            durationMinutes <= 0
        ) {
            alert("所需時間必須大於 0");
            return;
        }

        try {

            const response = await fetch(
                `${API_BASE_URL}/admin/services`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${adminIdToken}`,
                    },
                    body: JSON.stringify({
                        name,
                        price,
                        duration_minutes: durationMinutes,
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

            serviceForm.reset();

            await loadServices();

        } catch (error) {

            console.error(
                "Failed to create service:",
                error
            );

            alert(
                `新增失敗：${error.message}`
            );
        }
    }
);


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
   Init
========================================= */

async function initializeServicesPage() {
    try {
        const authenticated =
            await initializeAdminLiff();

        if (!authenticated) {
            return;
        }

        await loadServices();

    } catch (error) {
        console.error(
            "Admin initialization failed:",
            error
        );

        serviceList.innerHTML =
            '<p class="empty">無法驗證管理員身分</p>';
    }
}

initializeServicesPage();

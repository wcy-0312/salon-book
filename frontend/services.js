/* =========================================
   LIFF 登入、staff_id 解析等共用邏輯已抽到 admin-common.js
   （initializeAdminLiff / getStaffIdFromUrl / resolveInitialStaffId /
   updateUrlStaffId / buildAdminUrl / fetchAdminStaffList /
   pickDefaultStaff），此頁只保留自己的狀態與畫面邏輯。
========================================= */

let currentStaffId = null;


const servicesStaffTitle =
    document.querySelector("#services-staff-title");

const backToAdminLink =
    document.querySelector("#back-to-admin-link");

const serviceList =
    document.querySelector("#service-list");

const serviceForm =
    document.querySelector("#service-form");

const serviceNameInput =
    document.querySelector("#service-name");

const serviceEditOverlay =
    document.querySelector("#service-edit-overlay");

const serviceEditForm =
    document.querySelector("#service-edit-form");

const serviceEditTitle =
    document.querySelector("#service-edit-title");

const editServiceOfferedInput =
    document.querySelector("#edit-service-offered");

const serviceEditFields =
    document.querySelector("#service-edit-fields");

const editServicePriceInput =
    document.querySelector("#edit-service-price");

const editServiceDurationInput =
    document.querySelector("#edit-service-duration");

const serviceEditCancelButton =
    document.querySelector("#service-edit-cancel");


let editingServiceId = null;


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

        servicesStaffTitle.textContent =
            staff
                ? `${staff.name} 的服務`
                : "服務管理";

    } catch (error) {

        console.error(
            "Failed to load staff info:",
            error
        );

        servicesStaffTitle.textContent =
            "服務管理";
    }
}


/* =========================================
   Load staff services
========================================= */

async function loadServices() {

    serviceList.innerHTML =
        '<p class="loading">載入中...</p>';

    try {

        const response = await fetch(
            `${API_BASE_URL}/admin/staff-services?staff_id=${currentStaffId}`,
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

        const items =
            await response.json();

        renderServices(items);

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

function renderServices(items) {

    serviceList.innerHTML = "";

    if (items.length === 0) {

        serviceList.innerHTML =
            '<p class="empty">尚未建立任何服務項目</p>';

        return;
    }


    items.forEach((item) => {

        const isOffered =
            item.service_is_active && item.staff_service_is_active;

        const card =
            document.createElement("article");

        card.className = isOffered
            ? "service-card"
            : "service-card inactive";

        const durationText =
            item.duration_minutes != null
                ? (
                    item.duration_minutes >= 60
                        ? `約 ${Math.floor(item.duration_minutes / 60)} 小時${item.duration_minutes % 60 ? ` ${item.duration_minutes % 60} 分鐘` : ""}`
                        : `約 ${item.duration_minutes} 分鐘`
                )
                : null;

        const detailText = isOffered
            ? `$${item.price.toLocaleString()} · ${durationText}`
            : (
                item.service_is_active
                    ? "尚未提供這項服務"
                    : "服務項目已停用"
            );

        card.innerHTML = `
            <div class="service-card-info">

                <h3>
                    ${escapeHtml(item.service_name)}
                </h3>

                <p>
                    ${detailText}
                </p>

                <span class="service-status ${isOffered ? "" : "inactive"}">
                    ${isOffered ? "提供中" : "未提供"}
                </span>

            </div>

            <div class="service-card-actions">

                <button
                    type="button"
                    class="service-edit-button"
                    data-id="${item.service_id}"
                    ${item.service_is_active ? "" : "disabled"}
                >
                    編輯
                </button>

            </div>
        `;

        serviceList.appendChild(card);

    });

    bindServiceEditButtons(items);
}


function bindServiceEditButtons(items) {

    document
        .querySelectorAll(".service-edit-button")
        .forEach((button) => {

            button.addEventListener(
                "click",
                () => {

                    const item = items.find(
                        (candidate) => candidate.service_id === button.dataset.id
                    );

                    if (item) {
                        openServiceEditDialog(item);
                    }

                }
            );

        });
}


/* =========================================
   Edit dialog
========================================= */

function updateServiceEditFieldsVisibility() {
    const offered =
        editServiceOfferedInput.checked;

    serviceEditFields.classList.toggle(
        "hidden",
        !offered
    );

    editServicePriceInput.required = offered;
    editServiceDurationInput.required = offered;
}


editServiceOfferedInput.addEventListener(
    "change",
    updateServiceEditFieldsVisibility
);


function openServiceEditDialog(item) {

    editingServiceId = item.service_id;

    serviceEditTitle.textContent =
        `編輯「${item.service_name}」`;

    const isOffered =
        item.staff_service_is_active;

    editServiceOfferedInput.checked = isOffered;

    editServicePriceInput.value =
        item.price != null ? item.price : "";

    editServiceDurationInput.value =
        item.duration_minutes != null ? item.duration_minutes : "";

    updateServiceEditFieldsVisibility();

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

        const isOffered =
            editServiceOfferedInput.checked;

        const payload = {
            is_active: isOffered,
        };

        if (isOffered) {

            const price =
                Number(editServicePriceInput.value);

            const durationMinutes =
                Number(editServiceDurationInput.value);

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

            payload.price = price;
            payload.duration_minutes = durationMinutes;
        }

        try {

            const response = await fetch(
                `${API_BASE_URL}/admin/staff-services/${currentStaffId}/${editingServiceId}`,
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

                throw new Error(
                    error.detail
                    ?? `HTTP ${response.status}`
                );
            }

            closeServiceEditDialog();

            await loadServices();

        } catch (error) {

            console.error(
                "Failed to update staff service:",
                error
            );

            alert(
                `更新失敗：${error.message}`
            );
        }
    }
);


/* =========================================
   Create a brand new service item
========================================= */

serviceForm.addEventListener(
    "submit",
    async (event) => {

        event.preventDefault();

        const name =
            serviceNameInput.value.trim();

        if (!name) {
            alert("名稱不可為空");
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

        currentStaffId =
            await resolveInitialStaffId();

        await loadCurrentStaff();
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

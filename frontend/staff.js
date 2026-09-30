/* =========================================
   LIFF 登入邏輯與 API_BASE_URL 已抽到 admin-common.js。
========================================= */

const staffList =
    document.querySelector("#staff-list");

const staffForm =
    document.querySelector("#staff-form");

const staffNameInput =
    document.querySelector("#staff-name");

const staffTitleInput =
    document.querySelector("#staff-title");

const staffEditOverlay =
    document.querySelector("#staff-edit-overlay");

const staffEditForm =
    document.querySelector("#staff-edit-form");

const editStaffNameInput =
    document.querySelector("#edit-staff-name");

const editStaffTitleInput =
    document.querySelector("#edit-staff-title");

const editStaffActiveInput =
    document.querySelector("#edit-staff-active");

const staffEditCancelButton =
    document.querySelector("#staff-edit-cancel");


let editingStaffId = null;


/* =========================================
   Load staff
========================================= */

async function loadStaff() {

    staffList.innerHTML =
        '<p class="loading">載入中...</p>';

    try {

        const response = await fetch(
            `${API_BASE_URL}/admin/staff`,
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

        const staffMembers =
            await response.json();

        renderStaff(staffMembers);

    } catch (error) {

        console.error(
            "Failed to load staff:",
            error
        );

        staffList.innerHTML =
            '<p class="empty">無法載入設計師資料</p>';
    }
}


/* =========================================
   Render
========================================= */

function renderStaff(staffMembers) {

    staffList.innerHTML = "";

    if (staffMembers.length === 0) {

        staffList.innerHTML =
            '<p class="empty">尚未建立任何設計師</p>';

        return;
    }


    staffMembers.forEach((staff) => {

        const card =
            document.createElement("article");

        card.className = staff.is_active
            ? "service-card"
            : "service-card inactive";


        card.innerHTML = `
            <div class="service-card-info">

                <h3>
                    ${escapeHtml(staff.name)}
                </h3>

                <p>
                    ${escapeHtml(staff.title)}
                </p>

                <span class="service-status ${staff.is_active ? "" : "inactive"}">
                    ${staff.is_active ? "啟用中" : "已停用"}
                </span>

            </div>

            <div class="service-card-actions">

                <button
                    type="button"
                    class="service-edit-button"
                    data-id="${staff.id}"
                >
                    編輯
                </button>

            </div>
        `;

        staffList.appendChild(card);

    });

    bindStaffEditButtons(staffMembers);
}


function bindStaffEditButtons(staffMembers) {

    document
        .querySelectorAll(".service-edit-button")
        .forEach((button) => {

            button.addEventListener(
                "click",
                () => {

                    const staff = staffMembers.find(
                        (item) => String(item.id) === button.dataset.id
                    );

                    if (staff) {
                        openStaffEditDialog(staff);
                    }

                }
            );

        });
}


/* =========================================
   Edit dialog
========================================= */

function openStaffEditDialog(staff) {

    editingStaffId = staff.id;

    editStaffNameInput.value = staff.name;
    editStaffTitleInput.value = staff.title;
    editStaffActiveInput.checked = staff.is_active;

    staffEditOverlay.classList.remove("hidden");
}


function closeStaffEditDialog() {

    editingStaffId = null;

    staffEditOverlay.classList.add("hidden");
}


staffEditCancelButton.addEventListener(
    "click",
    closeStaffEditDialog
);


staffEditOverlay.addEventListener(
    "click",
    (event) => {
        if (event.target === staffEditOverlay) {
            closeStaffEditDialog();
        }
    }
);


staffEditForm.addEventListener(
    "submit",
    async (event) => {

        event.preventDefault();

        if (editingStaffId === null) {
            return;
        }

        const name =
            editStaffNameInput.value.trim();

        const title =
            editStaffTitleInput.value.trim();

        if (!name) {
            alert("姓名不可為空");
            return;
        }

        if (!title) {
            alert("職稱不可為空");
            return;
        }

        try {

            const response = await fetch(
                `${API_BASE_URL}/admin/staff/${editingStaffId}`,
                {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${adminIdToken}`,
                    },
                    body: JSON.stringify({
                        name,
                        title,
                        is_active: editStaffActiveInput.checked,
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

            closeStaffEditDialog();

            await loadStaff();

        } catch (error) {

            console.error(
                "Failed to update staff:",
                error
            );

            alert(
                `更新失敗：${error.message}`
            );
        }
    }
);


/* =========================================
   Create staff
========================================= */

staffForm.addEventListener(
    "submit",
    async (event) => {

        event.preventDefault();

        const name =
            staffNameInput.value.trim();

        const title =
            staffTitleInput.value.trim();

        if (!name) {
            alert("姓名不可為空");
            return;
        }

        if (!title) {
            alert("職稱不可為空");
            return;
        }

        try {

            const response = await fetch(
                `${API_BASE_URL}/admin/staff`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${adminIdToken}`,
                    },
                    body: JSON.stringify({
                        name,
                        title,
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

            staffForm.reset();

            await loadStaff();

        } catch (error) {

            console.error(
                "Failed to create staff:",
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

async function initializeStaffPage() {
    try {
        const authenticated =
            await initializeAdminLiff();

        if (!authenticated) {
            return;
        }

        await loadStaff();

    } catch (error) {
        console.error(
            "Admin initialization failed:",
            error
        );

        staffList.innerHTML =
            '<p class="empty">無法驗證管理員身分</p>';
    }
}

initializeStaffPage();

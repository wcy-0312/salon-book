/* =========================================
   新增不可預約時間（Calendar 的「+」入口，第二層頁面）

   沿用既有 BlockedTime business logic（backend 完全沒有變動）：
   一律以該日 [00:00, 隔天00:00) 的整天範圍建立/刪除 BlockedTime，
   與原本 leave.html／leave.js 的行為完全相同，只是重新安排成
   Calendar 底下「選定某一天 → 管理這天是否可預約」的第二層頁面，
   而不是獨立的月曆瀏覽頁。

   沒有 Bottom Navigation，Back 回到 Calendar 並保留原本選定的日期。
========================================= */

const backLink =
    document.querySelector("#back-link");

const content =
    document.querySelector("#blocked-time-content");


let currentStaffId = null;
let selectedDate = null;


const WEEKDAY_LABELS_FULL = ["日", "一", "二", "三", "四", "五", "六"];


function getDateFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const value = params.get("date");

    if (!value) {
        return null;
    }

    const [year, month, day] = value.split("-").map(Number);
    const parsed = new Date(year, month - 1, day);

    return Number.isNaN(parsed.getTime()) ? null : parsed;
}


function formatDateForInput(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}


function formatDateLabel(date) {
    return `${date.getMonth() + 1} 月 ${date.getDate()} 日（${WEEKDAY_LABELS_FULL[date.getDay()]}）`;
}


function buildCalendarUrl() {
    const params = new URLSearchParams({
        staff_id: String(currentStaffId),
        date: formatDateForInput(selectedDate),
    });

    return `calendar.html?${params}`;
}


/* =========================================
   Load current state for the date
========================================= */

async function fetchExistingBlockedTime() {

    const params = new URLSearchParams({
        staff_id: String(currentStaffId),
        date: formatDateForInput(selectedDate),
    });

    const response = await fetch(
        `${API_BASE_URL}/blocked-times?${params}`,
        { headers: { Authorization: `Bearer ${adminIdToken}` } }
    );

    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    const blockedTimes = await response.json();

    // 這一版只處理整天休假（與既有 leave.js 行為一致），找出涵蓋
    // 整天的那一筆（如果有）。
    return blockedTimes.find((bt) => {
        const start = new Date(bt.start_at);
        const end = new Date(bt.end_at);
        return (end.getTime() - start.getTime()) >= 24 * 60 * 60 * 1000;
    }) ?? null;
}


function render(existingBlockedTime) {

    const dateLabel = formatDateLabel(selectedDate);

    if (existingBlockedTime) {

        content.innerHTML = `
            <div class="detail-status-row">
                <span class="detail-heading">${dateLabel}</span>
                <span class="status-pill is-rejected">
                    <span class="icon">${ICONS.noEntry()}</span>
                    已設為休假
                </span>
            </div>

            <div class="detail-card">
                <div class="detail-row">
                    <span class="icon-badge size-md is-note">
                        <span class="icon icon-18">${ICONS.note()}</span>
                    </span>
                    <div class="detail-row-body">
                        <div class="detail-row-primary">原因</div>
                        <div class="detail-row-secondary">${existingBlockedTime.reason ? escapeHtml(existingBlockedTime.reason) : "沒有備註"}</div>
                    </div>
                </div>
            </div>

            <div class="detail-actions single">
                <button type="button" id="remove-button" class="action-button is-reject">
                    <span class="icon">${ICONS.close()}</span>
                    取消這天的休假
                </button>
            </div>
        `;

        document.querySelector("#remove-button").addEventListener(
            "click",
            () => handleRemove(existingBlockedTime.id)
        );

    } else {

        content.innerHTML = `
            <div class="detail-status-row">
                <span class="detail-heading">${dateLabel}</span>
            </div>

            <p class="state-message" style="padding: var(--space-4) 0; text-align: left; color: var(--color-text-muted);">
                目前這天可以正常預約。設為休假後，客人將無法在這天預約，已有的預約不會受影響。
            </p>

            <label class="detail-card" style="display: block; padding: var(--space-4);">
                <span class="detail-row-primary" style="display: block; margin-bottom: var(--space-2);">原因（選填）</span>
                <input
                    id="reason-input"
                    type="text"
                    placeholder="例如：個人休假、進修"
                    style="width: 100%; padding: var(--space-3); border: 1px solid var(--color-border-strong); border-radius: var(--radius-sm); font: inherit; font-size: var(--text-body);"
                >
            </label>

            <div class="detail-actions single">
                <button type="button" id="set-off-button" class="action-button is-confirm">
                    <span class="icon">${ICONS.noEntry()}</span>
                    設為整天休假
                </button>
            </div>
        `;

        document.querySelector("#set-off-button").addEventListener(
            "click",
            handleSetOff
        );
    }
}


function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = value ?? "";
    return div.innerHTML;
}


/* =========================================
   Actions（沿用既有 POST / DELETE /blocked-times 邏輯）
========================================= */

async function handleSetOff() {

    const button = document.querySelector("#set-off-button");
    const reasonInput = document.querySelector("#reason-input");

    button.disabled = true;
    button.textContent = "設定中...";

    const nextDay = new Date(selectedDate);
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
                    staff_id: currentStaffId,
                    start_at: `${formatDateForInput(selectedDate)}T00:00:00`,
                    end_at: `${formatDateForInput(nextDay)}T00:00:00`,
                    reason: reasonInput.value.trim() || null,
                }),
            }
        );

        if (!response.ok) {

            const error = await response.json();

            if (response.status === 409) {
                throw new Error("當天已有客人預約，請先確認或取消該預約後再設定休假");
            }

            throw new Error(error.detail ?? `HTTP ${response.status}`);
        }

        const created = await response.json();

        render(created);

    } catch (error) {

        console.error("Failed to set day off:", error);

        alert(`設定休假失敗：${error.message}`);

        button.disabled = false;
        button.innerHTML = `<span class="icon">${ICONS.noEntry()}</span> 設為整天休假`;
    }
}


async function handleRemove(blockedTimeId) {

    const confirmed = window.confirm("確定要取消這天的休假嗎？");

    if (!confirmed) {
        return;
    }

    const button = document.querySelector("#remove-button");

    button.disabled = true;
    button.textContent = "取消中...";

    try {

        const response = await fetch(
            `${API_BASE_URL}/blocked-times/${blockedTimeId}`,
            {
                method: "DELETE",
                headers: { Authorization: `Bearer ${adminIdToken}` },
            }
        );

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail ?? `HTTP ${response.status}`);
        }

        render(null);

    } catch (error) {

        console.error("Failed to cancel day off:", error);

        alert(`取消休假失敗：${error.message}`);

        button.disabled = false;
        button.innerHTML = `<span class="icon">${ICONS.close()}</span> 取消這天的休假`;
    }
}


/* =========================================
   Init
========================================= */

async function initializeBlockedTimePage() {

    selectedDate = getDateFromUrl() ?? new Date();

    try {

        document.querySelector("#back-icon").innerHTML = ICONS.chevronLeft();

        const authenticated = await initializeAdminLiff();

        if (!authenticated) {
            return;
        }

        currentStaffId =
            getStaffIdFromUrl()
            ?? await resolveInitialStaffId();

        backLink.href = buildCalendarUrl();

        const existing = await fetchExistingBlockedTime();

        render(existing);

    } catch (error) {

        console.error("Failed to load blocked time page:", error);

        content.innerHTML = `<p class="state-message">${error.message ?? "無法載入資料"}</p>`;
    }
}

initializeBlockedTimePage();

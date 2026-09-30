/* =========================================
   SalonBook Admin — 共用 helper

   給所有 Admin 頁面（admin.html / pending.html /
   booking-detail.html / schedule.html / services.html /
   staff.html）共用：LIFF 登入、staff_id 的解析與 URL 讀寫。

   這個檔案只抽出「重複邏輯」，不引入任何 framework 或路由，
   每個頁面仍然各自載入自己的 <script>，彼此獨立運作。
========================================= */

const LIFF_ID = "2011675360-s1xEolBB";

const API_BASE_URL =
    "https://salon-book-production.up.railway.app";

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


function getStaffIdFromUrl() {
    const params =
        new URLSearchParams(window.location.search);

    const value = params.get("staff_id");

    if (!value) {
        return null;
    }

    const parsed = Number(value);

    return Number.isInteger(parsed) ? parsed : null;
}


function updateUrlStaffId(staffId) {
    const url = new URL(window.location.href);

    url.searchParams.set("staff_id", staffId);

    window.history.replaceState(
        null,
        "",
        url
    );
}


function pickDefaultStaff(staffList) {

    const andy = staffList.find(
        (staff) => staff.name === "Andy"
    );

    return (
        andy
        ?? staffList.find((staff) => staff.is_active)
        ?? staffList[0]
    );
}


async function fetchAdminStaffList() {

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

    return response.json();
}


/**
 * 解析目前頁面應該使用哪個 staff_id：
 * URL 上已經有 staff_id 就直接用；沒有的話才打 API 取得預設
 * 設計師（Andy → 第一位 active → 清單第一筆）。
 */
async function resolveInitialStaffId() {

    const staffIdFromUrl =
        getStaffIdFromUrl();

    if (staffIdFromUrl !== null) {
        return staffIdFromUrl;
    }

    const staffList =
        await fetchAdminStaffList();

    if (staffList.length === 0) {
        throw new Error("目前沒有設計師");
    }

    return pickDefaultStaff(staffList).id;
}


/**
 * 組出「帶著目前 staff_id」的 Admin 頁面連結，讓每個頁面之間
 * 的導覽都能保留 staff context，並支援 refresh / deep-link。
 */
function buildAdminUrl(page, staffId) {
    return `${page}?staff_id=${staffId}`;
}

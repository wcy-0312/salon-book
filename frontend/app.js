const LIFF_ID = "2011675360-s1xEolBB";

const API_BASE_URL =
    "https://salon-book-production.up.railway.app";

const servicePage = document.querySelector("#service-page");
const datetimePage = document.querySelector("#datetime-page");

const serviceCards = document.querySelectorAll(".service-card");

const summary = document.querySelector("#summary");
const nextButton = document.querySelector("#next-button");

const backButton = document.querySelector("#back-button");

const calendar = document.querySelector("#calendar");
const calendarTitle = document.querySelector("#calendar-title");

const previousMonthButton =
    document.querySelector("#previous-month");

const nextMonthButton =
    document.querySelector("#next-month");

const timeSection =
    document.querySelector("#time-section");

const timeSlots =
    document.querySelector("#time-slots");

const selectedDateTitle =
    document.querySelector("#selected-date-title");

const bookingServiceSummary =
    document.querySelector("#booking-service-summary");


const bookingPage =
    document.querySelector("#booking-page");

const successPage =
    document.querySelector("#success-page");

const bookingBackButton =
    document.querySelector("#booking-back-button");

const customerName =
    document.querySelector("#customer-name");

const customerPhone =
    document.querySelector("#customer-phone");


const confirmService =
    document.querySelector("#confirm-service");

const confirmDate =
    document.querySelector("#confirm-date");

const confirmTime =
    document.querySelector("#confirm-time");

const confirmDuration =
    document.querySelector("#confirm-duration");

const confirmPrice =
    document.querySelector("#confirm-price");


const successService =
    document.querySelector("#success-service");

const successDate =
    document.querySelector("#success-date");

const successTime =
    document.querySelector("#success-time");

const successPrice =
    document.querySelector("#success-price");


let selectedService = null;
let selectedDate = null;
let selectedTime = null;
let currentStep = 1;


// Calendar 目前顯示的月份
const today = new Date();

let currentYear = today.getFullYear();
let currentMonth = today.getMonth();


/*
 * 暫時使用假資料。
 *
 * 之後 Backend 做好後，
 * 這整段會改成 API response。
 */
// const mockAvailableSlots = {
//     "2026-09-21": [
//         "10:00",
//         "11:00",
//         "14:00",
//         "16:00"
//     ],

//     "2026-09-22": [
//         "13:00",
//         "15:00",
//         "17:00"
//     ],

//     "2026-09-23": [
//         "10:00",
//         "12:00",
//         "18:00"
//     ],

//     "2026-09-25": [
//         "11:00",
//         "14:00",
//         "17:30"
//     ],

//     "2026-09-26": [
//         "10:00",
//         "13:00",
//         "16:00"
//     ]
// };
let availableSlots = {};

/* -------------------------
   Service
------------------------- */

serviceCards.forEach((card) => {

    card.addEventListener("click", () => {

        serviceCards.forEach((item) => {
            item.classList.remove("selected");
        });

        card.classList.add("selected");

        selectedService = {
            id: card.dataset.service,
            name: card.querySelector("strong").textContent,
            price: Number(card.dataset.price),
            duration: Number(card.dataset.duration),
        };

        summary.textContent =
            `${selectedService.name} · $${selectedService.price.toLocaleString()}`;

        nextButton.disabled = false;

    });

});


/* -------------------------
   Bottom button
------------------------- */

nextButton.addEventListener("click", async (event) => {

    event.preventDefault();

    /*
     * Step 1
     * Service → Date/Time
     */
    if (currentStep === 1) {

        if (!selectedService) {
            return;
        }

        servicePage.classList.add("hidden");
        datetimePage.classList.remove("hidden");

        bookingServiceSummary.textContent =
            `${selectedService.name} · $${selectedService.price.toLocaleString()}`;

        nextButton.textContent = "請選擇時段";
        nextButton.disabled = true;

        currentStep = 2;

        renderCalendar();

        window.scrollTo(0, 0);

        return;
    }


    /*
     * Step 2
     * Date/Time → Booking confirmation
     */
    if (currentStep === 2) {

        if (!selectedDate || !selectedTime) {
            return;
        }

        datetimePage.classList.add("hidden");
        bookingPage.classList.remove("hidden");

        renderBookingSummary();

        summary.textContent =
            `${formatDisplayDate(selectedDate)} ${selectedTime}`;

        nextButton.textContent = "送出預約";

        currentStep = 3;

        validateBookingForm();

        window.scrollTo(0, 0);

        return;
    }


    /*
     * Step 3
     * Submit booking
     */
    if (currentStep === 3) {

        if (!isBookingFormValid()) {
            return;
        }

        // 避免連點造成重複預約
        nextButton.disabled = true;
        nextButton.textContent = "送出中...";

        try {

            const response = await fetch(
                `${API_BASE_URL}/bookings`,
                {
                    method: "POST",

                    headers: {
                        "Content-Type": "application/json",
                    },

                    body: JSON.stringify({
                        staff_id: 1,

                        service_id: selectedService.id,

                        customer_name: customerName.value.trim(),
                        customer_phone: customerPhone.value.trim(),

                        start_at:
                            `${selectedDate}T${selectedTime}:00`,
                    }),
                }
            );


            if (!response.ok) {
                const errorData = await response.json();

                throw new Error(
                    `HTTP ${response.status}: ${
                        errorData.detail ?? "Unknown error"
                    }`
                );
            }


            const createdBooking =
                await response.json();


            console.log(
                "Booking created:",
                createdBooking
            );


            /*
             * API 成功後才進成功頁
             */
            bookingPage.classList.add("hidden");
            successPage.classList.remove("hidden");

            currentStep = 4;

            renderSuccessPage();

            document
                .querySelector(".bottom-bar")
                .classList.add("hidden");

            window.scrollTo(0, 0);

        } catch (error) {

            console.error(
                "Create booking failed:",
                error
            );

            alert(
                `預約送出失敗\n${error.message}`
            );

            nextButton.disabled = false;
            nextButton.textContent = "送出預約";
        }

        return;
    }

});


/* -------------------------
   Back
------------------------- */

backButton.addEventListener("click", () => {

    datetimePage.classList.add("hidden");
    servicePage.classList.remove("hidden");

    currentStep = 1;

    selectedDate = null;
    selectedTime = null;

    timeSection.classList.add("hidden");

    summary.textContent =
        `${selectedService.name} · $${selectedService.price.toLocaleString()}`;

    nextButton.textContent = "選擇日期";
    nextButton.disabled = false;

});


/* -------------------------
   Calendar
------------------------- */

function renderCalendar() {

    calendar.innerHTML = "";

    calendarTitle.textContent =
        `${currentYear} 年 ${currentMonth + 1} 月`;


    const firstDay =
        new Date(currentYear, currentMonth, 1);

    const lastDay =
        new Date(currentYear, currentMonth + 1, 0);


    /*
     * 月初之前補空格
     */
    for (let i = 0; i < firstDay.getDay(); i++) {

        const empty =
            document.createElement("div");

        empty.classList.add("calendar-empty");

        calendar.appendChild(empty);

    }


    /*
     * 建立日期
     */
    for (
        let day = 1;
        day <= lastDay.getDate();
        day++
    ) {

        const button =
            document.createElement("button");

        button.type = "button";
        button.classList.add("calendar-day");

        button.textContent = day;


        const dateString =
            formatDate(
                currentYear,
                currentMonth + 1,
                day
            );


        /*
         * 沒有可預約時段的日期不能按
         */
        button.addEventListener(
            "click",
            async () => {

                await selectDate(
                    button,
                    dateString
                );

            }
        );


        if (selectedDate === dateString) {
            button.classList.add("selected");
        }


        calendar.appendChild(button);

    }

}


/* -------------------------
   Select date
------------------------- */

async function selectDate(
    button,
    dateString
) {

    document
        .querySelectorAll(".calendar-day")
        .forEach((day) => {
            day.classList.remove("selected");
        });


    button.classList.add("selected");

    selectedDate = dateString;
    selectedTime = null;

    nextButton.disabled = true;
    nextButton.textContent = "請選擇時段";


    try {

        const slots =
            await fetchAvailability(
                dateString
            );

        availableSlots[dateString] =
            slots;

        renderTimeSlots(
            dateString
        );

    } catch (error) {

        console.error(
            "Failed to load availability:",
            error
        );

        alert("無法取得可預約時段");

    }
}


/* -------------------------
   Time slots
------------------------- */

function renderTimeSlots(dateString) {

    timeSlots.innerHTML = "";

    timeSection.classList.remove("hidden");


    selectedDateTitle.textContent =
        `${formatDisplayDate(dateString)} 可預約時段`;


    const slots =
        availableSlots[dateString] ?? [];

    if (slots.length === 0) {

        timeSlots.innerHTML =
            "<p>當天沒有可預約時段</p>";

        return;
    }


    slots.forEach((time) => {

        const button =
            document.createElement("button");

        button.type = "button";
        button.classList.add("time-slot");

        button.textContent = time;


        button.addEventListener("click", () => {

            document
                .querySelectorAll(".time-slot")
                .forEach((slot) => {

                    slot.classList.remove("selected");

                });


            button.classList.add("selected");

            selectedTime = time;


            summary.textContent =
                `${formatDisplayDate(selectedDate)} ${selectedTime}`;


            nextButton.textContent =
                "下一步";

            nextButton.disabled = false;

        });


        timeSlots.appendChild(button);

    });

}


/* -------------------------
   Month navigation
------------------------- */

previousMonthButton.addEventListener(
    "click",
    () => {

        currentMonth--;

        if (currentMonth < 0) {

            currentMonth = 11;
            currentYear--;

        }

        renderCalendar();

    }
);


nextMonthButton.addEventListener(
    "click",
    () => {

        currentMonth++;

        if (currentMonth > 11) {

            currentMonth = 0;
            currentYear++;

        }

        renderCalendar();

    }
);


/* -------------------------
   表單驗證
------------------------- */

customerName.addEventListener(
    "input",
    validateBookingForm
);

customerPhone.addEventListener(
    "input",
    validateBookingForm
);


function validateBookingForm() {

    if (
        bookingPage.classList.contains("hidden")
    ) {
        return;
    }

    nextButton.disabled =
        !isBookingFormValid();

}


function isBookingFormValid() {

    const name =
        customerName.value.trim();

    const phone =
        customerPhone.value.trim();


    return (
        name.length > 0 &&
        /^09\d{8}$/.test(phone)
    );

}

/* -------------------------
   返回選時間
------------------------- */

bookingBackButton.addEventListener(
    "click",
    () => {

        bookingPage.classList.add("hidden");
        datetimePage.classList.remove("hidden");

        currentStep = 2;

        nextButton.textContent = "下一步";
        nextButton.disabled = false;

        summary.textContent =
            `${formatDisplayDate(selectedDate)} ${selectedTime}`;

        window.scrollTo(0, 0);

    }
);

/* -------------------------
   取得 availability
------------------------- */

async function fetchAvailability(dateString) {

    const params = new URLSearchParams({
        staff_id: "1",
        service_id: selectedService.id,
        target_date: dateString,
    });

    const response = await fetch(
        `${API_BASE_URL}/availability?${params}`
    );

    if (!response.ok) {
        throw new Error(
            `Availability API error: ${response.status}`
        );
    }

    const data = await response.json();

    return data.slots;
}

/* -------------------------
   Helpers
------------------------- */

function formatDate(year, month, day) {

    const mm =
        String(month).padStart(2, "0");

    const dd =
        String(day).padStart(2, "0");


    return `${year}-${mm}-${dd}`;

}


function formatDisplayDate(dateString) {

    const [year, month, day] =
        dateString.split("-");


    return `${Number(month)}/${Number(day)}`;

}


function renderBookingSummary() {

    confirmService.textContent =
        selectedService.name;

    confirmDate.textContent =
        formatDisplayDate(selectedDate);

    confirmTime.textContent =
        selectedTime;

    confirmDuration.textContent =
        formatDuration(selectedService.duration);

    confirmPrice.textContent =
        `$${selectedService.price.toLocaleString()}`;

}


function renderSuccessPage() {

    successService.textContent =
        selectedService.name;

    successDate.textContent =
        formatDisplayDate(selectedDate);

    successTime.textContent =
        selectedTime;

    successPrice.textContent =
        `$${selectedService.price.toLocaleString()}`;

}


function formatDuration(minutes) {

    if (minutes < 60) {
        return `${minutes} 分鐘`;
    }

    const hours =
        Math.floor(minutes / 60);

    const remainingMinutes =
        minutes % 60;

    if (remainingMinutes === 0) {
        return `約 ${hours} 小時`;
    }

    return `約 ${hours} 小時 ${remainingMinutes} 分鐘`;

}


let lineIdToken = null;


async function verifyLineIdentity() {
    if (!lineIdToken) {
        throw new Error("LINE ID token is unavailable");
    }

    const response = await fetch(
        `${API_BASE_URL}/auth/line`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                id_token: lineIdToken,
            }),
        }
    );

    if (!response.ok) {
        throw new Error(
            `LINE authentication failed: ${response.status}`
        );
    }

    return await response.json();
}

async function initializeLiff() {
    try {
        await liff.init({
            liffId: LIFF_ID,
        });

        if (!liff.isLoggedIn()) {
            liff.login();
            return;
        }

        const profile = await liff.getProfile();

        lineIdToken = liff.getIDToken();

        const lineUser = await verifyLineIdentity();

        alert(
            `LINE 身分驗證成功\n${lineUser.display_name}`
        );

        console.log(
            "LINE user:",
            profile.displayName
        );

        console.log(
            "ID token available:",
            Boolean(lineIdToken)
        );

    } catch (error) {
        console.error(
            "LIFF initialization failed:",
            error
        );
    }
}

initializeLiff();

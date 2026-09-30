/* =========================================
   SalonBook Admin — Icon system

   一套 24x24 outline SVG icon，統一線寬、統一風格，取代原本
   散落各處的 Emoji（🏠 📅 ✂️ ⚙️ 👤 ✅ 等）。

   所有 icon 都用 currentColor，顏色完全交給呼叫端的 CSS
   （nav 用中性灰／品牌色；Booking Detail 的語意 icon 用個別
   語意色），Icon 本身不內建顏色，避免「多彩 icon family」
   與「單色 nav icon」需要兩套實作。

   使用方式：ICONS.home()、ICONS.calendar() 等，回傳 SVG 字串，
   直接塞進 innerHTML。不引入任何外部 icon library 或 CDN，
   純 vanilla，避免額外的網路依賴或 framework。
========================================= */

const ICONS = {

    home: () => `
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 10.5L12 4L20 10.5V19C20 19.5523 19.5523 20 19 20H15V14H9V20H5C4.44772 20 4 19.5523 4 19V10.5Z"
                stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" />
        </svg>
    `,

    calendarNav: () => `
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="4" y="5.5" width="16" height="14" rx="2" stroke="currentColor" stroke-width="1.7" />
            <path d="M4 9.5H20" stroke="currentColor" stroke-width="1.7" />
            <path d="M8 3.5V6.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
            <path d="M16 3.5V6.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
        </svg>
    `,

    scissors: () => `
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="6.5" cy="6.5" r="2.2" stroke="currentColor" stroke-width="1.7" />
            <circle cx="6.5" cy="17.5" r="2.2" stroke="currentColor" stroke-width="1.7" />
            <path d="M8.2 7.8L20 19" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
            <path d="M8.2 16.2L20 5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
        </svg>
    `,

    settings: () => `
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.7" />
            <path d="M12 3.5V5.5M12 18.5V20.5M20.5 12H18.5M5.5 12H3.5M17.7 6.3L16.3 7.7M7.7 16.3L6.3 17.7M17.7 17.7L16.3 16.3M7.7 7.7L6.3 6.3"
                stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
        </svg>
    `,

    clock: () => `
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="1.7" />
            <path d="M12 8V12L14.8 14" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
    `,

    chevronRight: () => `
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M9 6L15 12L9 18" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
    `,

    chevronLeft: () => `
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M15 6L9 12L15 18" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
    `,

    user: () => `
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="8.3" r="3.3" stroke="currentColor" stroke-width="1.7" />
            <path d="M5 19.5C5.8 16.3 8.6 14.5 12 14.5C15.4 14.5 18.2 16.3 19 19.5"
                stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
        </svg>
    `,

    calendarDetail: () => `
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="4" y="5.5" width="16" height="14" rx="2" stroke="currentColor" stroke-width="1.7" />
            <path d="M4 9.5H20" stroke="currentColor" stroke-width="1.7" />
            <path d="M8 3.5V6.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
            <path d="M16 3.5V6.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
        </svg>
    `,

    note: () => `
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 4.5H15L18 7.5V19.5H6V4.5Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" />
            <path d="M14.5 4.7V8H17.8" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" />
            <path d="M9 12H15M9 15.5H13" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
        </svg>
    `,

    checkCircle: () => `
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.7" />
            <path d="M8.5 12.3L10.8 14.6L15.5 9.7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
    `,

    closeCircle: () => `
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.7" />
            <path d="M9.5 9.5L14.5 14.5M14.5 9.5L9.5 14.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
        </svg>
    `,

    check: () => `
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M5 12.5L9.5 17L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
    `,

    close: () => `
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
    `,

    sparkle: () => `
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 4L13.6 9.4L19 11L13.6 12.6L12 18L10.4 12.6L5 11L10.4 9.4L12 4Z"
                stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
        </svg>
    `,

};

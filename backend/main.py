import os
import httpx
import uuid
from pathlib import Path
from datetime import date, datetime, time, timedelta
from enum import Enum
from zoneinfo import ZoneInfo


from fastapi import Depends, FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Field, Session, SQLModel, create_engine, select
from sqlalchemy import UniqueConstraint
from contextlib import asynccontextmanager


# =========================================================
# Timezone
# =========================================================
# All datetime columns (start_at, created_at, reminder_sent_at) are
# stored as naive datetimes that represent Asia/Taipei local time,
# regardless of the server's own system timezone. `taipei_now()` must
# be used instead of `datetime.now()` for any business-time logic.

TAIPEI_TZ = ZoneInfo("Asia/Taipei")


def taipei_now() -> datetime:
    return datetime.now(TAIPEI_TZ).replace(tzinfo=None)


# =========================================================
# Database
# =========================================================

BASE_DIR = Path(__file__).resolve().parent

DATA_DIR = Path(
    os.getenv(
        "DATA_DIR",
        BASE_DIR / "data",
    )
)

DATA_DIR.mkdir(parents=True, exist_ok=True)

DB_PATH = DATA_DIR / "salonbook.db"

engine = create_engine(
    f"sqlite:///{DB_PATH.as_posix()}",
    echo=True,
)


# =========================================================
# Models
# =========================================================

class BookingStatus(str, Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    REJECTED = "rejected"
    CANCELLED = "cancelled"


class Staff(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    name: str
    title: str
    is_active: bool = Field(default=True)


class Service(SQLModel, table=True):
    id: str = Field(primary_key=True)
    name: str
    is_active: bool = Field(default=True)


class StaffService(SQLModel, table=True):
    """
    設計師與服務的關聯：每位設計師可以為自己提供的服務設定
    專屬的 price / duration_minutes。同一個 staff_id + service_id
    最多只能有一筆設定，由下方 unique constraint 強制保證；
    constraint 名稱必須與 migration
    57798a2ffe54_add_staff_service_table.py 裡建立的
    'uq_staffservice_staff_id_service_id' 一致，否則
    `alembic check` 會偵測到 model metadata 與實際 DB schema
    不一致。
    """

    __table_args__ = (
        UniqueConstraint(
            "staff_id",
            "service_id",
            name="uq_staffservice_staff_id_service_id",
        ),
    )

    id: int | None = Field(default=None, primary_key=True)

    staff_id: int
    service_id: str

    price: int
    duration_minutes: int

    is_active: bool = Field(default=True)


class Schedule(SQLModel, table=True):
    id: int | None = Field(
        default=None,
        primary_key=True,
    )

    staff_id: int

    # Python weekday:
    # Monday = 0
    # Tuesday = 1
    # ...
    # Sunday = 6
    weekday: int

    start_time: time
    end_time: time


class Booking(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)

    staff_id: int

    service_id: str
    service_name: str
    price: int
    duration_minutes: int

    customer_name: str
    customer_phone: str

    line_user_id: str | None = Field(default=None, index=True)

    start_at: datetime
    status: BookingStatus = BookingStatus.PENDING
    created_at: datetime = Field(
        default_factory=taipei_now
    )
    reminder_sent_at: datetime | None = None


class BlockedTime(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)

    staff_id: int

    start_at: datetime
    end_at: datetime

    reason: str | None = None

    created_at: datetime = Field(
        default_factory=taipei_now
    )


class BookingCreate(SQLModel):
    staff_id: int
    service_id: str

    customer_name: str
    customer_phone: str

    start_at: datetime
    id_token: str


class BlockedTimeCreate(SQLModel):
    staff_id: int
    start_at: datetime
    end_at: datetime
    reason: str | None = None


class ServiceCreate(SQLModel):
    name: str


class ServiceUpdate(SQLModel):
    name: str | None = None
    is_active: bool | None = None


class StaffServiceUpsert(SQLModel):
    """
    Admin 設定「某設計師是否提供某服務」的請求格式。
    price / duration_minutes 只在 is_active 為 True 時需要。
    """

    price: int | None = None
    duration_minutes: int | None = None
    is_active: bool


class StaffCreate(SQLModel):
    name: str
    title: str


class StaffUpdate(SQLModel):
    name: str | None = None
    title: str | None = None
    is_active: bool | None = None


class ScheduleDay(SQLModel):
    weekday: int
    is_open: bool
    start_time: time | None = None
    end_time: time | None = None


class ScheduleDayUpdate(SQLModel):
    staff_id: int
    is_open: bool
    start_time: time | None = None
    end_time: time | None = None


class AvailabilityResponse(SQLModel):
    date: date
    staff_id: int
    service_id: str
    slots: list[str]


class LineAuthRequest(SQLModel):
    id_token: str


class LineAuthResponse(SQLModel):
    line_user_id: str
    display_name: str | None = None


class AdminAuthRequest(SQLModel):
    id_token: str


class StaffServiceOffering(SQLModel):
    """
    客戶端看到的「某設計師提供的某項服務」：Service 本身的
    id/name，加上該設計師專屬的 price/duration_minutes。
    """

    id: str
    name: str
    price: int
    duration_minutes: int


class AdminStaffServiceItem(SQLModel):
    """
    Admin 服務管理頁面用：某個 Service 本身的資訊，加上
    「目前選中的設計師」是否提供、以及該設計師的 price/duration
    （若尚未設定則為 None）。
    """

    service_id: str
    service_name: str
    service_is_active: bool
    staff_service_is_active: bool
    price: int | None = None
    duration_minutes: int | None = None


class MyBookingResponse(SQLModel):
    id: int
    staff_name: str
    service_name: str
    price: int
    duration_minutes: int
    start_at: datetime
    status: BookingStatus


# =========================================================
# Seed Data
# =========================================================

def seed_data():

    with Session(engine) as session:

        # -------------------------
        # Staff
        # -------------------------
        # Staff(id=1) 是否已存在，代表這個資料庫是否已經初始化過。
        # 這裡沒有任何刪除 Staff 的功能，所以可以安全地把它當成
        # 「是否為全新資料庫」的一次性判斷依據，而不是用
        # Schedule table 是否為空（Admin 把整週都設為公休時，
        # Schedule table 會合法地變成空的，不代表尚未初始化）。

        staff = session.get(Staff, 1)

        is_first_time_setup = staff is None

        if staff is None:

            staff = Staff(
                id=1,
                name="Andy",
                title="髮型設計師",
            )

            session.add(staff)


        # -------------------------
        # Services
        # -------------------------
        # Service 只描述服務本身（name/is_active），價格與服務時間
        # 屬於每位設計師自己的 StaffService，見下方 Andy 的預設值。

        default_services = [
            ("cut", "剪髮", 600, 60),
            ("perm", "燙髮", 800, 180),
            ("color", "染髮", 1200, 180),
            ("care", "護髮", 1000, 120),
        ]

        for service_id, name, default_price, default_duration in default_services:

            existing_service = session.get(
                Service,
                service_id,
            )

            if existing_service is None:
                session.add(
                    Service(
                        id=service_id,
                        name=name,
                    )
                )

            # 只在資料庫第一次初始化時，幫 Andy 建立對應的
            # StaffService（沿用原本 Service 上的預設價格/時間）。
            # 之後 Admin 對 Andy 服務設定的任何修改都不會被覆蓋。
            if is_first_time_setup:

                session.add(
                    StaffService(
                        staff_id=1,
                        service_id=service_id,
                        price=default_price,
                        duration_minutes=default_duration,
                    )
                )

        # -------------------------
        # Schedule
        # -------------------------
        # 只在資料庫第一次初始化時建立預設營業時間。
        # 之後即使 Admin 把整週都設成公休（Schedule table 變空），
        # 重新啟動也不會被這裡誤判成「尚未初始化」而恢復預設值。

        if is_first_time_setup:

            # Monday ~ Saturday
            for weekday in range(6):

                schedule = Schedule(
                    staff_id=1,
                    weekday=weekday,
                    start_time=time(10, 0),
                    end_time=time(19, 0),
                )

                session.add(schedule)


        session.commit()


# =========================================================
# Lifespan
# =========================================================

@asynccontextmanager
async def lifespan(app: FastAPI):

    # 建立初始資料
    seed_data()

    yield
    # 關閉時執行
    # 目前 SalonBook 沒東西需要寫

# =========================================================
# FastAPI
# =========================================================

app = FastAPI(
    title="SalonBook API",
    lifespan=lifespan,
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://wcy-0312.github.io",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================================================
# Functions
# =========================================================

def verify_line_id_token(id_token: str) -> dict:
    channel_id = os.getenv("LINE_CHANNEL_ID")

    if not channel_id:
        raise HTTPException(
            status_code=500,
            detail="LINE_CHANNEL_ID is not configured",
        )

    response = httpx.post(
        "https://api.line.me/oauth2/v2.1/verify",
        data={
            "id_token": id_token,
            "client_id": channel_id,
        },
        timeout=10.0,
    )

    if response.status_code != 200:
        raise HTTPException(
            status_code=401,
            detail="Invalid LINE ID token",
        )

    return response.json()


def verify_admin(id_token: str) -> dict:
    line_payload = verify_line_id_token(id_token)

    admin_line_user_id = os.getenv(
        "ADMIN_LINE_USER_ID"
    )

    if not admin_line_user_id:
        raise HTTPException(
            status_code=500,
            detail="ADMIN_LINE_USER_ID is not configured",
        )

    if line_payload["sub"] != admin_line_user_id:
        raise HTTPException(
            status_code=403,
            detail="Admin access required",
        )

    return line_payload


def require_admin(
    authorization: str | None = Header(default=None),
) -> dict:
    if not authorization:
        raise HTTPException(
            status_code=401,
            detail="Authorization header is required",
        )

    scheme, _, id_token = authorization.partition(" ")

    if scheme.lower() != "bearer" or not id_token:
        raise HTTPException(
            status_code=401,
            detail="Invalid authorization header",
        )

    return verify_admin(id_token)


def require_line_user(
    authorization: str | None = Header(default=None),
) -> str:
    """
    驗證 Authorization header 帶的 LINE ID token，回傳 LINE sub。
    僅代表「這是一個合法登入的 LINE 使用者」，不代表擁有任何特定
    Booking 的存取權；booking ownership 需要另外用
    booking.line_user_id == sub 檢查。
    """

    if not authorization:
        raise HTTPException(
            status_code=401,
            detail="Authorization header is required",
        )

    scheme, _, id_token = authorization.partition(" ")

    if scheme.lower() != "bearer" or not id_token:
        raise HTTPException(
            status_code=401,
            detail="Invalid authorization header",
        )

    line_payload = verify_line_id_token(id_token)

    return line_payload["sub"]


def push_line_messages(
    line_user_id: str,
    messages: list[dict],
) -> None:
    channel_access_token = os.getenv(
        "LINE_CHANNEL_ACCESS_TOKEN"
    )

    if not channel_access_token:
        raise HTTPException(
            status_code=500,
            detail="LINE_CHANNEL_ACCESS_TOKEN is not configured",
        )

    response = httpx.post(
        "https://api.line.me/v2/bot/message/push",
        headers={
            "Authorization": f"Bearer {channel_access_token}",
            "Content-Type": "application/json",
        },
        json={
            "to": line_user_id,
            "messages": messages,
        },
        timeout=10.0,
    )

    if response.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"LINE message failed: {response.text}",
        )


def send_line_message(
    line_user_id: str,
    message: str,
) -> None:
    push_line_messages(
        line_user_id,
        [
            {
                "type": "text",
                "text": message,
            }
        ],
    )


def try_send_line_message(
    line_user_id: str,
    message: str,
) -> bool:
    try:
        send_line_message(
            line_user_id,
            message,
        )
        return True

    except Exception as error:
        print(
            f"Failed to send LINE message: {error}"
        )
        return False


def build_booking_view_url(booking_id: int) -> str:
    """
    產生開啟 SalonBook MINI App 單筆預約頁的網址。
    使用既有 LIFF app（與客戶端預約流程共用同一個 LIFF ID），
    深連結到 booking.html，不直接暴露 Railway API URL。

    沿用目前實際使用的 MINI App domain（miniapp.line.me）。
    LINE 會把 LIFF ID 之後的 path／query string 原樣轉發到該
    LIFF app 設定的 Endpoint URL 上（這與 liff.line.me 是同一套
    轉發機制，只是網域名稱不同），因此 booking_id 這個 query
    string 會被保留並傳到 booking.html。
    """

    liff_id = os.getenv("LIFF_ID")

    if not liff_id:
        raise HTTPException(
            status_code=500,
            detail="LIFF_ID is not configured",
        )

    return f"https://miniapp.line.me/{liff_id}/booking.html?booking_id={booking_id}"


# 各種 booking lifecycle 事件對應的 Flex Message 呈現設定。
# 統一由 build_booking_flex_message() 依 notification_type 組出
# 完整的 Flex Message，避免每個狀態各自複製一份幾乎相同的 JSON。
BOOKING_FLEX_NOTIFICATION_CONFIG = {
    "pending": {
        "alt_text": "預約申請已送出",
        "title": "預約申請已送出",
        "title_color": "#b8860b",
        "status_text": "等待設計師確認",
        "show_action_button": True,
    },
    "confirmed": {
        "alt_text": "預約已確認",
        "title": "預約已確認",
        "title_color": "#1f8a4c",
        "status_text": "已確認",
        "show_action_button": True,
    },
    "rejected": {
        "alt_text": "預約未成立",
        "title": "預約未成立",
        "title_color": "#c0392b",
        "status_text": "設計師未接受這筆預約",
        "show_action_button": False,
    },
    "cancelled": {
        "alt_text": "預約已取消",
        "title": "預約已取消",
        "title_color": "#888888",
        "status_text": "已取消",
        "show_action_button": False,
    },
    "reminder": {
        "alt_text": "明天有預約",
        "title": "明天有預約",
        "title_color": "#242424",
        "status_text": "已確認",
        "show_action_button": True,
    },
}


def build_booking_info_row(label: str, value: str) -> dict:
    return {
        "type": "box",
        "layout": "baseline",
        "contents": [
            {
                "type": "text",
                "text": label,
                "color": "#999999",
                "size": "sm",
                "flex": 2,
            },
            {
                "type": "text",
                "text": value,
                "size": "sm",
                "flex": 5,
                "wrap": True,
            },
        ],
    }


def build_booking_flex_message(
    booking: "Booking",
    staff_name: str,
    notification_type: str,
) -> dict:
    """
    共用的 booking Flex Message builder。
    notification_type 決定 title、狀態文字、顏色，以及是否附上
    「查看／取消預約」按鈕；booking 本身的欄位呈現方式一致。
    """

    config = BOOKING_FLEX_NOTIFICATION_CONFIG[notification_type]

    body_contents = [
        {
            "type": "text",
            "text": config["title"],
            "weight": "bold",
            "size": "lg",
            "color": config["title_color"],
        },
        {
            "type": "separator",
            "margin": "md",
        },
        {
            "type": "box",
            "layout": "vertical",
            "margin": "md",
            "spacing": "sm",
            "contents": [
                build_booking_info_row("設計師", staff_name),
                build_booking_info_row("服務", booking.service_name),
                build_booking_info_row(
                    "日期",
                    f"{booking.start_at:%Y/%m/%d}",
                ),
                build_booking_info_row(
                    "時間",
                    f"{booking.start_at:%H:%M}",
                ),
                build_booking_info_row(
                    "價格",
                    f"${booking.price}",
                ),
                build_booking_info_row(
                    "狀態",
                    config["status_text"],
                ),
            ],
        },
    ]

    bubble = {
        "type": "bubble",
        "body": {
            "type": "box",
            "layout": "vertical",
            "spacing": "md",
            "contents": body_contents,
        },
    }

    if config["show_action_button"]:
        bubble["footer"] = {
            "type": "box",
            "layout": "vertical",
            "contents": [
                {
                    "type": "button",
                    "style": "primary",
                    "color": "#242424",
                    "action": {
                        "type": "uri",
                        "label": "查看／取消預約",
                        "uri": build_booking_view_url(booking.id),
                    },
                },
            ],
        }

    return {
        "type": "flex",
        "altText": config["alt_text"],
        "contents": bubble,
    }


def try_send_line_flex_message(
    line_user_id: str,
    flex_message: dict,
) -> bool:
    try:
        push_line_messages(
            line_user_id,
            [flex_message],
        )
        return True

    except Exception as error:
        print(
            f"Failed to send LINE flex message: {error}"
        )
        return False

# =========================================================
# Root
# =========================================================

@app.get("/")
def root():

    return {
        "message": "SalonBook API"
    }


# =========================================================
# Staff
# =========================================================

@app.get("/staff")
def get_staff():

    with Session(engine) as session:

        statement = select(Staff).where(
            Staff.is_active == True
        )

        staff = session.exec(
            statement
        ).all()

        return staff


@app.get(
    "/admin/staff",
    response_model=list[Staff],
)
def get_admin_staff(
    authorization: str | None = Header(default=None),
):
    require_admin(authorization)

    with Session(engine) as session:

        statement = select(Staff).order_by(
            Staff.name
        )

        staff = session.exec(
            statement
        ).all()

        return staff


def validate_staff_fields(
    name: str | None,
    title: str | None,
):
    if name is not None and not name.strip():
        raise HTTPException(
            status_code=422,
            detail="name must not be empty",
        )

    if title is not None and not title.strip():
        raise HTTPException(
            status_code=422,
            detail="title must not be empty",
        )


@app.post(
    "/admin/staff",
    response_model=Staff,
)
def create_staff(
    data: StaffCreate,
    authorization: str | None = Header(default=None),
):
    require_admin(authorization)

    validate_staff_fields(
        data.name,
        data.title,
    )

    with Session(engine) as session:

        staff = Staff(
            name=data.name.strip(),
            title=data.title.strip(),
        )

        session.add(staff)
        session.commit()
        session.refresh(staff)

        return staff


@app.patch(
    "/admin/staff/{staff_id}",
    response_model=Staff,
)
def update_staff(
    staff_id: int,
    data: StaffUpdate,
    authorization: str | None = Header(default=None),
):
    require_admin(authorization)

    validate_staff_fields(
        data.name,
        data.title,
    )

    with Session(engine) as session:

        staff = session.get(
            Staff,
            staff_id,
        )

        if staff is None:
            raise HTTPException(
                status_code=404,
                detail="Staff not found",
            )

        # active → inactive 之前，確認沒有未來的 PENDING/CONFIRMED
        # Booking，避免客人的預約被停用的設計師「偷偷」晾在那裡。
        # inactive → active、以及其他欄位（name/title）的修改不受此限制。
        if (
            data.is_active is False
            and staff.is_active
        ):
            future_active_bookings = session.exec(
                select(Booking).where(
                    Booking.staff_id == staff_id,
                    Booking.start_at >= taipei_now(),
                    Booking.status.in_([
                        BookingStatus.PENDING,
                        BookingStatus.CONFIRMED,
                    ]),
                )
            ).first()

            if future_active_bookings is not None:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        "This staff member has upcoming pending or "
                        "confirmed bookings; please resolve them "
                        "before deactivating"
                    ),
                )

        if data.name is not None:
            staff.name = data.name.strip()

        if data.title is not None:
            staff.title = data.title.strip()

        if data.is_active is not None:
            staff.is_active = data.is_active

        session.add(staff)
        session.commit()
        session.refresh(staff)

        return staff


# =========================================================
# Services
# =========================================================

@app.get(
    "/services",
    response_model=list[StaffServiceOffering],
)
def get_services(
    staff_id: int,
):
    """
    客戶端取得「某設計師目前可預約的服務」，包含該設計師專屬的
    price / duration_minutes。只回傳 Staff active、Service active、
    StaffService active 三者皆成立的項目。
    """

    with Session(engine) as session:

        staff = session.get(
            Staff,
            staff_id,
        )

        if staff is None:
            raise HTTPException(
                status_code=404,
                detail="Staff not found",
            )

        if not staff.is_active:
            return []

        statement = (
            select(StaffService, Service)
            .where(
                StaffService.staff_id == staff_id,
                StaffService.is_active == True,
                StaffService.service_id == Service.id,
                Service.is_active == True,
            )
            .order_by(
                StaffService.price,
                Service.name,
            )
        )

        rows = session.exec(statement).all()

        return [
            StaffServiceOffering(
                id=service.id,
                name=service.name,
                price=staff_service.price,
                duration_minutes=staff_service.duration_minutes,
            )
            for staff_service, service in rows
        ]


@app.get(
    "/admin/services",
    response_model=list[Service],
)
def get_admin_services(
    authorization: str | None = Header(default=None),
):
    require_admin(authorization)

    with Session(engine) as session:

        statement = select(Service).order_by(
            Service.name
        )

        services = session.exec(
            statement
        ).all()

        return services


@app.get(
    "/admin/staff-services",
    response_model=list[AdminStaffServiceItem],
)
def get_admin_staff_services(
    staff_id: int,
    authorization: str | None = Header(default=None),
):
    """
    Admin 服務管理頁面用：列出所有 Service，並附上「目前選中的
    設計師」是否提供、以及該設計師專屬的 price/duration（尚未
    設定則為 None）。
    """

    require_admin(authorization)

    with Session(engine) as session:

        staff = session.get(
            Staff,
            staff_id,
        )

        if staff is None:
            raise HTTPException(
                status_code=404,
                detail="Staff not found",
            )

        all_services = session.exec(
            select(Service).order_by(Service.name)
        ).all()

        staff_services_by_service_id = {
            staff_service.service_id: staff_service
            for staff_service in session.exec(
                select(StaffService).where(
                    StaffService.staff_id == staff_id,
                )
            ).all()
        }

        items = []

        for service in all_services:

            staff_service = staff_services_by_service_id.get(
                service.id
            )

            items.append(
                AdminStaffServiceItem(
                    service_id=service.id,
                    service_name=service.name,
                    service_is_active=service.is_active,
                    staff_service_is_active=(
                        staff_service.is_active
                        if staff_service is not None
                        else False
                    ),
                    price=(
                        staff_service.price
                        if staff_service is not None
                        else None
                    ),
                    duration_minutes=(
                        staff_service.duration_minutes
                        if staff_service is not None
                        else None
                    ),
                )
            )

        return items


@app.put(
    "/admin/staff-services/{staff_id}/{service_id}",
    response_model=AdminStaffServiceItem,
)
def upsert_staff_service(
    staff_id: int,
    service_id: str,
    data: StaffServiceUpsert,
    authorization: str | None = Header(default=None),
):
    """
    Admin 設定「某設計師是否提供某服務」，以及該設計師專屬的
    price / duration_minutes。is_active=True 時 price/duration_minutes
    為必填；is_active=False 只是停用這筆設定，不會刪除資料列。
    """

    require_admin(authorization)

    with Session(engine) as session:

        staff = session.get(
            Staff,
            staff_id,
        )

        if staff is None:
            raise HTTPException(
                status_code=404,
                detail="Staff not found",
            )

        service = session.get(
            Service,
            service_id,
        )

        if service is None:
            raise HTTPException(
                status_code=404,
                detail="Service not found",
            )

        if data.is_active:

            if data.price is None or data.duration_minutes is None:
                raise HTTPException(
                    status_code=422,
                    detail=(
                        "price and duration_minutes are required "
                        "when is_active is true"
                    ),
                )

            if data.price < 0:
                raise HTTPException(
                    status_code=422,
                    detail="price must be >= 0",
                )

            if data.duration_minutes <= 0:
                raise HTTPException(
                    status_code=422,
                    detail="duration_minutes must be > 0",
                )

        staff_service = session.exec(
            select(StaffService).where(
                StaffService.staff_id == staff_id,
                StaffService.service_id == service_id,
            )
        ).first()

        if staff_service is None and not data.is_active:
            # 從沒設定過、這次也只是要設為「不提供」，不需要寫入
            # 任何資料列。
            return AdminStaffServiceItem(
                service_id=service.id,
                service_name=service.name,
                service_is_active=service.is_active,
                staff_service_is_active=False,
                price=None,
                duration_minutes=None,
            )

        if staff_service is None:
            staff_service = StaffService(
                staff_id=staff_id,
                service_id=service_id,
                price=data.price,
                duration_minutes=data.duration_minutes,
                is_active=data.is_active,
            )
        else:
            staff_service.is_active = data.is_active

            if data.price is not None:
                staff_service.price = data.price

            if data.duration_minutes is not None:
                staff_service.duration_minutes = data.duration_minutes

        session.add(staff_service)
        session.commit()
        session.refresh(staff_service)

        return AdminStaffServiceItem(
            service_id=service.id,
            service_name=service.name,
            service_is_active=service.is_active,
            staff_service_is_active=staff_service.is_active,
            price=staff_service.price,
            duration_minutes=staff_service.duration_minutes,
        )


def validate_service_fields(
    name: str | None,
):
    if name is not None and not name.strip():
        raise HTTPException(
            status_code=422,
            detail="name must not be empty",
        )


@app.post(
    "/admin/services",
    response_model=Service,
)
def create_service(
    data: ServiceCreate,
    authorization: str | None = Header(default=None),
):
    require_admin(authorization)

    validate_service_fields(
        data.name,
    )

    with Session(engine) as session:

        service = Service(
            id=f"svc_{uuid.uuid4().hex[:12]}",
            name=data.name.strip(),
        )

        session.add(service)
        session.commit()
        session.refresh(service)

        return service


@app.patch(
    "/admin/services/{service_id}",
    response_model=Service,
)
def update_service(
    service_id: str,
    data: ServiceUpdate,
    authorization: str | None = Header(default=None),
):
    require_admin(authorization)

    validate_service_fields(
        data.name,
    )

    with Session(engine) as session:

        service = session.get(
            Service,
            service_id,
        )

        if service is None:
            raise HTTPException(
                status_code=404,
                detail="Service not found",
            )

        if data.name is not None:
            service.name = data.name.strip()

        if data.is_active is not None:
            service.is_active = data.is_active

        session.add(service)
        session.commit()
        session.refresh(service)

        return service


# =========================================================
# Bookings
# =========================================================

@app.post(
    "/bookings",
    response_model=Booking,
)
def create_booking(
    data: BookingCreate,
):
    line_payload = verify_line_id_token(
        data.id_token
    )

    line_user_id = line_payload["sub"]

    minimum_booking_time = (
        taipei_now()
        + timedelta(hours=1)
    )

    if data.start_at < minimum_booking_time:
        raise HTTPException(
            status_code=409,
            detail="Booking must be made at least 1 hour in advance",
        )

    maximum_booking_date = (
        taipei_now().date()
        + timedelta(days=30)
    )

    if data.start_at.date() > maximum_booking_date:
        raise HTTPException(
            status_code=409,
            detail="Booking can only be made within 30 days",
        )
    
    with Session(engine) as session:

        # -------------------------
        # Staff
        # -------------------------

        staff = session.get(
            Staff,
            data.staff_id,
        )

        if staff is None:
            raise HTTPException(
                status_code=404,
                detail="Staff not found",
            )

        if not staff.is_active:
            raise HTTPException(
                status_code=409,
                detail="Staff is no longer available",
            )


        # -------------------------
        # Service
        # -------------------------

        service = session.get(
            Service,
            data.service_id,
        )

        if service is None:
            raise HTTPException(
                status_code=404,
                detail="Service not found",
            )

        if not service.is_active:
            raise HTTPException(
                status_code=409,
                detail="Service is no longer available",
            )


        # -------------------------
        # StaffService
        # -------------------------
        # price / duration_minutes 一律以該設計師的 StaffService 為準，
        # 不可信任客戶端傳入的任何價格/時長，也不再直接使用 Service
        # 上的全域欄位（該欄位已移除）。如果這位設計師沒有提供這項
        # 服務，即使 staff_id 與 service_id 個別都合法，也一律拒絕。

        staff_service = session.exec(
            select(StaffService).where(
                StaffService.staff_id == data.staff_id,
                StaffService.service_id == data.service_id,
            )
        ).first()

        if staff_service is None or not staff_service.is_active:
            raise HTTPException(
                status_code=409,
                detail="This staff does not offer the selected service",
            )


        # -------------------------
        # Schedule
        # -------------------------

        booking_date = data.start_at.date()
        weekday = booking_date.weekday()

        schedule_statement = select(Schedule).where(
            Schedule.staff_id == data.staff_id,
            Schedule.weekday == weekday,
        )

        schedule = session.exec(
            schedule_statement
        ).first()


        if schedule is None:
            raise HTTPException(
                status_code=409,
                detail="Staff is not working on this date",
            )


        # -------------------------
        # 確認預約時間在工作時間內
        # -------------------------

        booking_start = data.start_at

        booking_end = (
            booking_start
            + timedelta(
                minutes=staff_service.duration_minutes
            )
        )

        work_start = datetime.combine(
            booking_date,
            schedule.start_time,
        )

        work_end = datetime.combine(
            booking_date,
            schedule.end_time,
        )


        if (
            booking_start < work_start
            or booking_end > work_end
        ):
            raise HTTPException(
                status_code=409,
                detail="Booking is outside working hours",
            )


        # -------------------------
        # 找出當天已有 Booking
        # -------------------------

        day_start = datetime.combine(
            booking_date,
            time.min,
        )

        day_end = datetime.combine(
            booking_date,
            time.max,
        )


        statement = select(Booking).where(
            Booking.staff_id == data.staff_id,
            Booking.start_at >= day_start,
            Booking.start_at <= day_end,
            Booking.status.in_([
                BookingStatus.PENDING,
                BookingStatus.CONFIRMED,
            ]),
        )


        existing_bookings = session.exec(
            statement
        ).all()


        # -------------------------
        # 檢查時間衝突
        # -------------------------

        for existing_booking in existing_bookings:

            existing_start = (
                existing_booking.start_at
            )

            existing_end = (
                existing_start
                + timedelta(
                    minutes=
                    existing_booking.duration_minutes
                )
            )


            if (
                booking_start < existing_end
                and
                booking_end > existing_start
            ):
                raise HTTPException(
                    status_code=409,
                    detail="Time slot is no longer available",
                )


        # -------------------------
        # 建立 Booking
        # -------------------------

        booking = Booking(
            staff_id=staff.id,

            service_id=service.id,
            service_name=service.name,
            price=staff_service.price,
            duration_minutes=staff_service.duration_minutes,

            customer_name=data.customer_name,
            customer_phone=data.customer_phone,

            line_user_id=line_user_id,

            start_at=data.start_at,

            status=BookingStatus.PENDING,
        )


        session.add(booking)
        session.commit()
        session.refresh(booking)

        try_send_line_flex_message(
            booking.line_user_id,
            build_booking_flex_message(
                booking,
                staff.name,
                "pending",
            ),
        )

        return booking

# =========================================================
# Availability
# =========================================================

def compute_available_slots(
    target_date: date,
    schedule: Schedule | None,
    service_duration_minutes: int,
    bookings: list[Booking],
    blocked_times: list[BlockedTime],
    now: datetime,
) -> list[str]:
    """
    單一日期的可預約時段計算核心邏輯。
    /availability 與 /availability/summary 都必須呼叫這裡，
    確保兩者的可預約判定規則完全一致。

    `bookings` / `blocked_times` 需為已經與 target_date 有交集、
    且屬於同一位 staff 的資料（呼叫端負責篩選），本函式不再對
    staff_id 或日期做過濾。
    """

    if schedule is None:
        return []

    work_start = datetime.combine(
        target_date,
        schedule.start_time,
    )

    work_end = datetime.combine(
        target_date,
        schedule.end_time,
    )

    slots = []

    slot_interval = timedelta(
        minutes=30
    )

    service_duration = timedelta(
        minutes=service_duration_minutes
    )

    candidate_start = work_start

    minimum_booking_time = (
        now
        + timedelta(hours=1)
    )

    while (
        candidate_start + service_duration
        <= work_end
    ):

        if candidate_start < minimum_booking_time:
            candidate_start += slot_interval
            continue

        candidate_end = (
            candidate_start
            + service_duration
        )

        conflict = False


        for booking in bookings:

            booking_start = (
                booking.start_at
            )

            booking_end = (
                booking_start
                + timedelta(
                    minutes=
                    booking.duration_minutes
                )
            )


            # 時間區間重疊
            if (
                candidate_start < booking_end
                and
                candidate_end > booking_start
            ):

                conflict = True
                break


        if not conflict:

            for blocked_time in blocked_times:

                # 時間區間重疊
                if (
                    candidate_start < blocked_time.end_at
                    and
                    candidate_end > blocked_time.start_at
                ):

                    conflict = True
                    break


        if not conflict:

            slots.append(
                candidate_start.strftime(
                    "%H:%M"
                )
            )


        candidate_start += slot_interval


    return slots


@app.get(
    "/availability",
    response_model=AvailabilityResponse,
)
def get_availability(
    staff_id: int,
    service_id: str,
    target_date: date,
):

    maximum_booking_date = (
        taipei_now().date()
        + timedelta(days=30)
    )

    if target_date > maximum_booking_date:
        return AvailabilityResponse(
            date=target_date,
            staff_id=staff_id,
            service_id=service_id,
            slots=[],
        )

    with Session(engine) as session:

        # -------------------------
        # Staff
        # -------------------------

        staff = session.get(
            Staff,
            staff_id,
        )

        if staff is None:
            raise HTTPException(
                status_code=404,
                detail="Staff not found",
            )

        if not staff.is_active:
            return AvailabilityResponse(
                date=target_date,
                staff_id=staff_id,
                service_id=service_id,
                slots=[],
            )


        # -------------------------
        # Service
        # -------------------------

        service = session.get(
            Service,
            service_id,
        )

        if service is None:
            raise HTTPException(
                status_code=404,
                detail="Service not found",
            )

        if not service.is_active:
            return AvailabilityResponse(
                date=target_date,
                staff_id=staff_id,
                service_id=service_id,
                slots=[],
            )


        # -------------------------
        # StaffService
        # -------------------------
        # 時長必須用該設計師專屬的 duration_minutes，不同設計師
        # 提供同一項服務可以有不同時長。

        staff_service = session.exec(
            select(StaffService).where(
                StaffService.staff_id == staff_id,
                StaffService.service_id == service_id,
            )
        ).first()

        if staff_service is None or not staff_service.is_active:
            return AvailabilityResponse(
                date=target_date,
                staff_id=staff_id,
                service_id=service_id,
                slots=[],
            )


        # -------------------------
        # Schedule
        # -------------------------

        weekday = target_date.weekday()

        statement = select(Schedule).where(
            Schedule.staff_id == staff_id,
            Schedule.weekday == weekday,
        )

        schedule = session.exec(
            statement
        ).first()


        # -------------------------
        # 找出當天已有的 Booking
        # -------------------------

        day_start = datetime.combine(
            target_date,
            time.min,
        )

        day_end = datetime.combine(
            target_date,
            time.max,
        )


        booking_statement = select(Booking).where(
            Booking.staff_id == staff_id,
            Booking.start_at >= day_start,
            Booking.start_at <= day_end,
            Booking.status.in_([
                BookingStatus.PENDING,
                BookingStatus.CONFIRMED,
            ]),
        )


        bookings = session.exec(
            booking_statement
        ).all()


        # -------------------------
        # 找出當天已有的 BlockedTime
        # -------------------------

        next_day_start = datetime.combine(
            target_date + timedelta(days=1),
            time.min,
        )

        blocked_times_statement = select(BlockedTime).where(
            BlockedTime.staff_id == staff_id,
            BlockedTime.start_at < next_day_start,
            BlockedTime.end_at > day_start,
        )

        blocked_times = session.exec(
            blocked_times_statement
        ).all()


        # -------------------------
        # 計算 Availability
        # -------------------------

        slots = compute_available_slots(
            target_date=target_date,
            schedule=schedule,
            service_duration_minutes=staff_service.duration_minutes,
            bookings=bookings,
            blocked_times=blocked_times,
            now=taipei_now(),
        )

        return AvailabilityResponse(
            date=target_date,
            staff_id=staff_id,
            service_id=service_id,
            slots=slots,
        )


class AvailabilitySummaryResponse(SQLModel):
    staff_id: int
    service_id: str
    available_dates: list[date]


@app.get(
    "/availability/summary",
    response_model=AvailabilitySummaryResponse,
)
def get_availability_summary(
    staff_id: int,
    service_id: str,
    start_date: date,
    end_date: date,
):

    if end_date < start_date:
        raise HTTPException(
            status_code=422,
            detail="end_date must not be before start_date",
        )

    now = taipei_now()

    maximum_booking_date = (
        now.date()
        + timedelta(days=30)
    )

    # 只需要計算 [today, maximum_booking_date] 且落在請求範圍內的日期，
    # 其餘日期本來就不可能可預約（規則與 /availability 相同）。
    range_start = max(
        start_date,
        now.date(),
    )

    range_end = min(
        end_date,
        maximum_booking_date,
    )

    if range_end < range_start:
        return AvailabilitySummaryResponse(
            staff_id=staff_id,
            service_id=service_id,
            available_dates=[],
        )

    with Session(engine) as session:

        # -------------------------
        # Staff
        # -------------------------

        staff = session.get(
            Staff,
            staff_id,
        )

        if staff is None:
            raise HTTPException(
                status_code=404,
                detail="Staff not found",
            )

        if not staff.is_active:
            return AvailabilitySummaryResponse(
                staff_id=staff_id,
                service_id=service_id,
                available_dates=[],
            )


        # -------------------------
        # Service
        # -------------------------

        service = session.get(
            Service,
            service_id,
        )

        if service is None:
            raise HTTPException(
                status_code=404,
                detail="Service not found",
            )

        if not service.is_active:
            return AvailabilitySummaryResponse(
                staff_id=staff_id,
                service_id=service_id,
                available_dates=[],
            )


        # -------------------------
        # StaffService
        # -------------------------

        staff_service = session.exec(
            select(StaffService).where(
                StaffService.staff_id == staff_id,
                StaffService.service_id == service_id,
            )
        ).first()

        if staff_service is None or not staff_service.is_active:
            return AvailabilitySummaryResponse(
                staff_id=staff_id,
                service_id=service_id,
                available_dates=[],
            )


        # -------------------------
        # Schedule（整週只有 7 種 weekday，一次查完）
        # -------------------------

        schedules_by_weekday = {
            schedule.weekday: schedule
            for schedule in session.exec(
                select(Schedule).where(
                    Schedule.staff_id == staff_id,
                )
            ).all()
        }


        # -------------------------
        # 一次查出整個範圍內的 Booking / BlockedTime
        # -------------------------

        range_start_at = datetime.combine(
            range_start,
            time.min,
        )

        range_end_at = datetime.combine(
            range_end + timedelta(days=1),
            time.min,
        )

        bookings_in_range = session.exec(
            select(Booking).where(
                Booking.staff_id == staff_id,
                Booking.start_at >= range_start_at,
                Booking.start_at < range_end_at,
                Booking.status.in_([
                    BookingStatus.PENDING,
                    BookingStatus.CONFIRMED,
                ]),
            )
        ).all()

        blocked_times_in_range = session.exec(
            select(BlockedTime).where(
                BlockedTime.staff_id == staff_id,
                BlockedTime.start_at < range_end_at,
                BlockedTime.end_at > range_start_at,
            )
        ).all()


        # -------------------------
        # 逐日判定是否至少有一個可預約時段
        # -------------------------

        available_dates = []

        current_date = range_start

        while current_date <= range_end:

            day_start = datetime.combine(
                current_date,
                time.min,
            )

            day_end = datetime.combine(
                current_date,
                time.max,
            )

            next_day_start = datetime.combine(
                current_date + timedelta(days=1),
                time.min,
            )

            bookings_for_day = [
                booking
                for booking in bookings_in_range
                if day_start <= booking.start_at <= day_end
            ]

            blocked_times_for_day = [
                blocked_time
                for blocked_time in blocked_times_in_range
                if blocked_time.start_at < next_day_start
                and blocked_time.end_at > day_start
            ]

            schedule = schedules_by_weekday.get(
                current_date.weekday()
            )

            slots = compute_available_slots(
                target_date=current_date,
                schedule=schedule,
                service_duration_minutes=staff_service.duration_minutes,
                bookings=bookings_for_day,
                blocked_times=blocked_times_for_day,
                now=now,
            )

            if slots:
                available_dates.append(current_date)

            current_date += timedelta(days=1)

        return AvailabilitySummaryResponse(
            staff_id=staff_id,
            service_id=service_id,
            available_dates=available_dates,
        )


# =========================================================
# Booking Management
# =========================================================

@app.get(
    "/bookings/{booking_id}",
    response_model=Booking,
)
def get_booking(
    booking_id: int,
    authorization: str | None = Header(default=None),
):
    """
    Admin 專用的單筆 Booking 詳情，供 Admin App 的 Booking Detail
    畫面使用。與 /my-bookings/{id} 是完全不同的 endpoint：這裡用
    require_admin() 驗證管理員身分，不做 customer ownership 檢查，
    因為呼叫者是 Admin 本人，不是預約的客人。
    """

    require_admin(authorization)

    with Session(engine) as session:

        booking = session.get(
            Booking,
            booking_id,
        )

        if booking is None:
            raise HTTPException(
                status_code=404,
                detail="Booking not found",
            )

        return booking


@app.get(
    "/bookings",
    response_model=list[Booking],
)
def get_bookings(
    status: BookingStatus | None = None,
    date: date | None = None,
    upcoming_only: bool = False,
    limit: int | None = None,
    staff_id: int | None = None,
    authorization: str | None = Header(default=None),
):
    require_admin(authorization)

    with Session(engine) as session:

        statement = select(Booking)

        if staff_id is not None:
            statement = statement.where(
                Booking.staff_id == staff_id
            )

        if status is not None:
            statement = statement.where(
                Booking.status == status
            )

        if date is not None:
            day_start = datetime.combine(
                date,
                time.min,
            )

            day_end = datetime.combine(
                date,
                time.max,
            )

            statement = statement.where(
                Booking.start_at >= day_start,
                Booking.start_at <= day_end,
            )

        if upcoming_only:
            statement = statement.where(
                Booking.start_at >= taipei_now()
            )

        statement = statement.order_by(
            Booking.start_at
        )

        if limit is not None:
            statement = statement.limit(limit)

        bookings = session.exec(
            statement
        ).all()

        return bookings


@app.patch(
    "/bookings/{booking_id}/confirm",
    response_model=Booking,
)
def confirm_booking(
    booking_id: int,
    authorization: str | None = Header(default=None),
):
    require_admin(authorization)

    with Session(engine) as session:
        booking = session.get(
            Booking,
            booking_id,
        )

        if booking is None:
            raise HTTPException(
                status_code=404,
                detail="Booking not found",
            )

        if booking.status != BookingStatus.PENDING:
            raise HTTPException(
                status_code=409,
                detail="Only pending bookings can be confirmed",
            )

        booking.status = BookingStatus.CONFIRMED

        session.add(booking)
        session.commit()
        session.refresh(booking)

        # 預約是透過 LINE 建立的才發送通知
        if booking.line_user_id:
            staff = session.get(
                Staff,
                booking.staff_id,
            )

            try_send_line_flex_message(
                booking.line_user_id,
                build_booking_flex_message(
                    booking,
                    staff.name if staff else "",
                    "confirmed",
                ),
            )

        return booking


@app.patch(
    "/bookings/{booking_id}/reject",
    response_model=Booking,
)
def reject_booking(
    booking_id: int,
    authorization: str | None = Header(default=None),
):
    require_admin(authorization)

    with Session(engine) as session:
        booking = session.get(
            Booking,
            booking_id,
        )

        if booking is None:
            raise HTTPException(
                status_code=404,
                detail="Booking not found",
            )

        if booking.status != BookingStatus.PENDING:
            raise HTTPException(
                status_code=409,
                detail="Only pending bookings can be rejected",
            )

        booking.status = BookingStatus.REJECTED

        session.add(booking)
        session.commit()
        session.refresh(booking)

        # 預約是透過 LINE 建立的才發送通知
        if booking.line_user_id:
            staff = session.get(
                Staff,
                booking.staff_id,
            )

            try_send_line_flex_message(
                booking.line_user_id,
                build_booking_flex_message(
                    booking,
                    staff.name if staff else "",
                    "rejected",
                ),
            )

        return booking


@app.patch(
    "/bookings/{booking_id}/cancel",
    response_model=Booking,
)
def cancel_booking(
    booking_id: int,
    authorization: str | None = Header(default=None),
):
    require_admin(authorization)

    with Session(engine) as session:
        booking = session.get(
            Booking,
            booking_id,
        )

        if booking is None:
            raise HTTPException(
                status_code=404,
                detail="Booking not found",
            )

        if booking.status != BookingStatus.CONFIRMED:
            raise HTTPException(
                status_code=409,
                detail="Only confirmed bookings can be cancelled",
            )

        booking.status = BookingStatus.CANCELLED

        session.add(booking)
        session.commit()
        session.refresh(booking)

        # 預約是透過 LINE 建立的才發送通知
        if booking.line_user_id:
            staff = session.get(
                Staff,
                booking.staff_id,
            )

            try_send_line_flex_message(
                booking.line_user_id,
                build_booking_flex_message(
                    booking,
                    staff.name if staff else "",
                    "cancelled",
                ),
            )

        return booking


# =========================================================
# 客人查看／取消自己的預約
# =========================================================
# booking_id 不能作為授權依據：每個 endpoint 都必須先用
# require_line_user() 驗證 LINE ID token 取得 sub，
# 再確認 booking.line_user_id == sub 才能存取，否則一律視為
# 404，不區分「不存在」與「不是本人的預約」，避免洩漏其他
# 客人的預約是否存在。

@app.get(
    "/my-bookings/{booking_id}",
    response_model=MyBookingResponse,
)
def get_my_booking(
    booking_id: int,
    line_user_id: str = Depends(require_line_user),
):
    with Session(engine) as session:

        booking = session.get(
            Booking,
            booking_id,
        )

        if (
            booking is None
            or booking.line_user_id is None
            or booking.line_user_id != line_user_id
        ):
            raise HTTPException(
                status_code=404,
                detail="Booking not found",
            )

        staff = session.get(
            Staff,
            booking.staff_id,
        )

        return MyBookingResponse(
            id=booking.id,
            staff_name=staff.name if staff else "",
            service_name=booking.service_name,
            price=booking.price,
            duration_minutes=booking.duration_minutes,
            start_at=booking.start_at,
            status=booking.status,
        )


@app.patch(
    "/my-bookings/{booking_id}/cancel",
    response_model=MyBookingResponse,
)
def cancel_my_booking(
    booking_id: int,
    line_user_id: str = Depends(require_line_user),
):
    with Session(engine) as session:

        booking = session.get(
            Booking,
            booking_id,
        )

        if (
            booking is None
            or booking.line_user_id is None
            or booking.line_user_id != line_user_id
        ):
            raise HTTPException(
                status_code=404,
                detail="Booking not found",
            )

        if booking.status not in (
            BookingStatus.PENDING,
            BookingStatus.CONFIRMED,
        ):
            raise HTTPException(
                status_code=409,
                detail="Only pending or confirmed bookings can be cancelled",
            )

        booking.status = BookingStatus.CANCELLED

        session.add(booking)
        session.commit()
        session.refresh(booking)

        staff = session.get(
            Staff,
            booking.staff_id,
        )

        try_send_line_flex_message(
            booking.line_user_id,
            build_booking_flex_message(
                booking,
                staff.name if staff else "",
                "cancelled",
            ),
        )

        return MyBookingResponse(
            id=booking.id,
            staff_name=staff.name if staff else "",
            service_name=booking.service_name,
            price=booking.price,
            duration_minutes=booking.duration_minutes,
            start_at=booking.start_at,
            status=booking.status,
        )


# =========================================================
# Blocked Time Management
# =========================================================

@app.get(
    "/blocked-times",
    response_model=list[BlockedTime],
)
def get_blocked_times(
    staff_id: int,
    date: date | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    authorization: str | None = Header(default=None),
):
    require_admin(authorization)

    if date is not None:
        range_start = date
        range_end = date
    elif start_date is not None and end_date is not None:
        range_start = start_date
        range_end = end_date
    else:
        raise HTTPException(
            status_code=422,
            detail="Either date, or both start_date and end_date, are required",
        )

    with Session(engine) as session:

        range_start_at = datetime.combine(
            range_start,
            time.min,
        )

        range_end_at = datetime.combine(
            range_end + timedelta(days=1),
            time.min,
        )

        statement = select(BlockedTime).where(
            BlockedTime.staff_id == staff_id,
            BlockedTime.start_at < range_end_at,
            BlockedTime.end_at > range_start_at,
        ).order_by(
            BlockedTime.start_at
        )

        blocked_times = session.exec(
            statement
        ).all()

        return blocked_times


@app.post(
    "/blocked-times",
    response_model=BlockedTime,
)
def create_blocked_time(
    data: BlockedTimeCreate,
    authorization: str | None = Header(default=None),
):
    require_admin(authorization)

    if data.end_at <= data.start_at:
        raise HTTPException(
            status_code=422,
            detail="end_at must be after start_at",
        )

    with Session(engine) as session:

        # -------------------------
        # 檢查是否與現有 Booking 衝突
        # -------------------------

        booking_statement = select(Booking).where(
            Booking.staff_id == data.staff_id,
            Booking.status.in_([
                BookingStatus.PENDING,
                BookingStatus.CONFIRMED,
            ]),
        )

        existing_bookings = session.exec(
            booking_statement
        ).all()

        for existing_booking in existing_bookings:

            existing_start = (
                existing_booking.start_at
            )

            existing_end = (
                existing_start
                + timedelta(
                    minutes=
                    existing_booking.duration_minutes
                )
            )

            # 時間區間重疊
            if (
                data.start_at < existing_end
                and
                data.end_at > existing_start
            ):
                raise HTTPException(
                    status_code=409,
                    detail="Blocked time conflicts with an existing booking",
                )


        # -------------------------
        # 建立 BlockedTime
        # -------------------------

        blocked_time = BlockedTime(
            staff_id=data.staff_id,
            start_at=data.start_at,
            end_at=data.end_at,
            reason=data.reason,
        )

        session.add(blocked_time)
        session.commit()
        session.refresh(blocked_time)

        return blocked_time


@app.delete(
    "/blocked-times/{blocked_time_id}",
    status_code=204,
)
def delete_blocked_time(
    blocked_time_id: int,
    authorization: str | None = Header(default=None),
):
    require_admin(authorization)

    with Session(engine) as session:
        blocked_time = session.get(
            BlockedTime,
            blocked_time_id,
        )

        if blocked_time is None:
            raise HTTPException(
                status_code=404,
                detail="Blocked time not found",
            )

        session.delete(blocked_time)
        session.commit()


# =========================================================
# Schedule Management（每週固定營業時間）
# =========================================================

@app.get(
    "/admin/schedule",
    response_model=list[ScheduleDay],
)
def get_admin_schedule(
    staff_id: int,
    authorization: str | None = Header(default=None),
):
    require_admin(authorization)

    with Session(engine) as session:

        schedules_by_weekday = {
            schedule.weekday: schedule
            for schedule in session.exec(
                select(Schedule).where(
                    Schedule.staff_id == staff_id,
                )
            ).all()
        }

        week = []

        for weekday in range(7):

            schedule = schedules_by_weekday.get(weekday)

            if schedule is None:
                week.append(
                    ScheduleDay(
                        weekday=weekday,
                        is_open=False,
                    )
                )
            else:
                week.append(
                    ScheduleDay(
                        weekday=weekday,
                        is_open=True,
                        start_time=schedule.start_time,
                        end_time=schedule.end_time,
                    )
                )

        return week


def find_conflicting_bookings_for_weekday(
    session: Session,
    staff_id: int,
    weekday: int,
    new_start_time: time | None,
    new_end_time: time | None,
    now: datetime,
) -> list[Booking]:
    """
    找出「這次 Schedule 變更會讓其落在新營業時間之外」的未來預約。
    new_start_time / new_end_time 為 None 代表這天要設為公休，
    此時當天任何未來預約都視為衝突。
    """

    future_bookings = session.exec(
        select(Booking).where(
            Booking.staff_id == staff_id,
            Booking.start_at >= now,
            Booking.status.in_([
                BookingStatus.PENDING,
                BookingStatus.CONFIRMED,
            ]),
        )
    ).all()

    conflicting = []

    for booking in future_bookings:

        if booking.start_at.weekday() != weekday:
            continue

        if new_start_time is None or new_end_time is None:
            conflicting.append(booking)
            continue

        booking_date = booking.start_at.date()

        new_work_start = datetime.combine(
            booking_date,
            new_start_time,
        )

        new_work_end = datetime.combine(
            booking_date,
            new_end_time,
        )

        booking_end = (
            booking.start_at
            + timedelta(minutes=booking.duration_minutes)
        )

        if (
            booking.start_at < new_work_start
            or booking_end > new_work_end
        ):
            conflicting.append(booking)

    return conflicting


@app.put(
    "/admin/schedule/{weekday}",
    response_model=ScheduleDay,
)
def update_schedule_day(
    weekday: int,
    data: ScheduleDayUpdate,
    authorization: str | None = Header(default=None),
):
    require_admin(authorization)

    if weekday < 0 or weekday > 6:
        raise HTTPException(
            status_code=422,
            detail="weekday must be between 0 (Monday) and 6 (Sunday)",
        )

    if data.is_open:
        if data.start_time is None or data.end_time is None:
            raise HTTPException(
                status_code=422,
                detail="start_time and end_time are required when is_open is true",
            )

        if data.end_time <= data.start_time:
            raise HTTPException(
                status_code=422,
                detail="end_time must be after start_time",
            )

    with Session(engine) as session:

        now = taipei_now()

        conflicting_bookings = find_conflicting_bookings_for_weekday(
            session=session,
            staff_id=data.staff_id,
            weekday=weekday,
            new_start_time=data.start_time if data.is_open else None,
            new_end_time=data.end_time if data.is_open else None,
            now=now,
        )

        if conflicting_bookings:
            raise HTTPException(
                status_code=409,
                detail=(
                    "This change would leave existing bookings outside "
                    "working hours; please resolve those bookings first"
                ),
            )

        existing_schedule = session.exec(
            select(Schedule).where(
                Schedule.staff_id == data.staff_id,
                Schedule.weekday == weekday,
            )
        ).first()

        if not data.is_open:

            if existing_schedule is not None:
                session.delete(existing_schedule)
                session.commit()

            return ScheduleDay(
                weekday=weekday,
                is_open=False,
            )

        if existing_schedule is None:
            existing_schedule = Schedule(
                staff_id=data.staff_id,
                weekday=weekday,
                start_time=data.start_time,
                end_time=data.end_time,
            )
        else:
            existing_schedule.start_time = data.start_time
            existing_schedule.end_time = data.end_time

        session.add(existing_schedule)
        session.commit()
        session.refresh(existing_schedule)

        return ScheduleDay(
            weekday=weekday,
            is_open=True,
            start_time=existing_schedule.start_time,
            end_time=existing_schedule.end_time,
        )


# =========================================================
# LINE 驗證 endpoint
# =========================================================

@app.post("/auth/line", response_model=LineAuthResponse)
def authenticate_line(request: LineAuthRequest):
    payload = verify_line_id_token(request.id_token)

    return LineAuthResponse(
        line_user_id=payload["sub"],
        display_name=payload.get("name"),
    )


@app.post("/auth/admin")
def authenticate_admin(
    request: AdminAuthRequest,
):
    payload = verify_admin(
        request.id_token
    )

    return {
        "is_admin": True,
        "display_name": payload.get("name"),
    }


# =========================================================
# 隔日預約通知
# =========================================================

@app.post("/internal/reminders/tomorrow")
def trigger_tomorrow_reminders(
    authorization: str | None = Header(default=None),
):
    reminder_secret = os.getenv(
        "REMINDER_SECRET"
    )

    if not reminder_secret:
        raise HTTPException(
            status_code=500,
            detail="REMINDER_SECRET is not configured",
        )

    scheme, _, token = (
        authorization or ""
    ).partition(" ")

    if (
        scheme.lower() != "bearer"
        or token != reminder_secret
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid reminder authorization",
        )

    # 放在這裡 import，避免 main.py <-> reminder.py
    # 產生 circular import。
    from backend.reminder import (
        send_tomorrow_reminders,
    )

    send_tomorrow_reminders()

    return {
        "message": "Tomorrow reminders processed",
    }
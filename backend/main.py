from datetime import date, datetime, time, timedelta
from enum import Enum
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Field, Session, SQLModel, create_engine, select


# =========================================================
# Database
# =========================================================

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"

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


class Service(SQLModel, table=True):
    id: str = Field(primary_key=True)
    name: str
    price: int
    duration_minutes: int

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

    start_at: datetime

    status: BookingStatus = BookingStatus.PENDING

    created_at: datetime = Field(
        default_factory=datetime.now
    )


class BookingCreate(SQLModel):
    staff_id: int
    service_id: str

    customer_name: str
    customer_phone: str

    start_at: datetime


class AvailabilityResponse(SQLModel):
    date: date
    staff_id: int
    service_id: str
    slots: list[str]


# =========================================================
# FastAPI
# =========================================================

app = FastAPI(
    title="SalonBook API"
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================================================
# Startup
# =========================================================

@app.on_event("startup")
def startup():

    # 建立不存在的 tables
    SQLModel.metadata.create_all(engine)

    # 建立初始資料
    seed_data()


def seed_data():

    with Session(engine) as session:

        # -------------------------
        # Staff
        # -------------------------

        staff = session.get(Staff, 1)

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

        services = [
            Service(
                id="cut",
                name="剪髮",
                price=600,
                duration_minutes=60,
            ),

            Service(
                id="perm",
                name="燙髮",
                price=800,
                duration_minutes=180,
            ),

            Service(
                id="color",
                name="染髮",
                price=1200,
                duration_minutes=180,
            ),

            Service(
                id="care",
                name="護髮",
                price=1000,
                duration_minutes=120,
            ),
        ]


        for service in services:

            existing_service = session.get(
                Service,
                service.id,
            )

            if existing_service is None:
                session.add(service)

        # -------------------------
        # Schedule
        # -------------------------

        existing_schedules = session.exec(
            select(Schedule)
        ).all()

        if not existing_schedules:

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

        statement = select(Staff)

        staff = session.exec(
            statement
        ).all()

        return staff


# =========================================================
# Services
# =========================================================

@app.get("/services")
def get_services():

    with Session(engine) as session:

        statement = select(Service)

        services = session.exec(
            statement
        ).all()

        return services


# =========================================================
# Schedules
# =========================================================

@app.get("/schedules")
def get_schedules():

    with Session(engine) as session:

        schedules = session.exec(
            select(Schedule)
        ).all()

        return schedules

    
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
                minutes=service.duration_minutes
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
            price=service.price,
            duration_minutes=service.duration_minutes,

            customer_name=data.customer_name,
            customer_phone=data.customer_phone,

            start_at=data.start_at,

            status=BookingStatus.PENDING,
        )


        session.add(booking)
        session.commit()
        session.refresh(booking)

        return booking

# =========================================================
# Availability
# =========================================================

@app.get(
    "/availability",
    response_model=AvailabilityResponse,
)
def get_availability(
    staff_id: int,
    service_id: str,
    target_date: date,
):

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


        # 當天沒有班
        if schedule is None:

            return AvailabilityResponse(
                date=target_date,
                staff_id=staff_id,
                service_id=service_id,
                slots=[],
            )


        # -------------------------
        # 工作時間
        # -------------------------

        work_start = datetime.combine(
            target_date,
            schedule.start_time,
        )

        work_end = datetime.combine(
            target_date,
            schedule.end_time,
        )


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
        # 計算 Availability
        # -------------------------

        slots = []

        slot_interval = timedelta(
            minutes=30
        )

        service_duration = timedelta(
            minutes=service.duration_minutes
        )

        candidate_start = work_start


        while (
            candidate_start + service_duration
            <= work_end
        ):

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

                slots.append(
                    candidate_start.strftime(
                        "%H:%M"
                    )
                )


            candidate_start += slot_interval


        return AvailabilityResponse(
            date=target_date,
            staff_id=staff_id,
            service_id=service_id,
            slots=slots,
        )


# =========================================================
# Booking Management
# =========================================================

@app.get(
    "/bookings",
    response_model=list[Booking],
)
def get_bookings(
    status: BookingStatus | None = None,
):

    with Session(engine) as session:

        statement = select(Booking)

        if status is not None:
            statement = statement.where(
                Booking.status == status
            )

        statement = statement.order_by(
            Booking.start_at
        )

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
):

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


        booking.status = (
            BookingStatus.CONFIRMED
        )

        session.add(booking)
        session.commit()
        session.refresh(booking)

        return booking


@app.patch(
    "/bookings/{booking_id}/reject",
    response_model=Booking,
)
def reject_booking(
    booking_id: int,
):

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


        booking.status = (
            BookingStatus.REJECTED
        )

        session.add(booking)
        session.commit()
        session.refresh(booking)

        return booking
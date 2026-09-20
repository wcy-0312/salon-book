from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlmodel import Session, select

from backend.main import (
    Booking,
    BookingStatus,
    Staff,
    engine,
    try_send_line_message,
)

TAIPEI_TZ = ZoneInfo("Asia/Taipei")

def send_tomorrow_reminders():
    now = datetime.now(TAIPEI_TZ)
    tomorrow = now.date() + timedelta(days=1)

    with Session(engine) as session:
        bookings = session.exec(
            select(Booking).where(
                Booking.status == BookingStatus.CONFIRMED,
                Booking.reminder_sent_at == None,
            )
        ).all()

        bookings = [
            booking
            for booking in bookings
            if booking.start_at.date() == tomorrow
        ]

        print(
            f"Found {len(bookings)} bookings "
            f"for {tomorrow}"
        )

        for booking in bookings:
            if not booking.line_user_id:
                continue

            staff = session.get(
                Staff,
                booking.staff_id,
            )

            sent = try_send_line_message(
                booking.line_user_id,
                (
                    "SalonBook 預約提醒\n\n"
                    "提醒您明天有預約！\n\n"
                    f"設計師：{staff.name}\n"
                    f"服務：{booking.service_name}\n"
                    f"日期：{booking.start_at:%Y/%m/%d}\n"
                    f"時間：{booking.start_at:%H:%M}\n\n"
                    "期待您的到來！"
                ),
            )

            if not sent:
                print(
                    f"Reminder failed for booking "
                    f"{booking.id}"
                )
                continue

            booking.reminder_sent_at = datetime.now(
                TAIPEI_TZ
            ).replace(tzinfo=None)

            session.add(booking)
            session.commit()

            print(
                f"Reminder sent for booking "
                f"{booking.id}"
            )


if __name__ == "__main__":
    send_tomorrow_reminders()
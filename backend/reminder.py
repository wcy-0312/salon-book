from datetime import timedelta

from sqlmodel import Session, select

from backend.main import (
    Booking,
    BookingStatus,
    Staff,
    build_booking_flex_message,
    engine,
    taipei_now,
    try_send_line_flex_message,
)

def send_tomorrow_reminders():
    now = taipei_now()
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

            sent = try_send_line_flex_message(
                booking.line_user_id,
                build_booking_flex_message(
                    booking,
                    staff.name,
                    "reminder",
                ),
            )

            if not sent:
                print(
                    f"Reminder failed for booking "
                    f"{booking.id}"
                )
                continue

            booking.reminder_sent_at = taipei_now()

            session.add(booking)
            session.commit()

            print(
                f"Reminder sent for booking "
                f"{booking.id}"
            )


if __name__ == "__main__":
    send_tomorrow_reminders()
import os

import httpx


API_URL = (
    "https://salon-book-production.up.railway.app"
    "/internal/reminders/tomorrow"
)


def main():
    reminder_secret = os.environ["REMINDER_SECRET"]

    response = httpx.post(
        API_URL,
        headers={
            "Authorization": (
                f"Bearer {reminder_secret}"
            ),
        },
        timeout=30.0,
    )

    response.raise_for_status()

    print(response.json())


if __name__ == "__main__":
    main()
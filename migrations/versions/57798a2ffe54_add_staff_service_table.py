"""add staff service table

Revision ID: 57798a2ffe54
Revises: b8507c17d612
Create Date: 2026-09-30 12:35:24.313387

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = '57798a2ffe54'
down_revision: Union[str, Sequence[str], None] = 'b8507c17d612'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""

    # -------------------------
    # 1. 建立 StaffService 表
    # -------------------------
    # 這一步只新增資料表，完全不動 Service / Booking 既有欄位，
    # 是安全、可獨立回退的第一步。

    op.create_table(
        'staffservice',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('staff_id', sa.Integer(), nullable=False),
        sa.Column('service_id', sqlmodel.sql.sqltypes.AutoString(), nullable=False),
        sa.Column('price', sa.Integer(), nullable=False),
        sa.Column('duration_minutes', sa.Integer(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint(
            'staff_id',
            'service_id',
            name='uq_staffservice_staff_id_service_id',
        ),
    )

    # -------------------------
    # 2. 資料搬移：既有 Service 都已經有 price / duration_minutes，
    #    而且既有 Andy (id=1) 已經存在。用既有 Service 的值，
    #    幫 Andy 建立對應的 StaffService，讓 Andy 既有的服務設定
    #    在改版後不會消失。
    # -------------------------
    # 只有在 staff(id=1) 確實存在時才搬移，避免在全新資料庫（尚未
    # 跑過 seed_data()）上對不存在的 staff 建立資料；全新資料庫會
    # 由 seed_data() 自行建立 Andy 與對應的 StaffService。

    connection = op.get_bind()

    staff_exists = connection.execute(
        sa.text("SELECT 1 FROM staff WHERE id = 1")
    ).first()

    if staff_exists is not None:

        existing_services = connection.execute(
            sa.text(
                "SELECT id, price, duration_minutes FROM service"
            )
        ).fetchall()

        for service_id, price, duration_minutes in existing_services:

            connection.execute(
                sa.text(
                    """
                    INSERT INTO staffservice
                        (staff_id, service_id, price, duration_minutes, is_active)
                    VALUES
                        (1, :service_id, :price, :duration_minutes, 1)
                    """
                ),
                {
                    "service_id": service_id,
                    "price": price,
                    "duration_minutes": duration_minutes,
                },
            )

    # -------------------------
    # 3. Service 上的 price / duration_minutes 欄位到這裡為止還
    #    保留，資料完全沒有被修改或刪除。欄位的移除放在下一個
    #    migration 處理（SQLite 的 DROP COLUMN 需要用
    #    batch_alter_table 以確保跨版本相容，見下一版 migration）。
    # -------------------------


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('staffservice')

"""drop price and duration from service

Revision ID: 46d238100a92
Revises: 57798a2ffe54
Create Date: 2026-09-30 14:22:13.866862

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '46d238100a92'
down_revision: Union[str, Sequence[str], None] = '57798a2ffe54'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""

    # Service 的 price / duration_minutes 已經在上一個 migration
    # 搬移到 StaffService（Andy 的既有資料已backfill），這裡才能
    # 安全移除這兩個全域欄位。
    #
    # SQLite 對 ALTER TABLE 的支援有限，即使部分新版 SQLite 支援
    # 原生 DROP COLUMN，也不保證 Railway 上執行的版本一定支援；
    # 用 batch_alter_table 讓 Alembic 改用「建立新表、搬資料、
    # 換掉舊表」的方式完成，確保跨 SQLite 版本都安全可靠。
    with op.batch_alter_table('service') as batch_op:
        batch_op.drop_column('price')
        batch_op.drop_column('duration_minutes')


def downgrade() -> None:
    """Downgrade schema."""

    # 復原時無法還原真正的舊資料（既有資料在 upgrade 之後已經
    # 分散到各設計師的 StaffService，且可能已被個別調整），這裡
    # 只能把欄位加回來並給預設值，不嘗試從 StaffService 反推。
    with op.batch_alter_table('service') as batch_op:
        batch_op.add_column(
            sa.Column(
                'price',
                sa.Integer(),
                nullable=False,
                server_default='0',
            )
        )
        batch_op.add_column(
            sa.Column(
                'duration_minutes',
                sa.Integer(),
                nullable=False,
                server_default='30',
            )
        )

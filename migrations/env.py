from logging.config import fileConfig

from alembic import context
from sqlmodel import SQLModel

from backend.main import engine


# Alembic Config
config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)


# SQLModel 所有 table 的 metadata
target_metadata = SQLModel.metadata


def run_migrations_offline() -> None:
    """Run migrations in offline mode."""

    context.configure(
        url=str(engine.url),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in online mode."""

    with engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
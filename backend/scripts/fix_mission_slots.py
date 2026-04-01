#!/usr/bin/env python3
"""
One-time fix: Populate required_slots for existing missions from their mission_type.
Run: python3 scripts/fix_mission_slots.py
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, update, text

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:5432/workforce_db",
)


async def fix_mission_slots():
    engine = create_async_engine(DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as session:
        # First: run migration to add column if not exists
        await session.execute(text("""
            ALTER TABLE missions ADD COLUMN IF NOT EXISTS required_slots JSONB;
            ALTER TABLE missions ADD COLUMN IF NOT EXISTS notes TEXT;
        """))
        await session.commit()

        # Backfill required_slots from mission_types
        result = await session.execute(text("""
            UPDATE missions m
            SET required_slots = mt.required_slots
            FROM mission_types mt
            WHERE m.mission_type_id = mt.id
              AND mt.required_slots IS NOT NULL
              AND m.required_slots IS NULL
            RETURNING m.id
        """))
        updated = result.rowcount
        await session.commit()

        print(f"✅ Updated {updated} missions with slots from their mission type")

        # Report summary
        total = await session.execute(text("SELECT COUNT(*) FROM missions"))
        total_count = total.scalar()

        with_slots = await session.execute(text(
            "SELECT COUNT(*) FROM missions WHERE required_slots IS NOT NULL AND jsonb_array_length(required_slots) > 0"
        ))
        with_slots_count = with_slots.scalar()

        print(f"📊 Total missions: {total_count}")
        print(f"📊 Missions with slots: {with_slots_count}")
        print(f"📊 Missions without slots: {total_count - with_slots_count}")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(fix_mission_slots())

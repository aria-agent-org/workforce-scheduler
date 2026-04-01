"""Create user_webauthn_credentials table.

Revision ID: 010_webauthn_table
Revises: 009_avatar_url_text
Create Date: 2026-04-01
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "010_webauthn_table"
down_revision = "009_avatar_url_text"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Table may already exist if created manually; use IF NOT EXISTS semantics
    conn = op.get_bind()
    inspector = sa.inspect(conn)
    if "user_webauthn_credentials" in inspector.get_table_names():
        return
    op.create_table(
        "user_webauthn_credentials",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("credential_id", sa.LargeBinary(), nullable=False),
        sa.Column("public_key", sa.LargeBinary(), nullable=False),
        sa.Column("sign_count", sa.Integer(), default=0, nullable=False),
        sa.Column("aaguid", sa.String(255), nullable=True),
        sa.Column("device_name", sa.String(255), nullable=True),
        sa.Column(
            "transports",
            postgresql.ARRAY(sa.String()),
            nullable=True,
        ),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("backed_up", sa.Boolean(), default=False, nullable=False),
        sa.UniqueConstraint("credential_id", name="uq_webauthn_credential_id"),
    )
    op.create_index(
        "ix_user_webauthn_credentials_user_id",
        "user_webauthn_credentials",
        ["user_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_user_webauthn_credentials_user_id", table_name="user_webauthn_credentials")
    op.drop_table("user_webauthn_credentials")

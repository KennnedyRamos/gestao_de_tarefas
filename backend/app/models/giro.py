from sqlalchemy import Boolean, Column, Date, DateTime, Integer, Numeric, String, UniqueConstraint, func

from app.database.base import Base


class GiroEquipment(Base):
    __tablename__ = "giro_equipment"

    id = Column(Integer, primary_key=True, index=True)
    client_code = Column(String(64), nullable=False, index=True)
    equipment_type = Column(String(12), nullable=False, index=True)
    snapshot_month = Column(String(7), nullable=False, index=True)
    install_date = Column(Date, nullable=False, index=True)
    quantity = Column(Numeric(12, 3), nullable=False, default=1)
    is_refrigerator = Column(Boolean, nullable=False, default=True)
    balance = Column(Numeric(12, 3), nullable=False, default=1)


class GiroEquipmentSnapshot(Base):
    __tablename__ = "giro_equipment_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    month = Column(String(7), unique=True, nullable=False, index=True)
    file_name = Column(String(255), default="", nullable=False)
    rows_imported = Column(Integer, nullable=False, default=0)
    rows_ignored = Column(Integer, nullable=False, default=0)
    imported_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class GiroMonthlySale(Base):
    __tablename__ = "giro_monthly_sales"
    __table_args__ = (
        UniqueConstraint("client_code", "month", "basket", name="uq_giro_monthly_sale"),
    )

    id = Column(Integer, primary_key=True, index=True)
    client_code = Column(String(64), nullable=False, index=True)
    month = Column(String(7), nullable=False, index=True)
    basket = Column(String(12), nullable=False, index=True)
    amount = Column(Numeric(14, 2), nullable=False, default=0)


class GiroMonthlyTarget(Base):
    __tablename__ = "giro_monthly_targets"
    __table_args__ = (
        UniqueConstraint("month", "equipment_type", name="uq_giro_monthly_target"),
    )

    id = Column(Integer, primary_key=True, index=True)
    month = Column(String(7), nullable=False, index=True)
    equipment_type = Column(String(12), nullable=False, index=True)
    target_percent = Column(Numeric(6, 3), nullable=False)


class GiroImportStatus(Base):
    __tablename__ = "giro_import_status"

    id = Column(Integer, primary_key=True, index=True)
    dataset = Column(String(20), unique=True, nullable=False, index=True)
    file_name = Column(String(255), default="", nullable=False)
    rows_imported = Column(Integer, nullable=False, default=0)
    rows_ignored = Column(Integer, nullable=False, default=0)
    imported_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

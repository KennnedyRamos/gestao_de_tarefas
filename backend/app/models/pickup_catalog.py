from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, func

from app.database.base import Base


class PickupCatalogClient(Base):
    __tablename__ = "pickup_catalog_clients"

    id = Column(Integer, primary_key=True, index=True)
    client_code = Column(String(64), unique=True, index=True, nullable=False)
    nome_fantasia = Column(String(255), default="")
    razao_social = Column(String(255), default="")
    cnpj_cpf = Column(String(64), default="")
    setor = Column(String(80), default="")
    telefone = Column(String(80), default="")
    endereco = Column(String(255), default="")
    bairro = Column(String(120), default="")
    cidade = Column(String(120), default="")
    cep = Column(String(32), default="")
    inscricao_estadual = Column(String(64), default="")
    responsavel_cliente = Column(String(120), default="")
    responsavel_retirada = Column(String(120), default="")
    responsavel_conferencia = Column(String(120), default="")

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class PickupCatalogUploadBatch(Base):
    __tablename__ = "pickup_catalog_upload_batches"

    id = Column(Integer, primary_key=True, index=True)
    clients_file_name = Column(String(255), default="")
    inventory_file_name = Column(String(255), default="")
    clients_count = Column(Integer, default=0)
    inventory_clients = Column(Integer, default=0)
    open_items = Column(Integer, default=0)
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)


class PickupCatalogInventoryItem(Base):
    __tablename__ = "pickup_catalog_inventory_items"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("pickup_catalog_clients.id"), nullable=False, index=True)
    batch_id = Column(Integer, ForeignKey("pickup_catalog_upload_batches.id"), nullable=True)

    description = Column(String(255), nullable=False)
    item_type = Column(String(40), default="outro", index=True)
    open_quantity = Column(Integer, default=0)
    rg = Column(String(120), default="")
    volume_key = Column(String(20), default="")
    source_baixados = Column(Integer, default=0)
    product_code = Column(String(120), default="")

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)


class PickupCatalogOrder(Base):
    __tablename__ = "pickup_catalog_orders"

    id = Column(Integer, primary_key=True, index=True)
    order_number = Column(String(64), unique=True, index=True, nullable=True)
    company_name = Column(String(255), default="Ribeira Beer")

    client_id = Column(Integer, ForeignKey("pickup_catalog_clients.id"), nullable=True, index=True)
    client_code = Column(String(64), default="")
    nome_fantasia = Column(String(255), default="")
    razao_social = Column(String(255), default="")
    cnpj_cpf = Column(String(64), default="")
    setor = Column(String(80), default="")
    telefone = Column(String(80), default="")
    endereco = Column(String(255), default="")
    bairro = Column(String(120), default="")
    cidade = Column(String(120), default="")
    cep = Column(String(32), default="")
    inscricao_estadual = Column(String(64), default="")
    responsavel_cliente = Column(String(120), default="")
    responsavel_retirada = Column(String(120), default="")
    responsavel_conferencia = Column(String(120), default="")

    withdrawal_date = Column(String(20), default="")
    withdrawal_time = Column(String(20), default="")
    summary_line = Column(Text, default="")
    observation = Column(Text, default="")
    selected_types = Column(String(255), default="")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)


class PickupCatalogOrderItem(Base):
    __tablename__ = "pickup_catalog_order_items"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("pickup_catalog_orders.id"), nullable=False, index=True)

    description = Column(String(255), default="")
    item_type = Column(String(40), default="outro")
    quantity = Column(Integer, default=0)
    quantity_text = Column(String(120), default="")
    rg = Column(String(120), default="")
    volume_key = Column(String(20), default="")

from sqlalchemy import Column, Integer, String, Text
from app.database.base import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False)
    password = Column(String, nullable=False)
    role = Column(String, default="assistente")
    permissions = Column(Text, default="[]")
    token_version = Column(Integer, default=0, server_default="0", nullable=False)

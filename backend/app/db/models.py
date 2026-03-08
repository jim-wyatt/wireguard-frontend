from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text
from sqlalchemy.sql import func
from app.db.database import Base

class Client(Base):
    __tablename__ = "clients"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String, nullable=True)
    public_key = Column(String, unique=True, nullable=False)
    private_key = Column(String, nullable=False)
    ip_address = Column(String, unique=True, nullable=False)
    preshared_key = Column(String, nullable=True)
    allowed_ips = Column(String, default="0.0.0.0/0, ::/0")
    dns = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    is_active = Column(Boolean, default=True)
    last_handshake = Column(DateTime(timezone=True), nullable=True)
    config_downloaded = Column(Boolean, default=False)
    
    def __repr__(self):
        return f"<Client {self.email}>"

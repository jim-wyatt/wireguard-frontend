from pydantic import BaseModel, EmailStr, Field
from datetime import datetime
from typing import Optional

class ClientBase(BaseModel):
    name: Optional[str] = Field(default=None, max_length=128)

class ClientCreate(ClientBase):
    email: EmailStr

class ClientResponse(ClientBase):
    email: str
    id: int
    ip_address: str
    public_key: str
    is_active: bool
    created_at: datetime
    last_handshake: Optional[datetime] = None
    config_downloaded: bool
    
    class Config:
        from_attributes = True

class ClientConfig(BaseModel):
    config: str
    qr_code: Optional[str] = None

class ClientConnected(BaseModel):
    id: int
    email: str
    name: Optional[str]
    ip_address: str
    last_handshake: datetime
    transfer_rx: int
    transfer_tx: int
    
    class Config:
        from_attributes = True

class ClientStats(BaseModel):
    total_clients: int
    active_clients: int
    connected_clients: int

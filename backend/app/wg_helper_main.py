import ipaddress
import re
import subprocess

from fastapi import Depends, FastAPI, Header, HTTPException, status
from pydantic import BaseModel

from app.core.config import settings


WG_PUBLIC_KEY_PATTERN = re.compile(r"^[A-Za-z0-9+/]{43}=$")
INTERFACE_PATTERN = re.compile(r"^[A-Za-z0-9_.=-]{1,32}$")

app = FastAPI(title="WireGuard Helper", docs_url=None, openapi_url=None)


class InterfaceRequest(BaseModel):
    interface: str


class PeerRequest(BaseModel):
    interface: str
    public_key: str


class AddPeerRequest(PeerRequest):
    ip_address: str


def _expected_token() -> str:
    token = (settings.WG_HELPER_TOKEN or settings.API_SECRET_KEY).strip()
    if not token:
        raise RuntimeError("WG_HELPER_TOKEN or API_SECRET_KEY must be configured")
    return token


def require_helper_auth(x_wg_helper_token: str = Header(default="")) -> None:
    if x_wg_helper_token != _expected_token():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")


def _validate_interface(interface: str) -> str:
    if not INTERFACE_PATTERN.match(interface):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid interface")
    return interface


def _validate_public_key(public_key: str) -> str:
    if not WG_PUBLIC_KEY_PATTERN.match(public_key):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid public key")
    return public_key


def _validate_ip(ip_address: str) -> str:
    try:
        return str(ipaddress.ip_address(ip_address))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid IP address") from exc


def _run(args: list[str]) -> str:
    try:
        result = subprocess.run(args, capture_output=True, text=True, check=True)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc
    except subprocess.CalledProcessError as exc:
        detail = exc.stderr.strip() or exc.stdout.strip() or "WireGuard command failed"
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=detail) from exc
    return result.stdout


@app.post("/ip-link-show", dependencies=[Depends(require_helper_auth)])
def ip_link_show(payload: InterfaceRequest) -> dict[str, str]:
    output = _run(["ip", "link", "show", _validate_interface(payload.interface)])
    return {"output": output}


@app.post("/show-dump", dependencies=[Depends(require_helper_auth)])
def show_dump(payload: InterfaceRequest) -> dict[str, str]:
    output = _run(["wg", "show", _validate_interface(payload.interface), "dump"])
    return {"output": output}


@app.post("/show-listen-port", dependencies=[Depends(require_helper_auth)])
def show_listen_port(payload: InterfaceRequest) -> dict[str, str]:
    output = _run(["wg", "show", _validate_interface(payload.interface), "listen-port"])
    return {"output": output}


@app.post("/show-public-key", dependencies=[Depends(require_helper_auth)])
def show_public_key(payload: InterfaceRequest) -> dict[str, str]:
    output = _run(["wg", "show", _validate_interface(payload.interface), "public-key"])
    return {"output": output}


@app.post("/add-peer", dependencies=[Depends(require_helper_auth)])
def add_peer(payload: AddPeerRequest) -> dict[str, bool]:
    interface = _validate_interface(payload.interface)
    public_key = _validate_public_key(payload.public_key)
    ip_address = _validate_ip(payload.ip_address)
    _run(["wg", "set", interface, "peer", public_key, "allowed-ips", f"{ip_address}/32"])
    return {"ok": True}


@app.post("/remove-peer", dependencies=[Depends(require_helper_auth)])
def remove_peer(payload: PeerRequest) -> dict[str, bool]:
    interface = _validate_interface(payload.interface)
    public_key = _validate_public_key(payload.public_key)
    _run(["wg", "set", interface, "peer", public_key, "remove"])
    return {"ok": True}


@app.post("/save-config", dependencies=[Depends(require_helper_auth)])
def save_config(payload: InterfaceRequest) -> dict[str, bool]:
    _run(["wg-quick", "save", _validate_interface(payload.interface)])
    return {"ok": True}
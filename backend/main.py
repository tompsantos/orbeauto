from datetime import timedelta
from collections import Counter
import io
import re
from urllib.parse import urlparse
from xml.sax.saxutils import escape

from fastapi.responses import StreamingResponse
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Image as RLImage
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

import json
import os
import shutil
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from fastapi.staticfiles import StaticFiles
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr
from sqlalchemy import (
    text,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Float,
    Integer,
    Numeric,
    String,
    Text,
    create_engine,
)
from sqlalchemy.orm import Session, declarative_base, relationship, sessionmaker


DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://orbeauto:orbeauto@orbeauto-db:5432/orbeauto",
)

JWT_SECRET = os.getenv("JWT_SECRET", "change-me-orbeauto-dev-secret")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ADMIN_SECRET = os.getenv("ADMIN_SECRET", "orbeauto-admin-2026")
ADMIN_PANEL_USER = os.getenv("ADMIN_PANEL_USER", "tom")
ADMIN_PANEL_PASSWORD = os.getenv("ADMIN_PANEL_PASSWORD", "cori1993")
UPLOAD_DIR = Path(os.getenv("UPLOAD_DIR", "/app/uploads"))
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "")

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

app = FastAPI(title="orbeauto api", version="1.9.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")


def now():
    return datetime.now(timezone.utc)


def uid():
    return str(uuid.uuid4())


def public_url(path: str):
    base = (PUBLIC_BASE_URL or "").rstrip("/")
    if base:
        return f"{base}{path}"
    return path


class Workshop(Base):
    __tablename__ = "workshops"

    id = Column(String, primary_key=True, default=uid)
    legal_name = Column(String, nullable=False)
    trade_name = Column(String, nullable=False)
    cnpj = Column(String, nullable=False, unique=True)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    address = Column(Text, nullable=True)
    specialty = Column(String, nullable=True)
    pix = Column(String, nullable=True)
    instagram = Column(String, nullable=True)
    logo_url = Column(Text, nullable=True)
    active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=now)

    users = relationship("User", back_populates="workshop")
    orders = relationship("Order", back_populates="workshop")

    plan = Column(String, default="trial")
    subscription_status = Column(String, default="trial")
    billing_status = Column(String, default="ok")
    monthly_price = Column(Float, default=0)
    due_day = Column(Integer, nullable=True)
    locked_reason = Column(Text, nullable=True)
    internal_notes = Column(Text, nullable=True)
    last_payment_at = Column(DateTime(timezone=True), nullable=True)
    next_due_at = Column(DateTime(timezone=True), nullable=True)
    max_users = Column(Integer, nullable=True)
    max_orders_month = Column(Integer, nullable=True)
    storage_limit_mb = Column(Integer, nullable=True)
    features_json = Column(Text, nullable=True)
    admin_tags = Column(Text, nullable=True)

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=uid)
    workshop_id = Column(String, ForeignKey("workshops.id"), nullable=False)
    name = Column(String, nullable=False)
    email = Column(String, nullable=False, unique=True)
    password_hash = Column(Text, nullable=False)
    role = Column(String, default="owner")
    active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=now)

    workshop = relationship("Workshop", back_populates="users")


class Customer(Base):
    __tablename__ = "customers"

    id = Column(String, primary_key=True, default=uid)
    workshop_id = Column(String, ForeignKey("workshops.id"), nullable=False)
    name = Column(String, nullable=False)
    phone = Column(String, nullable=True)
    cpf = Column(String, nullable=True)
    email = Column(String, nullable=True)
    address = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=now)


class Vehicle(Base):
    __tablename__ = "vehicles"

    id = Column(String, primary_key=True, default=uid)
    workshop_id = Column(String, ForeignKey("workshops.id"), nullable=False)
    customer_id = Column(String, ForeignKey("customers.id"), nullable=False)
    brand = Column(String, nullable=False)
    model = Column(String, nullable=False)
    year = Column(String, nullable=False)
    color = Column(String, nullable=True)
    plate_or_chassis = Column(String, nullable=True)
    chassis = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=now)


class Order(Base):
    __tablename__ = "orders"

    id = Column(String, primary_key=True)
    workshop_id = Column(String, ForeignKey("workshops.id"), nullable=False)
    customer_id = Column(String, ForeignKey("customers.id"), nullable=False)
    vehicle_id = Column(String, ForeignKey("vehicles.id"), nullable=False)

    status = Column(String, default="em aberto")
    os_type = Column(String, default="particular")

    insurer_company = Column(String, nullable=True)
    insurance_service_order = Column(String, nullable=True)
    insurance_contact = Column(String, nullable=True)

    damage_types = Column(Text, default="[]")
    damage_description = Column(Text, nullable=True)
    service_description = Column(Text, nullable=True)

    amount = Column(Numeric(12, 2), default=0)
    payment_method = Column(String, nullable=True)
    payment_condition = Column(String, default="avista")
    installments = Column(Integer, default=1)

    created_at = Column(DateTime(timezone=True), default=now)
    updated_at = Column(DateTime(timezone=True), default=now)

    workshop = relationship("Workshop", back_populates="orders")
    customer = relationship("Customer")
    vehicle = relationship("Vehicle")
    photos = relationship("Photo", cascade="all, delete-orphan", back_populates="order")

    scheduled_entry_at = Column(DateTime(timezone=True), nullable=True)
    scheduled_entry_note = Column(Text, nullable=True)
    schedule_priority = Column(String, default="normal")
    vehicle_received_at = Column(DateTime(timezone=True), nullable=True)
    production_status = Column(String, default="orcamento")
    production_notes = Column(Text, nullable=True)
    checklist_json = Column(Text, nullable=True)

    finished_at = Column(DateTime(timezone=True), nullable=True)

class Photo(Base):
    __tablename__ = "photos"

    id = Column(String, primary_key=True, default=uid)
    workshop_id = Column(String, ForeignKey("workshops.id"), nullable=False)
    order_id = Column(String, ForeignKey("orders.id"), nullable=False)
    label = Column(String, nullable=True)
    url = Column(Text, nullable=False)
    filename = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=now)

    order = relationship("Order", back_populates="photos")


class FiscalSettings(Base):
    __tablename__ = "fiscal_settings"

    id = Column(String, primary_key=True, default=uid)
    workshop_id = Column(String, ForeignKey("workshops.id"), nullable=False, unique=True)

    provider_cnpj = Column(String, nullable=True)
    provider_municipal_registration = Column(String, nullable=True)
    provider_city = Column(String, nullable=True)
    provider_state = Column(String, nullable=True)

    service_code = Column(String, nullable=True)
    cnae = Column(String, nullable=True)
    activity_description = Column(Text, nullable=True)

    iss_rate = Column(Float, nullable=True)
    simple_national = Column(Boolean, default=False)
    special_tax_regime = Column(String, nullable=True)
    iss_withheld_default = Column(Boolean, default=False)

    rps_series = Column(String, nullable=True)
    next_rps_number = Column(Integer, nullable=True)

    environment = Column(String, default="draft")
    created_at = Column(DateTime(timezone=True), default=now)
    updated_at = Column(DateTime(timezone=True), default=now)


class FiscalDocument(Base):
    __tablename__ = "fiscal_documents"

    id = Column(String, primary_key=True, default=uid)
    workshop_id = Column(String, ForeignKey("workshops.id"), nullable=False)
    order_id = Column(String, ForeignKey("orders.id"), nullable=False)

    status = Column(String, default="rascunho")

    taker_json = Column(Text, nullable=True)
    service_json = Column(Text, nullable=True)
    values_json = Column(Text, nullable=True)
    settings_snapshot_json = Column(Text, nullable=True)

    rps_number = Column(String, nullable=True)
    rps_series = Column(String, nullable=True)
    protocol = Column(String, nullable=True)

    verification_code = Column(String, nullable=True)

    xml_request = Column(Text, nullable=True)
    xml_response = Column(Text, nullable=True)
    error_message = Column(Text, nullable=True)

    issued_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=now)
    updated_at = Column(DateTime(timezone=True), default=now)

    giss_protocol = Column(String, nullable=True)
    giss_http_status = Column(Integer, nullable=True)
    giss_last_operation = Column(String, nullable=True)
    giss_sent_xml = Column(Text, nullable=True)
    giss_response_xml = Column(Text, nullable=True)
    giss_messages_json = Column(Text, nullable=True)
    giss_sent_at = Column(DateTime(timezone=True), nullable=True)
    giss_response_at = Column(DateTime(timezone=True), nullable=True)
    nfse_number = Column(String, nullable=True)
    nfse_verification_code = Column(String, nullable=True)



Base.metadata.create_all(bind=engine)

def ensure_subscription_columns():
    statements = [
        "ALTER TABLE workshops ADD COLUMN IF NOT EXISTS plan VARCHAR DEFAULT 'trial'",
        "ALTER TABLE workshops ADD COLUMN IF NOT EXISTS subscription_status VARCHAR DEFAULT 'trial'",
        "ALTER TABLE workshops ADD COLUMN IF NOT EXISTS billing_status VARCHAR DEFAULT 'ok'",
        "ALTER TABLE workshops ADD COLUMN IF NOT EXISTS monthly_price FLOAT DEFAULT 0",
        "ALTER TABLE workshops ADD COLUMN IF NOT EXISTS due_day INTEGER",
        "ALTER TABLE workshops ADD COLUMN IF NOT EXISTS locked_reason TEXT",
        "ALTER TABLE workshops ADD COLUMN IF NOT EXISTS internal_notes TEXT",
    ]

    with engine.begin() as conn:
        for statement in statements:
            conn.execute(text(statement))


ensure_subscription_columns()


def ensure_admin_control_columns():
    statements = [
        "ALTER TABLE workshops ADD COLUMN IF NOT EXISTS last_payment_at TIMESTAMPTZ",
        "ALTER TABLE workshops ADD COLUMN IF NOT EXISTS next_due_at TIMESTAMPTZ",
        "ALTER TABLE workshops ADD COLUMN IF NOT EXISTS max_users INTEGER",
        "ALTER TABLE workshops ADD COLUMN IF NOT EXISTS max_orders_month INTEGER",
        "ALTER TABLE workshops ADD COLUMN IF NOT EXISTS storage_limit_mb INTEGER",
        "ALTER TABLE workshops ADD COLUMN IF NOT EXISTS features_json TEXT",
        "ALTER TABLE workshops ADD COLUMN IF NOT EXISTS admin_tags TEXT",
        """
        CREATE TABLE IF NOT EXISTS admin_audit_logs (
            id UUID PRIMARY KEY,
            workshop_id VARCHAR,
            admin_user VARCHAR NOT NULL,
            action VARCHAR NOT NULL,
            metadata TEXT,
            created_at TIMESTAMPTZ DEFAULT now()
        )
        """,
    ]

    with engine.begin() as conn:
        for statement in statements:
            conn.execute(text(statement))


ensure_admin_control_columns()


def ensure_operational_columns():
    statements = [
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS scheduled_entry_at TIMESTAMPTZ",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS scheduled_entry_note TEXT",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS schedule_priority VARCHAR DEFAULT 'normal'",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS vehicle_received_at TIMESTAMPTZ",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS production_status VARCHAR DEFAULT 'orcamento'",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS production_notes TEXT",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS checklist_json TEXT",
        "ALTER TABLE orders ADD COLUMN IF NOT EXISTS finished_at TIMESTAMPTZ",
    ]

    with engine.begin() as conn:
        for statement in statements:
            conn.execute(text(statement))


ensure_operational_columns()


def write_admin_audit(db: Session, admin_user: str, action: str, workshop_id: Optional[str] = None, metadata: Optional[dict] = None):
    try:
        db.execute(
            text("""
                INSERT INTO admin_audit_logs (id, workshop_id, admin_user, action, metadata, created_at)
                VALUES (:id, :workshop_id, :admin_user, :action, :metadata, :created_at)
            """),
            {
                "id": str(uuid.uuid4()),
                "workshop_id": workshop_id,
                "admin_user": admin_user,
                "action": action,
                "metadata": json.dumps(metadata or {}, ensure_ascii=False),
                "created_at": datetime.now(timezone.utc),
            },
        )
    except Exception as error:
        print("admin audit error:", error)


def parse_admin_datetime(value):
    if not value:
        return None

    if isinstance(value, datetime):
        return value

    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except Exception:
        return None


def admin_datetime_label(value):
    if not value:
        return None

    try:
        return value.isoformat()
    except Exception:
        return None

    statements = [
        "ALTER TABLE workshops ADD COLUMN IF NOT EXISTS plan VARCHAR DEFAULT 'trial'",
        "ALTER TABLE workshops ADD COLUMN IF NOT EXISTS subscription_status VARCHAR DEFAULT 'trial'",
        "ALTER TABLE workshops ADD COLUMN IF NOT EXISTS billing_status VARCHAR DEFAULT 'ok'",
        "ALTER TABLE workshops ADD COLUMN IF NOT EXISTS monthly_price FLOAT DEFAULT 0",
        "ALTER TABLE workshops ADD COLUMN IF NOT EXISTS due_day INTEGER",
        "ALTER TABLE workshops ADD COLUMN IF NOT EXISTS locked_reason TEXT",
        "ALTER TABLE workshops ADD COLUMN IF NOT EXISTS internal_notes TEXT",
    ]

    with engine.begin() as conn:
        for statement in statements:
            conn.execute(text(statement))


ensure_subscription_columns()





class OrderSchedulePayload(BaseModel):
    scheduled_entry_at: Optional[str] = None
    scheduled_entry_note: Optional[str] = None
    schedule_priority: Optional[str] = "normal"


class OrderProductionPayload(BaseModel):
    production_status: Optional[str] = None
    production_notes: Optional[str] = None
    vehicle_received_at: Optional[str] = None


class OrderChecklistPayload(BaseModel):
    checklist: dict


class WorkshopCreate(BaseModel):
    legal_name: str
    trade_name: str
    cnpj: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    specialty: Optional[str] = "martelinho de ouro, funilaria e pintura"
    pix: Optional[str] = None
    instagram: Optional[str] = None
    owner_name: str
    owner_email: EmailStr
    owner_password: str


class LoginPayload(BaseModel):
    email: EmailStr
    password: str


class WorkshopPatch(BaseModel):
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    address: Optional[str] = None


class CustomerPayload(BaseModel):
    name: str
    phone: Optional[str] = None
    cpf: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None


class VehiclePayload(BaseModel):
    brand: str
    model: str
    year: str
    color: Optional[str] = None
    plate_or_chassis: Optional[str] = None
    chassis: Optional[str] = None


class InsurancePayload(BaseModel):
    company: Optional[str] = None
    service_order: Optional[str] = None
    contact: Optional[str] = None


class PaymentPayload(BaseModel):
    amount: float = 0
    method: Optional[str] = "pix"
    condition: Optional[str] = "avista"
    installments: Optional[int] = 1


class OrderPayload(BaseModel):
    customer: CustomerPayload
    vehicle: VehiclePayload
    os_type: str = "particular"
    status: Optional[str] = "em aberto"
    insurance: Optional[InsurancePayload] = None
    damage_types: list[str] = []
    damage_description: Optional[str] = None
    service_description: Optional[str] = None
    payment: PaymentPayload


class StatusPayload(BaseModel):
    status: str


class FiscalSettingsPayload(BaseModel):
    provider_cnpj: Optional[str] = None
    provider_municipal_registration: Optional[str] = None
    provider_city: Optional[str] = None
    provider_state: Optional[str] = None

    service_code: Optional[str] = None
    cnae: Optional[str] = None
    activity_description: Optional[str] = None

    iss_rate: Optional[float] = None
    simple_national: Optional[bool] = None
    special_tax_regime: Optional[str] = None
    iss_withheld_default: Optional[bool] = None

    rps_series: Optional[str] = None
    next_rps_number: Optional[int] = None
    environment: Optional[str] = None


class FiscalDraftPayload(BaseModel):
    taker: dict = {}
    service: dict = {}
    values: dict = {}
    settings: dict = {}
    status: Optional[str] = "rascunho"



def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def hash_password(password: str):
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str):
    return pwd_context.verify(password, password_hash)


def create_token(user: User):
    payload = {
        "sub": user.id,
        "workshop_id": user.workshop_id,
        "role": user.role,
        "exp": datetime.utcnow() + timedelta(days=7),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=["HS256"])
        user_id = payload.get("sub")
    except JWTError:
        raise HTTPException(status_code=401, detail="token inválido")

    user = db.query(User).filter(User.id == user_id, User.active == True).first()

    if not user:
        raise HTTPException(status_code=401, detail="usuário não encontrado")

    
    if user.workshop and (
        not user.workshop.active
        or user.workshop.subscription_status in ["suspenso", "bloqueado", "inadimplente"]
        or user.workshop.billing_status in ["inadimplente", "bloqueado"]
    ):
        reason = user.workshop.locked_reason or "assinante bloqueado ou inativo"
        raise HTTPException(status_code=403, detail=reason)

    return user


def workshop_dict(workshop: Workshop):
    return {
        "id": workshop.id,
        "legal_name": workshop.legal_name,
        "trade_name": workshop.trade_name,
        "cnpj": workshop.cnpj,
        "email": workshop.email,
        "phone": workshop.phone,
        "address": workshop.address,
        "specialty": workshop.specialty,
        "pix": workshop.pix,
        "instagram": workshop.instagram,
        "logo_url": workshop.logo_url,
        "active": workshop.active,
    }


def user_dict(user: User):
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "workshop_id": user.workshop_id,
    }


def order_code():
    return str(int(datetime.now().timestamp() * 1000))[-8:]


def parse_damage_types(value: str):
    try:
        parsed = json.loads(value or "[]")
        return parsed if isinstance(parsed, list) else []
    except Exception:
        return []



def parse_optional_datetime(value):
    if not value:
        return None

    if isinstance(value, datetime):
        return value

    raw = str(value).strip()

    if not raw:
        return None

    try:
        if len(raw) == 10:
            return datetime.fromisoformat(raw + "T09:00:00+00:00")

        return datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except Exception:
        raise HTTPException(status_code=400, detail="data inválida")


def iso_or_none(value):
    if not value:
        return None

    try:
        return value.isoformat()
    except Exception:
        return None


def parse_checklist(value):
    if not value:
        return {}

    if isinstance(value, dict):
        return value

    try:
        return json.loads(value)
    except Exception:
        return {}


def default_operational_checklist():
    return {
        "veiculo_recebido": False,
        "fotos_entrada": False,
        "danos_conferidos": False,
        "servico_iniciado": False,
        "funilaria_pintura_martelinho": False,
        "acabamento": False,
        "conferencia_final": False,
        "veiculo_pronto": False,
        "veiculo_entregue": False,
    }


def normalize_production_status(status):
    raw = (status or "").strip().lower()

    allowed = {
        "orcamento",
        "enviado",
        "aprovado",
        "agendado",
        "recebido",
        "em_execucao",
        "pronto",
        "finalizado",
        "cancelado",
    }

    if raw not in allowed:
        return "orcamento"

    return raw


def serialize_order(order: Order):
    return {
        "id": order.id,
        "status": order.status,
        "created_at": order.created_at.isoformat() if order.created_at else None,
        "updated_at": order.updated_at.isoformat() if order.updated_at else None,
        "scheduled_entry_at": iso_or_none(order.scheduled_entry_at),
        "scheduled_entry_note": order.scheduled_entry_note,
        "schedule_priority": order.schedule_priority or "normal",
        "vehicle_received_at": iso_or_none(order.vehicle_received_at),
        "finished_at": iso_or_none(order.finished_at),
        "production_status": order.production_status or "orcamento",
        "production_notes": order.production_notes,
        "checklist": parse_checklist(order.checklist_json),
        "os_type": order.os_type,
        "customer": {
            "id": order.customer.id,
            "name": order.customer.name,
            "phone": order.customer.phone,
            "cpf": order.customer.cpf,
            "email": order.customer.email,
            "address": order.customer.address,
        },
        "vehicle": {
            "id": order.vehicle.id,
            "brand": order.vehicle.brand,
            "model": order.vehicle.model,
            "year": order.vehicle.year,
            "color": order.vehicle.color,
            "plate_or_chassis": order.vehicle.plate_or_chassis,
            "chassis": order.vehicle.chassis,
        },
        "insurance": {
            "company": order.insurer_company,
            "service_order": order.insurance_service_order,
            "contact": order.insurance_contact,
        },
        "damage_types": parse_damage_types(order.damage_types),
        "damage_description": order.damage_description,
        "service_description": order.service_description,
        "payment": {
            "amount": float(order.amount or 0),
            "method": order.payment_method,
            "condition": order.payment_condition,
            "installments": order.installments,
        },
        "photos": [
            serialize_photo(photo)
            for photo in sorted(order.photos or [], key=lambda item: item.created_at or datetime.min)
        ],
    }


def create_or_update_order(
    db: Session,
    payload: OrderPayload,
    user: User,
    existing_order: Optional[Order] = None,
):
    insurance = payload.insurance or InsurancePayload()

    if existing_order:
        customer = existing_order.customer
        vehicle = existing_order.vehicle
        order = existing_order
    else:
        customer = None

        if payload.customer.cpf:
            customer = (
                db.query(Customer)
                .filter(
                    Customer.workshop_id == user.workshop_id,
                    Customer.cpf == payload.customer.cpf,
                )
                .first()
            )

        if not customer and payload.customer.phone:
            customer = (
                db.query(Customer)
                .filter(
                    Customer.workshop_id == user.workshop_id,
                    Customer.phone == payload.customer.phone,
                )
                .first()
            )

        if not customer and payload.customer.email:
            customer = (
                db.query(Customer)
                .filter(
                    Customer.workshop_id == user.workshop_id,
                    Customer.email == payload.customer.email,
                )
                .first()
            )

        if not customer:
            customer = Customer(workshop_id=user.workshop_id)
            db.add(customer)

        customer.name = payload.customer.name
        customer.phone = payload.customer.phone
        customer.cpf = payload.customer.cpf
        customer.email = payload.customer.email
        customer.address = payload.customer.address

        db.flush()

        vehicle = None

        if payload.vehicle.plate_or_chassis:
            vehicle = (
                db.query(Vehicle)
                .filter(
                    Vehicle.workshop_id == user.workshop_id,
                    Vehicle.customer_id == customer.id,
                    Vehicle.plate_or_chassis == payload.vehicle.plate_or_chassis,
                )
                .first()
            )

        if not vehicle:
            vehicle = Vehicle(
                workshop_id=user.workshop_id,
                customer_id=customer.id,
            )
            db.add(vehicle)

        vehicle.brand = payload.vehicle.brand
        vehicle.model = payload.vehicle.model
        vehicle.year = payload.vehicle.year
        vehicle.color = payload.vehicle.color
        vehicle.plate_or_chassis = payload.vehicle.plate_or_chassis
        vehicle.chassis = payload.vehicle.chassis

        db.flush()

        order = Order(
            id=order_code(),
            workshop_id=user.workshop_id,
            customer_id=customer.id,
            vehicle_id=vehicle.id,
        )

    if existing_order:
        customer.name = payload.customer.name
        customer.phone = payload.customer.phone
        customer.cpf = payload.customer.cpf
        customer.email = payload.customer.email
        customer.address = payload.customer.address

        vehicle.brand = payload.vehicle.brand
        vehicle.model = payload.vehicle.model
        vehicle.year = payload.vehicle.year
        vehicle.color = payload.vehicle.color
        vehicle.plate_or_chassis = payload.vehicle.plate_or_chassis
        vehicle.chassis = payload.vehicle.chassis

    order.status = payload.status or order.status or "em aberto"
    order.os_type = payload.os_type
    order.insurer_company = insurance.company
    order.insurance_service_order = insurance.service_order
    order.insurance_contact = insurance.contact
    order.damage_types = json.dumps(payload.damage_types or [], ensure_ascii=False)
    order.damage_description = payload.damage_description
    order.service_description = payload.service_description
    order.amount = payload.payment.amount or 0
    order.payment_method = payload.payment.method
    order.payment_condition = payload.payment.condition or "avista"
    order.installments = payload.payment.installments or 1
    order.updated_at = now()

    db.add(order)
    db.commit()
    db.refresh(order)

    return order


@app.get("/health")
def health():
    return {"ok": True, "service": "orbeauto-api"}


@app.post("/admin/workshops")
def admin_create_workshop(
    payload: WorkshopCreate,
    x_admin_secret: str = Header(default=""),
    db: Session = Depends(get_db),
):
    if x_admin_secret != ADMIN_SECRET:
        raise HTTPException(status_code=403, detail="admin secret inválido")

    existing_cnpj = db.query(Workshop).filter(Workshop.cnpj == payload.cnpj).first()
    if existing_cnpj:
        raise HTTPException(status_code=409, detail="cnpj já cadastrado")

    existing_user = db.query(User).filter(User.email == payload.owner_email).first()
    if existing_user:
        raise HTTPException(status_code=409, detail="email do responsável já cadastrado")

    workshop = Workshop(
        legal_name=payload.legal_name,
        trade_name=payload.trade_name,
        cnpj=payload.cnpj,
        email=payload.email,
        phone=payload.phone,
        address=payload.address,
        specialty=payload.specialty,
        pix=payload.pix,
        instagram=payload.instagram,
    )

    db.add(workshop)
    db.flush()

    user = User(
        workshop_id=workshop.id,
        name=payload.owner_name,
        email=str(payload.owner_email),
        password_hash=hash_password(payload.owner_password),
        role="owner",
    )

    db.add(user)
    db.commit()
    db.refresh(workshop)
    db.refresh(user)

    return {
        "workshop": workshop_dict(workshop),
        "owner": user_dict(user),
        "message": "oficina cadastrada",
    }


@app.post("/auth/login")
def login(payload: LoginPayload, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == str(payload.email), User.active == True).first()

    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="email ou senha inválidos")

    return {
        "token": create_token(user),
        "user": user_dict(user),
        "workshop": workshop_dict(user.workshop),
    }


@app.get("/me")
def me(user: User = Depends(get_current_user)):
    return {
        "user": user_dict(user),
        "workshop": workshop_dict(user.workshop),
    }


FISCAL_FEATURE_KEY = "fiscal_nfse"


def safe_json_loads(value, fallback=None):
    if fallback is None:
        fallback = {}

    if not value:
        return fallback

    try:
        parsed = json.loads(value)
        return parsed if parsed is not None else fallback
    except Exception:
        return fallback


def only_digits_backend(value):
    return "".join(ch for ch in str(value or "") if ch.isdigit())


def workshop_has_feature(workshop: Workshop, key: str):
    features = safe_json_loads(workshop.features_json, {})

    if isinstance(features, list):
        return key in features

    if isinstance(features, dict):
        return bool(features.get(key))

    return False


def require_fiscal_feature(user: User):
    if not workshop_has_feature(user.workshop, FISCAL_FEATURE_KEY):
        raise HTTPException(status_code=403, detail="módulo fiscal não habilitado para esta oficina")


def fiscal_settings_dict(settings: FiscalSettings):
    return {
        "id": settings.id,
        "workshop_id": settings.workshop_id,
        "provider_cnpj": settings.provider_cnpj,
        "provider_municipal_registration": settings.provider_municipal_registration,
        "provider_city": settings.provider_city,
        "provider_state": settings.provider_state,
        "service_code": settings.service_code,
        "cnae": settings.cnae,
        "activity_description": settings.activity_description,
        "iss_rate": settings.iss_rate,
        "simple_national": settings.simple_national,
        "special_tax_regime": settings.special_tax_regime,
        "iss_withheld_default": settings.iss_withheld_default,
        "rps_series": settings.rps_series,
        "next_rps_number": settings.next_rps_number,
        "environment": settings.environment,
        "created_at": iso_or_none(settings.created_at),
        "updated_at": iso_or_none(settings.updated_at),
    }


def fiscal_document_dict(document: FiscalDocument):
    return {
        "id": document.id,
        "workshop_id": document.workshop_id,
        "order_id": document.order_id,
        "status": document.status,
        "taker": safe_json_loads(document.taker_json, {}),
        "service": safe_json_loads(document.service_json, {}),
        "values": safe_json_loads(document.values_json, {}),
        "settings": safe_json_loads(document.settings_snapshot_json, {}),
        "rps_number": document.rps_number,
        "rps_series": document.rps_series,
        "protocol": document.protocol,
        "nfse_number": document.nfse_number,
        "verification_code": document.verification_code,
        "error_message": document.error_message,
        "issued_at": iso_or_none(document.issued_at),
        "created_at": iso_or_none(document.created_at),
        "updated_at": iso_or_none(document.updated_at),
    }


def default_fiscal_settings_for_workshop(workshop: Workshop):
    cnpj_digits = only_digits_backend(workshop.cnpj)

    defaults = {
        "provider_cnpj": workshop.cnpj,
        "provider_municipal_registration": None,
        "provider_city": "JABOTICABAL",
        "provider_state": "SP",
        "service_code": None,
        "cnae": None,
        "activity_description": None,
        "iss_rate": None,
        "simple_national": False,
        "special_tax_regime": None,
        "iss_withheld_default": False,
        "rps_series": None,
        "next_rps_number": None,
        "environment": "draft",
    }

    # configuração inicial segura para a oficina do Laércio, baseada na NFS-e enviada como referência
    if cnpj_digits == "39935230000188":
        defaults.update({
            "provider_municipal_registration": "126566",
            "service_code": "14.12",
            "cnae": "4520002",
            "activity_description": "Serviços de lanternagem ou funilaria e pintura de veículos automotores",
            "iss_rate": 3.0,
            "simple_national": False,
            "special_tax_regime": "0",
            "iss_withheld_default": False,
            "provider_city": "JABOTICABAL",
            "provider_state": "SP",
            "environment": "draft",
        })

    return defaults


def get_or_create_fiscal_settings(db: Session, workshop: Workshop):
    settings = db.query(FiscalSettings).filter(FiscalSettings.workshop_id == workshop.id).first()

    if settings:
        return settings

    defaults = default_fiscal_settings_for_workshop(workshop)

    settings = FiscalSettings(
        workshop_id=workshop.id,
        **defaults,
    )

    db.add(settings)
    db.commit()
    db.refresh(settings)

    return settings


def get_scoped_order_or_404(db: Session, user: User, order_id: str):
    order = (
        db.query(Order)
        .filter(Order.id == order_id, Order.workshop_id == user.workshop_id)
        .first()
    )

    if not order:
        raise HTTPException(status_code=404, detail="orçamento não encontrado")

    return order


def default_fiscal_taker_from_order(order: Order):
    customer = order.customer
    tax_id = customer.cpf if customer else ""
    digits = only_digits_backend(tax_id)

    return {
        "person_type": "juridica" if len(digits) == 14 else "fisica",
        "name": customer.name if customer else "",
        "legal_name": customer.name if customer else "",
        "tax_id": tax_id,
        "municipal_registration": "",
        "email": customer.email if customer else "",
        "phone": customer.phone if customer else "",
        "address": customer.address if customer else "",
        "number": "",
        "district": "",
        "city": "",
        "state": "",
        "zip_code": "",
        "country": "Brasil",
    }


def default_fiscal_service_from_order(order: Order):
    insurance_lines = []

    if order.insurance_contact:
        insurance_lines.append(f"AT.: {order.insurance_contact}")

    if order.insurance_service_order:
        insurance_lines.append(f"O.S.: {order.insurance_service_order}")

    description_seed = order.service_description or order.damage_description or ""

    if insurance_lines:
        description_seed = "\n".join([description_seed, *insurance_lines]).strip()

    return {
        "description": description_seed,
        "service_code": "",
        "cnae": "",
        "activity_description": "",
    }


def default_fiscal_values_from_order(order: Order):
    try:
        amount = float(order.amount or 0)
    except Exception:
        amount = 0

    return {
        "service_amount": amount,
        "deductions": 0,
        "discount_unconditional": 0,
        "discount_conditional": 0,
        "other_withholdings": 0,
        "iss_withheld": False,
    }


def get_or_create_fiscal_document(db: Session, user: User, order: Order):
    document = (
        db.query(FiscalDocument)
        .filter(
            FiscalDocument.order_id == order.id,
            FiscalDocument.workshop_id == user.workshop_id,
        )
        .order_by(FiscalDocument.created_at.desc())
        .first()
    )

    if document:
        return document

    settings = get_or_create_fiscal_settings(db, user.workshop)

    document = FiscalDocument(
        workshop_id=user.workshop_id,
        order_id=order.id,
        status="rascunho",
        taker_json=json.dumps(default_fiscal_taker_from_order(order), ensure_ascii=False),
        service_json=json.dumps(default_fiscal_service_from_order(order), ensure_ascii=False),
        values_json=json.dumps(default_fiscal_values_from_order(order), ensure_ascii=False),
        settings_snapshot_json=json.dumps(fiscal_settings_dict(settings), ensure_ascii=False),
    )

    db.add(document)
    db.commit()
    db.refresh(document)

    return document


@app.get("/fiscal/status")
def fiscal_status(user: User = Depends(get_current_user)):
    return {
        "enabled": workshop_has_feature(user.workshop, FISCAL_FEATURE_KEY),
        "feature": FISCAL_FEATURE_KEY,
    }


@app.get("/fiscal/settings")
def get_fiscal_settings(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_fiscal_feature(user)
    settings = get_or_create_fiscal_settings(db, user.workshop)
    return fiscal_settings_dict(settings)


@app.patch("/fiscal/settings")
def patch_fiscal_settings(
    payload: FiscalSettingsPayload,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_fiscal_feature(user)

    settings = get_or_create_fiscal_settings(db, user.workshop)
    data = payload.model_dump(exclude_unset=True)

    for field, value in data.items():
        setattr(settings, field, value)

    settings.updated_at = now()

    db.add(settings)
    db.commit()
    db.refresh(settings)

    return fiscal_settings_dict(settings)


@app.get("/orders/{order_id}/fiscal-draft")
def get_order_fiscal_draft(
    order_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_fiscal_feature(user)

    order = get_scoped_order_or_404(db, user, order_id)
    document = get_or_create_fiscal_document(db, user, order)

    return fiscal_document_dict(document)


@app.post("/orders/{order_id}/fiscal-draft")
def save_order_fiscal_draft(
    order_id: str,
    payload: FiscalDraftPayload,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_fiscal_feature(user)

    order = get_scoped_order_or_404(db, user, order_id)
    document = get_or_create_fiscal_document(db, user, order)

    document.status = payload.status or "rascunho"
    document.taker_json = json.dumps(payload.taker or {}, ensure_ascii=False)
    document.service_json = json.dumps(payload.service or {}, ensure_ascii=False)
    document.values_json = json.dumps(payload.values or {}, ensure_ascii=False)
    document.settings_snapshot_json = json.dumps(payload.settings or {}, ensure_ascii=False)
    document.updated_at = now()

    db.add(document)
    db.commit()
    db.refresh(document)

    return fiscal_document_dict(document)




def fiscal_validation_errors(document: FiscalDocument, settings: FiscalSettings):
    errors = []

    taker = safe_json_loads(document.taker_json, {})
    service = safe_json_loads(document.service_json, {})
    values = safe_json_loads(document.values_json, {})

    taker_name = taker.get("legal_name") or taker.get("name")
    tax_id = only_digits_backend(taker.get("tax_id"))

    if not str(taker_name or "").strip():
        errors.append("tomador sem nome ou razão social")

    if not tax_id:
        errors.append("tomador sem CPF/CNPJ")

    if tax_id and len(tax_id) not in [11, 14]:
        errors.append("CPF/CNPJ do tomador parece inválido")

    if not str(service.get("description") or "").strip():
        errors.append("discriminação da nota não informada")

    try:
        amount = float(values.get("service_amount") or 0)
    except Exception:
        amount = 0

    if amount <= 0:
        errors.append("valor da nota precisa ser maior que zero")

    if not only_digits_backend(settings.provider_cnpj):
        errors.append("CNPJ do prestador não configurado")

    if not str(settings.provider_municipal_registration or "").strip():
        errors.append("inscrição municipal do prestador não configurada")

    if not str(settings.service_code or "").strip():
        errors.append("código de serviço não configurado")

    if not str(settings.cnae or "").strip():
        errors.append("CNAE não configurado")

    if settings.iss_rate is None:
        errors.append("alíquota ISS não configurada")

    return errors


def xml_text(parent, tag, value):
    from xml.etree.ElementTree import SubElement

    child = SubElement(parent, tag)
    child.text = "" if value is None else str(value).strip()
    return child


def build_fiscal_draft_xml(order: Order, document: FiscalDocument, settings: FiscalSettings):
    from xml.etree.ElementTree import Element, SubElement, tostring
    from xml.dom import minidom

    taker = safe_json_loads(document.taker_json, {})
    service = safe_json_loads(document.service_json, {})
    values = safe_json_loads(document.values_json, {})

    try:
        service_amount = float(values.get("service_amount") or 0)
    except Exception:
        service_amount = 0

    try:
        iss_rate = float(settings.iss_rate or 0)
    except Exception:
        iss_rate = 0

    iss_value = round(service_amount * (iss_rate / 100), 2)

    root = Element("OrbeAutoNfseRascunho")
    root.set("versao", "1.20b")
    root.set("ambiente", settings.environment or "draft")

    meta = SubElement(root, "Meta")
    xml_text(meta, "OrdemId", order.id)
    xml_text(meta, "DocumentoFiscalId", document.id)
    xml_text(meta, "GeradoEm", now().isoformat())
    xml_text(meta, "Status", document.status or "rascunho")

    prestador = SubElement(root, "Prestador")
    xml_text(prestador, "Cnpj", only_digits_backend(settings.provider_cnpj))
    xml_text(prestador, "InscricaoMunicipal", settings.provider_municipal_registration)
    xml_text(prestador, "Municipio", settings.provider_city)
    xml_text(prestador, "Uf", settings.provider_state)
    xml_text(prestador, "CodigoServico", settings.service_code)
    xml_text(prestador, "Cnae", settings.cnae)
    xml_text(prestador, "Atividade", settings.activity_description)
    xml_text(prestador, "AliquotaIss", f"{iss_rate:.2f}")
    xml_text(prestador, "SimplesNacional", "1" if settings.simple_national else "2")
    xml_text(prestador, "RegimeEspecialTributacao", settings.special_tax_regime or "0")

    tomador = SubElement(root, "Tomador")
    xml_text(tomador, "TipoPessoa", taker.get("person_type") or "fisica")
    xml_text(tomador, "CpfCnpj", only_digits_backend(taker.get("tax_id")))
    xml_text(tomador, "NomeRazaoSocial", taker.get("legal_name") or taker.get("name"))
    xml_text(tomador, "InscricaoMunicipal", taker.get("municipal_registration"))
    xml_text(tomador, "Email", taker.get("email"))
    xml_text(tomador, "Telefone", only_digits_backend(taker.get("phone")))

    endereco = SubElement(tomador, "Endereco")
    xml_text(endereco, "Logradouro", taker.get("address"))
    xml_text(endereco, "Numero", taker.get("number"))
    xml_text(endereco, "Bairro", taker.get("district"))
    xml_text(endereco, "Municipio", taker.get("city"))
    xml_text(endereco, "Uf", taker.get("state"))
    xml_text(endereco, "Cep", only_digits_backend(taker.get("zip_code")))
    xml_text(endereco, "Pais", taker.get("country") or "Brasil")

    servico = SubElement(root, "Servico")
    xml_text(servico, "Discriminacao", service.get("description"))
    xml_text(servico, "CodigoServico", service.get("service_code") or settings.service_code)
    xml_text(servico, "Cnae", service.get("cnae") or settings.cnae)
    xml_text(servico, "Atividade", service.get("activity_description") or settings.activity_description)

    valores = SubElement(servico, "Valores")
    xml_text(valores, "ValorServico", f"{service_amount:.2f}")
    xml_text(valores, "Deducoes", f"{float(values.get('deductions') or 0):.2f}")
    xml_text(valores, "DescontoIncondicionado", f"{float(values.get('discount_unconditional') or 0):.2f}")
    xml_text(valores, "DescontoCondicionado", f"{float(values.get('discount_conditional') or 0):.2f}")
    xml_text(valores, "OutrasRetencoes", f"{float(values.get('other_withholdings') or 0):.2f}")
    xml_text(valores, "BaseCalculo", f"{service_amount:.2f}")
    xml_text(valores, "Aliquota", f"{iss_rate:.2f}")
    xml_text(valores, "ValorIss", f"{iss_value:.2f}")
    xml_text(valores, "IssRetido", "1" if values.get("iss_withheld") else "2")
    xml_text(valores, "ValorLiquido", f"{service_amount:.2f}")

    validacao = SubElement(root, "Validacao")
    errors = fiscal_validation_errors(document, settings)
    xml_text(validacao, "Ok", "true" if not errors else "false")

    mensagens = SubElement(validacao, "Mensagens")
    for error in errors:
        xml_text(mensagens, "Mensagem", error)

    raw = tostring(root, encoding="utf-8")
    pretty = minidom.parseString(raw).toprettyxml(indent="  ", encoding="utf-8")

    return pretty


@app.get("/orders/{order_id}/fiscal-draft/validate")
def validate_order_fiscal_draft(
    order_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_fiscal_feature(user)

    order = get_scoped_order_or_404(db, user, order_id)
    settings = get_or_create_fiscal_settings(db, user.workshop)
    document = get_or_create_fiscal_document(db, user, order)
    errors = fiscal_validation_errors(document, settings)

    return {
        "ok": len(errors) == 0,
        "errors": errors,
        "document": fiscal_document_dict(document),
    }


@app.get("/orders/{order_id}/fiscal-draft/xml")
def download_order_fiscal_draft_xml(
    order_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_fiscal_feature(user)

    order = get_scoped_order_or_404(db, user, order_id)
    settings = get_or_create_fiscal_settings(db, user.workshop)
    document = get_or_create_fiscal_document(db, user, order)

    xml_bytes = build_fiscal_draft_xml(order, document, settings)

    filename = f"nfse-rascunho-{slugify(user.workshop.trade_name)}-{slugify(order.id)}.xml"

    return StreamingResponse(
        io.BytesIO(xml_bytes),
        media_type="application/xml",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        },
    )



def giss_clean(value):
    return str(value or "").strip()


def giss_money(value):
    try:
        return f"{float(value or 0):.2f}"
    except Exception:
        return "0.00"


def giss_digits(value):
    return only_digits_backend(value)


def giss_city_code(city, state=None):
    raw = giss_clean(city).upper()
    raw = raw.replace("Ã", "A").replace("Á", "A").replace("Â", "A")
    raw = raw.replace("É", "E").replace("Ê", "E")
    raw = raw.replace("Í", "I")
    raw = raw.replace("Ó", "O").replace("Ô", "O")
    raw = raw.replace("Ú", "U")
    raw = raw.replace("Ç", "C")

    mapping = {
        "JABOTICABAL": "3524302",
        "SANTOS": "3548500",
        "SANTANA DE PARNAIBA": "3547304",
        "SAO PAULO": "3550308",
    }

    return mapping.get(raw, "3524302")


def giss_tag(parent, namespace, name, value=None, attrs=None):
    from xml.etree.ElementTree import SubElement

    element = SubElement(parent, f"{{{namespace}}}{name}", attrs or {})

    if value is not None:
        element.text = giss_clean(value)

    return element


def giss_id(prefix, value):
    raw = "".join(ch for ch in str(value or "") if ch.isalnum())
    if not raw:
        raw = uuid.uuid4().hex[:12]
    return f"{prefix}{raw}"


def build_giss_rps_lab_xml(order: Order, document: FiscalDocument, settings: FiscalSettings):
    from datetime import date
    from xml.etree.ElementTree import Element, SubElement, tostring, register_namespace
    from xml.dom import minidom

    NS_ENVIO = "http://www.giss.com.br/enviar-lote-rps-envio-v2_04.xsd"
    NS_TIPOS = "http://www.giss.com.br/tipos-v2_04.xsd"
    NS_DSIG = "http://www.w3.org/2000/09/xmldsig#"
    NS_XSI = "http://www.w3.org/2001/XMLSchema-instance"

    register_namespace("p", NS_ENVIO)
    register_namespace("p1", NS_TIPOS)
    register_namespace("ds", NS_DSIG)
    register_namespace("xsi", NS_XSI)

    taker = safe_json_loads(document.taker_json, {})
    service = safe_json_loads(document.service_json, {})
    values = safe_json_loads(document.values_json, {})

    service_amount = float(values.get("service_amount") or 0)
    iss_rate = float(settings.iss_rate or 0)
    iss_value = round(service_amount * (iss_rate / 100), 2)

    provider_cnpj = giss_digits(settings.provider_cnpj or order.workshop.cnpj)
    provider_im = giss_clean(settings.provider_municipal_registration)

    order_digits = giss_digits(order.id)
    lote_number = order_digits[-8:] if order_digits else str(int(now().timestamp()))
    rps_number = document.rps_number or lote_number
    rps_series = document.rps_series or settings.rps_series or "1"

    today = now().date().isoformat()
    competence = today

    root = Element(
        f"{{{NS_ENVIO}}}EnviarLoteRpsEnvio",
        {
            f"{{{NS_XSI}}}schemaLocation": "http://www.giss.com.br/enviar-lote-rps-envio-v2_04.xsd enviar-lote-rps-envio-v2_04.xsd"
        }
    )

    lote = giss_tag(root, NS_ENVIO, "LoteRps", attrs={
        "Id": giss_id("L", document.id),
        "versao": "2.04",
    })

    giss_tag(lote, NS_TIPOS, "NumeroLote", lote_number)

    prestador_lote = giss_tag(lote, NS_TIPOS, "Prestador")
    cpfcnpj_lote = giss_tag(prestador_lote, NS_TIPOS, "CpfCnpj")
    giss_tag(cpfcnpj_lote, NS_TIPOS, "Cnpj", provider_cnpj)
    giss_tag(prestador_lote, NS_TIPOS, "InscricaoMunicipal", provider_im)

    giss_tag(lote, NS_TIPOS, "QuantidadeRps", "1")

    lista_rps = giss_tag(lote, NS_TIPOS, "ListaRps")
    rps_wrapper = giss_tag(lista_rps, NS_TIPOS, "Rps")

    inf = giss_tag(
        rps_wrapper,
        NS_TIPOS,
        "InfDeclaracaoPrestacaoServico",
        attrs={"Id": giss_id("D", document.id)}
    )

    rps = giss_tag(inf, NS_TIPOS, "Rps", attrs={"Id": giss_id("R", document.id)})
    ident = giss_tag(rps, NS_TIPOS, "IdentificacaoRps")
    giss_tag(ident, NS_TIPOS, "Numero", rps_number)
    giss_tag(ident, NS_TIPOS, "Serie", rps_series)
    giss_tag(ident, NS_TIPOS, "Tipo", "1")
    giss_tag(rps, NS_TIPOS, "DataEmissao", today)
    giss_tag(rps, NS_TIPOS, "Status", "1")

    giss_tag(inf, NS_TIPOS, "Competencia", competence)

    servico = giss_tag(inf, NS_TIPOS, "Servico")
    valores = giss_tag(servico, NS_TIPOS, "Valores")

    giss_tag(valores, NS_TIPOS, "ValorServicos", giss_money(service_amount))
    giss_tag(valores, NS_TIPOS, "ValorDeducoes", giss_money(values.get("deductions")))
    giss_tag(valores, NS_TIPOS, "ValorPis", "0.00")
    giss_tag(valores, NS_TIPOS, "ValorCofins", "0.00")
    giss_tag(valores, NS_TIPOS, "ValorInss", "0.00")
    giss_tag(valores, NS_TIPOS, "ValorIr", "0.00")
    giss_tag(valores, NS_TIPOS, "ValorCsll", "0.00")
    giss_tag(valores, NS_TIPOS, "OutrasRetencoes", giss_money(values.get("other_withholdings")))
    giss_tag(valores, NS_TIPOS, "ValTotTributos", "0.00")
    giss_tag(valores, NS_TIPOS, "ValorIss", giss_money(iss_value))
    giss_tag(valores, NS_TIPOS, "Aliquota", giss_money(iss_rate))
    giss_tag(valores, NS_TIPOS, "DescontoIncondicionado", giss_money(values.get("discount_unconditional")))
    giss_tag(valores, NS_TIPOS, "DescontoCondicionado", giss_money(values.get("discount_conditional")))

    # Bloco novo do pacote Giss/LC 214. Mantido zerado em laboratório.
    trib = giss_tag(valores, NS_TIPOS, "trib")
    trib_fed = giss_tag(trib, NS_TIPOS, "tribFed")
    piscofins = giss_tag(trib_fed, NS_TIPOS, "piscofins")
    giss_tag(piscofins, NS_TIPOS, "CST", "00")
    giss_tag(piscofins, NS_TIPOS, "vBCPisCofins", "0.00")
    giss_tag(piscofins, NS_TIPOS, "pAliqPis", "0.00")
    giss_tag(piscofins, NS_TIPOS, "pAliqCofins", "0.00")
    giss_tag(piscofins, NS_TIPOS, "vPis", "0.00")
    giss_tag(piscofins, NS_TIPOS, "vCofins", "0.00")
    giss_tag(piscofins, NS_TIPOS, "tpRetPisCofins", "1")

    tot_trib = giss_tag(trib, NS_TIPOS, "totTrib")
    p_tot = giss_tag(tot_trib, NS_TIPOS, "pTotTrib")
    giss_tag(p_tot, NS_TIPOS, "pTotTribFed", "0.00")
    giss_tag(p_tot, NS_TIPOS, "pTotTribEst", "0.00")
    giss_tag(p_tot, NS_TIPOS, "pTotTribMun", "0.00")

    ibs_cbs = giss_tag(valores, NS_TIPOS, "IBSCBS")
    giss_tag(ibs_cbs, NS_TIPOS, "finNFSe", "0")
    giss_tag(ibs_cbs, NS_TIPOS, "indFinal", "0")
    giss_tag(ibs_cbs, NS_TIPOS, "cIndOp", "000000")
    giss_tag(ibs_cbs, NS_TIPOS, "indDest", "0")
    ibs_values = giss_tag(ibs_cbs, NS_TIPOS, "valores")
    ibs_trib = giss_tag(ibs_values, NS_TIPOS, "trib")
    g_ibs = giss_tag(ibs_trib, NS_TIPOS, "gIBSCBS")
    giss_tag(g_ibs, NS_TIPOS, "CST", "000")
    giss_tag(g_ibs, NS_TIPOS, "cClassTrib", "000000")
    giss_tag(ibs_values, NS_TIPOS, "cLocalidadeIncid", giss_city_code(settings.provider_city, settings.provider_state))
    giss_tag(ibs_values, NS_TIPOS, "pRedutor", "0.00")

    giss_tag(servico, NS_TIPOS, "IssRetido", "1" if values.get("iss_withheld") else "2")
    giss_tag(servico, NS_TIPOS, "ItemListaServico", settings.service_code or service.get("service_code") or "14.12")
    giss_tag(servico, NS_TIPOS, "CodigoCnae", settings.cnae or service.get("cnae") or "4520002")
    giss_tag(servico, NS_TIPOS, "CodigoTributacaoMunicipio", settings.service_code or "14.12")
    giss_tag(servico, NS_TIPOS, "Discriminacao", service.get("description"))
    giss_tag(servico, NS_TIPOS, "CodigoMunicipio", giss_city_code(settings.provider_city, settings.provider_state))
    giss_tag(servico, NS_TIPOS, "ExigibilidadeISS", "1")
    giss_tag(servico, NS_TIPOS, "MunicipioIncidencia", giss_city_code(settings.provider_city, settings.provider_state))

    prestador = giss_tag(inf, NS_TIPOS, "Prestador")
    cpfcnpj = giss_tag(prestador, NS_TIPOS, "CpfCnpj")
    giss_tag(cpfcnpj, NS_TIPOS, "Cnpj", provider_cnpj)
    giss_tag(prestador, NS_TIPOS, "InscricaoMunicipal", provider_im)

    taker_tax_id = giss_digits(taker.get("tax_id"))

    if taker_tax_id:
        tomador = giss_tag(inf, NS_TIPOS, "TomadorServico")
        ident_tomador = giss_tag(tomador, NS_TIPOS, "IdentificacaoTomador")
        cpfcnpj_tomador = giss_tag(ident_tomador, NS_TIPOS, "CpfCnpj")

        if len(taker_tax_id) == 14:
            giss_tag(cpfcnpj_tomador, NS_TIPOS, "Cnpj", taker_tax_id)
        else:
            giss_tag(cpfcnpj_tomador, NS_TIPOS, "Cpf", taker_tax_id)

        if giss_clean(taker.get("municipal_registration")):
            giss_tag(ident_tomador, NS_TIPOS, "InscricaoMunicipal", taker.get("municipal_registration"))

        giss_tag(tomador, NS_TIPOS, "RazaoSocial", taker.get("legal_name") or taker.get("name"))

        endereco = giss_tag(tomador, NS_TIPOS, "Endereco")
        giss_tag(endereco, NS_TIPOS, "Endereco", taker.get("address"))
        giss_tag(endereco, NS_TIPOS, "Numero", taker.get("number"))
        giss_tag(endereco, NS_TIPOS, "Bairro", taker.get("district"))
        giss_tag(endereco, NS_TIPOS, "CodigoMunicipio", giss_city_code(taker.get("city"), taker.get("state")))
        giss_tag(endereco, NS_TIPOS, "Uf", taker.get("state") or "SP")
        giss_tag(endereco, NS_TIPOS, "Cep", giss_digits(taker.get("zip_code")))

        contato = giss_tag(tomador, NS_TIPOS, "Contato")
        if giss_clean(taker.get("phone")):
            giss_tag(contato, NS_TIPOS, "Telefone", giss_digits(taker.get("phone")))
        if giss_clean(taker.get("email")):
            giss_tag(contato, NS_TIPOS, "Email", taker.get("email"))

    regime_especial = giss_clean(getattr(settings, "special_tax_regime", ""))
    if regime_especial in {"1", "2", "3", "4", "5", "6"}:
        giss_tag(inf, "RegimeEspecialTributacao", regime_especial)
    giss_tag(inf, NS_TIPOS, "OptanteSimplesNacional", "1" if settings.simple_national else "2")
    giss_tag(inf, NS_TIPOS, "IncentivoFiscal", "2")

    raw = tostring(root, encoding="utf-8")
    pretty = minidom.parseString(raw).toprettyxml(indent="  ", encoding="utf-8")

    return pretty


@app.get("/orders/{order_id}/fiscal-draft/giss-rps-xml")
def download_order_giss_rps_lab_xml(
    order_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_fiscal_feature(user)

    order = get_scoped_order_or_404(db, user, order_id)
    settings = get_or_create_fiscal_settings(db, user.workshop)
    document = get_or_create_fiscal_document(db, user, order)
    document = giss_ensure_rps_for_document(db, order, document, settings)

    errors = fiscal_validation_errors(document, settings)

    if errors:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "rascunho fiscal incompleto",
                "errors": errors,
            },
        )

    xml_bytes = build_giss_rps_lab_xml(order, document, settings)

    filename = f"giss-rps-lab-{slugify(user.workshop.trade_name)}-{slugify(order.id)}.xml"

    return StreamingResponse(
        io.BytesIO(xml_bytes),
        media_type="application/xml",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        },
    )



def read_secret_file(path_value):
    if not path_value:
        return ""

    try:
        return Path(path_value).read_text().strip()
    except Exception:
        return ""


def cert_datetime_iso(value):
    if not value:
        return None

    try:
        return value.isoformat()
    except Exception:
        return str(value)


def certificate_subject_text(cert):
    try:
        return cert.subject.rfc4514_string()
    except Exception:
        return ""


def certificate_issuer_text(cert):
    try:
        return cert.issuer.rfc4514_string()
    except Exception:
        return ""


def load_giss_a1_certificate():
    cert_path = os.getenv("GISS_A1_CERT_PATH", "")
    password = os.getenv("GISS_A1_CERT_PASSWORD", "")

    if not password:
        password = read_secret_file(os.getenv("GISS_A1_CERT_PASSWORD_FILE", ""))

    if not cert_path:
        raise HTTPException(status_code=500, detail="GISS_A1_CERT_PATH não configurado")

    file_path = Path(cert_path)

    if not file_path.exists():
        raise HTTPException(status_code=404, detail="certificado A1 não encontrado no container")

    if not password:
        raise HTTPException(status_code=500, detail="senha do certificado A1 não configurada")

    try:
        from cryptography.hazmat.primitives.serialization import pkcs12
        from cryptography.hazmat.primitives import hashes

        data = file_path.read_bytes()

        private_key, cert, additional = pkcs12.load_key_and_certificates(
            data,
            password.encode("utf-8"),
        )

        if not cert:
            raise ValueError("certificado principal não encontrado no PFX")

        fingerprint = cert.fingerprint(hashes.SHA256()).hex()

        return {
            "path": str(file_path),
            "private_key": private_key,
            "certificate": cert,
            "additional": additional or [],
            "fingerprint_sha256": fingerprint,
        }

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"não foi possível abrir o certificado A1: {exc}")


@app.get("/fiscal/certificate/status")
def fiscal_certificate_status(
    user: User = Depends(get_current_user),
):
    require_fiscal_feature(user)

    loaded = load_giss_a1_certificate()
    cert = loaded["certificate"]

    subject = certificate_subject_text(cert)
    issuer = certificate_issuer_text(cert)

    workshop_cnpj = only_digits_backend(user.workshop.cnpj)
    subject_digits = only_digits_backend(subject)
    issuer_digits = only_digits_backend(issuer)

    not_before = getattr(cert, "not_valid_before_utc", None) or getattr(cert, "not_valid_before", None)
    not_after = getattr(cert, "not_valid_after_utc", None) or getattr(cert, "not_valid_after", None)

    return {
        "ok": True,
        "cert_path": loaded["path"],
        "has_private_key": loaded["private_key"] is not None,
        "additional_certificates": len(loaded["additional"]),
        "subject": subject,
        "issuer": issuer,
        "serial_number": str(cert.serial_number),
        "not_valid_before": cert_datetime_iso(not_before),
        "not_valid_after": cert_datetime_iso(not_after),
        "fingerprint_sha256": loaded["fingerprint_sha256"],
        "workshop_cnpj": workshop_cnpj,
        "matches_workshop_cnpj_hint": workshop_cnpj in subject_digits or workshop_cnpj in issuer_digits,
    }



def xml_c14n(node):
    from lxml import etree

    return etree.tostring(
        node,
        method="c14n",
        exclusive=False,
        with_comments=False,
    )


def xml_node_id(node):
    return node.get("Id") or node.get("id") or node.get("ID")


def build_xml_signature_for_node(target_node, private_key, cert, reference_id):
    import base64
    import hashlib
    from lxml import etree
    from cryptography.hazmat.primitives.asymmetric import padding
    from cryptography.hazmat.primitives import hashes, serialization

    DSIG = "http://www.w3.org/2000/09/xmldsig#"
    C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315"
    RSA_SHA1 = "http://www.w3.org/2000/09/xmldsig#rsa-sha1"
    SHA1 = "http://www.w3.org/2000/09/xmldsig#sha1"
    ENVELOPED = "http://www.w3.org/2000/09/xmldsig#enveloped-signature"

    etree.register_namespace("ds", DSIG)

    digest = hashlib.sha1(xml_c14n(target_node)).digest()
    digest_b64 = base64.b64encode(digest).decode("ascii")

    signature = etree.Element(f"{{{DSIG}}}Signature")

    signed_info = etree.SubElement(signature, f"{{{DSIG}}}SignedInfo")

    etree.SubElement(
        signed_info,
        f"{{{DSIG}}}CanonicalizationMethod",
        Algorithm=C14N,
    )

    etree.SubElement(
        signed_info,
        f"{{{DSIG}}}SignatureMethod",
        Algorithm=RSA_SHA1,
    )

    reference = etree.SubElement(
        signed_info,
        f"{{{DSIG}}}Reference",
        URI=f"#{reference_id}",
    )

    transforms = etree.SubElement(reference, f"{{{DSIG}}}Transforms")

    etree.SubElement(
        transforms,
        f"{{{DSIG}}}Transform",
        Algorithm=ENVELOPED,
    )

    etree.SubElement(
        transforms,
        f"{{{DSIG}}}Transform",
        Algorithm=C14N,
    )

    etree.SubElement(
        reference,
        f"{{{DSIG}}}DigestMethod",
        Algorithm=SHA1,
    )

    digest_value = etree.SubElement(reference, f"{{{DSIG}}}DigestValue")
    digest_value.text = digest_b64

    signed_info_c14n = xml_c14n(signed_info)

    signature_raw = private_key.sign(
        signed_info_c14n,
        padding.PKCS1v15(),
        hashes.SHA1(),
    )

    signature_value = etree.SubElement(signature, f"{{{DSIG}}}SignatureValue")
    signature_value.text = base64.b64encode(signature_raw).decode("ascii")

    key_info = etree.SubElement(signature, f"{{{DSIG}}}KeyInfo")
    x509_data = etree.SubElement(key_info, f"{{{DSIG}}}X509Data")
    x509_cert = etree.SubElement(x509_data, f"{{{DSIG}}}X509Certificate")

    cert_der = cert.public_bytes(serialization.Encoding.DER)
    x509_cert.text = base64.b64encode(cert_der).decode("ascii")

    return signature


def _sign_giss_rps_lab_xml_original(xml_bytes):
    from lxml import etree

    loaded = load_giss_a1_certificate()
    private_key = loaded["private_key"]
    cert = loaded["certificate"]

    if private_key is None:
        raise HTTPException(status_code=400, detail="certificado A1 sem chave privada")

    parser = etree.XMLParser(remove_blank_text=True)
    root = etree.fromstring(xml_bytes, parser=parser)

    ns = {
        "p": "http://www.giss.com.br/enviar-lote-rps-envio-v2_04.xsd",
        "p1": "http://www.giss.com.br/tipos-v2_04.xsd",
        "ds": "http://www.w3.org/2000/09/xmldsig#",
    }

    lote = root.find("p:LoteRps", namespaces=ns)

    if lote is None:
        raise HTTPException(status_code=400, detail="LoteRps não encontrado no XML")

    inf = root.find(".//p1:InfDeclaracaoPrestacaoServico", namespaces=ns)

    if inf is None:
        raise HTTPException(status_code=400, detail="InfDeclaracaoPrestacaoServico não encontrado no XML")

    rps_wrapper = inf.getparent()

    if rps_wrapper is None:
        raise HTTPException(status_code=400, detail="wrapper do RPS não encontrado")

    inf_id = xml_node_id(inf)

    if not inf_id:
        raise HTTPException(status_code=400, detail="InfDeclaracaoPrestacaoServico sem Id")

    lote_id = xml_node_id(lote)

    if not lote_id:
        raise HTTPException(status_code=400, detail="LoteRps sem Id")

    # 1) assinatura do RPS, anexada logo depois da declaração, como nos exemplos Giss.
    rps_signature = build_xml_signature_for_node(inf, private_key, cert, inf_id)
    rps_wrapper.append(rps_signature)

    # 2) assinatura do lote, anexada na raiz depois do LoteRps.
    lote_signature = build_xml_signature_for_node(lote, private_key, cert, lote_id)
    root.append(lote_signature)

    return etree.tostring(
        root,
        xml_declaration=True,
        encoding="utf-8",
        pretty_print=False,
    )



def giss_fix_rps_signature_position(xml_value):
    from lxml import etree

    raw = giss_as_text(xml_value).encode("utf-8")
    root = etree.fromstring(raw)

    moved = 0

    for inf in root.xpath("//*[local-name()='InfDeclaracaoPrestacaoServico']"):
        parent = inf.getparent()

        if parent is None:
            continue

        # Pelo XSD, o Signature do RPS deve ser irmão de InfDeclaracaoPrestacaoServico
        # dentro do wrapper Rps/tcDeclaracaoPrestacaoServico.
        if etree.QName(parent).localname != "Rps":
            continue

        for child in list(inf):
            if etree.QName(child).localname != "Signature":
                continue

            inf.remove(child)
            parent.insert(parent.index(inf) + 1, child)
            moved += 1

    xml_text = etree.tostring(
        root,
        encoding="utf-8",
        xml_declaration=True,
        pretty_print=False,
    ).decode("utf-8")

    return xml_text, moved





def giss_xmlsec_strip_blank_text_nodes(node):
    if node.text is not None and not node.text.strip():
        node.text = None

    if node.tail is not None and not node.tail.strip():
        node.tail = None

    for child in list(node):
        giss_xmlsec_strip_blank_text_nodes(child)

    return node


def giss_xmlsec_remove_signature_nodes(root):
    for sig in list(root.xpath("//*[local-name()='Signature']")):
        parent = sig.getparent()
        if parent is not None:
            parent.remove(sig)


def giss_xmlsec_normalize_root(root):
    from lxml import etree

    root_q = etree.QName(root)
    root_ns = root_q.namespace
    root_name = root_q.localname

    tipos_ns = "http://www.giss.com.br/tipos-v2_04.xsd"
    ds_ns = "http://www.w3.org/2000/09/xmldsig#"

    new_root = etree.Element(
        etree.QName(root_ns, root_name),
        nsmap={
            "ds": ds_ns,
            "p": root_ns,
            "p1": tipos_ns,
        },
    )

    for key, value in root.attrib.items():
        if str(key).startswith("{http://www.w3.org/2001/XMLSchema-instance}"):
            continue
        new_root.set(key, value)

    for child in list(root):
        root.remove(child)
        new_root.append(child)

    return new_root




def giss_xmlsec_signature_template(ref_id):
    from lxml import etree

    ds_ns = "http://www.w3.org/2000/09/xmldsig#"

    def q(name):
        return etree.QName(ds_ns, name)

    clean_ref_id = str(ref_id or "").lstrip("#")
    if not clean_ref_id:
        raise RuntimeError("ref_id vazio para assinatura XML")

    sig = etree.Element(q("Signature"), nsmap={None: ds_ns})
    sig.set("Id", "Sig" + clean_ref_id)

    signed_info = etree.SubElement(sig, q("SignedInfo"))

    canon = etree.SubElement(signed_info, q("CanonicalizationMethod"))
    canon.set("Algorithm", "http://www.w3.org/TR/2001/REC-xml-c14n-20010315")

    sig_method = etree.SubElement(signed_info, q("SignatureMethod"))
    sig_method.set("Algorithm", "http://www.w3.org/2000/09/xmldsig#rsa-sha1")

    ref = etree.SubElement(signed_info, q("Reference"))
    ref.set("URI", "#" + clean_ref_id)

    transforms = etree.SubElement(ref, q("Transforms"))

    t1 = etree.SubElement(transforms, q("Transform"))
    t1.set("Algorithm", "http://www.w3.org/2000/09/xmldsig#enveloped-signature")

    t2 = etree.SubElement(transforms, q("Transform"))
    t2.set("Algorithm", "http://www.w3.org/TR/2001/REC-xml-c14n-20010315")

    digest_method = etree.SubElement(ref, q("DigestMethod"))
    digest_method.set("Algorithm", "http://www.w3.org/2000/09/xmldsig#sha1")

    etree.SubElement(ref, q("DigestValue"))
    etree.SubElement(sig, q("SignatureValue"))

    key_info = etree.SubElement(sig, q("KeyInfo"))
    x509_data = etree.SubElement(key_info, q("X509Data"))
    etree.SubElement(x509_data, q("X509Certificate"))

    return sig

def giss_xmlsec_extract_pem_files(tmpdir):
    import os
    import subprocess
    from pathlib import Path

    pfx_path = os.getenv("GISS_A1_CERT_PATH") or "/run/secrets/giss/laercio_a1.pfx"
    pass_file = os.getenv("GISS_A1_CERT_PASSWORD_FILE") or "/run/secrets/giss/a1_password.txt"

    tmpdir = Path(tmpdir)
    key_path = tmpdir / "giss-key.pem"
    cert_path = tmpdir / "giss-cert.pem"

    subprocess.run(
        [
            "openssl", "pkcs12",
            "-in", pfx_path,
            "-nocerts",
            "-nodes",
            "-passin", f"file:{pass_file}",
            "-out", str(key_path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )

    subprocess.run(
        [
            "openssl", "pkcs12",
            "-in", pfx_path,
            "-clcerts",
            "-nokeys",
            "-passin", f"file:{pass_file}",
            "-out", str(cert_path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )

    return key_path, cert_path


def giss_xmlsec_sign_file(input_path, output_path, key_path, cert_path, node_xpath):
    import subprocess

    cmd = [
        "xmlsec1",
        "--sign",
        "--output", str(output_path),
        "--id-attr:Id", "InfDeclaracaoPrestacaoServico",
        "--id-attr:Id", "Rps",
        "--id-attr:Id", "LoteRps",
        "--node-xpath", node_xpath,
        "--privkey-pem", f"{key_path},{cert_path}",
        str(input_path),
    ]

    result = subprocess.run(
        cmd,
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        raise RuntimeError(
            "xmlsec1 falhou\n"
            f"cmd: {' '.join(cmd)}\n"
            f"stdout:\n{result.stdout}\n"
            f"stderr:\n{result.stderr}"
        )



def giss_xmlsec_ensure_codigo_pais(root):
    from lxml import etree

    tipos_ns = "http://www.giss.com.br/tipos-v2_04.xsd"

    def lname(node):
        return etree.QName(node).localname

    def has_child(parent, name):
        return any(lname(child) == name for child in list(parent))

    added = 0

    for servico in root.xpath("//*[local-name()='Servico']"):
        if has_child(servico, "CodigoPais"):
            continue

        children = list(servico)
        insert_pos = None
        chosen_ns = tipos_ns

        # ordem correta: CodigoMunicipio, CodigoPais, ExigibilidadeISS
        for i, child in enumerate(children):
            if lname(child) == "CodigoMunicipio":
                insert_pos = i + 1
                chosen_ns = etree.QName(child).namespace or tipos_ns
                break

        if insert_pos is None:
            for i, child in enumerate(children):
                if lname(child) == "ExigibilidadeISS":
                    insert_pos = i
                    chosen_ns = etree.QName(child).namespace or tipos_ns
                    break

        if insert_pos is None:
            continue

        el = etree.Element(etree.QName(chosen_ns, "CodigoPais"))
        el.text = "1058"
        servico.insert(insert_pos, el)
        added += 1

    return len(root.xpath("//*[local-name()='Servico']/*[local-name()='CodigoPais']"))


def sign_giss_rps_lab_xml(xml_value):
    from lxml import etree
    from pathlib import Path
    import tempfile

    raw = giss_as_text(xml_value).encode("utf-8")

    root = etree.fromstring(raw)
    root = giss_xmlsec_normalize_root(root)

    giss_xmlsec_remove_signature_nodes(root)
    codigo_pais_count = giss_xmlsec_ensure_codigo_pais(root)
    if codigo_pais_count < 1:
        raise RuntimeError("CodigoPais 1058 não foi inserido no Servico do XML Giss")


    giss_xmlsec_strip_blank_text_nodes(root)

    inf_nodes = root.xpath("//*[local-name()='InfDeclaracaoPrestacaoServico']")
    if not inf_nodes:
        raise RuntimeError("não achei InfDeclaracaoPrestacaoServico para assinar")

    inf = inf_nodes[0]
    inf_id = inf.get("Id")
    if not inf_id:
        raise RuntimeError("InfDeclaracaoPrestacaoServico sem Id")

    rps_wrapper = inf.getparent()
    if rps_wrapper is None or etree.QName(rps_wrapper).localname != "Rps":
        raise RuntimeError("InfDeclaracaoPrestacaoServico não está dentro do wrapper Rps")

    # Modo Giss modelo oficial:
    # mantém Id no Rps interno, mas a assinatura do RPS referencia
    # InfDeclaracaoPrestacaoServico, como no padrão ABRASF/Giss.
    rps_nodes = inf.xpath("./*[local-name()='Rps']")
    if not rps_nodes:
        raise RuntimeError("não achei Rps interno dentro de InfDeclaracaoPrestacaoServico")

    rps_node = rps_nodes[0]
    rps_id = rps_node.get("Id")
    if not rps_id:
        suffix = inf_id[1:] if inf_id.startswith("D") else inf_id
        rps_id = "R" + suffix
        rps_node.set("Id", rps_id)

    lote_nodes = root.xpath("/*[local-name()='EnviarLoteRpsEnvio' or local-name()='EnviarLoteRpsSincronoEnvio']/*[local-name()='LoteRps']")
    if not lote_nodes:
        lote_nodes = root.xpath("//*[local-name()='LoteRps']")

    if not lote_nodes:
        raise RuntimeError("não achei LoteRps para assinar")

    lote = lote_nodes[0]
    lote_id = lote.get("Id")
    if not lote_id:
        raise RuntimeError("LoteRps sem Id")

    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        key_path, cert_path = giss_xmlsec_extract_pem_files(tmp)

        # 1) assina a Signature do RPS
        # Giss exige que o RPS em si seja o alvo da assinatura.
        # A Signature continua como filha do wrapper Rps.
        rps_sig = giss_xmlsec_signature_template(inf_id)
        rps_wrapper.insert(rps_wrapper.index(inf) + 1, rps_sig)

        rps_template = tmp / "rps-template.xml"
        rps_signed = tmp / "rps-signed.xml"

        etree.ElementTree(root).write(
            str(rps_template),
            encoding="utf-8",
            xml_declaration=True,
            pretty_print=False,
        )

        giss_xmlsec_sign_file(
            rps_template,
            rps_signed,
            key_path,
            cert_path,
            node_xpath="(//*[local-name()='Signature'])[last()]",
        )

        # 2) carrega XML com RPS assinado e assina a Signature do Lote
        root = etree.parse(str(rps_signed)).getroot()

        lote_nodes = root.xpath("/*[local-name()='EnviarLoteRpsEnvio' or local-name()='EnviarLoteRpsSincronoEnvio']/*[local-name()='LoteRps']")
        if not lote_nodes:
            lote_nodes = root.xpath("//*[local-name()='LoteRps']")

        if not lote_nodes:
            raise RuntimeError("não achei LoteRps depois de assinar RPS")

        lote = lote_nodes[0]
        lote_id = lote.get("Id")
        if not lote_id:
            raise RuntimeError("LoteRps sem Id depois de assinar RPS")

        lote_sig = giss_xmlsec_signature_template(lote_id)
        root.insert(root.index(lote) + 1, lote_sig)

        lote_template = tmp / "lote-template.xml"
        final_signed = tmp / "final-signed.xml"

        etree.ElementTree(root).write(
            str(lote_template),
            encoding="utf-8",
            xml_declaration=True,
            pretty_print=False,
        )

        giss_xmlsec_sign_file(
            lote_template,
            final_signed,
            key_path,
            cert_path,
            node_xpath="(//*[local-name()='Signature'])[last()]",
        )

        return final_signed.read_text(encoding="utf-8")


@app.get("/orders/{order_id}/fiscal-draft/giss-rps-xml-signed")
def download_order_giss_rps_signed_lab_xml(
    order_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_fiscal_feature(user)

    order = get_scoped_order_or_404(db, user, order_id)
    settings = get_or_create_fiscal_settings(db, user.workshop)
    document = get_or_create_fiscal_document(db, user, order)

    errors = fiscal_validation_errors(document, settings)

    if errors:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "rascunho fiscal incompleto",
                "errors": errors,
            },
        )

    unsigned_xml = build_giss_rps_lab_xml(order, document, settings)
    signed_xml = sign_giss_rps_lab_xml(unsigned_xml)

    filename = f"giss-rps-assinado-lab-{slugify(user.workshop.trade_name)}-{slugify(order.id)}.xml"

    return StreamingResponse(
        io.BytesIO(signed_xml),
        media_type="application/xml",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        },
    )



GISS_WS_URL = "https://ws-jaboticabal.giss.com.br/service-ws/nf/nfse-ws"


def giss_xml_escape(value):
    import html
    return html.escape(value or "")


def giss_unescape_xml(value):
    import html
    return html.unescape(value or "")


def giss_default_header_xml():
    return """<?xml version="1.0" encoding="UTF-8"?>
<cabecalho xmlns="http://www.giss.com.br/cabecalho-v2_04.xsd" versao="2.04">
  <versaoDados>2.04</versaoDados>
</cabecalho>""".strip()


def giss_soap_envelope(operation, cabec_xml, dados_xml):
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:nfse="http://nfse.abrasf.org.br">
  <soapenv:Header/>
  <soapenv:Body>
    <nfse:{operation}Request>
      <nfseCabecMsg>{giss_xml_escape(cabec_xml)}</nfseCabecMsg>
      <nfseDadosMsg>{giss_xml_escape(dados_xml)}</nfseDadosMsg>
    </nfse:{operation}Request>
  </soapenv:Body>
</soapenv:Envelope>""".encode("utf-8")


def giss_extract_output_xml(soap_text):
    import html
    import xml.etree.ElementTree as ET

    try:
        root = ET.fromstring(soap_text)
    except Exception:
        return ""

    for item in root.iter():
        if item.tag.endswith("outputXML"):
            return html.unescape(item.text or "")

    return ""


def giss_local_name(tag):
    return str(tag or "").split("}", 1)[-1]


def giss_extract_messages(output_xml):
    import xml.etree.ElementTree as ET

    if not output_xml:
        return []

    try:
        root = ET.fromstring(output_xml)
    except Exception:
        return []

    messages = []

    for msg in root.iter():
        if giss_local_name(msg.tag) != "MensagemRetorno":
            continue

        item = {}

        for child in list(msg):
            name = giss_local_name(child.tag)
            item[name] = child.text or ""

        if item:
            messages.append(item)

    return messages


def giss_soap_call(operation, dados_xml, timeout=60):
    import os
    import requests_pkcs12
    from pathlib import Path

    cert_path = os.getenv("GISS_A1_CERT_PATH")
    password_file = os.getenv("GISS_A1_CERT_PASSWORD_FILE")
    password = Path(password_file).read_text().strip()

    envelope = giss_soap_envelope(
        operation=operation,
        cabec_xml=giss_default_header_xml(),
        dados_xml=dados_xml,
    )

    headers = {
        "Content-Type": "text/xml; charset=utf-8",
        "SOAPAction": f"http://nfse.abrasf.org.br/{operation}",
    }

    response = requests_pkcs12.post(
        GISS_WS_URL,
        data=envelope,
        headers=headers,
        pkcs12_filename=cert_path,
        pkcs12_password=password,
        timeout=timeout,
    )

    output_xml = giss_extract_output_xml(response.text)
    messages = giss_extract_messages(output_xml)

    return {
        "http_status": response.status_code,
        "content_type": response.headers.get("content-type"),
        "soap_raw": response.text,
        "output_xml": output_xml,
        "messages": messages,
    }


def giss_consultar_nfse_por_rps_xml(numero, serie="1", tipo="1"):
    numero = giss_clean(numero)
    serie = giss_clean(serie)
    tipo = giss_clean(tipo)

    return f"""<?xml version="1.0" encoding="UTF-8"?>
<p:ConsultarNfseRpsEnvio
  xmlns:p="http://www.giss.com.br/consultar-nfse-rps-envio-v2_04.xsd"
  xmlns:p1="http://www.giss.com.br/tipos-v2_04.xsd"
  xmlns:ds="http://www.w3.org/2000/09/xmldsig#">
  <p:IdentificacaoRps>
    <p1:Numero>{numero}</p1:Numero>
    <p1:Serie>{serie}</p1:Serie>
    <p1:Tipo>{tipo}</p1:Tipo>
  </p:IdentificacaoRps>
  <p:Prestador>
    <p1:CpfCnpj>
      <p1:Cnpj>39935230000188</p1:Cnpj>
    </p1:CpfCnpj>
    <p1:InscricaoMunicipal>126566</p1:InscricaoMunicipal>
  </p:Prestador>
</p:ConsultarNfseRpsEnvio>""".strip()


@app.get("/fiscal/giss/test/consultar-rps")
def fiscal_giss_test_consultar_rps(
    numero: str = "999999999",
    serie: str = "1",
    tipo: str = "1",
    user: User = Depends(get_current_user),
):
    require_fiscal_feature(user)

    dados_xml = giss_consultar_nfse_por_rps_xml(numero, serie, tipo)
    result = giss_soap_call("ConsultarNfsePorRps", dados_xml)

    return {
        "ok": result["http_status"] == 200,
        "http_status": result["http_status"],
        "content_type": result["content_type"],
        "summary": giss_response_summary(result),
        "technical_messages": result["messages"],
        "output_xml_preview": result["output_xml"][:2000],
    }



def giss_real_send_enabled():
    raw = os.getenv("GISS_ALLOW_REAL_SEND", "false")
    return str(raw).strip().lower() in {"1", "true", "yes", "sim", "on"}


def giss_allowed_real_send_order_id():
    return str(os.getenv("GISS_REAL_SEND_ORDER_ID", "") or "").strip()


def giss_as_text(xml_value):
    if isinstance(xml_value, bytes):
        return xml_value.decode("utf-8")
    return str(xml_value or "")


def giss_count_signature_nodes(xml_value):
    import re

    text = giss_as_text(xml_value)

    # Conta apenas o elemento ds:Signature real.
    # Não conta ds:SignatureMethod nem ds:SignatureValue.
    return len(re.findall(r"<(?:\w+:)?Signature(?:\s|>)", text))




def giss_default_rps_series(settings):
    return giss_clean(getattr(settings, "rps_series", None)) or "1"


def giss_generate_rps_number_for_order(order: Order):
    # Para produção inicial, usamos o ID numérico do orçamento como RPS.
    # É genérico, persistente, rastreável e evita sequência solta em memória.
    # Depois podemos trocar para contador fiscal sequencial, se o Giss exigir.
    digits = only_digits_backend(getattr(order, "id", ""))

    if digits:
        return digits[-15:]

    return str(int(now().timestamp()))[-15:]


def giss_ensure_rps_for_document(db: Session, order: Order, document: FiscalDocument, settings: FiscalSettings):
    changed = False

    if not giss_clean(getattr(document, "rps_number", None)):
        document.rps_number = giss_generate_rps_number_for_order(order)
        changed = True

    if not giss_clean(getattr(document, "rps_series", None)):
        document.rps_series = giss_default_rps_series(settings)
        changed = True

    if changed:
        db.add(document)
        db.commit()
        db.refresh(document)

    return document

def giss_prepare_signed_rps_for_order(db: Session, user: User, order_id: str):
    require_fiscal_feature(user)

    order = get_scoped_order_or_404(db, user, order_id)
    settings = get_or_create_fiscal_settings(db, user.workshop)
    document = get_or_create_fiscal_document(db, user, order)

    errors = fiscal_validation_errors(document, settings)

    if errors:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "rascunho fiscal incompleto",
                "errors": errors,
            },
        )

    unsigned_xml = build_giss_rps_lab_xml(order, document, settings)
    signed_xml = sign_giss_rps_lab_xml(unsigned_xml)

    return order, document, settings, signed_xml


@app.get("/orders/{order_id}/fiscal-draft/giss-send-preview")
def fiscal_giss_send_preview(
    order_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    order, document, settings, signed_xml = giss_prepare_signed_rps_for_order(db, user, order_id)

    text = giss_as_text(signed_xml)

    return {
        "ok": True,
        "mode": "preview_only",
        "real_send_enabled": giss_real_send_enabled(),
        "operation": "RecepcionarLoteRps",
        "soap_action": "http://nfse.abrasf.org.br/RecepcionarLoteRps",
        "order_id": order.id,
        "fiscal_document_id": document.id,
        "xml_size_bytes": len(text.encode("utf-8")),
        "signature_count": giss_count_signature_nodes(text),
        "blocked_by_default": not giss_real_send_enabled(),
        "message": "preview gerado; nenhum XML foi enviado ao Giss",
    }


@app.post("/orders/{order_id}/fiscal-draft/giss-send-lab")
def fiscal_giss_send_lab(
    order_id: str,
    confirm: str = "",
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    order, document, settings, signed_xml = giss_prepare_signed_rps_for_order(db, user, order_id)
    allowed_order_id = giss_allowed_real_send_order_id()

    if giss_document_already_sent(document):
        return {
            "ok": False,
            "blocked": True,
            "reason": "documento fiscal já enviado",
            "message": "este rascunho fiscal já possui envio/protocolo/nota e não pode ser reenviado sem procedimento específico",
            "order_id": order.id,
            "fiscal_document": giss_fiscal_document_public_payload(document),
        }

    if not giss_order_is_finished(order):
        return {
            "ok": False,
            "blocked": True,
            "reason": "orçamento não finalizado",
            "message": "para emitir nota fiscal, finalize o serviço/orçamento primeiro",
            "order_id": order.id,
            "fiscal_document_id": document.id,
        }

    if not giss_real_send_enabled():
        return {
            "ok": False,
            "blocked": True,
            "reason": "GISS_ALLOW_REAL_SEND=false",
            "message": "envio real bloqueado por segurança; nada foi enviado ao Giss",
            "order_id": order.id,
            "fiscal_document_id": document.id,
            "signature_count": giss_count_signature_nodes(signed_xml),
            "real_send_enabled": False,
        }

    if allowed_order_id and allowed_order_id != order.id:
        return {
            "ok": False,
            "blocked": True,
            "reason": "GISS_REAL_SEND_ORDER_ID não confere",
            "message": "envio real bloqueado: este orçamento não está autorizado explicitamente",
            "order_id": order.id,
            "allowed_order_id": allowed_order_id,
            "fiscal_document_id": document.id,
            "signature_count": giss_count_signature_nodes(signed_xml),
        }

    if confirm != "EMITIR_NFSE_REAL":
        return {
            "ok": False,
            "blocked": True,
            "reason": "confirmação ausente",
            "message": "para enviar de verdade, precisa confirm=EMITIR_NFSE_REAL",
            "order_id": order.id,
            "allowed_order_id": allowed_order_id,
            "fiscal_document_id": document.id,
        }

    operation = "RecepcionarLoteRps"
    result = giss_soap_call(operation, giss_as_text(signed_xml))
    document = giss_save_send_result(db, document, operation, signed_xml, result)

    document_payload = giss_fiscal_document_public_payload(document)
    fiscal_status = giss_clean(document_payload.get("status")).lower()
    provider_messages = result.get("messages") or []

    issue_ok = (
        result.get("http_status") == 200
        and fiscal_status in {"enviado", "autorizado"}
        and not provider_messages
    )

    return {
        "ok": issue_ok,
        "blocked": False,
        "order_id": order.id,
        "fiscal_document": document_payload,
        "http_status": result["http_status"],
        "content_type": result["content_type"],
        "summary": giss_response_summary(result),
        "technical_messages": result["messages"],
        "output_xml_preview": result["output_xml"][:3000],
    }



def giss_translate_message(message):
    codigo = giss_clean(message.get("Codigo"))
    texto = giss_clean(message.get("Mensagem"))
    correcao = giss_clean(message.get("Correcao"))

    raw = {
        "codigo": codigo,
        "mensagem": texto,
        "correcao": correcao,
    }

    # Alguns retornos do Giss vêm como Codigo=V999 e Mensagem=E174.
    # Mantemos o código técnico sem inventar tradução oficial.
    technical_code = texto if texto.startswith(("E", "V")) else codigo

    friendly = "A prefeitura respondeu, mas retornou uma inconsistência técnica. Chame o suporte antes de tentar novamente."
    level = "warning"

    if codigo == "A01" or texto == "A01":
        friendly = "A prefeitura/Giss não conseguiu processar a solicitação agora. Nenhuma nota foi autorizada. Tente novamente mais tarde ou revise o XML com o suporte."
        level = "error"

    elif codigo == "E160" or texto == "E160":
        friendly = "O arquivo fiscal foi recusado por incompatibilidade com o padrão XML da prefeitura."
        level = "error"

    elif codigo == "E174" or texto == "E174":
        friendly = "O Giss informou que o RPS não foi reconhecido como assinado. A assinatura digital do RPS precisa ser revisada antes de reenviar."
        level = "error"

    elif codigo == "V999" and texto == "E174":
        friendly = "O Giss informou que o RPS não foi reconhecido como assinado. A assinatura digital do RPS precisa ser revisada antes de reenviar."
        level = "error"

    elif codigo == "V999" and texto:
        friendly = "A prefeitura recebeu a consulta, mas retornou um código técnico de validação. O suporte precisa revisar os detalhes."
        level = "warning"

    elif "não encontrado" in texto.lower() or "nao encontrado" in texto.lower():
        friendly = "A prefeitura não encontrou a nota ou o RPS informado."
        level = "info"

    elif not codigo and not texto:
        friendly = "A prefeitura respondeu sem mensagem detalhada."
        level = "warning"

    return {
        "level": level,
        "friendly_message": friendly,
        "technical_code": technical_code or codigo,
        "provider_code": codigo,
        "provider_message": texto,
        "provider_correction": correcao,
        "raw": raw,
    }


def giss_translate_messages(messages):
    return [giss_translate_message(item) for item in (messages or []) if item]


def giss_response_summary(result):
    messages = result.get("messages") or []
    translated = giss_translate_messages(messages)

    has_error = any(item.get("level") == "error" for item in translated)
    has_warning = any(item.get("level") == "warning" for item in translated)

    if result.get("http_status") != 200:
        status = "erro_http"
        title = "A prefeitura não aceitou a comunicação."
    elif has_error:
        status = "erro_prefeitura"
        title = "A prefeitura recusou os dados fiscais."
    elif has_warning:
        status = "alerta_prefeitura"
        title = "A prefeitura retornou uma inconsistência técnica."
    elif translated:
        status = "resposta_prefeitura"
        title = "A prefeitura respondeu à solicitação."
    else:
        status = "sem_mensagem"
        title = "A prefeitura respondeu sem mensagens de retorno."

    return {
        "status": status,
        "title": title,
        "http_status": result.get("http_status"),
        "messages": translated,
    }



def giss_extract_first_text(xml_text, local_names):
    import xml.etree.ElementTree as ET

    if not xml_text:
        return ""

    if isinstance(local_names, str):
        local_names = [local_names]

    wanted = set(local_names)

    try:
        root = ET.fromstring(xml_text)
    except Exception:
        return ""

    for item in root.iter():
        name = giss_local_name(item.tag)
        if name in wanted and item.text:
            return str(item.text).strip()

    return ""


def giss_document_already_sent(document: FiscalDocument):
    status = giss_clean(getattr(document, "status", "")).lower()

    if status in {"enviado", "autorizado", "emitida", "emitido"}:
        return True

    if giss_clean(getattr(document, "giss_protocol", "")):
        return True

    if giss_clean(getattr(document, "nfse_number", "")):
        return True

    return False


def giss_order_is_finished(order: Order):
    order_status = giss_clean(getattr(order, "status", "")).lower()
    production_status = giss_clean(getattr(order, "production_status", "")).lower()

    return order_status == "finalizado" or production_status == "finalizado"


def giss_save_send_result(
    db: Session,
    document: FiscalDocument,
    operation: str,
    sent_xml,
    result,
):
    sent_text = giss_as_text(sent_xml)
    output_xml = result.get("output_xml") or ""
    messages = result.get("messages") or []

    protocol = giss_extract_first_text(output_xml, ["Protocolo"])
    nfse_number = giss_extract_first_text(output_xml, ["Numero", "NumeroNfse"])
    verification = giss_extract_first_text(output_xml, ["CodigoVerificacao"])

    document.giss_last_operation = operation
    document.giss_http_status = result.get("http_status")
    document.giss_sent_xml = sent_text
    document.giss_response_xml = output_xml
    document.giss_messages_json = json.dumps(messages, ensure_ascii=False)
    document.giss_response_at = now()

    if not getattr(document, "giss_sent_at", None):
        document.giss_sent_at = now()

    if protocol:
        document.giss_protocol = protocol

    if nfse_number:
        document.nfse_number = nfse_number

    if verification:
        document.nfse_verification_code = verification

    if nfse_number:
        document.status = "autorizado"
    elif protocol:
        document.status = "enviado"
    elif messages:
        document.status = "erro_giss"
    else:
        document.status = "retorno_giss"

    db.add(document)
    db.commit()
    db.refresh(document)

    return document


def giss_fiscal_document_public_payload(document: FiscalDocument):
    messages = []
    try:
        messages = json.loads(getattr(document, "giss_messages_json", "") or "[]")
    except Exception:
        messages = []

    return {
        "id": document.id,
        "order_id": document.order_id,
        "status": getattr(document, "status", None),
        "rps_number": getattr(document, "rps_number", None),
        "rps_series": getattr(document, "rps_series", None),
        "giss_protocol": getattr(document, "giss_protocol", None),
        "giss_http_status": getattr(document, "giss_http_status", None),
        "giss_last_operation": getattr(document, "giss_last_operation", None),
        "giss_sent_at": str(getattr(document, "giss_sent_at", "") or ""),
        "giss_response_at": str(getattr(document, "giss_response_at", "") or ""),
        "nfse_number": getattr(document, "nfse_number", None),
        "nfse_verification_code": getattr(document, "nfse_verification_code", None),
        "technical_messages": messages,
    }



def get_existing_fiscal_document(db: Session, user: User, order_id: str):
    return (
        db.query(FiscalDocument)
        .filter(
            FiscalDocument.order_id == order_id,
            FiscalDocument.workshop_id == user.workshop_id,
        )
        .order_by(FiscalDocument.created_at.desc())
        .first()
    )


@app.get("/orders/{order_id}/fiscal/status")
def fiscal_order_status(
    order_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_fiscal_feature(user)

    order = get_scoped_order_or_404(db, user, order_id)
    document = get_existing_fiscal_document(db, user, order.id)

    if document:
        settings = get_or_create_fiscal_settings(db, user.workshop)
        document = giss_ensure_rps_for_document(db, order, document, settings)

    return {
        "ok": True,
        "order_id": order.id,
        "order_finished": giss_order_is_finished(order),
        "real_send_enabled": giss_real_send_enabled(),
        "allowed_order_id": giss_allowed_real_send_order_id(),
        "has_fiscal_draft": bool(document),
        "can_issue": bool(document) and giss_order_is_finished(order),
        "fiscal_document": giss_fiscal_document_public_payload(document) if document else None,
    }


@app.post("/orders/{order_id}/fiscal/preflight")
def fiscal_order_preflight(
    order_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    order, document, settings, signed_xml = giss_prepare_signed_rps_for_order(db, user, order_id)
    text = giss_as_text(signed_xml)

    return {
        "ok": True,
        "mode": "preflight",
        "message": "pré-validação fiscal concluída; nada foi enviado ao Giss",
        "order_id": order.id,
        "order_finished": giss_order_is_finished(order),
        "real_send_enabled": giss_real_send_enabled(),
        "fiscal_document": giss_fiscal_document_public_payload(document),
        "xml_size_bytes": len(text.encode("utf-8")),
        "signature_count": giss_count_signature_nodes(text),
    }


@app.post("/orders/{order_id}/fiscal/issue")
def fiscal_order_issue(
    order_id: str,
    confirm: str = "",
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return fiscal_giss_send_lab(
        order_id=order_id,
        confirm=confirm,
        user=user,
        db=db,
    )



def giss_c14n_node(node):
    from lxml import etree
    return etree.tostring(node, method="c14n", exclusive=False, with_comments=False)


def giss_remove_signature_nodes(node):
    from lxml import etree

    for sig in node.xpath(".//*[local-name()='Signature']"):
        parent = sig.getparent()
        if parent is not None:
            parent.remove(sig)


def giss_ensure_target_id(node, prefix):
    import uuid

    current = node.get("Id") or node.get("id")
    if current:
        node.set("Id", current)
        return current

    value = f"{prefix}{uuid.uuid4().hex}"
    node.set("Id", value)
    return value


def giss_load_signing_material_direct():
    import os
    from pathlib import Path
    from cryptography.hazmat.primitives.serialization import pkcs12

    cert_path = os.getenv("GISS_A1_CERT_PATH")
    password_file = os.getenv("GISS_A1_CERT_PASSWORD_FILE")

    if not cert_path:
        raise RuntimeError("GISS_A1_CERT_PATH não configurado")

    if not password_file:
        raise RuntimeError("GISS_A1_CERT_PASSWORD_FILE não configurado")

    password = Path(password_file).read_text(encoding="utf-8").strip().encode("utf-8")
    data = Path(cert_path).read_bytes()

    private_key, cert, extra = pkcs12.load_key_and_certificates(data, password)

    if private_key is None or cert is None:
        raise RuntimeError("certificado A1 sem chave privada ou certificado")

    return private_key, cert


def giss_build_signature_skeleton_for_target(target, private_key, cert, prefix, remove_nested_signatures=True):
    from copy import deepcopy
    from base64 import b64encode
    from lxml import etree
    from cryptography.hazmat.primitives.serialization import Encoding
    import hashlib

    ds = "http://www.w3.org/2000/09/xmldsig#"

    target_id = giss_ensure_target_id(target, prefix)

    target_copy = deepcopy(target)

    # Para assinatura do RPS, normalmente não há Signature dentro do alvo.
    # Para assinatura do LoteRps, precisamos preservar a assinatura do RPS
    # que já está dentro do lote, senão o digest local diverge do Giss.
    if remove_nested_signatures:
        giss_remove_signature_nodes(target_copy)

    digest_value = b64encode(
        hashlib.sha1(giss_c14n_node(target_copy)).digest()
    ).decode("ascii")

    sig = etree.Element(etree.QName(ds, "Signature"))

    signed_info = etree.SubElement(sig, etree.QName(ds, "SignedInfo"))

    etree.SubElement(
        signed_info,
        etree.QName(ds, "CanonicalizationMethod"),
        Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
    )

    etree.SubElement(
        signed_info,
        etree.QName(ds, "SignatureMethod"),
        Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1",
    )

    reference = etree.SubElement(
        signed_info,
        etree.QName(ds, "Reference"),
        URI=f"#{target_id}",
    )

    transforms = etree.SubElement(reference, etree.QName(ds, "Transforms"))

    etree.SubElement(
        transforms,
        etree.QName(ds, "Transform"),
        Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature",
    )

    etree.SubElement(
        transforms,
        etree.QName(ds, "Transform"),
        Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
    )

    etree.SubElement(
        reference,
        etree.QName(ds, "DigestMethod"),
        Algorithm="http://www.w3.org/2000/09/xmldsig#sha1",
    )

    digest_el = etree.SubElement(reference, etree.QName(ds, "DigestValue"))
    digest_el.text = digest_value

    signature_value_el = etree.SubElement(sig, etree.QName(ds, "SignatureValue"))

    key_info = etree.SubElement(sig, etree.QName(ds, "KeyInfo"))
    x509_data = etree.SubElement(key_info, etree.QName(ds, "X509Data"))
    x509_cert = etree.SubElement(x509_data, etree.QName(ds, "X509Certificate"))
    x509_cert.text = b64encode(cert.public_bytes(Encoding.DER)).decode("ascii")

    return sig, signed_info, signature_value_el


def giss_finalize_signature(sig, signed_info, signature_value_el, private_key):
    from base64 import b64encode
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric import padding

    signature_bytes = private_key.sign(
        giss_c14n_node(signed_info),
        padding.PKCS1v15(),
        hashes.SHA1(),
    )

    signature_value_el.text = b64encode(signature_bytes).decode("ascii")


def giss_normalize_root_namespace_for_signature(root):
    from lxml import etree

    root_q = etree.QName(root)
    root_ns = root_q.namespace
    root_name = root_q.localname

    tipos_ns = "http://www.giss.com.br/tipos-v2_04.xsd"
    ds_ns = "http://www.w3.org/2000/09/xmldsig#"

    # Mantém só os namespaces que queremos no XML final.
    # Remove xsi:schemaLocation para evitar diferença de canonicalização no Giss.
    new_root = etree.Element(
        etree.QName(root_ns, root_name),
        nsmap={
            "ds": ds_ns,
            "p": root_ns,
            "p1": tipos_ns,
        },
    )

    for key, value in root.attrib.items():
        if str(key).startswith("{http://www.w3.org/2001/XMLSchema-instance}"):
            continue
        new_root.set(key, value)

    for child in list(root):
        root.remove(child)
        new_root.append(child)

    return new_root


def giss_strip_blank_text_nodes(node):
    # remove espaços/quebras de linha de indentação antes de assinar.
    # isso evita digest diferente caso o Giss descarte whitespace ignorable.
    if node.text is not None and not node.text.strip():
        node.text = None

    if node.tail is not None and not node.tail.strip():
        node.tail = None

    for child in list(node):
        giss_strip_blank_text_nodes(child)

    return node















def sign_giss_rps_lab_xml(xml_value):
    from lxml import etree
    from pathlib import Path
    import tempfile

    raw = giss_as_text(xml_value).encode("utf-8")

    root = etree.fromstring(raw)
    root = giss_xmlsec_normalize_root(root)

    giss_xmlsec_remove_signature_nodes(root)

    codigo_pais_count = giss_xmlsec_ensure_codigo_pais(root)
    if codigo_pais_count < 1:
        raise RuntimeError("CodigoPais 1058 não foi inserido no Servico do XML Giss")

    giss_xmlsec_strip_blank_text_nodes(root)

    inf_nodes = root.xpath("//*[local-name()='InfDeclaracaoPrestacaoServico']")
    if not inf_nodes:
        raise RuntimeError("não achei InfDeclaracaoPrestacaoServico para assinar")

    inf = inf_nodes[0]
    inf_id = inf.get("Id")
    if not inf_id:
        raise RuntimeError("InfDeclaracaoPrestacaoServico sem Id")

    rps_wrapper = inf.getparent()
    if rps_wrapper is None or etree.QName(rps_wrapper).localname != "Rps":
        raise RuntimeError("InfDeclaracaoPrestacaoServico não está dentro do wrapper Rps")

    # Modo Giss modelo oficial:
    # mantém Id no Rps interno, mas a assinatura do RPS referencia
    # InfDeclaracaoPrestacaoServico, como no padrão ABRASF/Giss.
    rps_nodes = inf.xpath("./*[local-name()='Rps']")
    if not rps_nodes:
        raise RuntimeError("não achei Rps interno dentro de InfDeclaracaoPrestacaoServico")

    rps_node = rps_nodes[0]
    rps_id = rps_node.get("Id")
    if not rps_id:
        suffix = inf_id[1:] if inf_id.startswith("D") else inf_id
        rps_id = "R" + suffix
        rps_node.set("Id", rps_id)

    lote_nodes = root.xpath("/*[local-name()='EnviarLoteRpsEnvio' or local-name()='EnviarLoteRpsSincronoEnvio']/*[local-name()='LoteRps']")
    if not lote_nodes:
        lote_nodes = root.xpath("//*[local-name()='LoteRps']")

    if not lote_nodes:
        raise RuntimeError("não achei LoteRps para assinar")

    lote = lote_nodes[0]
    lote_id = lote.get("Id")
    if not lote_id:
        raise RuntimeError("LoteRps sem Id")

    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        key_path, cert_path = giss_xmlsec_extract_pem_files(tmp)

        # 1) assina o RPS
        rps_sig = giss_xmlsec_signature_template(inf_id)
        rps_wrapper.insert(rps_wrapper.index(inf) + 1, rps_sig)

        rps_template = tmp / "rps-template.xml"
        rps_signed = tmp / "rps-signed.xml"

        etree.ElementTree(root).write(
            str(rps_template),
            encoding="utf-8",
            xml_declaration=True,
            pretty_print=False,
        )

        giss_xmlsec_sign_file(rps_template, rps_signed, key_path, cert_path, node_xpath="(//*[local-name()='Signature'])[last()]")

        # 2) carrega XML com RPS assinado e assina o lote
        root = etree.parse(str(rps_signed)).getroot()

        lote = root.xpath("/*[local-name()='EnviarLoteRpsEnvio' or local-name()='EnviarLoteRpsSincronoEnvio']/*[local-name()='LoteRps']")
        if not lote:
            lote = root.xpath("//*[local-name()='LoteRps']")

        if not lote:
            raise RuntimeError("não achei LoteRps depois de assinar RPS")

        lote = lote[0]
        lote_id = lote.get("Id")
        if not lote_id:
            raise RuntimeError("LoteRps sem Id depois de assinar RPS")

        lote_sig = giss_xmlsec_signature_template(lote_id)
        root.insert(root.index(lote) + 1, lote_sig)

        lote_template = tmp / "lote-template.xml"
        final_signed = tmp / "final-signed.xml"

        etree.ElementTree(root).write(
            str(lote_template),
            encoding="utf-8",
            xml_declaration=True,
            pretty_print=False,
        )

        giss_xmlsec_sign_file(lote_template, final_signed, key_path, cert_path, node_xpath="(//*[local-name()='Signature'])[last()]")

        return final_signed.read_text(encoding="utf-8")


@app.get("/workshop")
def get_workshop(user: User = Depends(get_current_user)):
    return workshop_dict(user.workshop)


@app.patch("/workshop")
def patch_workshop(
    payload: WorkshopPatch,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    workshop = user.workshop

    # campos bloqueados por regra do produto:
    # legal_name, trade_name e cnpj não são editáveis pelo cliente.
    if payload.email is not None:
        workshop.email = str(payload.email)
    if payload.phone is not None:
        workshop.phone = payload.phone
    if payload.address is not None:
        workshop.address = payload.address

    db.add(workshop)
    db.commit()
    db.refresh(workshop)

    return workshop_dict(workshop)


def serialize_vehicle(vehicle: Vehicle):
    return {
        "id": vehicle.id,
        "customer_id": vehicle.customer_id,
        "brand": vehicle.brand,
        "model": vehicle.model,
        "year": vehicle.year,
        "color": vehicle.color,
        "plate_or_chassis": vehicle.plate_or_chassis,
        "chassis": vehicle.chassis,
        "created_at": vehicle.created_at.isoformat() if vehicle.created_at else None,
    }


def serialize_customer(customer: Customer, db: Session, include_orders: bool = False):
    orders = (
        db.query(Order)
        .filter(
            Order.workshop_id == customer.workshop_id,
            Order.customer_id == customer.id,
        )
        .order_by(Order.created_at.desc())
        .all()
    )

    vehicles = (
        db.query(Vehicle)
        .filter(
            Vehicle.workshop_id == customer.workshop_id,
            Vehicle.customer_id == customer.id,
        )
        .order_by(Vehicle.created_at.desc())
        .all()
    )

    approved_total = sum(float(order.amount or 0) for order in orders if order.status == "aprovado")
    total_value = sum(float(order.amount or 0) for order in orders)

    data = {
        "id": customer.id,
        "name": customer.name,
        "phone": customer.phone,
        "cpf": customer.cpf,
        "email": customer.email,
        "address": customer.address,
        "created_at": customer.created_at.isoformat() if customer.created_at else None,
        "orders_count": len(orders),
        "vehicles_count": len(vehicles),
        "total_value": total_value,
        "approved_total": approved_total,
        "last_order_at": orders[0].created_at.isoformat() if orders else None,
        "vehicles": [serialize_vehicle(vehicle) for vehicle in vehicles],
    }

    if include_orders:
        data["orders"] = [serialize_order(order) for order in orders]

    return data



class AdminLoginPayload(BaseModel):
    username: str
    password: str


class SubscriberPatchPayload(BaseModel):
    active: Optional[bool] = None
    plan: Optional[str] = None
    subscription_status: Optional[str] = None
    billing_status: Optional[str] = None
    monthly_price: Optional[float] = None
    due_day: Optional[int] = None
    locked_reason: Optional[str] = None
    internal_notes: Optional[str] = None
    last_payment_at: Optional[str] = None
    next_due_at: Optional[str] = None
    max_users: Optional[int] = None
    max_orders_month: Optional[int] = None
    storage_limit_mb: Optional[int] = None
    features_json: Optional[str] = None
    admin_tags: Optional[str] = None


class AdminPasswordResetPayload(BaseModel):
    password: str
    reason: Optional[str] = None


def create_admin_token(username: str):
    payload = {
        "sub": username,
        "type": "admin",
        "exp": datetime.now(timezone.utc) + timedelta(hours=12),
    }

    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def get_admin_user(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="token admin ausente")

    token = authorization.split(" ", 1)[1].strip()

    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except Exception:
        raise HTTPException(status_code=401, detail="token admin inválido")

    if payload.get("type") != "admin" or payload.get("sub") != ADMIN_PANEL_USER:
        raise HTTPException(status_code=403, detail="acesso admin negado")

    return payload.get("sub")


def admin_password_hash(password: str):
    try:
        return hash_password(password)
    except NameError:
        return pwd_context.hash(password)


def subscriber_dict(workshop: Workshop, db: Session):
    owner = (
        db.query(User)
        .filter(User.workshop_id == workshop.id)
        .order_by(User.created_at.asc())
        .first()
    )

    orders_count = db.query(Order).filter(Order.workshop_id == workshop.id).count()
    customers_count = db.query(Customer).filter(Customer.workshop_id == workshop.id).count()
    vehicles_count = db.query(Vehicle).filter(Vehicle.workshop_id == workshop.id).count()

    total_value = sum(
        float(order.amount or 0)
        for order in db.query(Order).filter(Order.workshop_id == workshop.id).all()
    )

    return {
        "id": workshop.id,
        "legal_name": workshop.legal_name,
        "trade_name": workshop.trade_name,
        "cnpj": workshop.cnpj,
        "email": workshop.email,
        "phone": workshop.phone,
        "address": workshop.address,
        "specialty": workshop.specialty,
        "pix": workshop.pix,
        "instagram": workshop.instagram,
        "logo_url": workshop.logo_url,
        "active": workshop.active,
        "plan": workshop.plan or "trial",
        "subscription_status": workshop.subscription_status or "trial",
        "billing_status": workshop.billing_status or "ok",
        "monthly_price": float(workshop.monthly_price or 0),
        "due_day": workshop.due_day,
        "locked_reason": workshop.locked_reason,
        "internal_notes": workshop.internal_notes,
        "last_payment_at": admin_datetime_label(workshop.last_payment_at),
        "next_due_at": admin_datetime_label(workshop.next_due_at),
        "max_users": workshop.max_users,
        "max_orders_month": workshop.max_orders_month,
        "storage_limit_mb": workshop.storage_limit_mb,
        "features_json": workshop.features_json,
        "admin_tags": workshop.admin_tags,
        "limits": {
            "max_users": workshop.max_users,
            "max_orders_month": workshop.max_orders_month,
            "storage_limit_mb": workshop.storage_limit_mb,
            "features_json": workshop.features_json,
        },
        "created_at": workshop.created_at.isoformat() if workshop.created_at else None,
        "owner": {
            "id": owner.id if owner else None,
            "name": owner.name if owner else None,
            "email": owner.email if owner else None,
            "active": owner.active if owner else None,
        },
        "stats": {
            "orders_count": orders_count,
            "customers_count": customers_count,
            "vehicles_count": vehicles_count,
            "total_value": round(total_value, 2),
        },
    }


@app.post("/admin/login")
def admin_login(payload: AdminLoginPayload):
    username = (payload.username or "").strip()
    password = payload.password or ""

    if username != ADMIN_PANEL_USER or password != ADMIN_PANEL_PASSWORD:
        raise HTTPException(status_code=401, detail="usuário ou senha admin inválidos")

    return {
        "token": create_admin_token(username),
        "user": {
            "username": username,
            "role": "admin",
        },
    }


@app.get("/admin/subscribers")
def list_subscribers(
    admin: str = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    workshops = db.query(Workshop).order_by(Workshop.created_at.desc()).all()
    return [subscriber_dict(workshop, db) for workshop in workshops]


@app.post("/admin/subscribers")
def create_subscriber(
    payload: WorkshopCreate,
    admin: str = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    existing_cnpj = db.query(Workshop).filter(Workshop.cnpj == payload.cnpj).first()
    if existing_cnpj:
        raise HTTPException(status_code=400, detail="cnpj já cadastrado")

    existing_user = db.query(User).filter(User.email == payload.owner_email).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="email do dono já cadastrado")

    workshop = Workshop(
        legal_name=payload.legal_name,
        trade_name=payload.trade_name,
        cnpj=payload.cnpj,
        email=payload.email,
        phone=payload.phone,
        address=payload.address,
        specialty=payload.specialty,
        pix=payload.pix,
        instagram=payload.instagram,
        active=True,
        plan="trial",
        subscription_status="trial",
        billing_status="ok",
        monthly_price=0,
        due_day=None,
        internal_notes="assinante criado pelo painel interno",
    )

    db.add(workshop)
    db.flush()

    owner = User(
        workshop_id=workshop.id,
        name=payload.owner_name,
        email=payload.owner_email,
        password_hash=admin_password_hash(payload.owner_password),
        role="owner",
        active=True,
    )

    db.add(owner)
    write_admin_audit(
        db,
        admin,
        "subscriber.create",
        workshop.id,
        {
            "trade_name": workshop.trade_name,
            "owner_email": owner.email,
        },
    )
    db.commit()
    db.refresh(workshop)

    return subscriber_dict(workshop, db)


@app.patch("/admin/subscribers/{workshop_id}")
def update_subscriber(
    workshop_id: str,
    payload: SubscriberPatchPayload,
    admin: str = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    workshop = db.query(Workshop).filter(Workshop.id == workshop_id).first()

    if not workshop:
        raise HTTPException(status_code=404, detail="assinante não encontrado")

    data = payload.model_dump(exclude_unset=True)

    for field, value in data.items():
        if field in ["last_payment_at", "next_due_at"]:
            setattr(workshop, field, parse_admin_datetime(value))
        else:
            setattr(workshop, field, value)

    db.add(workshop)
    write_admin_audit(
        db,
        admin,
        "subscriber.update",
        workshop.id,
        {
            "fields": list(data.keys()),
            "data": data,
        },
    )
    db.commit()
    db.refresh(workshop)

    return subscriber_dict(workshop, db)




@app.patch("/admin/subscribers/{workshop_id}/owner-password")
def reset_subscriber_owner_password(
    workshop_id: str,
    payload: AdminPasswordResetPayload,
    admin: str = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    password = (payload.password or "").strip()

    if len(password) < 6:
        raise HTTPException(status_code=400, detail="a senha precisa ter pelo menos 6 caracteres")

    workshop = db.query(Workshop).filter(Workshop.id == workshop_id).first()

    if not workshop:
        raise HTTPException(status_code=404, detail="assinante não encontrado")

    owner = (
        db.query(User)
        .filter(User.workshop_id == workshop.id)
        .order_by(User.created_at.asc())
        .first()
    )

    if not owner:
        raise HTTPException(status_code=404, detail="dono da oficina não encontrado")

    owner.password_hash = admin_password_hash(password)
    db.add(owner)

    write_admin_audit(
        db,
        admin,
        "owner.password_reset",
        workshop.id,
        {
            "owner_email": owner.email,
            "reason": payload.reason or "reset manual pelo painel interno",
        },
    )

    db.commit()

    return {
        "ok": True,
        "message": "senha do dono atualizada",
        "owner_email": owner.email,
    }


@app.get("/admin/subscribers/{workshop_id}/audit")
def list_subscriber_audit(
    workshop_id: str,
    admin: str = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    rows = db.execute(
        text("""
            SELECT id, workshop_id, admin_user, action, metadata, created_at
            FROM admin_audit_logs
            WHERE workshop_id = :workshop_id
            ORDER BY created_at DESC
            LIMIT 80
        """),
        {"workshop_id": workshop_id},
    ).mappings().all()

    result = []

    for row in rows:
        metadata = {}

        try:
            metadata = json.loads(row["metadata"] or "{}")
        except Exception:
            metadata = {"raw": row["metadata"]}

        result.append({
            "id": str(row["id"]),
            "workshop_id": str(row["workshop_id"]) if row["workshop_id"] else None,
            "admin_user": row["admin_user"],
            "action": row["action"],
            "metadata": metadata,
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        })

    return result


@app.get("/admin/audit")
def list_admin_audit(
    admin: str = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    rows = db.execute(
        text("""
            SELECT id, workshop_id, admin_user, action, metadata, created_at
            FROM admin_audit_logs
            ORDER BY created_at DESC
            LIMIT 120
        """)
    ).mappings().all()

    result = []

    for row in rows:
        metadata = {}

        try:
            metadata = json.loads(row["metadata"] or "{}")
        except Exception:
            metadata = {"raw": row["metadata"]}

        result.append({
            "id": str(row["id"]),
            "workshop_id": str(row["workshop_id"]) if row["workshop_id"] else None,
            "admin_user": row["admin_user"],
            "action": row["action"],
            "metadata": metadata,
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        })

    return result



@app.patch("/orders/{order_id}/schedule")
def update_order_schedule(
    order_id: str,
    payload: OrderSchedulePayload,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    order = (
        db.query(Order)
        .filter(Order.id == order_id, Order.workshop_id == current_user.workshop_id)
        .first()
    )

    if not order:
        raise HTTPException(status_code=404, detail="orçamento não encontrado")

    order.scheduled_entry_at = parse_optional_datetime(payload.scheduled_entry_at)
    order.scheduled_entry_note = payload.scheduled_entry_note
    order.schedule_priority = (payload.schedule_priority or "normal").strip().lower()

    if order.scheduled_entry_at and order.status == "aprovado":
        order.production_status = "agendado"

    if order.scheduled_entry_at and not order.production_status:
        order.production_status = "agendado"

    order.updated_at = datetime.now(timezone.utc)

    db.add(order)
    db.commit()
    db.refresh(order)

    return serialize_order(order)


@app.patch("/orders/{order_id}/production")
def update_order_production(
    order_id: str,
    payload: OrderProductionPayload,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    order = (
        db.query(Order)
        .filter(Order.id == order_id, Order.workshop_id == current_user.workshop_id)
        .first()
    )

    if not order:
        raise HTTPException(status_code=404, detail="orçamento não encontrado")

    if payload.production_status is not None:
        order.production_status = normalize_production_status(payload.production_status)
    # orbeauto 1.16d status sync
    if order.production_status == "finalizado":
        order.status = "finalizado"
        # orbeauto 1.16e finished_at
        if not order.finished_at:
            order.finished_at = datetime.now(timezone.utc)
    elif order.production_status == "cancelado":
        order.status = "cancelado"
        order.finished_at = order.finished_at or datetime.now(timezone.utc)
    elif order.production_status in ["recebido", "em_execucao", "pronto", "agendado"]:
        if order.status not in ["finalizado", "cancelado"]:
            order.status = "aprovado"


    if payload.production_notes is not None:
        order.production_notes = payload.production_notes

    if payload.vehicle_received_at is not None:
        order.vehicle_received_at = parse_optional_datetime(payload.vehicle_received_at)

    if order.production_status == "recebido" and not order.vehicle_received_at:
        order.vehicle_received_at = datetime.now(timezone.utc)

    current_checklist = parse_checklist(order.checklist_json) or default_operational_checklist()

    if order.production_status == "recebido":
        current_checklist["veiculo_recebido"] = True

    if order.production_status == "em_execucao":
        current_checklist["veiculo_recebido"] = True
        current_checklist["servico_iniciado"] = True

    if order.production_status == "pronto":
        current_checklist["veiculo_pronto"] = True

    if order.production_status == "finalizado":
        current_checklist["veiculo_entregue"] = True

    order.checklist_json = json.dumps(current_checklist, ensure_ascii=False)
    order.updated_at = datetime.now(timezone.utc)

    db.add(order)
    db.commit()
    db.refresh(order)

    return serialize_order(order)


@app.patch("/orders/{order_id}/checklist")
def update_order_checklist(
    order_id: str,
    payload: OrderChecklistPayload,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    order = (
        db.query(Order)
        .filter(Order.id == order_id, Order.workshop_id == current_user.workshop_id)
        .first()
    )

    if not order:
        raise HTTPException(status_code=404, detail="orçamento não encontrado")

    checklist = default_operational_checklist()
    checklist.update(payload.checklist or {})

    order.checklist_json = json.dumps(checklist, ensure_ascii=False)
    order.updated_at = datetime.now(timezone.utc)

    db.add(order)
    db.commit()
    db.refresh(order)

    return serialize_order(order)


@app.get("/schedule")
def list_schedule(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    orders = (
        db.query(Order)
        .filter(
            Order.workshop_id == current_user.workshop_id,
            Order.scheduled_entry_at.isnot(None),
        )
        .order_by(Order.scheduled_entry_at.asc())
        .limit(200)
        .all()
    )

    return [serialize_order(order) for order in orders]


@app.get("/customers")
def list_customers(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    customers = (
        db.query(Customer)
        .filter(Customer.workshop_id == user.workshop_id)
        .order_by(Customer.created_at.desc())
        .all()
    )

    return [serialize_customer(customer, db) for customer in customers]


@app.get("/customers/{customer_id}")
def get_customer(
    customer_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    customer = (
        db.query(Customer)
        .filter(
            Customer.id == customer_id,
            Customer.workshop_id == user.workshop_id,
        )
        .first()
    )

    if not customer:
        raise HTTPException(status_code=404, detail="cliente não encontrado")

    return serialize_customer(customer, db, include_orders=True)


@app.get("/customers/{customer_id}/orders")
def get_customer_orders(
    customer_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    customer = (
        db.query(Customer)
        .filter(
            Customer.id == customer_id,
            Customer.workshop_id == user.workshop_id,
        )
        .first()
    )

    if not customer:
        raise HTTPException(status_code=404, detail="cliente não encontrado")

    orders = (
        db.query(Order)
        .filter(
            Order.workshop_id == user.workshop_id,
            Order.customer_id == customer.id,
        )
        .order_by(Order.created_at.desc())
        .all()
    )

    return [serialize_order(order) for order in orders]


@app.get("/vehicles")
def list_vehicles(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    vehicles = (
        db.query(Vehicle)
        .filter(Vehicle.workshop_id == user.workshop_id)
        .order_by(Vehicle.created_at.desc())
        .all()
    )

    return [serialize_vehicle(vehicle) for vehicle in vehicles]


@app.get("/vehicles/{vehicle_id}/orders")
def get_vehicle_orders(
    vehicle_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    vehicle = (
        db.query(Vehicle)
        .filter(
            Vehicle.id == vehicle_id,
            Vehicle.workshop_id == user.workshop_id,
        )
        .first()
    )

    if not vehicle:
        raise HTTPException(status_code=404, detail="veículo não encontrado")

    orders = (
        db.query(Order)
        .filter(
            Order.workshop_id == user.workshop_id,
            Order.vehicle_id == vehicle.id,
        )
        .order_by(Order.created_at.desc())
        .all()
    )

    return [serialize_order(order) for order in orders]


def pdf_safe(value, fallback="não informado"):
    value = "" if value is None else str(value)
    value = value.strip()

    if not value:
        value = fallback

    return escape(value)


def money_br(value):
    try:
        number = float(value or 0)
    except Exception:
        number = 0

    formatted = f"{number:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"R$ {formatted}"


def date_br(value):
    if not value:
        return "data não informada"

    try:
        return value.strftime("%d/%m/%Y")
    except Exception:
        return "data não informada"


def slugify(value):
    value = str(value or "oficina").lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    value = value.strip("-")
    return value or "oficina"


def upload_local_path(value):
    if not value:
        return None

    try:
        parsed = urlparse(str(value))
        filename = Path(parsed.path).name
    except Exception:
        filename = Path(str(value)).name

    if not filename:
        return None

    file_path = UPLOAD_DIR / filename

    if file_path.exists():
        return file_path

    return None


def fitted_image(file_path, max_width, max_height):
    if not file_path:
        return None

    file_path = Path(file_path)

    if not file_path.exists():
        return None

    if file_path.suffix.lower() == ".svg":
        return None

    try:
        img = RLImage(str(file_path))
        ratio = img.imageWidth / img.imageHeight

        width = max_width
        height = width / ratio

        if height > max_height:
            height = max_height
            width = height * ratio

        img.drawWidth = width
        img.drawHeight = height
        return img
    except Exception:
        return None


def payment_label(order):
    condition = order.payment_condition or "avista"
    installments = int(order.installments or 1)

    if condition == "parcelado" and installments > 1:
        total = float(order.amount or 0)
        part = total / installments if installments else total
        return f"{installments}x de {money_br(part)}"

    return "à vista"


def damage_list(order):
    try:
        items = json.loads(order.damage_types or "[]")
        if isinstance(items, list) and items:
            return ", ".join(str(item) for item in items)
    except Exception:
        pass

    return "não informado"


def build_order_pdf(order: Order, workshop: Workshop):
    buffer = io.BytesIO()

    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=14 * mm,
        leftMargin=14 * mm,
        topMargin=13 * mm,
        bottomMargin=15 * mm,
        title=f"Orçamento {order.id}",
        author=workshop.trade_name or "orbeauto",
    )

    styles = getSampleStyleSheet()

    styles.add(ParagraphStyle(
        name="pdfSmallCaps",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=7.2,
        leading=9,
        textColor=colors.HexColor("#667085"),
        spaceAfter=2,
    ))

    styles.add(ParagraphStyle(
        name="pdfBody",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=12,
        textColor=colors.HexColor("#344054"),
    ))

    styles.add(ParagraphStyle(
        name="pdfBodyBold",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=9.5,
        leading=12,
        textColor=colors.HexColor("#101828"),
    ))

    styles.add(ParagraphStyle(
        name="pdfTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=18,
        leading=21,
        textColor=colors.HexColor("#101828"),
        spaceAfter=2,
    ))

    styles.add(ParagraphStyle(
        name="pdfSubtitle",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor("#667085"),
    ))

    styles.add(ParagraphStyle(
        name="pdfSectionTitle",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=11,
        leading=14,
        textColor=colors.HexColor("#101828"),
        spaceBefore=3,
        spaceAfter=7,
    ))

    styles.add(ParagraphStyle(
        name="pdfValue",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=26,
        leading=30,
        textColor=colors.HexColor("#0A5BE0"),
        alignment=TA_RIGHT,
    ))

    styles.add(ParagraphStyle(
        name="pdfRight",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor("#475467"),
        alignment=TA_RIGHT,
    ))

    styles.add(ParagraphStyle(
        name="pdfNote",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        leading=11,
        textColor=colors.HexColor("#667085"),
    ))

    styles.add(ParagraphStyle(
        name="pdfCenter",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=8,
        leading=10,
        textColor=colors.HexColor("#667085"),
        alignment=TA_CENTER,
    ))

    def p(value, style="pdfBody"):
        return Paragraph(pdf_safe(value), styles[style])

    def money(value):
        try:
            number = float(value or 0)
        except Exception:
            number = 0

        raw = f"{number:,.2f}"
        return "R$ " + raw.replace(",", "X").replace(".", ",").replace("X", ".")

    def clean_join(items, sep=" · "):
        return sep.join([str(item).strip() for item in items if str(item or "").strip()])

    def logo_flowable():
        logo_url = getattr(workshop, "logo_url", None)
        if not logo_url:
            return None

        file_path = upload_local_path(logo_url)
        if not file_path or not file_path.exists():
            return None

        if file_path.suffix.lower() not in [".png", ".jpg", ".jpeg", ".webp"]:
            return None

        try:
            from PIL import Image as PILImage

            with PILImage.open(file_path) as image:
                width, height = image.size

            max_w = 34 * mm
            max_h = 18 * mm
            ratio = min(max_w / width, max_h / height)

            return RLImage(str(file_path), width=width * ratio, height=height * ratio)
        except Exception:
            return None

    def data_card(label, value, detail=None):
        content = [
            p(label.upper(), "pdfSmallCaps"),
            p(value, "pdfBodyBold"),
        ]

        if detail:
            content.append(p(detail, "pdfBody"))

        return content

    customer = order.customer
    vehicle = order.vehicle

    customer_name = customer.name if customer else "não informado"
    customer_phone = customer.phone if customer else ""
    customer_email = customer.email if customer else ""
    customer_cpf = customer.cpf if customer else ""

    vehicle_name = clean_join([
        vehicle.brand if vehicle else "",
        vehicle.model if vehicle else "",
    ], " ") or "não informado"

    vehicle_detail = clean_join([
        f"ano {vehicle.year}" if vehicle and vehicle.year else "",
        vehicle.color if vehicle and vehicle.color else "",
    ])

    vehicle_plate = (
        vehicle.plate_or_chassis
        or vehicle.chassis
        or "não informado"
    ) if vehicle else "não informado"

    issue_date = date_br(datetime.now(timezone.utc))
    created_date = date_br(order.created_at)

    amount_label = money(order.amount)
    payment_method = payment_label(order)
    raw_damages = damage_list(order)

    if isinstance(raw_damages, str):
        damages = [raw_damages.strip()] if raw_damages.strip() else []
    else:
        damages = [
            str(item).strip()
            for item in (raw_damages or [])
            if str(item or "").strip()
        ]

    damages_label = ", ".join(damages) if damages else "não informado"

    service_description = (
        order.service_description
        or order.damage_description
        or "serviço conforme avaliação da oficina."
    )

    workshop_name = workshop.trade_name or workshop.legal_name or "oficina"
    workshop_doc = clean_join([
        f"cnpj: {workshop.cnpj}" if workshop.cnpj else "",
        workshop.phone,
        workshop.email,
    ])

    story = []

    logo = logo_flowable()

    if logo:
        brand_cell = [
            logo,
            Spacer(1, 2 * mm),
            p(workshop_name, "pdfBodyBold"),
            p(workshop_doc or "dados da oficina não informados", "pdfSubtitle"),
            p(workshop.address or "", "pdfSubtitle"),
        ]
    else:
        brand_cell = [
            p(workshop_name, "pdfTitle"),
            p(workshop.legal_name or "", "pdfSubtitle"),
            p(workshop_doc or "dados da oficina não informados", "pdfSubtitle"),
            p(workshop.address or "", "pdfSubtitle"),
        ]

    header_table = Table(
        [
            [
                brand_cell,
                [
                    p("ORÇAMENTO", "pdfSmallCaps"),
                    p(f"#{order.id}", "pdfTitle"),
                    p(f"emitido em {issue_date}", "pdfRight"),
                    p(f"criado em {created_date}", "pdfRight"),
                    p(f"status: {order.status or 'em aberto'}", "pdfRight"),
                ],
            ]
        ],
        colWidths=[112 * mm, 70 * mm],
    )

    header_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F8FAFC")),
        ("BOX", (0, 0), (-1, -1), 0.4, colors.HexColor("#E4E7EC")),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 9),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))

    story.append(header_table)
    story.append(Spacer(1, 7 * mm))

    intro_table = Table(
        [
            [
                [
                    p("PROPOSTA COMERCIAL", "pdfSmallCaps"),
                    p("Orçamento para serviços automotivos", "pdfSectionTitle"),
                    p("Este documento apresenta a estimativa de serviço conforme informações fornecidas e avaliação registrada pela oficina.", "pdfBody"),
                ],
                [
                    p("VALOR TOTAL", "pdfSmallCaps"),
                    p(amount_label, "pdfValue"),
                    p(payment_method or "forma de pagamento não informada", "pdfRight"),
                ],
            ]
        ],
        colWidths=[112 * mm, 70 * mm],
    )

    intro_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (0, 0), colors.HexColor("#FFFFFF")),
        ("BACKGROUND", (1, 0), (1, 0), colors.HexColor("#EEF4FF")),
        ("BOX", (0, 0), (-1, -1), 0.4, colors.HexColor("#D0D5DD")),
        ("LINEBEFORE", (1, 0), (1, 0), 0.4, colors.HexColor("#D0D5DD")),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))

    story.append(intro_table)
    story.append(Spacer(1, 7 * mm))

    client_vehicle_table = Table(
        [
            [
                data_card("cliente", customer_name, clean_join([customer_phone, customer_email])),
                data_card("documento", customer_cpf or "não informado"),
            ],
            [
                data_card("veículo", vehicle_name, vehicle_detail),
                data_card("placa/chassi", vehicle_plate),
            ],
        ],
        colWidths=[91 * mm, 91 * mm],
    )

    client_vehicle_table.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.4, colors.HexColor("#E4E7EC")),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#E4E7EC")),
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FFFFFF")),
        ("LEFTPADDING", (0, 0), (-1, -1), 9),
        ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))

    story.append(Paragraph("dados do atendimento", styles["pdfSectionTitle"]))
    story.append(client_vehicle_table)

    if order.os_type == "seguradora":
        story.append(Spacer(1, 5 * mm))

        insurance_table = Table(
            [
                [
                    data_card("seguradora", order.insurer_company or "não informada"),
                    data_card("os/atendimento", order.insurance_service_order or "não informado"),
                    data_card("responsável", order.insurance_contact or "não informado"),
                ]
            ],
            colWidths=[60 * mm, 61 * mm, 61 * mm],
        )

        insurance_table.setStyle(TableStyle([
            ("BOX", (0, 0), (-1, -1), 0.4, colors.HexColor("#B2CCFF")),
            ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#D1E0FF")),
            ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#EEF4FF")),
            ("LEFTPADDING", (0, 0), (-1, -1), 9),
            ("RIGHTPADDING", (0, 0), (-1, -1), 9),
            ("TOPPADDING", (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]))

        story.append(insurance_table)

    story.append(Spacer(1, 7 * mm))
    story.append(Paragraph("serviço orçado", styles["pdfSectionTitle"]))

    service_table = Table(
        [
            [
                data_card("tipo de atendimento", "seguradora" if order.os_type == "seguradora" else "particular"),
                data_card("danos/itens", damages_label),
            ],
            [
                [
                    p("DESCRIÇÃO DO SERVIÇO", "pdfSmallCaps"),
                    p(service_description, "pdfBody"),
                ],
                [
                    p("OBSERVAÇÕES", "pdfSmallCaps"),
                    p(order.damage_description or "sem observações adicionais.", "pdfBody"),
                ],
            ],
        ],
        colWidths=[91 * mm, 91 * mm],
    )

    service_table.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.4, colors.HexColor("#E4E7EC")),
        ("INNERGRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#E4E7EC")),
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FFFFFF")),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F8FAFC")),
        ("LEFTPADDING", (0, 0), (-1, -1), 9),
        ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))

    story.append(service_table)

    story.append(Spacer(1, 7 * mm))
    story.append(Paragraph("condições comerciais", styles["pdfSectionTitle"]))

    payment_table = Table(
        [
            [
                [
                    p("VALOR TOTAL", "pdfSmallCaps"),
                    p(amount_label, "pdfValue"),
                ],
                [
                    p("PAGAMENTO", "pdfSmallCaps"),
                    p(payment_method or "não informado", "pdfBodyBold"),
                    p("Valores e condições podem ser ajustados após avaliação técnica complementar, quando aplicável.", "pdfNote"),
                ],
            ]
        ],
        colWidths=[72 * mm, 110 * mm],
    )

    payment_table.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.4, colors.HexColor("#D0D5DD")),
        ("BACKGROUND", (0, 0), (0, 0), colors.HexColor("#EEF4FF")),
        ("BACKGROUND", (1, 0), (1, 0), colors.HexColor("#FFFFFF")),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))

    story.append(payment_table)

    story.append(Spacer(1, 7 * mm))

    note_table = Table(
        [[
            p("Observação: este orçamento é uma proposta comercial baseada nas informações registradas. A execução do serviço depende de aprovação do cliente e disponibilidade de agenda da oficina. Peças, serviços adicionais ou divergências identificadas na desmontagem podem exigir nova autorização.", "pdfNote")
        ]],
        colWidths=[182 * mm],
    )

    note_table.setStyle(TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.35, colors.HexColor("#E4E7EC")),
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F9FAFB")),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))

    story.append(note_table)

    def footer(canvas, document):
        canvas.saveState()

        canvas.setStrokeColor(colors.HexColor("#E4E7EC"))
        canvas.setLineWidth(0.4)
        canvas.line(14 * mm, 12 * mm, 196 * mm, 12 * mm)

        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(colors.HexColor("#98A2B3"))
        canvas.drawString(14 * mm, 7 * mm, f"{workshop_name} · orçamento emitido pelo orbeauto")
        canvas.drawRightString(196 * mm, 7 * mm, f"página {document.page}")

        canvas.restoreState()

    doc.build(story, onFirstPage=footer, onLaterPages=footer)

    buffer.seek(0)
    return buffer.getvalue()


@app.get("/orders/{order_id}/pdf")
def download_order_pdf(
    order_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    order = (
        db.query(Order)
        .filter(
            Order.id == order_id,
            Order.workshop_id == user.workshop_id,
        )
        .first()
    )

    if not order:
        raise HTTPException(status_code=404, detail="orçamento não encontrado")

    filename = f"orcamento-{slugify(user.workshop.trade_name)}-{slugify(order.id)}.pdf"
    pdf_bytes = build_order_pdf(order, user.workshop)

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="{filename}"'
        },
    )


@app.post("/workshop/logo")
def upload_workshop_logo(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ext = Path(file.filename or "").suffix.lower() or ".png"

    if ext not in [".png", ".jpg", ".jpeg", ".webp", ".svg"]:
        raise HTTPException(status_code=400, detail="formato de logo inválido")

    filename = f"{user.workshop_id}_logo_{uuid.uuid4().hex}{ext}"
    file_path = UPLOAD_DIR / filename

    with file_path.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    user.workshop.logo_url = public_url(f"/uploads/{filename}")

    db.add(user.workshop)
    db.commit()
    db.refresh(user.workshop)

    return workshop_dict(user.workshop)


@app.get("/stats")
def stats(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    orders = db.query(Order).filter(Order.workshop_id == user.workshop_id).all()

    total = len(orders)
    approved = len([order for order in orders if order.status == "aprovado"])
    open_orders = len([order for order in orders if order.status == "em aberto"])
    finished = len([order for order in orders if order.status == "finalizado"])
    insurer = len([order for order in orders if order.os_type == "seguradora"])

    return {
        "total": total,
        "open": open_orders,
        "approved": approved,
        "finished": finished,
        "insurer": insurer,
        "approval_rate": round((approved / total) * 100) if total else 0,
    }


def float_amount(value):
    try:
        return float(value or 0)
    except Exception:
        return 0.0


def dashboard_order_value(order):
    return float_amount(order.amount)


def dashboard_period_stats(orders):
    total_count = len(orders)
    total_value = sum(dashboard_order_value(order) for order in orders)

    approved_orders = [order for order in orders if order.status == "aprovado"]
    finished_orders = [order for order in orders if order.status == "finalizado"]
    open_orders = [order for order in orders if order.status == "em aberto"]
    sent_orders = [order for order in orders if order.status == "enviado"]
    draft_orders = [order for order in orders if order.status == "rascunho"]
    canceled_orders = [order for order in orders if order.status == "cancelado"]

    approved_value = sum(dashboard_order_value(order) for order in approved_orders)
    finished_value = sum(dashboard_order_value(order) for order in finished_orders)
    open_value = sum(dashboard_order_value(order) for order in open_orders)
    sent_value = sum(dashboard_order_value(order) for order in sent_orders)

    active_orders = [
        order for order in orders
        if order.status not in ["cancelado", "rascunho"]
    ]

    active_value = sum(dashboard_order_value(order) for order in active_orders)
    ticket_average = active_value / len(active_orders) if active_orders else 0
    approval_rate = round((len(approved_orders) / total_count) * 100) if total_count else 0

    return {
        "orders_count": total_count,
        "total_value": round(total_value, 2),
        "active_value": round(active_value, 2),
        "approved_value": round(approved_value, 2),
        "finished_value": round(finished_value, 2),
        "open_value": round(open_value, 2),
        "sent_value": round(sent_value, 2),
        "ticket_average": round(ticket_average, 2),
        "approval_rate": approval_rate,
        "status_counts": {
            "rascunho": len(draft_orders),
            "em aberto": len(open_orders),
            "enviado": len(sent_orders),
            "aprovado": len(approved_orders),
            "finalizado": len(finished_orders),
            "cancelado": len(canceled_orders),
        },
    }


def dashboard_type_stats(orders):
    result = {}

    for kind in ["particular", "seguradora"]:
        kind_orders = [order for order in orders if order.os_type == kind]
        approved = [order for order in kind_orders if order.status == "aprovado"]

        total_value = sum(dashboard_order_value(order) for order in kind_orders)
        approved_value = sum(dashboard_order_value(order) for order in approved)
        ticket = total_value / len(kind_orders) if kind_orders else 0

        result[kind] = {
            "orders_count": len(kind_orders),
            "total_value": round(total_value, 2),
            "approved_value": round(approved_value, 2),
            "ticket_average": round(ticket, 2),
        }

    return result


def customer_ranking(orders):
    grouped = {}

    for order in orders:
        if not order.customer:
            continue

        customer_id = order.customer.id

        if customer_id not in grouped:
            grouped[customer_id] = {
                "id": customer_id,
                "name": order.customer.name,
                "phone": order.customer.phone,
                "orders_count": 0,
                "total_value": 0,
                "approved_value": 0,
            }

        grouped[customer_id]["orders_count"] += 1
        grouped[customer_id]["total_value"] += dashboard_order_value(order)

        if order.status == "aprovado":
            grouped[customer_id]["approved_value"] += dashboard_order_value(order)

    ranking = list(grouped.values())

    ranking.sort(
        key=lambda item: (item["orders_count"], item["total_value"]),
        reverse=True
    )

    for item in ranking:
        item["total_value"] = round(item["total_value"], 2)
        item["approved_value"] = round(item["approved_value"], 2)

    return ranking[:5]


def insurer_ranking(orders):
    grouped = {}

    for order in orders:
        if order.os_type != "seguradora":
            continue

        name = (order.insurer_company or "não informada").strip() or "não informada"

        if name not in grouped:
            grouped[name] = {
                "name": name,
                "orders_count": 0,
                "total_value": 0,
                "approved_value": 0,
            }

        grouped[name]["orders_count"] += 1
        grouped[name]["total_value"] += dashboard_order_value(order)

        if order.status == "aprovado":
            grouped[name]["approved_value"] += dashboard_order_value(order)

    ranking = list(grouped.values())
    ranking.sort(
        key=lambda item: (item["orders_count"], item["total_value"]),
        reverse=True
    )

    for item in ranking:
        item["total_value"] = round(item["total_value"], 2)
        item["approved_value"] = round(item["approved_value"], 2)

    return ranking[:5]


@app.get("/dashboard")
def dashboard(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    orders = (
        db.query(Order)
        .filter(Order.workshop_id == user.workshop_id)
        .order_by(Order.created_at.desc())
        .all()
    )

    now_dt = now()
    today_start = now_dt.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = now_dt - timedelta(days=7)
    month_start = now_dt.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    today_orders = [order for order in orders if order.created_at and order.created_at >= today_start]
    week_orders = [order for order in orders if order.created_at and order.created_at >= week_start]
    month_orders = [order for order in orders if order.created_at and order.created_at >= month_start]

    biggest_orders = sorted(
        orders,
        key=lambda order: dashboard_order_value(order),
        reverse=True,
    )[:5]

    recent_open = [
        order for order in orders
        if order.status in ["rascunho", "em aberto", "enviado"]
    ][:8]

    return {
        "workshop_id": user.workshop_id,
        "generated_at": now_dt.isoformat(),
        "periods": {
            "today": dashboard_period_stats(today_orders),
            "week": dashboard_period_stats(week_orders),
            "month": dashboard_period_stats(month_orders),
            "all": dashboard_period_stats(orders),
        },
        "types": dashboard_type_stats(orders),
        "rankings": {
            "biggest_orders": [serialize_order(order) for order in biggest_orders],
            "recent_open": [serialize_order(order) for order in recent_open],
            "customers": customer_ranking(orders),
            "insurers": insurer_ranking(orders),
        },
    }


@app.get("/orders")
def list_orders(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    orders = (
        db.query(Order)
        .filter(Order.workshop_id == user.workshop_id)
        .order_by(Order.created_at.desc())
        .all()
    )

    return [serialize_order(order) for order in orders]


@app.post("/orders")
def create_order(
    payload: OrderPayload,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    order = create_or_update_order(db, payload, user)
    return serialize_order(order)


@app.get("/orders/{order_id}")
def get_order(
    order_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    order = (
        db.query(Order)
        .filter(Order.id == order_id, Order.workshop_id == user.workshop_id)
        .first()
    )

    if not order:
        raise HTTPException(status_code=404, detail="orçamento não encontrado")

    return serialize_order(order)


@app.put("/orders/{order_id}")
def update_order(
    order_id: str,
    payload: OrderPayload,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    order = (
        db.query(Order)
        .filter(Order.id == order_id, Order.workshop_id == user.workshop_id)
        .first()
    )

    if not order:
        raise HTTPException(status_code=404, detail="orçamento não encontrado")

    updated = create_or_update_order(db, payload, user, existing_order=order)
    return serialize_order(updated)


@app.patch("/orders/{order_id}/status")
def update_status(
    order_id: str,
    payload: StatusPayload,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    order = (
        db.query(Order)
        .filter(Order.id == order_id, Order.workshop_id == user.workshop_id)
        .first()
    )

    if not order:
        raise HTTPException(status_code=404, detail="orçamento não encontrado")

    order.status = payload.status
    order.updated_at = now()

    db.add(order)
    db.commit()
    db.refresh(order)

    return serialize_order(order)


@app.delete("/orders/{order_id}")
def delete_order(
    order_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    order = (
        db.query(Order)
        .filter(Order.id == order_id, Order.workshop_id == user.workshop_id)
        .first()
    )

    if not order:
        raise HTTPException(status_code=404, detail="orçamento não encontrado")

    for photo in list(order.photos):
        filename = Path(photo.filename).name
        file_path = UPLOAD_DIR / filename
        if file_path.exists():
            file_path.unlink()

    # 1.20 fiscal foundation:
    # remove documentos fiscais/rascunhos ligados ao orçamento antes de apagar o orçamento.
    # sem isso, o banco bloqueia o delete por causa da chave estrangeira.
    db.query(FiscalDocument).filter(
        FiscalDocument.order_id == order.id,
        FiscalDocument.workshop_id == user.workshop_id,
    ).delete(synchronize_session=False)

    db.delete(order)
    db.commit()

    return {"ok": True}



PHOTO_LABELS = {
    "before": "before",
    "after": "after",
    "vehicle_document": "vehicle_document",
    "rear_plate": "rear_plate",
    "foto": "before",
    "antes": "before",
    "depois": "after",
    "documento": "vehicle_document",
    "documento_veiculo": "vehicle_document",
    "placa": "rear_plate",
    "placa_traseira": "rear_plate",
}


def normalize_photo_label(label: str):
    raw = (label or "before").strip().lower()
    raw = raw.replace("-", "_").replace(" ", "_")
    return PHOTO_LABELS.get(raw, "before")


def serialize_photo(photo: Photo):
    return {
        "id": photo.id,
        "label": normalize_photo_label(photo.label),
        "url": photo.url,
        "filename": photo.filename,
        "created_at": iso_or_none(photo.created_at),
    }


@app.get("/orders/{order_id}/photos")
def list_order_photos(
    order_id: str,
    label: Optional[str] = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    order = (
        db.query(Order)
        .filter(Order.id == order_id, Order.workshop_id == user.workshop_id)
        .first()
    )

    if not order:
        raise HTTPException(status_code=404, detail="orçamento não encontrado")

    photos = list(order.photos or [])

    if label:
        wanted = normalize_photo_label(label)
        photos = [photo for photo in photos if normalize_photo_label(photo.label) == wanted]

    photos.sort(key=lambda photo: photo.created_at or datetime.min)

    return [serialize_photo(photo) for photo in photos]


@app.post("/orders/{order_id}/photos")
def upload_photo(
    order_id: str,
    label: str = "foto",
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    order = (
        db.query(Order)
        .filter(Order.id == order_id, Order.workshop_id == user.workshop_id)
        .first()
    )

    if not order:
        raise HTTPException(status_code=404, detail="orçamento não encontrado")

    ext = Path(file.filename or "").suffix.lower() or ".jpg"
    filename = f"{user.workshop_id}_{order_id}_{uuid.uuid4().hex}{ext}"
    file_path = UPLOAD_DIR / filename

    with file_path.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    url = public_url(f"/uploads/{filename}")

    photo = Photo(
        workshop_id=user.workshop_id,
        order_id=order.id,
        label=normalize_photo_label(label),
        filename=filename,
        url=url,
    )

    db.add(photo)
    db.commit()
    db.refresh(photo)

    return serialize_photo(photo)


@app.delete("/photos/{photo_id}")
def delete_photo(
    photo_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    photo = (
        db.query(Photo)
        .filter(Photo.id == photo_id, Photo.workshop_id == user.workshop_id)
        .first()
    )

    if not photo:
        raise HTTPException(status_code=404, detail="foto não encontrada")

    filename = Path(photo.filename).name
    file_path = UPLOAD_DIR / filename

    if file_path.exists():
        file_path.unlink()

    db.delete(photo)
    db.commit()

    return {"ok": True}

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Bell,
  Bookmark,
  Building2,
  Calendar,
  Camera,
  Car,
  CheckCircle2,
  ChevronRight,
  CircleCheck,
  Clock3,
  Copy,
  CreditCard,
  DollarSign,
  Download,
  Eye,
  FileText,
  Filter,
  Flag,
  Home as HomeIcon,
  IdCard,
  Image as ImageIcon,
  KeyRound,
  LockKeyhole,
  LogOut,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  ReceiptText,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Trash2,
  Upload,
  User,
  Users,
  Wrench,
  Zap
} from "lucide-react";

const API_BASE = import.meta.env.VITE_API_BASE || "/api";

const TOKEN_KEY = "orbeauto.token.v1";

const STATUS_OPTIONS = [
  { id: "rascunho", label: "rascunho" },
  { id: "em aberto", label: "em aberto" },
  { id: "enviado", label: "enviado" },
  { id: "aprovado", label: "aprovado" },
  { id: "finalizado", label: "finalizado" },
  { id: "cancelado", label: "cancelado" }
];

const FILTER_OPTIONS = [
  { id: "todos", label: "todos" },
  { id: "em aberto", label: "abertos" },
  { id: "aprovado", label: "aprovados" },
  { id: "finalizado", label: "finalizados" },
  { id: "seguradora", label: "seguradora" },
  { id: "particular", label: "particular" }
];

const emptyDraft = {
  customer: { name: "", phone: "", cpf: "", email: "", address: "" },
  vehicle: { brand: "", model: "", year: "", color: "", plateOrChassis: "", chassis: "" },
  osType: "particular",
  insurance: { company: "", serviceOrder: "", contact: "" },
  damageTypes: ["amassado"],
  damageDescription: "",
  serviceDescription: "",
  payment: { amount: "", method: "pix", condition: "avista", installments: "1" },
  photos: []
};

const cx = (...classes) => classes.filter(Boolean).join(" ");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function apiErrorMessage(data, fallback = "erro na api") {
  const detail = data?.detail ?? data?.message ?? data?.error;

  if (!detail) return fallback;

  if (typeof detail === "string") return detail;

  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        const field = Array.isArray(item?.loc) ? item.loc.filter(Boolean).join(".") : "";
        const msg = item?.msg || item?.message || JSON.stringify(item);
        return field ? `${field}: ${msg}` : msg;
      })
      .join(" | ");
  }

  if (typeof detail === "object") {
    return detail?.msg || detail?.message || JSON.stringify(detail);
  }

  return String(detail);
}

async function api(endpoint, options = {}) {
  const token = options.token;
  const body = options.body;
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;

  const headers = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(options.headers || {}),
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: options.method || "GET",
    headers,
    body: body
      ? isFormData
        ? body
        : JSON.stringify(body)
      : undefined,
  });

  if (!response.ok) {
    let message = "erro na comunicação com a api";

    try {
      const data = await response.json();

      if (Array.isArray(data.detail)) {
        message = data.detail
          .map((item) => {
            const field = Array.isArray(item.loc) ? item.loc.join(".") : "campo";
            return `${field}: ${item.msg}`;
          })
          .join(" · ");
      } else {
        message = data.detail || data.message || message;
      }
    } catch {
      try {
        message = await response.text();
      } catch {}
    }

    throw new Error(message);
  }

  if (response.status === 204) return null;

  return response.json();
}

function moneyNumber(value) {
  const clean = String(value || "")
    .toLowerCase()
    .replace("r$", "")
    .replace(/\./g, "")
    .replace(",", ".")
    .replace(/[^\d.]/g, "");

  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : 0;
}

function moneyLabel(value, fallback = "R$ 0,00") {
  const raw = String(value ?? "").trim();

  if (!raw) return fallback;
  if (raw.toLowerCase().includes("r$")) return raw;

  const parsed = moneyNumber(raw);
  if (!parsed) return fallback;

  return parsed.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function todayLabel() {
  return new Date()
    .toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })
    .replace(".", "");
}

function fullDateLabel(iso) {
  const date = iso ? new Date(iso) : new Date();
  if (Number.isNaN(date.getTime())) return "data não informada";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

function timeLabel(iso) {
  const date = iso ? new Date(iso) : new Date();
  if (Number.isNaN(date.getTime())) return "horário não informado";

  const today = new Date();
  const sameDay =
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear();

  const time = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  if (sameDay) return `hoje às ${time}`;

  const day = date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return `${day} às ${time}`;
}

function installmentLabel(budget) {
  const condition = budget?.payment?.condition;
  const installments = Number(budget?.payment?.installments || 1);
  const amount = moneyNumber(budget?.payment?.amount);

  if (condition !== "parcelado" || installments <= 1) return "à vista no pix";

  const installmentAmount = amount / installments;

  if (!installmentAmount) return `${installments}x no cartão`;

  return `${installments}x de ${installmentAmount.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  })} no cartão`;
}

function budgetVehicleTitle(budget) {
  return `${budget?.vehicle?.brand || "marca"} ${budget?.vehicle?.model || "modelo"} ${budget?.vehicle?.year || "ano"}`;
}

function normalizeWorkshop(w) {
  return {
    id: w.id,
    legalName: w.legal_name || "",
    tradeName: w.trade_name || "",
    cnpj: w.cnpj || "",
    name: w.trade_name || "oficina",
    email: w.email || "",
    phone: w.phone || "",
    address: w.address || "",
    specialty: w.specialty || "",
    pix: w.pix || "",
    instagram: w.instagram || "",
    logoUrl: w.logo_url || ""
  };
}

function normalizeOrder(o) {
  return {
    id: o.id,
    status: o.status || "em aberto",
    createdAt: o.created_at,
    updatedAt: o.updated_at,
    customer: {
      id: o.customer?.id,
      name: o.customer?.name || "",
      phone: o.customer?.phone || "",
      cpf: o.customer?.cpf || "",
      email: o.customer?.email || "",
      address: o.customer?.address || ""
    },
    vehicle: {
      id: o.vehicle?.id,
      brand: o.vehicle?.brand || "",
      model: o.vehicle?.model || "",
      year: o.vehicle?.year || "",
      color: o.vehicle?.color || "",
      plateOrChassis: o.vehicle?.plate_or_chassis || "",
      chassis: o.vehicle?.chassis || ""
    },
    osType: o.os_type || "particular",
    insurance: {
      company: o.insurance?.company || "",
      serviceOrder: o.insurance?.service_order || "",
      contact: o.insurance?.contact || ""
    },
    damageTypes: o.damage_types || [],
    damageDescription: o.damage_description || "",
    serviceDescription: o.service_description || "",
    payment: {
      amount: String(o.payment?.amount ?? ""),
      method: o.payment?.method || "pix",
      condition: o.payment?.condition || "avista",
      installments: String(o.payment?.installments || 1)
    },
    photos: (o.photos || []).map((photo) => ({
      id: photo.id,
      label: photo.label,
      src: photo.url,
      url: photo.url,
      filename: photo.filename,
      remote: true
    }))
  };
}

function enrichOperationalOrder(order, raw = {}) {
  return {
    ...order,
    scheduled_entry_at: raw.scheduled_entry_at ?? order.scheduled_entry_at ?? null,
    scheduled_entry_note: raw.scheduled_entry_note ?? order.scheduled_entry_note ?? "",
    schedule_priority: raw.schedule_priority ?? order.schedule_priority ?? "normal",
    vehicle_received_at: raw.vehicle_received_at ?? order.vehicle_received_at ?? null,
    production_status: raw.production_status ?? order.production_status ?? "orcamento",
    production_notes: raw.production_notes ?? order.production_notes ?? "",
    checklist: raw.checklist ?? order.checklist ?? {}
  };
}

function scheduleDateValue(value) {
  if (!value) return null;

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return null;

  return date;
}

function startOfLocalDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function isSameLocalDay(a, b) {
  const da = scheduleDateValue(a);
  const db = scheduleDateValue(b);

  if (!da || !db) return false;

  return startOfLocalDay(da).getTime() === startOfLocalDay(db).getTime();
}

function isAfterToday(value) {
  const date = scheduleDateValue(value);

  if (!date) return false;

  return startOfLocalDay(date).getTime() > startOfLocalDay(new Date()).getTime();
}

function scheduleDateLabel(value) {
  const date = scheduleDateValue(value);

  if (!date) return "sem data";

  return date.toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit"
  });
}

function scheduleTimeLabel(value) {
  const date = scheduleDateValue(value);

  if (!date) return "";

  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function scheduleMoneyLabel(value) {
  const number = Number(value || 0);

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(number);
}

function orderCustomerName(order) {
  return (
    order.customer?.name ||
    order.customer_name ||
    order.client_name ||
    order.name ||
    "cliente sem nome"
  );
}

function orderCustomerPhone(order) {
  return (
    order.customer?.phone ||
    order.customer_phone ||
    order.client_phone ||
    order.phone ||
    ""
  );
}

function orderVehicleLabel(order) {
  const vehicle = order.vehicle || {};

  const parts = [
    vehicle.plate,
    vehicle.brand,
    vehicle.model,
    vehicle.color
  ].filter(Boolean);

  return (
    parts.join(" · ") ||
    order.vehicle_label ||
    order.car ||
    order.car_model ||
    "veículo não informado"
  );
}

function orderAmountValue(order) {
  return (
    order.amount ??
    order.total ??
    order.total_value ??
    order.final_value ??
    order.price ??
    order.value ??
    0
  );
}

function normalizeScheduleInput(raw) {
  const value = String(raw || "").trim();

  if (!value) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return `${value}T09:00:00-03:00`;
  }

  if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}$/.test(value)) {
    return `${value.replace(" ", "T")}:00-03:00`;
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    return `${value}:00-03:00`;
  }

  return value;
}

function localDateString(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function quickScheduleAt(offsetDays = 0, hour = 9) {
  return `${localDateString(offsetDays)}T${String(hour).padStart(2, "0")}:00:00-03:00`;
}

function isApprovedOrder(order) {
  return String(order.status || "").toLowerCase() === "aprovado";
}

function isFinishedOperationally(order) {
  const status = String(order.production_status || "").toLowerCase();

  return ["finalizado", "cancelado"].includes(status);
}








function openScheduleDatePicker(order, options = {}) {
  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve(null);
      return;
    }

    const previous = document.querySelector(".approval-schedule-backdrop");
    if (previous) previous.remove();

    const backdrop = document.createElement("div");
    backdrop.className = "approval-schedule-backdrop";

    const card = document.createElement("div");
    card.className = "approval-schedule-card";

    const customer = order ? orderCustomerName(order) : "cliente";
    const phone = order ? orderCustomerPhone(order) : "";
    const vehicle = order ? orderVehicleLabel(order) : "veículo";
    const amount = order ? scheduleMoneyLabel(orderAmountValue(order)) : "";

    const title = options.title || "deseja agendar?";
    const subtitle = options.subtitle || "escolha a data de entrada do veículo na oficina.";
    const confirmLabel = options.confirmLabel || "confirmar data";
    const cancelLabel = options.cancelLabel || "agendar depois";

    const existingDate =
      order && order.scheduled_entry_at
        ? scheduleDateValue(order.scheduled_entry_at)
        : null;

    const defaultDate =
      options.defaultDate ||
      (existingDate ? existingDate.toISOString().slice(0, 10) : localDateString(0));

    card.innerHTML = `
      <div class="approval-schedule-head">
        <span>orbeauto agenda</span>
        <strong data-title></strong>
        <p data-subtitle></p>
      </div>

      <div class="approval-schedule-summary">
        <div>
          <span>cliente</span>
          <b data-customer></b>
          <small data-phone></small>
        </div>

        <div>
          <span>veículo</span>
          <b data-vehicle></b>
          <small data-amount></small>
        </div>
      </div>

      <label class="approval-schedule-date">
        <span>data de entrada</span>
        <input data-schedule-date type="date" />
      </label>

      <div class="approval-schedule-actions">
        <button data-cancel type="button"></button>
        <button data-confirm type="button"></button>
      </div>
    `;

    backdrop.appendChild(card);
    document.body.appendChild(backdrop);

    card.querySelector("[data-title]").textContent = title;
    card.querySelector("[data-subtitle]").textContent = subtitle;
    card.querySelector("[data-customer]").textContent = customer;
    card.querySelector("[data-phone]").textContent = phone || "telefone não informado";
    card.querySelector("[data-vehicle]").textContent = vehicle;
    card.querySelector("[data-amount]").textContent = amount || "valor não informado";

    const input = card.querySelector("[data-schedule-date]");
    const cancel = card.querySelector("[data-cancel]");
    const confirm = card.querySelector("[data-confirm]");

    input.value = defaultDate;
    input.min = localDateString(0);
    cancel.textContent = cancelLabel;
    confirm.textContent = confirmLabel;

    function cleanup(value) {
      backdrop.remove();
      resolve(value);
    }

    cancel.addEventListener("click", () => cleanup(null));
    confirm.addEventListener("click", () => cleanup(input.value || null));

    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) cleanup(null);
    });

    setTimeout(() => {
      input.focus();

      if (input.showPicker) {
        try {
          input.showPicker();
        } catch {}
      }
    }, 180);
  });
}


function openApprovedScheduleModal(order) {
  return openScheduleDatePicker(order, {
    title: "deseja agendar a entrada?",
    subtitle: "o orçamento foi marcado como aprovado. escolha a data em que o cliente vai levar o veículo.",
    confirmLabel: "confirmar data",
    cancelLabel: "agendar depois"
  });
}


function storeApprovedScheduleDate(dateValue) {
  if (typeof window === "undefined") return;

  window.__orbeautoApprovedScheduleDate = {
    dateValue,
    createdAt: Date.now()
  };
}


function takeApprovedScheduleDate() {
  if (typeof window === "undefined") return undefined;

  const saved = window.__orbeautoApprovedScheduleDate;
  window.__orbeautoApprovedScheduleDate = undefined;

  if (!saved) return undefined;

  if (Date.now() - Number(saved.createdAt || 0) > 120000) {
    return undefined;
  }

  return saved.dateValue || null;
}


function installApprovedScheduleWatcher() {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (window.__orbeautoApprovedScheduleWatcherInstalled) return;

  window.__orbeautoApprovedScheduleWatcherInstalled = true;

  document.addEventListener(
    "change",
    async (event) => {
      const target = event.target;

      if (!target) return;
      if (target.closest && target.closest(".approval-schedule-card")) return;
      if (String(target.tagName || "").toLowerCase() !== "select") return;
      if (String(target.value || "").toLowerCase() !== "aprovado") return;

      const selectedDate = await openScheduleDatePicker(null, {
        title: "deseja agendar?",
        subtitle: "esse orçamento foi marcado como aprovado. escolha a data de entrada do veículo ou deixe para depois.",
        confirmLabel: "usar esta data",
        cancelLabel: "agendar depois"
      });

      storeApprovedScheduleDate(selectedDate);
    },
    true
  );
}


async function maybeAskScheduleAfterApproved(order, onScheduleBudget) {
  try {
    if (!order || !onScheduleBudget) return order;
    if (!isApprovedOrder(order)) return order;
    if (order.scheduled_entry_at) return order;
    if (isFinishedOperationally(order)) return order;

    const preselectedDate = takeApprovedScheduleDate();

    if (preselectedDate === null) return order;

    const selectedDate = preselectedDate || await openApprovedScheduleModal(order);

    if (!selectedDate) return order;

    const scheduled = await onScheduleBudget(order.id, {
      scheduled_entry_at: normalizeScheduleInput(selectedDate),
      scheduled_entry_note: "entrada agendada após aprovação do orçamento",
      schedule_priority: order.schedule_priority || "normal"
    });

    return scheduled || order;
  } catch (error) {
    console.error("approved schedule error", error);
    return order;
  }
}


if (typeof window !== "undefined") {
  setTimeout(() => installApprovedScheduleWatcher(), 0);
}




function syncOrderStatusFromProduction(order) {
  const productionStatus = String(order.production_status || "").toLowerCase();

  if (productionStatus === "finalizado") {
    return { ...order, status: "finalizado" };
  }

  if (productionStatus === "cancelado") {
    return { ...order, status: "cancelado" };
  }

  if (["agendado", "recebido", "em_execucao", "pronto"].includes(productionStatus)) {
    if (!["finalizado", "cancelado"].includes(String(order.status || "").toLowerCase())) {
      return { ...order, status: "aprovado" };
    }
  }

  return order;
}





function normalizePhotoStage(value) {
  const raw = String(value || "before").trim().toLowerCase().replace(/[-\s]/g, "_");

  const map = {
    before: "before",
    after: "after",
    vehicle_document: "vehicle_document",
    rear_plate: "rear_plate",
    foto: "before",
    foto_1: "before",
    foto_2: "before",
    foto_3: "before",
    foto_4: "before",
    foto_5: "before",
    foto_6: "before",
    antes: "before",
    depois: "after",
    documento: "vehicle_document",
    documento_veiculo: "vehicle_document",
    placa: "rear_plate",
    placa_traseira: "rear_plate"
  };

  return map[raw] || "before";
}

function normalizePhoto(photo, index = 0) {
  if (!photo) return null;

  const stage = normalizePhotoStage(photo.stage || photo.label || photo.category);
  const src = photo.src || photo.url || photo.data_url || photo.dataUrl || "";
  const id = photo.id || `photo-${stage}-${index}`;

  return {
    ...photo,
    id,
    label: photo.label || stage,
    stage,
    src,
    url: photo.url || src,
    data_url: photo.data_url || src,
    filename: photo.filename || "",
    remote: photo.remote ?? Boolean(photo.id && (photo.url || photo.filename)),
    local: photo.local ?? Boolean(photo.file)
  };
}

function normalizePhotos(photos) {
  if (!Array.isArray(photos)) return [];
  return photos
    .map((photo, index) => normalizePhoto(photo, index))
    .filter(Boolean);
}

function photoStageLabel(stage) {
  const labels = {
    entrada: "entrada",
    dano: "dano",
    durante: "durante",
    final: "final"
  };

  return labels[stage] || "foto";
}

function photoStagesForProduction(stage) {
  if (stage === "agendado") return ["entrada", "dano"];
  if (stage === "recebido") return ["entrada", "dano"];
  if (stage === "em_execucao") return ["durante", "dano"];
  if (stage === "pronto") return ["final", "durante"];
  return ["entrada"];
}

function orderPhotos(order) {
  return normalizePhotos(order?.photos || []);
}

function countPhotosByStage(order, stage) {
  return orderPhotos(order).filter((photo) => photo.stage === stage).length;
}


function operationalChecklistItems() {
  return [
    ["veiculo_recebido", "veículo recebido"],
    ["fotos_entrada", "fotos de entrada"],
    ["danos_conferidos", "danos conferidos"],
    ["servico_iniciado", "serviço iniciado"],
    ["funilaria_pintura_martelinho", "funilaria/pintura/martelinho"],
    ["acabamento", "acabamento"],
    ["conferencia_final", "conferência final"],
    ["veiculo_pronto", "veículo pronto"],
    ["veiculo_entregue", "veículo entregue"]
  ];
}

function operationalMessage(order, type) {
  const customer = orderCustomerName(order);
  const vehicle = orderVehicleLabel(order);
  const date = order.scheduled_entry_at
    ? `${scheduleDateLabel(order.scheduled_entry_at)} ${scheduleTimeLabel(order.scheduled_entry_at) || ""}`.trim()
    : "";

  const messages = {
    confirmar_agendamento: `olá, ${customer}! passando para confirmar a entrada do veículo ${vehicle}${date ? ` para ${date}` : ""}. qualquer imprevisto, pode me avisar por aqui.`,
    lembrar_amanha: `olá, ${customer}! passando para lembrar que a entrada do veículo ${vehicle} está agendada. qualquer imprevisto, me avise por aqui.`,
    recebido: `olá, ${customer}! seu veículo ${vehicle} já foi recebido na oficina. vamos seguir com o serviço combinado.`,
    iniciado: `olá, ${customer}! o serviço do veículo ${vehicle} já foi iniciado. qualquer novidade eu te aviso por aqui.`,
    pronto: `olá, ${customer}! seu veículo ${vehicle} ficou pronto e já pode ser retirado na oficina. qualquer dúvida, estou à disposição.`,
    entregue: `olá, ${customer}! veículo entregue. obrigado pela confiança na RestauraCar. qualquer coisa, fico à disposição.`
  };

  return messages[type] || "";
}

async function copyOperationalMessage(order, type) {
  const text = operationalMessage(order, type);

  try {
    await navigator.clipboard.writeText(text);
  } catch {
    console.log(text);
  }
}

function checklistDoneCount(order) {
  const checklist = order.checklist || {};
  return operationalChecklistItems().filter(([key]) => Boolean(checklist[key])).length;
}


function productionStage(order) {
  const status = String(order.production_status || "").toLowerCase();

  if (status && status !== "orcamento") return status;
  if (order.scheduled_entry_at && isApprovedOrder(order)) return "agendado";
  if (isApprovedOrder(order)) return "aprovado";

  return "orcamento";
}

function productionStageLabel(stage) {
  const labels = {
    aprovado: "aprovado",
    agendado: "agendado",
    recebido: "recebido",
    em_execucao: "em execução",
    pronto: "pronto",
    finalizado: "finalizado",
    cancelado: "cancelado"
  };

  return labels[stage] || stage || "orçamento";
}

function buildProductionBuckets(budgets = []) {
  const buckets = {
    agendado: [],
    recebido: [],
    em_execucao: [],
    pronto: []
  };

  budgets.forEach((order) => {
    if (!isApprovedOrder(order)) return;

    const stage = productionStage(order);

    if (stage === "finalizado" || stage === "cancelado") return;

    if (stage === "recebido") {
      buckets.recebido.push(order);
      return;
    }

    if (stage === "em_execucao") {
      buckets.em_execucao.push(order);
      return;
    }

    if (stage === "pronto") {
      buckets.pronto.push(order);
      return;
    }

    if (order.scheduled_entry_at || stage === "agendado") {
      buckets.agendado.push(order);
    }
  });

  const bySchedule = (a, b) => {
    const da = scheduleDateValue(a.scheduled_entry_at)?.getTime() || 0;
    const db = scheduleDateValue(b.scheduled_entry_at)?.getTime() || 0;
    return da - db;
  };

  buckets.agendado.sort(bySchedule);

  return buckets;
}

function productionValueTotal(items = []) {
  return items.reduce((sum, order) => sum + Number(orderAmountValue(order) || 0), 0);
}


function buildAgendaBuckets(budgets = []) {
  const today = [];
  const upcoming = [];
  const approvedWithoutSchedule = [];

  budgets.forEach((order) => {
    if (!isApprovedOrder(order)) return;
    if (isFinishedOperationally(order)) return;

    if (!order.scheduled_entry_at) {
      approvedWithoutSchedule.push(order);
      return;
    }

    if (isSameLocalDay(order.scheduled_entry_at, new Date())) {
      today.push(order);
      return;
    }

    if (isAfterToday(order.scheduled_entry_at)) {
      upcoming.push(order);
    }
  });

  const bySchedule = (a, b) => {
    const da = scheduleDateValue(a.scheduled_entry_at)?.getTime() || 0;
    const db = scheduleDateValue(b.scheduled_entry_at)?.getTime() || 0;
    return da - db;
  };

  return {
    today: today.sort(bySchedule),
    upcoming: upcoming.sort(bySchedule).slice(0, 8),
    approvedWithoutSchedule: approvedWithoutSchedule.slice(0, 8)
  };
}



function normalizeVehicle(v) {
  return {
    id: v.id,
    customerId: v.customer_id,
    brand: v.brand || "",
    model: v.model || "",
    year: v.year || "",
    color: v.color || "",
    plateOrChassis: v.plate_or_chassis || "",
    chassis: v.chassis || "",
    createdAt: v.created_at
  };
}

function normalizeCustomer(c) {
  return {
    id: c.id,
    name: c.name || "",
    phone: c.phone || "",
    cpf: c.cpf || "",
    email: c.email || "",
    address: c.address || "",
    createdAt: c.created_at,
    ordersCount: c.orders_count || 0,
    vehiclesCount: c.vehicles_count || 0,
    totalValue: c.total_value || 0,
    approvedTotal: c.approved_total || 0,
    lastOrderAt: c.last_order_at,
    vehicles: (c.vehicles || []).map(normalizeVehicle),
    orders: (c.orders || []).map(normalizeOrder)
  };
}

function toApiOrder(draft, status = "em aberto") {
  return {
    customer: {
      name: draft.customer.name || "cliente sem nome",
      phone: draft.customer.phone,
      cpf: draft.customer.cpf,
      email: draft.customer.email,
      address: draft.customer.address
    },
    vehicle: {
      brand: draft.vehicle.brand || "marca não informada",
      model: draft.vehicle.model || "modelo não informado",
      year: draft.vehicle.year || "ano não informado",
      color: draft.vehicle.color,
      plate_or_chassis: draft.vehicle.plateOrChassis,
      chassis: draft.vehicle.chassis
    },
    os_type: draft.osType,
    status,
    insurance: {
      company: draft.insurance.company,
      service_order: draft.insurance.serviceOrder,
      contact: draft.insurance.contact
    },
    damage_types: draft.damageTypes || [],
    damage_description: draft.damageDescription,
    service_description: draft.serviceDescription,
    payment: {
      amount: moneyNumber(draft.payment.amount),
      method: draft.payment.method,
      condition: draft.payment.condition,
      installments: Number(draft.payment.installments || 1)
    }
  };
}

function draftFromBudget(budget) {
  return {
    customer: clone(budget.customer || emptyDraft.customer),
    vehicle: clone(budget.vehicle || emptyDraft.vehicle),
    osType: budget.osType || "particular",
    insurance: clone(budget.insurance || emptyDraft.insurance),
    damageTypes: budget.damageTypes || ["amassado"],
    damageDescription: budget.damageDescription || "",
    serviceDescription: budget.serviceDescription || "",
    payment: clone(budget.payment || emptyDraft.payment),
    photos: normalizePhotos(budget.photos || [])
  };
}

const emptyDashboardPeriod = {
  ordersCount: 0,
  totalValue: 0,
  activeValue: 0,
  approvedValue: 0,
  finishedValue: 0,
  openValue: 0,
  sentValue: 0,
  ticketAverage: 0,
  approvalRate: 0,
  statusCounts: {
    rascunho: 0,
    "em aberto": 0,
    enviado: 0,
    aprovado: 0,
    finalizado: 0,
    cancelado: 0
  }
};

function normalizeDashboardPeriod(period = {}) {
  return {
    ordersCount: period.orders_count || 0,
    totalValue: period.total_value || 0,
    activeValue: period.active_value || 0,
    approvedValue: period.approved_value || 0,
    finishedValue: period.finished_value || 0,
    openValue: period.open_value || 0,
    sentValue: period.sent_value || 0,
    ticketAverage: period.ticket_average || 0,
    approvalRate: period.approval_rate || 0,
    statusCounts: period.status_counts || emptyDashboardPeriod.statusCounts
  };
}

function normalizeDashboard(data = {}) {
  return {
    generatedAt: data.generated_at,
    periods: {
      today: normalizeDashboardPeriod(data.periods?.today),
      week: normalizeDashboardPeriod(data.periods?.week),
      month: normalizeDashboardPeriod(data.periods?.month),
      all: normalizeDashboardPeriod(data.periods?.all)
    },
    types: {
      particular: {
        ordersCount: data.types?.particular?.orders_count || 0,
        totalValue: data.types?.particular?.total_value || 0,
        approvedValue: data.types?.particular?.approved_value || 0,
        ticketAverage: data.types?.particular?.ticket_average || 0
      },
      seguradora: {
        ordersCount: data.types?.seguradora?.orders_count || 0,
        totalValue: data.types?.seguradora?.total_value || 0,
        approvedValue: data.types?.seguradora?.approved_value || 0,
        ticketAverage: data.types?.seguradora?.ticket_average || 0
      }
    },
    rankings: {
      biggestOrders: (data.rankings?.biggest_orders || []).map(normalizeOrder),
      recentOpen: (data.rankings?.recent_open || []).map(normalizeOrder),
      customers: data.rankings?.customers || [],
      insurers: data.rankings?.insurers || []
    }
  };
}

function draftFromCustomer(customer) {
  const vehicle = customer.vehicles?.[0] || {};

  return {
    ...clone(emptyDraft),
    customer: {
      name: customer.name || "",
      phone: customer.phone || "",
      cpf: customer.cpf || "",
      email: customer.email || "",
      address: customer.address || ""
    },
    vehicle: {
      brand: vehicle.brand || "",
      model: vehicle.model || "",
      year: vehicle.year || "",
      color: vehicle.color || "",
      plateOrChassis: vehicle.plateOrChassis || "",
      chassis: vehicle.chassis || ""
    }
  };
}

function pdfFileName(budget, workshop) {
  const cleanWorkshop = String(workshop?.name || workshop?.tradeName || "oficina")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return `orcamento-${cleanWorkshop || "oficina"}-${budget.id}.pdf`;
}

function buildWhatsappText(budget, workshop) {
  return [
    `olá, ${budget.customer.name}!`,
    "",
    `segue seu orçamento da ${workshop.name}:`,
    "",
    `veículo: ${budgetVehicleTitle(budget)}`,
    `tipo de os: ${budget.osType}`,
    budget.osType === "seguradora" && budget.insurance?.serviceOrder
      ? `os/atendimento: ${budget.insurance.serviceOrder}`
      : "",
    `serviço: ${budget.serviceDescription}`,
    `valor: ${moneyLabel(budget.payment.amount)}`,
    `condição: ${installmentLabel(budget)}`,
    "",
    `${workshop.name} - ${workshop.phone}`,
    workshop.address
  ].filter(Boolean).join("\n");
}

function buildInsuranceReport(budget, workshop) {
  return [
    `relatório de atendimento - ${workshop.name}`,
    "",
    `orçamento: #${budget.id}`,
    `data: ${fullDateLabel(budget.createdAt)}`,
    `status: ${budget.status}`,
    "",
    "cliente",
    `nome: ${budget.customer.name}`,
    `telefone: ${budget.customer.phone || "não informado"}`,
    "",
    "veículo",
    `marca/modelo: ${budgetVehicleTitle(budget)}`,
    `cor: ${budget.vehicle.color || "não informada"}`,
    `placa/chassi: ${budget.vehicle.plateOrChassis || "não informado"}`,
    "",
    "seguradora",
    `seguradora: ${budget.insurance?.company || "não informada"}`,
    `os/atendimento: ${budget.insurance?.serviceOrder || "não informado"}`,
    `responsável: ${budget.insurance?.contact || "não informado"}`,
    "",
    "avaliação",
    `tipo de dano: ${(budget.damageTypes || []).join(", ") || "não informado"}`,
    `dano: ${budget.damageDescription}`,
    `serviço proposto: ${budget.serviceDescription}`,
    `valor: ${moneyLabel(budget.payment.amount)}`,
    `condição: ${installmentLabel(budget)}`,
    "",
    `fotos anexadas: ${(budget.photos || []).length}`,
    "",
    `${workshop.name} - ${workshop.phone}`,
    workshop.address
  ].join("\n");
}

function Brand({ compact = false }) {
  return (
    <div className={cx("brand", compact && "brand-compact")}>
      <div className="orbe-ring" aria-hidden="true"><span /></div>
      <div className="brand-copy">
        <strong>orbe<span>auto</span></strong>
        {!compact && <p>orçamentos profissionais para oficinas</p>}
      </div>
    </div>
  );
}

function Splash() {
  return (
    <main className="splash-screen">
      <div className="splash-orb">
        <div className="orbe-ring"><span /></div>
      </div>
      <div className="splash-copy">
        <strong>orbe<span>auto</span></strong>
        <p>orçamentos profissionais para oficinas</p>
      </div>
      <div className="splash-loader" />
    </main>
  );
}

function Toast({ message }) {
  if (!message) return null;
  return <div className="toast">{message}</div>;
}

function Login({ onLogin, goAdmin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <main className="screen login-screen">
      <section className="login-brand"><Brand /></section>

      <section className="panel login-card">
        <div className="card-heading loose">
          <div>
            <h1>bem-vindo de volta</h1>
            <p>acesse sua oficina com login real</p>
          </div>
        </div>

        <label className="input-line">
          <Mail size={18} />
          <input value={email} placeholder="email" autoComplete="username" onChange={(event) => setEmail(event.target.value)} />
        </label>

        <label className="input-line">
          <LockKeyhole size={18} />
          <input value={password} placeholder="senha" type="password" autoComplete="current-password" onChange={(event) => setPassword(event.target.value)} />
          <Eye size={17} className="muted-icon" />
        </label>

        <div className="login-row">
          <label className="check-row">
            <input type="checkbox" defaultChecked />
            lembrar acesso
          </label>
        </div>

        <button className="primary" onClick={() => onLogin(email, password)}>
          entrar
        </button>

        <button className="secondary quiet" onClick={goAdmin}>
          <Building2 size={18} />
          painel de controle
        </button>
      </section>

      <footer className="footer-note">api: {API_BASE}</footer>
    </main>
  );
}

function planMeta(plan) {
  const key = String(plan || "trial").toLowerCase();

  const map = {
    trial: { label: "trial", tone: "blue", priceHint: "teste" },
    starter: { label: "starter", tone: "green", priceHint: "entrada" },
    pro: { label: "pro", tone: "purple", priceHint: "profissional" },
    business: { label: "business", tone: "dark", priceHint: "operação" },
    enterprise: { label: "enterprise", tone: "gold", priceHint: "sob medida" }
  };

  return map[key] || { label: key || "trial", tone: "blue", priceHint: "custom" };
}

function subscriberHealth(subscriber) {
  const active = Boolean(subscriber.active);
  const billing = String(subscriber.billing_status || "ok").toLowerCase();
  const subscription = String(subscriber.subscription_status || "trial").toLowerCase();

  if (!active || billing === "inadimplente" || billing === "bloqueado" || subscription === "suspenso" || subscription === "bloqueado") {
    return {
      label: "bloqueado",
      tone: "danger",
      description: subscriber.locked_reason || "assinante sem acesso ao sistema"
    };
  }

  if (billing === "pendente") {
    return {
      label: "atenção",
      tone: "warning",
      description: "cobrança pendente"
    };
  }

  if (subscription === "trial") {
    return {
      label: "trial",
      tone: "blue",
      description: "assinante em período de teste"
    };
  }

  return {
    label: "saudável",
    tone: "success",
    description: "acesso liberado"
  };
}

function subscriberSearchBlob(subscriber) {
  return [
    subscriber.trade_name,
    subscriber.legal_name,
    subscriber.cnpj,
    subscriber.email,
    subscriber.phone,
    subscriber.owner?.name,
    subscriber.owner?.email,
    subscriber.plan,
    subscriber.subscription_status,
    subscriber.billing_status,
    subscriber.internal_notes
  ].join(" ").toLowerCase();
}

function subscriberCreatedLabel(value) {
  if (!value) return "sem data";

  try {
    return new Date(value).toLocaleDateString("pt-BR");
  } catch {
    return "sem data";
  }
}

function adminSubscriberSummary(subscriber) {
  const health = subscriberHealth(subscriber);

  return [
    `assinante: ${subscriber.trade_name || subscriber.legal_name}`,
    `cnpj: ${subscriber.cnpj || "não informado"}`,
    `dono: ${subscriber.owner?.name || "não informado"} (${subscriber.owner?.email || "sem email"})`,
    `plano: ${subscriber.plan || "trial"}`,
    `status: ${health.label}`,
    `financeiro: ${subscriber.billing_status || "ok"}`,
    `mensalidade: ${moneyLabel(subscriber.monthly_price || 0, "R$ 0,00")}`,
    `clientes: ${subscriber.stats?.customers_count || 0}`,
    `orçamentos: ${subscriber.stats?.orders_count || 0}`,
    `volume: ${moneyLabel(subscriber.stats?.total_value || 0, "R$ 0,00")}`,
    `observações: ${subscriber.internal_notes || "sem observações"}`
  ].join("\n");
}

function AdminPanelLogin({ goLogin, onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  return (
    <main className="screen login-screen admin-login-screen">
      <section className="login-brand">
        <Brand />
      </section>

      <section className="panel login-card admin-login-card">
        <div className="card-heading loose">
          <div>
            <h1>painel de controle</h1>
            <p>acesso interno da orbe</p>
          </div>
        </div>

        <label className="input-line">
          <User size={18} />
          <input
            value={username}
            placeholder="usuário admin"
            autoCapitalize="none"
            autoComplete="username" onChange={(event) => setUsername(event.target.value)}
          />
        </label>

        <label className="input-line">
          <LockKeyhole size={18} />
          <input
            value={password}
            placeholder="senha admin"
            type="password"
            autoComplete="current-password" onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        <button className="primary admin-login-primary" onClick={() => onLogin(username, password)}>
          entrar no painel
        </button>

        <button className="secondary quiet admin-login-secondary" onClick={goLogin}>
          voltar ao login da oficina
        </button>
      </section>
    </main>
  );
}

function SubscriberControlPanel({
  goLogin,
  subscribers,
  onRefresh,
  onCreateSubscriber,
  onUpdateSubscriber,
  onResetOwnerPassword,
  onLoadSubscriberAudit,
  onLogout
}) {
  const [query, setQuery] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [tab, setTab] = useState("overview");
  const [planFilter, setPlanFilter] = useState("todos");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [sortBy, setSortBy] = useState("recentes");
  const [dense, setDense] = useState(false);
  const [selectedSubscriber, setSelectedSubscriber] = useState(null);

  const stats = useMemo(() => {
    const total = subscribers.length;
    const healthy = subscribers.filter((sub) => subscriberHealth(sub).label === "saudável").length;
    const trial = subscribers.filter((sub) => String(sub.subscription_status || "").toLowerCase() === "trial").length;
    const blocked = subscribers.filter((sub) => subscriberHealth(sub).tone === "danger").length;
    const pending = subscribers.filter((sub) => String(sub.billing_status || "").toLowerCase() === "pendente").length;
    const overdue = subscribers.filter((sub) => String(sub.billing_status || "").toLowerCase() === "inadimplente").length;
    const mrr = subscribers.reduce((sum, sub) => sum + Number(sub.monthly_price || 0), 0);
    const orders = subscribers.reduce((sum, sub) => sum + Number(sub.stats?.orders_count || 0), 0);
    const customers = subscribers.reduce((sum, sub) => sum + Number(sub.stats?.customers_count || 0), 0);
    const vehicles = subscribers.reduce((sum, sub) => sum + Number(sub.stats?.vehicles_count || 0), 0);
    const volume = subscribers.reduce((sum, sub) => sum + Number(sub.stats?.total_value || 0), 0);
    const ticket = total ? mrr / total : 0;

    return { total, healthy, trial, blocked, pending, overdue, mrr, orders, customers, vehicles, volume, ticket };
  }, [subscribers]);

  const overdueSubscribers = useMemo(() => {
    return subscribers.filter((sub) => {
      const health = subscriberHealth(sub);
      const billing = String(sub.billing_status || "ok").toLowerCase();
      const subscription = String(sub.subscription_status || "trial").toLowerCase();

      return health.tone === "danger" || billing === "pendente" || billing === "inadimplente" || subscription === "suspenso";
    });
  }, [subscribers]);

  const filteredSubscribers = useMemo(() => {
    const search = query.trim().toLowerCase();

    let list = subscribers.filter((sub) => {
      const health = subscriberHealth(sub);
      const plan = String(sub.plan || "trial").toLowerCase();
      const billing = String(sub.billing_status || "ok").toLowerCase();
      const subscription = String(sub.subscription_status || "trial").toLowerCase();

      const matchesSearch = !search || subscriberSearchBlob(sub).includes(search);
      const matchesPlan = planFilter === "todos" || plan === planFilter;
      const matchesStatus =
        statusFilter === "todos" ||
        health.label === statusFilter ||
        billing === statusFilter ||
        subscription === statusFilter;

      return matchesSearch && matchesPlan && matchesStatus;
    });

    list = [...list].sort((a, b) => {
      if (sortBy === "receita") return Number(b.monthly_price || 0) - Number(a.monthly_price || 0);
      if (sortBy === "volume") return Number(b.stats?.total_value || 0) - Number(a.stats?.total_value || 0);
      if (sortBy === "orcamentos") return Number(b.stats?.orders_count || 0) - Number(a.stats?.orders_count || 0);
      if (sortBy === "nome") return String(a.trade_name || a.legal_name || "").localeCompare(String(b.trade_name || b.legal_name || ""));
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    });

    return list;
  }, [subscribers, query, planFilter, statusFilter, sortBy]);

  const planRows = useMemo(() => {
    return ["trial", "starter", "pro", "business", "enterprise"].map((plan) => {
      const items = subscribers.filter((sub) => String(sub.plan || "trial").toLowerCase() === plan);
      const revenue = items.reduce((sum, sub) => sum + Number(sub.monthly_price || 0), 0);
      const volume = items.reduce((sum, sub) => sum + Number(sub.stats?.total_value || 0), 0);

      return {
        plan,
        items,
        revenue,
        volume,
        meta: planMeta(plan)
      };
    });
  }, [subscribers]);

  const topSubscribers = useMemo(() => {
    return [...subscribers]
      .sort((a, b) => Number(b.stats?.total_value || 0) - Number(a.stats?.total_value || 0))
      .slice(0, 5);
  }, [subscribers]);

  const alerts = useMemo(() => {
    const list = [];

    if (stats.blocked) list.push(`${stats.blocked} assinante(s) bloqueado(s)`);
    if (stats.pending) list.push(`${stats.pending} cobrança(s) pendente(s)`);
    if (stats.overdue) list.push(`${stats.overdue} inadimplente(s)`);
    if (stats.trial) list.push(`${stats.trial} trial(s) ativo(s)`);

    const noPrice = subscribers.filter((sub) => Number(sub.monthly_price || 0) === 0).length;
    if (noPrice) list.push(`${noPrice} assinante(s) sem mensalidade`);

    return list.length ? list : ["base saudável no momento"];
  }, [stats, subscribers]);

  async function copyPanelSnapshot() {
    const text = [
      "orbeauto painel interno",
      `assinantes: ${stats.total}`,
      `saudáveis: ${stats.healthy}`,
      `trial: ${stats.trial}`,
      `bloqueados: ${stats.blocked}`,
      `mrr manual: ${moneyLabel(stats.mrr, "R$ 0,00")}`,
      `orçamentos: ${stats.orders}`,
      `clientes: ${stats.customers}`,
      `volume operacional: ${moneyLabel(stats.volume, "R$ 0,00")}`
    ].join("\n");

    try {
      await navigator.clipboard.writeText(text);
    } catch {
      console.log(text);
    }
  }

  return (
    <main className="screen control-panel-screen control-panel-v115d">
      <header className="control-topbar">
        <button className="round-button ghost" onClick={goLogin}>
          <ArrowLeft size={21} />
        </button>

        <div className="control-title">
          <span>orbeauto console</span>
          <h1>painel interno</h1>
          <p>assinantes, planos, cobrança, bloqueios e operação</p>
        </div>

        <button className="round-button ghost" onClick={onLogout}>
          <LogOut size={19} />
        </button>
      </header>

      <section className="control-command panel">
        <div className="control-command-main">
          <span>status da plataforma</span>
          <strong>operacional</strong>
          <p>{stats.total} assinante(s) · {stats.blocked} bloqueado(s) · {stats.overdue} inadimplente(s)</p>
        </div>

        <div className="control-command-actions">
          <button className="secondary" onClick={onRefresh}>atualizar</button>
          <button className="secondary" onClick={copyPanelSnapshot}>copiar resumo</button>
          <button className="primary" onClick={() => setShowCreate((value) => !value)}>
            <Plus size={18} />
            novo assinante
          </button>
        </div>
      </section>

      <nav className="control-tabs real-tabs">
        {[
          ["overview", "visão geral", stats.total],
          ["subscribers", "assinantes", subscribers.length],
          ["overdue", "inadimplência", overdueSubscribers.length],
          ["plans", "planos", planRows.length]
        ].map(([key, label, count]) => (
          <button key={key} className={cx(tab === key && "active")} onClick={() => setTab(key)}>
            <span>{label}</span>
            <b>{count}</b>
          </button>
        ))}
      </nav>

      {showCreate && (
        <SubscriberCreateCard
          onCreate={async (payload) => {
            await onCreateSubscriber(payload);
            setShowCreate(false);
            setTab("subscribers");
          }}
        />
      )}

      {tab === "overview" && (
        <AdminOverviewTab
          stats={stats}
          alerts={alerts}
          topSubscribers={topSubscribers}
          onOpenSubscriber={setSelectedSubscriber}
        />
      )}

      {tab === "subscribers" && (
        <AdminSubscribersTab
          query={query}
          setQuery={setQuery}
          planFilter={planFilter}
          setPlanFilter={setPlanFilter}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          sortBy={sortBy}
          setSortBy={setSortBy}
          dense={dense}
          setDense={setDense}
          subscribers={filteredSubscribers}
          onUpdateSubscriber={onUpdateSubscriber}
          onOpenSubscriber={setSelectedSubscriber}
        />
      )}

      {tab === "overdue" && (
        <AdminBillingTab
          subscribers={overdueSubscribers}
          onUpdateSubscriber={onUpdateSubscriber}
          onOpenSubscriber={setSelectedSubscriber}
        />
      )}

      {tab === "plans" && (
        <AdminPlansTab
          rows={planRows}
          onOpenSubscriber={setSelectedSubscriber}
          onUpdateSubscriber={onUpdateSubscriber}
        />
      )}

      {selectedSubscriber && (
        <SubscriberDetailPanel
          subscriber={subscribers.find((item) => item.id === selectedSubscriber.id) || selectedSubscriber}
          onClose={() => setSelectedSubscriber(null)}
          onUpdate={onUpdateSubscriber}
          onResetOwnerPassword={onResetOwnerPassword}
          onLoadSubscriberAudit={onLoadSubscriberAudit}
        />
      )}
    </main>
  );
}

function AdminOverviewTab({ stats, alerts, topSubscribers, onOpenSubscriber }) {
  return (
    <>
      <section className="control-kpi-grid">
        <DashMetric label="assinantes" value={String(stats.total)} icon={<Building2 size={19} />} />
        <DashMetric label="saudáveis" value={String(stats.healthy)} icon={<CheckCircle2 size={19} />} tone="green" />
        <DashMetric label="bloqueados" value={String(stats.blocked)} icon={<LockKeyhole size={19} />} tone="orange" />
        <DashMetric label="mrr manual" value={moneyLabel(stats.mrr, "R$ 0,00")} icon={<ReceiptText size={19} />} tone="purple" />
      </section>

      <section className="overview-v115d-grid">
        <div className="panel overview-big-card">
          <span>volume operacional</span>
          <strong>{moneyLabel(stats.volume, "R$ 0,00")}</strong>
          <p>{stats.orders} orçamentos · {stats.customers} clientes · {stats.vehicles} veículos</p>
        </div>

        <div className="panel overview-big-card">
          <span>ticket médio mensal</span>
          <strong>{moneyLabel(stats.ticket, "R$ 0,00")}</strong>
          <p>média manual calculada por assinante cadastrado</p>
        </div>

        <div className="panel overview-alert-card">
          <span>alertas rápidos</span>
          {alerts.map((alert) => (
            <div key={alert} className="admin-alert-line">
              {alert}
            </div>
          ))}
        </div>

        <div className="panel overview-ranking-card">
          <span>top operação</span>
          {topSubscribers.length === 0 ? (
            <p>sem assinantes ainda</p>
          ) : (
            topSubscribers.map((subscriber, index) => (
              <button key={subscriber.id} onClick={() => onOpenSubscriber(subscriber)}>
                <b>{index + 1}</b>
                <span>{subscriber.trade_name || subscriber.legal_name}</span>
                <strong>{moneyLabel(subscriber.stats?.total_value || 0, "R$ 0,00")}</strong>
              </button>
            ))
          )}
        </div>
      </section>
    </>
  );
}

function AdminFilterPanel({
  query,
  setQuery,
  planFilter,
  setPlanFilter,
  statusFilter,
  setStatusFilter,
  sortBy,
  setSortBy,
  dense,
  setDense
}) {
  return (
    <section className="panel control-filter-panel">
      <label className="search-box control-search">
        <Search size={18} />
        <input
          value={query}
          placeholder="buscar por oficina, cnpj, dono, email, plano..."
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      <div className="control-filter-grid">
        <label>
          <span>plano</span>
          <select value={planFilter} onChange={(event) => setPlanFilter(event.target.value)}>
            <option value="todos">todos</option>
            <option value="trial">trial</option>
            <option value="starter">starter</option>
            <option value="pro">pro</option>
            <option value="business">business</option>
            <option value="enterprise">enterprise</option>
          </select>
        </label>

        <label>
          <span>status</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="todos">todos</option>
            <option value="saudável">saudável</option>
            <option value="trial">trial</option>
            <option value="pendente">pendente</option>
            <option value="inadimplente">inadimplente</option>
            <option value="bloqueado">bloqueado</option>
          </select>
        </label>

        <label>
          <span>ordenar</span>
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
            <option value="recentes">mais recentes</option>
            <option value="receita">maior mensalidade</option>
            <option value="volume">maior volume</option>
            <option value="orcamentos">mais orçamentos</option>
            <option value="nome">nome</option>
          </select>
        </label>

        <button className="secondary control-density" onClick={() => setDense((value) => !value)}>
          {dense ? "modo detalhado" : "modo compacto"}
        </button>
      </div>
    </section>
  );
}

function AdminSubscribersTab({
  query,
  setQuery,
  planFilter,
  setPlanFilter,
  statusFilter,
  setStatusFilter,
  sortBy,
  setSortBy,
  dense,
  setDense,
  subscribers,
  onUpdateSubscriber,
  onOpenSubscriber
}) {
  return (
    <>
      <AdminFilterPanel
        query={query}
        setQuery={setQuery}
        planFilter={planFilter}
        setPlanFilter={setPlanFilter}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        sortBy={sortBy}
        setSortBy={setSortBy}
        dense={dense}
        setDense={setDense}
      />

      <section className={cx("subscriber-list premium-subscriber-list", dense && "dense")}>
        {subscribers.map((subscriber) => (
          <SubscriberCard
            key={subscriber.id}
            subscriber={subscriber}
            dense={dense}
            onUpdate={onUpdateSubscriber}
            onOpenDetail={onOpenSubscriber}
          />
        ))}

        {subscribers.length === 0 && (
          <section className="panel empty-state">
            <Building2 size={22} />
            <strong>nenhum assinante encontrado</strong>
            <p>ajuste os filtros ou cadastre uma nova oficina.</p>
          </section>
        )}
      </section>
    </>
  );
}

function AdminBillingTab({ subscribers, onUpdateSubscriber, onOpenSubscriber }) {
  return (
    <section className="billing-console-list">
      {subscribers.length === 0 && (
        <section className="panel empty-state">
          <CheckCircle2 size={22} />
          <strong>sem inadimplência agora</strong>
          <p>nenhum assinante pendente, suspenso ou inadimplente.</p>
        </section>
      )}

      {subscribers.map((subscriber) => {
        const health = subscriberHealth(subscriber);

        return (
          <article key={subscriber.id} className="panel billing-card">
            <div>
              <span>{health.label}</span>
              <strong>{subscriber.trade_name || subscriber.legal_name}</strong>
              <p>{subscriber.locked_reason || health.description}</p>
            </div>

            <div className="billing-card-metrics">
              <b>{moneyLabel(subscriber.monthly_price || 0, "R$ 0,00")}</b>
              <small>{subscriber.due_day ? `vence dia ${subscriber.due_day}` : "sem vencimento"}</small>
            </div>

            <div className="billing-card-actions">
              <button className="secondary" onClick={() => onOpenSubscriber(subscriber)}>abrir</button>
              <button
                className="secondary"
                onClick={() => copyBillingMessage(subscriber)}
              >
                cobrar
              </button>
              <button
                className="secondary"
                onClick={() => onUpdateSubscriber(subscriber.id, {
                  active: true,
                  subscription_status: "ativo",
                  billing_status: "ok",
                  locked_reason: ""
                })}
              >
                regularizar
              </button>
              <button
                className="danger-soft"
                onClick={() => onUpdateSubscriber(subscriber.id, {
                  active: false,
                  subscription_status: "suspenso",
                  billing_status: "inadimplente",
                  locked_reason: "acesso suspenso por inadimplência"
                })}
              >
                suspender
              </button>
            </div>
          </article>
        );
      })}
    </section>
  );
}

function AdminPlansTab({ rows, onOpenSubscriber, onUpdateSubscriber }) {
  return (
    <section className="plans-real-grid">
      {rows.map((row) => (
        <article key={row.plan} className={cx("panel plan-detail-card", `plan-${row.meta.tone}`)}>
          <div className="plan-detail-head">
            <div>
              <span>{row.meta.priceHint}</span>
              <strong>{row.meta.label}</strong>
            </div>
            <b>{moneyLabel(row.revenue, "R$ 0,00")}</b>
          </div>

          <p>{row.items.length} assinante(s) · volume {moneyLabel(row.volume, "R$ 0,00")}</p>

          <div className="plan-member-list">
            {row.items.length === 0 ? (
              <small>nenhum assinante neste plano</small>
            ) : (
              row.items.map((subscriber) => (
                <button key={subscriber.id} onClick={() => onOpenSubscriber(subscriber)}>
                  <span>{subscriber.trade_name || subscriber.legal_name}</span>
                  <small>{moneyLabel(subscriber.monthly_price || 0, "R$ 0,00")}</small>
                </button>
              ))
            )}
          </div>

          {row.plan !== "trial" && row.items.length > 0 && (
            <button
              className="secondary plan-action"
              onClick={() => row.items.forEach((subscriber) => onUpdateSubscriber(subscriber.id, { plan: row.plan }))}
            >
              confirmar plano em lote
            </button>
          )}
        </article>
      ))}
    </section>
  );
}

function copyBillingMessage(subscriber) {
  const message = [
    `olá, ${subscriber.owner?.name || "tudo bem"}?`,
    "",
    `identificamos uma pendência no acesso ao orbeauto da ${subscriber.trade_name || subscriber.legal_name}.`,
    `plano: ${subscriber.plan || "trial"}`,
    `valor: ${moneyLabel(subscriber.monthly_price || 0, "R$ 0,00")}`,
    subscriber.due_day ? `vencimento: dia ${subscriber.due_day}` : "vencimento: não informado",
    "",
    "para manter o acesso ativo, por favor regularize a pendência. se já tiver feito o pagamento, pode desconsiderar esta mensagem."
  ].join("\n");

  navigator.clipboard?.writeText(message).catch(() => console.log(message));
}

function SubscriberDetailPanel({
  subscriber,
  onClose,
  onUpdate,
  onResetOwnerPassword,
  onLoadSubscriberAudit
}) {
  const [notes, setNotes] = useState(subscriber.internal_notes || "");
  const [price, setPrice] = useState(String(subscriber.monthly_price || ""));
  const [plan, setPlan] = useState(subscriber.plan || "trial");
  const [dueDay, setDueDay] = useState(String(subscriber.due_day || ""));
  const [newPassword, setNewPassword] = useState("");
  const [resetReason, setResetReason] = useState("reset manual pelo painel interno");
  const [audit, setAudit] = useState([]);
  const [loadingAudit, setLoadingAudit] = useState(false);

  const health = subscriberHealth(subscriber);
  const meta = planMeta(subscriber.plan);

  useEffect(() => {
    let alive = true;

    async function loadAudit() {
      if (!onLoadSubscriberAudit) return;

      setLoadingAudit(true);
      const rows = await onLoadSubscriberAudit(subscriber.id);

      if (alive) {
        setAudit(rows || []);
        setLoadingAudit(false);
      }
    }

    loadAudit();

    return () => {
      alive = false;
    };
  }, [subscriber.id, onLoadSubscriberAudit]);

  async function saveCommercial() {
    await onUpdate(subscriber.id, {
      plan,
      monthly_price: moneyNumber(price),
      due_day: dueDay ? Number(dueDay) : null,
      internal_notes: notes
    });
  }

  async function resetPassword() {
    await onResetOwnerPassword(subscriber.id, newPassword, resetReason);
    setNewPassword("");
  }

  return (
    <section className="detail-backdrop">
      <article className="panel subscriber-detail-panel">
        <header className="detail-head">
          <div>
            <span>detalhe do assinante</span>
            <h2>{subscriber.trade_name || subscriber.legal_name}</h2>
            <p>{subscriber.legal_name}</p>
          </div>

          <button className="round-button ghost" onClick={onClose}>×</button>
        </header>

        <div className="detail-status-row">
          <span className={cx("status-pill", `status-${health.tone}`)}>{health.label}</span>
          <span className={cx("plan-pill", `plan-${meta.tone}`)}>{meta.label}</span>
          <span>{subscriber.billing_status || "ok"}</span>
          <span>{subscriber.subscription_status || "trial"}</span>
        </div>

        <section className="detail-grid">
          <div>
            <span>cnpj</span>
            <strong>{subscriber.cnpj || "não informado"}</strong>
          </div>
          <div>
            <span>dono</span>
            <strong>{subscriber.owner?.name || "não informado"}</strong>
            <small>{subscriber.owner?.email || "sem email"}</small>
          </div>
          <div>
            <span>clientes</span>
            <strong>{subscriber.stats?.customers_count || 0}</strong>
          </div>
          <div>
            <span>orçamentos</span>
            <strong>{subscriber.stats?.orders_count || 0}</strong>
          </div>
          <div>
            <span>volume</span>
            <strong>{moneyLabel(subscriber.stats?.total_value || 0, "R$ 0,00")}</strong>
          </div>
          <div>
            <span>cadastro</span>
            <strong>{subscriberCreatedLabel(subscriber.created_at)}</strong>
          </div>
        </section>

        <section className="detail-section">
          <h3>comercial e cobrança</h3>

          <div className="subscriber-admin-row">
            <label>
              <span>plano</span>
              <select value={plan} onChange={(event) => setPlan(event.target.value)}>
                <option value="trial">trial</option>
                <option value="starter">starter</option>
                <option value="pro">pro</option>
                <option value="business">business</option>
                <option value="enterprise">enterprise</option>
              </select>
            </label>

            <label>
              <span>mensalidade</span>
              <input value={price} inputMode="decimal" onChange={(event) => setPrice(event.target.value)} />
            </label>

            <label>
              <span>vencimento</span>
              <input value={dueDay} inputMode="numeric" onChange={(event) => setDueDay(event.target.value.replace(/\D/g, "").slice(0, 2))} />
            </label>
          </div>

          <label className="subscriber-notes">
            <span>observações internas</span>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>

          <div className="detail-actions-row">
            <button className="primary" onClick={saveCommercial}>salvar alterações</button>
            <button className="secondary" onClick={() => copyBillingMessage(subscriber)}>copiar cobrança</button>
          </div>
        </section>

        <section className="detail-section">
          <h3>operações de acesso</h3>

          <div className="detail-actions-row danger-zone">
            <button
              className="secondary"
              onClick={() => onUpdate(subscriber.id, {
                active: true,
                subscription_status: "ativo",
                billing_status: "ok",
                locked_reason: ""
              })}
            >
              liberar acesso
            </button>

            <button
              className="secondary"
              onClick={() => onUpdate(subscriber.id, {
                active: true,
                subscription_status: "trial",
                billing_status: "ok",
                locked_reason: ""
              })}
            >
              colocar trial
            </button>

            <button
              className="secondary"
              onClick={() => onUpdate(subscriber.id, {
                active: true,
                subscription_status: "ativo",
                billing_status: "pendente",
                locked_reason: "pagamento pendente"
              })}
            >
              marcar pendente
            </button>

            <button
              className="danger-soft"
              onClick={() => onUpdate(subscriber.id, {
                active: false,
                subscription_status: "suspenso",
                billing_status: "inadimplente",
                locked_reason: "acesso suspenso por inadimplência"
              })}
            >
              suspender
            </button>
          </div>
        </section>

        <section className="detail-section">
          <h3>reset de senha do dono</h3>

          <div className="reset-password-grid">
            <input
              value={newPassword}
              placeholder="nova senha"
              type="password"
              onChange={(event) => setNewPassword(event.target.value)}
            />

            <input
              value={resetReason}
              placeholder="motivo"
              onChange={(event) => setResetReason(event.target.value)}
            />

            <button className="secondary" onClick={resetPassword}>
              resetar senha
            </button>
          </div>
        </section>

        <section className="detail-section">
          <h3>auditoria recente</h3>

          {loadingAudit && <p className="audit-empty">carregando auditoria...</p>}

          {!loadingAudit && audit.length === 0 && (
            <p className="audit-empty">sem registros de auditoria ainda</p>
          )}

          <div className="audit-list">
            {audit.map((row) => (
              <div key={row.id} className="audit-row">
                <strong>{row.action}</strong>
                <span>{row.admin_user} · {row.created_at ? new Date(row.created_at).toLocaleString("pt-BR") : "sem data"}</span>
                <small>{row.metadata ? JSON.stringify(row.metadata) : ""}</small>
              </div>
            ))}
          </div>
        </section>
      </article>
    </section>
  );
}

function SubscriberCreateCard({ onCreate }) {
  const [form, setForm] = useState({
    legalName: "",
    tradeName: "",
    cnpj: "",
    email: "",
    phone: "",
    address: "",
    specialty: "martelinho de ouro, funilaria e pintura",
    pix: "",
    instagram: "",
    ownerName: "",
    ownerEmail: "",
    ownerPassword: "123456"
  });

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function payload() {
    return {
      legal_name: form.legalName,
      trade_name: form.tradeName,
      cnpj: form.cnpj,
      email: form.email || null,
      phone: form.phone,
      address: form.address,
      specialty: form.specialty,
      pix: form.pix,
      instagram: form.instagram,
      owner_name: form.ownerName,
      owner_email: form.ownerEmail,
      owner_password: form.ownerPassword
    };
  }

  return (
    <section className="panel subscriber-create-card premium-create-card">
      <div className="card-heading loose">
        <div>
          <h2><span className="title-icon"><Building2 size={19} /></span>novo assinante</h2>
          <p>inclui uma oficina na base comercial da orbeauto</p>
        </div>
      </div>

      <div className="form-grid settings-grid premium-create-grid">
        <Field label="razão social *" value={form.legalName} placeholder="razão social" onChange={(value) => update("legalName", value)} />
        <Field label="nome fantasia *" value={form.tradeName} placeholder="nome fantasia" onChange={(value) => update("tradeName", value)} />
        <Field label="cnpj *" value={form.cnpj} placeholder="00.000.000/0001-00" onChange={(value) => update("cnpj", value)} />
        <Field label="email da oficina" value={form.email} placeholder="email" onChange={(value) => update("email", value)} />
        <Field label="telefone" value={form.phone} placeholder="telefone" onChange={(value) => update("phone", value)} />
        <Field label="pix" value={form.pix} placeholder="pix" onChange={(value) => update("pix", value)} />
        <Field wide label="endereço" value={form.address} placeholder="endereço" onChange={(value) => update("address", value)} />
        <Field wide label="especialidade" value={form.specialty} placeholder="especialidade" onChange={(value) => update("specialty", value)} />
        <Field wide label="instagram" value={form.instagram} placeholder="@oficina" onChange={(value) => update("instagram", value)} />
        <Field label="dono *" value={form.ownerName} placeholder="nome do dono" onChange={(value) => update("ownerName", value)} />
        <Field label="login do dono *" value={form.ownerEmail} placeholder="email de login" onChange={(value) => update("ownerEmail", value)} />
        <Field label="senha inicial *" value={form.ownerPassword} placeholder="senha" onChange={(value) => update("ownerPassword", value)} />
      </div>

      <button className="mini-action primary-mini" onClick={() => onCreate(payload())}>
        incluir assinante
      </button>
    </section>
  );
}

function SubscriberCard({ subscriber, dense, onUpdate, onOpenDetail }) {
  const [notes, setNotes] = useState(subscriber.internal_notes || "");
  const [price, setPrice] = useState(String(subscriber.monthly_price || ""));
  const [plan, setPlan] = useState(subscriber.plan || "trial");
  const [dueDay, setDueDay] = useState(String(subscriber.due_day || ""));

  const health = subscriberHealth(subscriber);
  const meta = planMeta(subscriber.plan);
  const blocked = health.tone === "danger";

  function saveCommercial() {
    onUpdate(subscriber.id, {
      plan,
      monthly_price: moneyNumber(price),
      due_day: dueDay ? Number(dueDay) : null,
      internal_notes: notes
    });
  }

  return (
    <article className={cx("panel subscriber-card premium-subscriber-card", blocked && "is-blocked", dense && "is-dense")}>
      <div className="subscriber-premium-top">
        <div className="subscriber-avatar">
          {(subscriber.trade_name || subscriber.legal_name || "?").slice(0, 2).toUpperCase()}
        </div>

        <div className="subscriber-mainline">
          <div className="subscriber-title-row">
            <strong>{subscriber.trade_name}</strong>
            <span className={cx("status-pill", `status-${health.tone}`)}>{health.label}</span>
          </div>

          <p>{subscriber.legal_name}</p>
          <small>cnpj: {subscriber.cnpj || "não informado"} · desde {subscriberCreatedLabel(subscriber.created_at)}</small>
        </div>
      </div>

      <div className="subscriber-tags">
        <span className={cx("plan-pill", `plan-${meta.tone}`)}>{meta.label}</span>
        <span>{subscriber.billing_status || "ok"}</span>
        <span>{subscriber.subscription_status || "trial"}</span>
        {subscriber.due_day && <span>vence dia {subscriber.due_day}</span>}
      </div>

      {!dense && (
        <>
          <div className="subscriber-premium-grid">
            <div>
              <span>dono</span>
              <strong>{subscriber.owner?.name || "não informado"}</strong>
              <small>{subscriber.owner?.email || "sem email"}</small>
            </div>

            <div>
              <span>mensalidade</span>
              <strong>{moneyLabel(subscriber.monthly_price || 0, "R$ 0,00")}</strong>
              <small>{meta.priceHint}</small>
            </div>

            <div>
              <span>uso</span>
              <strong>{subscriber.stats?.orders_count || 0} orçamentos</strong>
              <small>{subscriber.stats?.customers_count || 0} clientes · {subscriber.stats?.vehicles_count || 0} veículos</small>
            </div>

            <div>
              <span>volume</span>
              <strong>{moneyLabel(subscriber.stats?.total_value || 0, "R$ 0,00")}</strong>
              <small>orçamentos gerados</small>
            </div>
          </div>

          <div className="subscriber-health-box">
            <strong>{health.description}</strong>
            <p>{subscriber.locked_reason || subscriber.internal_notes || "sem observações internas relevantes por enquanto"}</p>
          </div>
        </>
      )}

      <div className="subscriber-admin-row">
        <label>
          <span>plano</span>
          <select value={plan} onChange={(event) => setPlan(event.target.value)}>
            <option value="trial">trial</option>
            <option value="starter">starter</option>
            <option value="pro">pro</option>
            <option value="business">business</option>
            <option value="enterprise">enterprise</option>
          </select>
        </label>

        <label>
          <span>mensalidade</span>
          <input value={price} placeholder="ex: 49.90" inputMode="decimal" onChange={(event) => setPrice(event.target.value)} />
        </label>

        <label>
          <span>vencimento</span>
          <input value={dueDay} placeholder="dia" inputMode="numeric" onChange={(event) => setDueDay(event.target.value.replace(/\D/g, "").slice(0, 2))} />
        </label>
      </div>

      {!dense && (
        <label className="subscriber-notes">
          <span>observações internas</span>
          <textarea value={notes} placeholder="observações internas..." onChange={(event) => setNotes(event.target.value)} />
        </label>
      )}

      <div className="subscriber-actions premium-actions">
        <button className="secondary" onClick={saveCommercial}>salvar</button>
        <button className="secondary" onClick={() => onOpenDetail(subscriber)}>abrir detalhe</button>
        <button className="secondary" onClick={() => copyBillingMessage(subscriber)}>cobrança</button>
      </div>
    </article>
  );
}


function AdminScreen({ goLogin, onCreated }) {
  const [form, setForm] = useState({
    adminSecret: "",
    legalName: "",
    tradeName: "",
    cnpj: "",
    email: "",
    phone: "",
    address: "",
    specialty: "martelinho de ouro, funilaria e pintura",
    pix: "",
    instagram: "",
    ownerName: "",
    ownerEmail: "",
    ownerPassword: "123456"
  });

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit() {
    await onCreated({
      legal_name: form.legalName,
      trade_name: form.tradeName,
      cnpj: form.cnpj,
      email: form.email || null,
      phone: form.phone,
      address: form.address,
      specialty: form.specialty,
      pix: form.pix,
      instagram: form.instagram,
      owner_name: form.ownerName,
      owner_email: form.ownerEmail,
      owner_password: form.ownerPassword
    }, form.adminSecret);
  }

  return (
    <main className="screen admin-screen">
      <header className="nav-title">
        <button className="round-button ghost" onClick={goLogin}><ArrowLeft size={21} /></button>
        <div>
          <h1>admin</h1>
          <p>cadastrar nova oficina</p>
        </div>
        <span className="nav-spacer" />
      </header>

      <section className="panel settings-card">
        <div className="card-heading loose">
          <h2><span className="title-icon"><KeyRound size={19} /></span> acesso admin</h2>
        </div>

        <Field label="admin secret" value={form.adminSecret} placeholder="chave admin" onChange={(value) => update("adminSecret", value)} />
      </section>

      <section className="panel settings-card">
        <div className="card-heading loose">
          <h2><span className="title-icon"><Building2 size={19} /></span> oficina</h2>
        </div>

        <div className="form-grid settings-grid">
          <Field label="razão social *" value={form.legalName} placeholder="razão social" onChange={(value) => update("legalName", value)} />
          <Field label="nome fantasia *" value={form.tradeName} placeholder="nome fantasia" onChange={(value) => update("tradeName", value)} />
          <Field label="cnpj *" value={form.cnpj} placeholder="00.000.000/0001-00" onChange={(value) => update("cnpj", value)} />
          <Field label="email" value={form.email} placeholder="email da oficina" onChange={(value) => update("email", value)} />
          <Field label="telefone" value={form.phone} placeholder="telefone" onChange={(value) => update("phone", value)} />
          <Field label="pix" value={form.pix} placeholder="chave pix" onChange={(value) => update("pix", value)} />
          <Field wide label="endereço" value={form.address} placeholder="endereço completo" onChange={(value) => update("address", value)} />
          <Field wide label="especialidade" value={form.specialty} placeholder="especialidade" onChange={(value) => update("specialty", value)} />
          <Field wide label="instagram" value={form.instagram} placeholder="@oficina" onChange={(value) => update("instagram", value)} />
        </div>
      </section>

      <section className="panel settings-card">
        <div className="card-heading loose">
          <h2><span className="title-icon"><User size={19} /></span> usuário dono</h2>
        </div>

        <div className="form-grid settings-grid">
          <Field label="nome *" value={form.ownerName} placeholder="nome do dono" onChange={(value) => update("ownerName", value)} />
          <Field label="email *" value={form.ownerEmail} placeholder="email de login" onChange={(value) => update("ownerEmail", value)} />
          <Field wide label="senha *" value={form.ownerPassword} placeholder="senha inicial" onChange={(value) => update("ownerPassword", value)} />
        </div>

        <button className="mini-action primary-mini" onClick={submit}>
          cadastrar oficina
        </button>
      </section>
    </main>
  );
}



function HomeScheduleBoard({
  buckets,
  openBudget,
  onScheduleBudget,
  onReceiveBudget
}) {
  const totalAgenda =
    buckets.today.length +
    buckets.upcoming.length +
    buckets.approvedWithoutSchedule.length;

  if (!totalAgenda) {
    return (
      <section className="paper-agenda-board panel paper-agenda-empty">
        <div>
          <span>agenda de entrada</span>
          <strong>nenhum veículo aprovado agendado</strong>
          <p>quando um orçamento for aprovado, ele aparece aqui para ganhar data de entrada.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="paper-agenda-board panel">
      <header className="paper-agenda-head">
        <div>
          <span>agenda de entrada</span>
          <h2>veículos agendados</h2>
          <p>o bloco de manhã: cliente, telefone, carro e valor sem caça ao tesouro.</p>
        </div>

        <div className="paper-agenda-counts">
          <b>{buckets.today.length}</b>
          <small>hoje</small>
        </div>
      </header>

      {buckets.today.length > 0 && (
        <AgendaLane
          title="chegam hoje"
          tone="today"
          items={buckets.today}
          openBudget={openBudget}
          onScheduleBudget={onScheduleBudget}
          onReceiveBudget={onReceiveBudget}
        />
      )}

      {buckets.upcoming.length > 0 && (
        <AgendaLane
          title="próximos dias"
          tone="upcoming"
          items={buckets.upcoming}
          openBudget={openBudget}
          onScheduleBudget={onScheduleBudget}
          onReceiveBudget={onReceiveBudget}
        />
      )}

      {buckets.approvedWithoutSchedule.length > 0 && (
        <AgendaLane
          title="aprovados sem agendamento"
          tone="warning"
          items={buckets.approvedWithoutSchedule}
          openBudget={openBudget}
          onScheduleBudget={onScheduleBudget}
          onReceiveBudget={onReceiveBudget}
        />
      )}
    </section>
  );
}

function AgendaLane({
  title,
  tone,
  items,
  openBudget,
  onScheduleBudget,
  onReceiveBudget
}) {
  return (
    <div className={cx("agenda-lane", `agenda-lane-${tone}`)}>
      <div className="agenda-lane-title">
        <strong>{title}</strong>
        <span>{items.length}</span>
      </div>

      <div className="agenda-card-strip">
        {items.map((order) => (
          <AgendaQuickCard
            key={order.id}
            order={order}
            openBudget={openBudget}
            onScheduleBudget={onScheduleBudget}
            onReceiveBudget={onReceiveBudget}
          />
        ))}
      </div>
    </div>
  );
}

function AgendaQuickCard({
  order,
  openBudget,
  onScheduleBudget,
  onReceiveBudget
}) {
  const hasSchedule = Boolean(order.scheduled_entry_at);
  const phone = orderCustomerPhone(order);
  const customer = orderCustomerName(order);
  const vehicle = orderVehicleLabel(order);
  const amount = orderAmountValue(order);

  async function scheduleCustom() {
    const selectedDate = await openScheduleDatePicker(order, {
      title: hasSchedule ? "remarcar entrada" : "agendar entrada",
      subtitle: hasSchedule
        ? "escolha a nova data de entrada do veículo."
        : "escolha a data em que o cliente vai levar o veículo para a oficina.",
      confirmLabel: hasSchedule ? "confirmar remarcação" : "confirmar agendamento",
      cancelLabel: "cancelar"
    });

    if (!selectedDate || !onScheduleBudget) return;

    await onScheduleBudget(order.id, {
      scheduled_entry_at: normalizeScheduleInput(selectedDate),
      scheduled_entry_note: order.scheduled_entry_note || "",
      schedule_priority: order.schedule_priority || "normal"
    });
  }

  async function scheduleQuick(offsetDays) {
    if (!onScheduleBudget) return;

    await onScheduleBudget(order.id, {
      scheduled_entry_at: quickScheduleAt(offsetDays, 9),
      scheduled_entry_note: order.scheduled_entry_note || "",
      schedule_priority: order.schedule_priority || "normal"
    });
  }

  async function receiveVehicle() {
    if (!onReceiveBudget) return;

    await onReceiveBudget(order.id);
  }

  return (
    <article className={cx("agenda-quick-card", !hasSchedule && "needs-schedule")}>
      <button className="agenda-card-main" onClick={() => openBudget(order)}>
        <span className="agenda-card-date">
          {hasSchedule ? (
            <>
              <b>{scheduleDateLabel(order.scheduled_entry_at)}</b>
              <small>{scheduleTimeLabel(order.scheduled_entry_at)}</small>
            </>
          ) : (
            <>
              <b>sem data</b>
              <small>agendar entrada</small>
            </>
          )}
        </span>

        <span className="agenda-card-info">
          <strong>{customer}</strong>
          <small>{phone || "telefone não informado"}</small>
          <em>{vehicle}</em>
        </span>

        <span className="agenda-card-value">
          {scheduleMoneyLabel(amount)}
        </span>
      </button>

      <div className="agenda-card-actions">
        {!hasSchedule && (
          <>
            <button onClick={() => scheduleQuick(0)}>hoje 9h</button>
            <button onClick={() => scheduleQuick(1)}>amanhã 9h</button>
          </>
        )}

        <button onClick={scheduleCustom}>{hasSchedule ? "remarcar" : "agendar"}</button>

        {hasSchedule && (
          <button className="arrived" onClick={receiveVehicle}>
            veículo chegou
          </button>
        )}
      </div>
    </article>
  );
}



function ProductionScreen({
  go,
  budgets,
  openBudget,
  onUpdateProduction,
  onUpdateChecklist,
  onUploadPhoto,
  onDeletePhoto,
  onScheduleBudget
}) {
  const buckets = useMemo(() => buildProductionBuckets(budgets), [budgets]);

  const total =
    buckets.agendado.length +
    buckets.recebido.length +
    buckets.em_execucao.length +
    buckets.pronto.length;

  const activeValue =
    productionValueTotal(buckets.recebido) +
    productionValueTotal(buckets.em_execucao) +
    productionValueTotal(buckets.pronto);

  const lanes = [
    ["agendado", "agendados", "entrada marcada"],
    ["recebido", "recebidos", "já estão na oficina"],
    ["em_execucao", "em execução", "serviço andando"],
    ["pronto", "prontos", "aguardando entrega"]
  ];

  return (
    <main className="screen production-screen">
      <header className="topbar">
        <button className="round-button ghost" onClick={() => go("home")} aria-label="voltar">←</button>
        <Brand compact />
        <button className="round-button ghost" onClick={() => go("home")} aria-label="início">início</button>
      </header>

      <section className="production-hero panel">
        <div>
          <span>produção da oficina</span>
          <h1>evidências do serviço</h1>
          <p>fotos de entrada, dano, execução e finalização no mesmo fluxo da oficina.</p>
        </div>

        <div className="production-hero-kpis">
          <div>
            <strong>{total}</strong>
            <small>ativos</small>
          </div>
          <div>
            <strong>{scheduleMoneyLabel(activeValue)}</strong>
            <small>em produção</small>
          </div>
        </div>
      </section>

      <section className="production-lanes">
        {lanes.map(([key, title, subtitle]) => (
          <ProductionLane
            key={key}
            stage={key}
            title={title}
            subtitle={subtitle}
            items={buckets[key]}
            openBudget={openBudget}
            onUpdateProduction={onUpdateProduction}
            onUpdateChecklist={onUpdateChecklist}
            onUploadPhoto={onUploadPhoto}
            onDeletePhoto={onDeletePhoto}
            onScheduleBudget={onScheduleBudget}
          />
        ))}
      </section>
    </main>
  );
}

function ProductionLane({
  stage,
  title,
  subtitle,
  items,
  openBudget,
  onUpdateProduction,
  onUpdateChecklist,
  onUploadPhoto,
  onDeletePhoto,
  onScheduleBudget
}) {
  return (
    <section className={cx("panel production-lane-card", `production-lane-${stage}`)}>
      <header className="production-lane-head">
        <div>
          <strong>{title}</strong>
          <span>{subtitle}</span>
        </div>
        <b>{items.length}</b>
      </header>

      <div className="production-card-list">
        {items.length === 0 && <div className="production-empty">nada aqui agora</div>}

        {items.map((order) => (
          <ProductionQuickCard
            key={order.id}
            order={order}
            openBudget={openBudget}
            onUpdateProduction={onUpdateProduction}
            onUpdateChecklist={onUpdateChecklist}
            onUploadPhoto={onUploadPhoto}
            onDeletePhoto={onDeletePhoto}
            onScheduleBudget={onScheduleBudget}
          />
        ))}
      </div>
    </section>
  );
}

function ProductionPhotoPanel({
  order,
  stage,
  onUploadPhoto,
  onDeletePhoto
}) {
  const photos = orderPhotos(order);
  const stages = photoStagesForProduction(stage);

  async function upload(stageName, event) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    await onUploadPhoto(order.id, file, stageName);
  }

  return (
    <section className="production-photo-panel">
      <header>
        <strong>fotos do serviço</strong>
        <span>{photos.length} foto{photos.length === 1 ? "" : "s"}</span>
      </header>

      <div className="production-photo-actions">
        {stages.map((stageName) => (
          <label key={stageName}>
            + {photoStageLabel(stageName)}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(event) => upload(stageName, event)}
            />
          </label>
        ))}
      </div>

      {photos.length > 0 && (
        <div className="production-photo-strip">
          {photos.slice(0, 8).map((photo) => (
            <figure key={photo.id}>
              <img src={photo.data_url} alt={`foto ${photoStageLabel(photo.stage)}`} />
              <figcaption>
                <span>{photoStageLabel(photo.stage)}</span>
                <button onClick={() => onDeletePhoto(order.id, photo.id)}>apagar</button>
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {photos.length === 0 && (
        <p>adicione fotos para registrar entrada, dano, execução e resultado final.</p>
      )}
    </section>
  );
}

function ProductionQuickCard({
  order,
  openBudget,
  onUpdateProduction,
  onUpdateChecklist,
  onUploadPhoto,
  onDeletePhoto,
  onScheduleBudget
}) {
  const stage = productionStage(order);
  const customer = orderCustomerName(order);
  const phone = orderCustomerPhone(order);
  const vehicle = orderVehicleLabel(order);
  const amount = orderAmountValue(order);
  const checklist = order.checklist || {};
  const items = operationalChecklistItems();
  const doneCount = checklistDoneCount(order);

  async function remarcate() {
    const selectedDate = await openScheduleDatePicker(order, {
      title: "remarcar entrada",
      subtitle: "escolha a nova data em que o cliente vai levar o veículo.",
      confirmLabel: "confirmar remarcação",
      cancelLabel: "cancelar"
    });

    if (!selectedDate) return;

    await onScheduleBudget(order.id, {
      scheduled_entry_at: normalizeScheduleInput(selectedDate),
      scheduled_entry_note: order.scheduled_entry_note || "",
      schedule_priority: order.schedule_priority || "normal"
    });
  }

  async function toggleChecklist(key) {
    const next = {
      ...checklist,
      [key]: !checklist[key]
    };

    await onUpdateChecklist(order.id, next);
  }

  async function finishDelivery() {
    await onUpdateProduction(order.id, "finalizado", "veículo entregue ao cliente");
    await copyOperationalMessage(order, "entregue");
  }

  return (
    <article className="production-quick-card production-quick-card-v117a">
      <button className="production-card-main" onClick={() => openBudget(order)}>
        <span className="production-date-pill">
          {order.scheduled_entry_at ? (
            <>
              <b>{scheduleDateLabel(order.scheduled_entry_at)}</b>
              <small>{scheduleTimeLabel(order.scheduled_entry_at) || "09:00"}</small>
            </>
          ) : (
            <>
              <b>sem data</b>
              <small>{productionStageLabel(stage)}</small>
            </>
          )}
        </span>

        <span className="production-info">
          <strong>{customer}</strong>
          <small>{phone || "telefone não informado"}</small>
          <em>{vehicle}</em>
        </span>

        <span className="production-value">{scheduleMoneyLabel(amount)}</span>
      </button>

      <div className="production-mini-status">
        <span>{productionStageLabel(stage)}</span>
        <b>{doneCount}/{items.length} checklist · {orderPhotos(order).length} fotos</b>
      </div>

      <ProductionPhotoPanel
        order={order}
        stage={stage}
        onUploadPhoto={onUploadPhoto}
        onDeletePhoto={onDeletePhoto}
      />

      {["recebido", "em_execucao", "pronto"].includes(stage) && (
        <div className="production-checklist">
          {items.map(([key, label]) => (
            <button
              key={key}
              className={checklist[key] ? "done" : ""}
              onClick={() => toggleChecklist(key)}
            >
              <span>{checklist[key] ? "✓" : ""}</span>
              {label}
            </button>
          ))}
        </div>
      )}

      <div className="production-message-actions">
        {stage === "agendado" && <button onClick={() => copyOperationalMessage(order, "confirmar_agendamento")}>msg agendamento</button>}
        {stage === "agendado" && <button onClick={() => copyOperationalMessage(order, "lembrar_amanha")}>msg lembrete</button>}
        {stage === "recebido" && <button onClick={() => copyOperationalMessage(order, "recebido")}>msg recebido</button>}
        {stage === "em_execucao" && <button onClick={() => copyOperationalMessage(order, "iniciado")}>msg iniciado</button>}
        {stage === "pronto" && <button onClick={() => copyOperationalMessage(order, "pronto")}>msg pronto</button>}
      </div>

      <div className="production-actions">
        {stage === "agendado" && (
          <>
            <button onClick={remarcate}>remarcar</button>
            <button onClick={() => onUpdateProduction(order.id, "recebido", "veículo chegou na oficina")}>
              veículo chegou
            </button>
          </>
        )}

        {stage === "recebido" && (
          <>
            <button onClick={() => openBudget(order)}>abrir</button>
            <button onClick={() => onUpdateProduction(order.id, "em_execucao", "serviço iniciado")}>
              iniciar serviço
            </button>
          </>
        )}

        {stage === "em_execucao" && (
          <>
            <button onClick={() => openBudget(order)}>abrir</button>
            <button onClick={() => onUpdateProduction(order.id, "pronto", "serviço pronto para entrega")}>
              marcar pronto
            </button>
          </>
        )}

        {stage === "pronto" && (
          <>
            <button onClick={() => openBudget(order)}>abrir</button>
            <button onClick={finishDelivery}>
              finalizar entrega
            </button>
          </>
        )}
      </div>
    </article>
  );
}



function DbStatusDot() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    let alive = true;

    async function check() {
      try {
        const response = await fetch("/api/health", { cache: "no-store" });
        if (alive) setOnline(response.ok);
      } catch {
        if (alive) setOnline(false);
      }
    }

    check();

    const timer = window.setInterval(check, 30000);
    const handleOnline = () => check();
    const handleOffline = () => alive && setOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return (
    <span
      className={`db-dot ${online ? "online" : "offline"}`}
      title={online ? "banco online" : "banco offline"}
      aria-label={online ? "banco online" : "banco offline"}
    />
  );
}


function AutoDraftCard({ go }) {
  const [available, setAvailable] = useState(() => hasNewBudgetAutoDraft());

  useEffect(() => {
    setAvailable(hasNewBudgetAutoDraft());
  }, []);

  if (!available) return null;

  function continueDraft() {
    go("new");
  }

  function discardDraft() {
    clearNewBudgetAutoDraft();
    setAvailable(false);
  }

  return (
    <section className="panel auto-draft-card">
      <div>
        <span>orçamento em andamento</span>
        <strong>tem um preenchimento salvo neste navegador</strong>
        <p>continue de onde parou ou descarte para começar limpo.</p>
      </div>

      <div className="auto-draft-actions">
        <button className="primary" onClick={continueDraft}>continuar preenchendo</button>
        <button className="secondary" onClick={discardDraft}>descartar</button>
      </div>
    </section>
  );
}

function Home({ go, budgets, openBudget, onDeleteBudget, workshop, user, onLogout, onScheduleBudget, onReceiveBudget }) {
  const agendaBuckets = useMemo(() => buildAgendaBuckets(budgets), [budgets]);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("todos");

  const filteredBudgets = useMemo(() => {
    const search = query.trim().toLowerCase();

    return budgets.filter((budget) => {
      const searchable = [
        budget.customer?.name,
        budget.customer?.phone,
        budget.vehicle?.brand,
        budget.vehicle?.model,
        budget.vehicle?.year,
        budget.vehicle?.plateOrChassis,
        budget.osType,
        budget.status
      ].join(" ").toLowerCase();

      const matchesSearch = !search || searchable.includes(search);
      const matchesFilter = filter === "todos" || budget.status === filter || budget.osType === filter;

      return matchesSearch && matchesFilter;
    });
  }, [budgets, query, filter]);

  return (
    <main className="screen home-screen">

      <header className="topbar">
        <Brand compact />
        <button className="round-button" onClick={onLogout} aria-label="sair">
          <LogOut size={18} />
        </button>
      </header>

      <section className="hello">
        <div className="avatar-soft"><User size={22} /></div>

        <div className="hello-copy">
          <div className="hello-title">
            <h1>olá, {user?.name?.split(" ")[0] || "oficina"}</h1>
            <span className="today-chip">{todayLabel()}</span>
          </div>

          <p className="workspace-status-line">
            <span className="workspace-chip">{workshop.name}</span>
            <DbStatusDot />
          </p>
        </div>
      </section>

            <AutoDraftCard go={go} />

      <button className="hero-action" onClick={() => go("new")}>
        <span className="hero-icon"><Plus size={30} /></span>
        <span>
          <strong>novo orçamento</strong>
          <small>criar orçamento rápido</small>
        </span>
        <ChevronRight size={25} />
      </button>

      <section className="metric-grid">
        <Metric icon={<FileText size={20} />} label="em aberto" value={budgets.filter((b) => b.status === "em aberto").length} />
        <Metric icon={<CheckCircle2 size={20} />} label="aprovados" value={budgets.filter((b) => b.status === "aprovado").length} tone="green" />
        <Metric icon={<ShieldCheck size={20} />} label="seguradora" value={budgets.filter((b) => b.osType === "seguradora").length} tone="purple" />
        <Metric icon={<Flag size={20} />} label="finalizados" value={budgets.filter((b) => b.status === "finalizado").length} tone="orange" />
        <Metric icon={<Users size={20} />} label="clientes" value={new Set(budgets.map((b) => b.customer?.name)).size} />
        <Metric icon={<Zap size={20} />} label="produção" value="" muted onClick={() => go("production")} />
      </section>

      <section className="panel search-panel">
        <label className="search-box">
          <Search size={18} />
          <input value={query} placeholder="buscar por cliente, placa ou telefone" onChange={(event) => setQuery(event.target.value)} />
        </label>

        <div className="filter-row">
          <Filter size={15} />
          {FILTER_OPTIONS.map((item) => (
            <button key={item.id} className={filter === item.id ? "active" : ""} onClick={() => setFilter(item.id)}>
              {item.label}
            </button>
          ))}
        </div>
      </section>

      
      <HomeScheduleBoard
        buckets={agendaBuckets}
        openBudget={openBudget}
        onScheduleBudget={onScheduleBudget}
        onReceiveBudget={onReceiveBudget}
      />
<section className="panel">
        <div className="card-heading">
          <h2>orçamentos recentes</h2>
          <span className="recent-clean-spacer" />
        </div>

        <div className="recent-list">
          {filteredBudgets.slice(0, 8).map((item) => (
            <div className="recent-item recent-item-div" key={item.id} role="button" tabIndex={0} onClick={() => openBudget(item)}>
              <div className="car-badge"><Car size={19} /></div>

              <div className="recent-copy">
                <strong>{item.customer.name}</strong>
                <span>{budgetVehicleTitle(item)}</span>
                <small>orç. #{item.id} · {timeLabel(item.createdAt)}</small>
              </div>

              <div className="recent-right">
                <span className={cx("status-pill", item.status.replace(" ", "-"))}>{item.status}</span>
                <strong>{moneyLabel(item.payment.amount)}</strong>
              </div>

              <button
                className="quick-delete"
                onClick={(event) => {
                  event.stopPropagation();
                  onDeleteBudget(item);
                }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}

          {filteredBudgets.length === 0 && (
            <div className="empty-state">
              <Search size={21} />
              <strong>nenhum orçamento ainda</strong>
              <p>cria o primeiro orçamento real dessa oficina.</p>
            </div>
          )}
        </div>
      </section>

      <section className="stats-card">
        <div>
          <span>hoje</span>
          <strong>{budgets.filter((b) => timeLabel(b.createdAt).startsWith("hoje")).length || 0}</strong>
          <small>orçamentos</small>
        </div>
        <div>
          <span>mês</span>
          <strong>{budgets.length}</strong>
          <small>orçamentos</small>
        </div>
        <div>
          <span>aprovação</span>
          <strong>{budgets.length ? Math.round((budgets.filter((b) => b.status === "aprovado").length / budgets.length) * 100) : 0}%</strong>
          <small>mês atual</small>
        </div>
      </section>

      <BottomNav go={go} active="home" />
    </main>
  );
}

function Metric({ icon, label, value, tone, muted, onClick }) {
  return (
    <button className={cx("metric", tone && `tone-${tone}`, muted && "metric-muted")} onClick={onClick}>
      <span>{icon}</span>
      <div>
        <p>{label}</p>
        {value !== "" && <strong>{value}</strong>}
      </div>
    </button>
  );
}


const NEW_BUDGET_AUTODRAFT_KEY = "orbeauto:new-budget:auto-draft:v1";
const NEW_BUDGET_AUTOOPEN_KEY = "orbeauto:new-budget:auto-open:v1";

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function formatPhoneInput(value) {
  const digits = onlyDigits(value).slice(0, 11);

  if (!digits) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;

  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function formatCpfInput(value) {
  const digits = onlyDigits(value).slice(0, 11);

  if (!digits) return "";
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;

  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function formatCurrencyInput(value) {
  const raw = String(value || "").replace(/[^\d,.]/g, "").replace(/\./g, ",");

  if (!raw) return "";

  const hasComma = raw.includes(",");
  const [integerPart, ...decimalParts] = raw.split(",");
  const integer = integerPart.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
  const decimals = decimalParts.join("").replace(/\D/g, "").slice(0, 2);

  if (hasComma) {
    return `${integer || "0"},${decimals}`;
  }

  return integer;
}


function loadNewBudgetAutoDraft() {
  try {
    const raw = window.localStorage.getItem(NEW_BUDGET_AUTODRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function loadNewBudgetAutoOpen() {
  try {
    return window.localStorage.getItem(NEW_BUDGET_AUTOOPEN_KEY) || "cliente";
  } catch {
    return "cliente";
  }
}

function hasNewBudgetAutoDraft() {
  try {
    const raw = window.localStorage.getItem(NEW_BUDGET_AUTODRAFT_KEY);
    if (!raw) return false;
    return hasMeaningfulNewBudgetDraft(JSON.parse(raw));
  } catch {
    return false;
  }
}

function safeDraftForLocalStorage(draft) {
  const safePhotos = Array.isArray(draft.photos)
    ? draft.photos.map((photo) => ({
        id: photo.id,
        label: photo.label,
        src: photo.src || photo.url || photo.data_url || "",
        local: true
      }))
    : [];

  const fullDraft = { ...draft, photos: safePhotos };

  try {
    if (JSON.stringify(fullDraft).length < 2800000) {
      return fullDraft;
    }
  } catch {
    // cai para versão sem fotos
  }

  return { ...draft, photos: [] };
}


function hasMeaningfulNewBudgetDraft(draft) {
  if (!draft) return false;

  const fields = [
    draft.customer?.name,
    draft.customer?.phone,
    draft.customer?.cpf,
    draft.customer?.email,
    draft.customer?.address,
    draft.vehicle?.brand,
    draft.vehicle?.model,
    draft.vehicle?.year,
    draft.vehicle?.color,
    draft.vehicle?.plateOrChassis,
    draft.insurance?.company,
    draft.insurance?.serviceOrder,
    draft.insurance?.contact,
    draft.damageDescription,
    draft.serviceDescription,
    draft.payment?.amount,
    draft.payment?.method,
    draft.payment?.installments
  ];

  const hasText = fields.some((value) => String(value || "").trim().length > 0);
  const hasPhotos = Array.isArray(draft.photos) && draft.photos.length > 0;
  const hasDamage = Array.isArray(draft.damageTypes) && draft.damageTypes.some((item) => item && item !== "amassado");

  return hasText || hasPhotos || hasDamage || draft.osType === "seguradora";
}

function saveNewBudgetAutoDraft(draft, open) {
  if (!hasMeaningfulNewBudgetDraft(draft)) {
    clearNewBudgetAutoDraft();
    return;
  }

  try {
    window.localStorage.setItem(NEW_BUDGET_AUTODRAFT_KEY, JSON.stringify(safeDraftForLocalStorage(draft)));
    window.localStorage.setItem(NEW_BUDGET_AUTOOPEN_KEY, open || "cliente");
  } catch {
    try {
      window.localStorage.setItem(NEW_BUDGET_AUTODRAFT_KEY, JSON.stringify({ ...draft, photos: [] }));
      window.localStorage.setItem(NEW_BUDGET_AUTOOPEN_KEY, open || "cliente");
    } catch {
      // sem espaço local, não quebra o orçamento
    }
  }
}

function clearNewBudgetAutoDraft() {
  try {
    window.localStorage.removeItem(NEW_BUDGET_AUTODRAFT_KEY);
    window.localStorage.removeItem(NEW_BUDGET_AUTOOPEN_KEY);
  } catch {
    // nada
  }
}



function ReadyBudget({
  go,
  budget,
  workshop,
  token,
  onWhatsapp,
  onEmail,
  onPrint,
  onDelete,
  onEdit,
  onStatusChange,
  onScheduleBudget,
  onProductionChange,
  onCopyReport
}) {
  useEffect(() => {
    clearNewBudgetAutoDraft();
  }, [budget?.id]);

  useEffect(() => {
    if (!token) return;

    let active = true;

    api("/fiscal/status", { token })
      .then((data) => {
        if (!active) return;
        setFiscalEnabled(Boolean(data?.enabled));
      })
      .catch(() => {
        if (!active) return;
        setFiscalEnabled(false);
      });

    return () => {
      active = false;
    };
  }, [token]);

  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [scheduleValue, setScheduleValue] = useState(() => toLocalDateTimeInput(budget?.scheduled_entry_at));
  const [scheduleNote, setScheduleNote] = useState(budget?.scheduled_entry_note || "");
  const [actionLoading, setActionLoading] = useState("");
  const [afterOpen, setAfterOpen] = useState(false);
  const [afterDraftPhotos, setAfterDraftPhotos] = useState([]);
  const [localAfterPhotos, setLocalAfterPhotos] = useState([]);
  const [localDeletedPhotoIds, setLocalDeletedPhotoIds] = useState([]);
  const [localFinalized, setLocalFinalized] = useState(false);
  const [afterPhotoSlot, setAfterPhotoSlot] = useState(0);
  const [afterMode, setAfterMode] = useState("finalize");
  const [gallery, setGallery] = useState(null);
  const [fiscalEnabled, setFiscalEnabled] = useState(false);
  const [fiscalOpen, setFiscalOpen] = useState(false);
  const [fiscalStep, setFiscalStep] = useState(1);
  const [fiscalDraft, setFiscalDraft] = useState(null);
  const [fiscalLoading, setFiscalLoading] = useState(false);
  const [fiscalMessage, setFiscalMessage] = useState("");
  const afterFileInputRef = useRef(null);

  if (!budget) {
    return (
      <main className="screen ready-v2-screen">
        <section className="panel ready-v2-shell">
          <Brand compact />
          <h1>orçamento não encontrado</h1>
          <p>volte para a home e tente abrir novamente.</p>
          <button className="ready-v2-command-btn primary" onClick={() => go("home")}>voltar para home</button>
        </section>
      </main>
    );
  }

  function parseMoney(value) {
    if (typeof value === "number") return value;

    const clean = String(value || "0").replace(/[^\d,.-]/g, "");
    const normalized = clean.includes(",")
      ? clean.replace(/\./g, "").replace(",", ".")
      : clean;

    const number = Number(normalized);
    return Number.isFinite(number) ? number : 0;
  }

  function toLocalDateTimeInput(value) {
    if (!value) return "";

    try {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "";

      const pad = (item) => String(item).padStart(2, "0");

      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    } catch {
      return "";
    }
  }

  function toIsoFromLocal(value) {
    if (!value) return null;

    try {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return null;
      return date.toISOString();
    } catch {
      return null;
    }
  }

  function formatDateTime(value) {
    if (!value) return "sem agenda";

    try {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "sem agenda";

      return date.toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch {
      return "sem agenda";
    }
  }

  async function runAction(name, action) {
    if (!action || actionLoading) return;

    try {
      setActionLoading(name);
      await action();
    } finally {
      setActionLoading("");
    }
  }

  async function changeProductionStatus(status) {
    if (onProductionChange) {
      return await onProductionChange(budget.id, status, "");
    }

    return await api(`/orders/${budget.id}/production`, {
      method: "PATCH",
      token,
      body: {
        production_status: status,
        production_notes: budget.production_notes || ""
      }
    });
  }

  async function saveSchedule() {
    const scheduledAt = toIsoFromLocal(scheduleValue);

    if (!scheduledAt) {
      window.alert("escolha data e hora de entrada");
      return;
    }

    await runAction("agenda", () => onScheduleBudget?.(budget.id, {
      scheduled_entry_at: scheduledAt,
      scheduled_entry_note: scheduleNote || "",
      schedule_priority: "normal"
    }));

    setScheduleOpen(false);
  }

  function pickAfterPhoto(slot) {
    setAfterPhotoSlot(slot);
    afterFileInputRef.current?.click();
  }

  function handleAfterPhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      setAfterDraftPhotos((current) => [
        ...current.filter((photo) => photo.slot !== afterPhotoSlot),
        {
          id: `after-${afterPhotoSlot}-${Date.now()}`,
          slot: afterPhotoSlot,
          src: reader.result,
          file,
          local: true
        }
      ]);
    };

    reader.readAsDataURL(file);
    event.target.value = "";
  }

  function removeAfterPhoto(slot) {
    setAfterDraftPhotos((current) => current.filter((photo) => photo.slot !== slot));
  }

    async function uploadAfterPhotos() {
    const uploaded = [];

    for (const photo of afterDraftPhotos.filter((item) => item.file)) {
      const formData = new FormData();
      formData.append("file", photo.file);

      const savedPhoto = await api(`/orders/${budget.id}/photos?label=after`, {
        method: "POST",
        token,
        body: formData
      });

      uploaded.push(normalizePhoto(savedPhoto));
    }

    return uploaded;
  }


    async function saveAfterPhotosOnly() {
    await runAction("fotos", async () => {
      const uploaded = await uploadAfterPhotos();

      if (uploaded.length) {
        setLocalAfterPhotos((current) => normalizePhotos([...current, ...uploaded]));
      }

      setAfterDraftPhotos([]);
      setAfterOpen(false);
    });
  }

  async function finalizeBudgetWithPhotos() {
    await runAction("finalizar", async () => {
      const uploaded = await uploadAfterPhotos();
      await changeProductionStatus("finalizado");

      if (uploaded.length) {
        setLocalAfterPhotos((current) => normalizePhotos([...current, ...uploaded]));
      }

      setLocalFinalized(true);
      setAfterDraftPhotos([]);
      setAfterOpen(false);
    });
  }


    async function finalizeBudgetWithoutPhotos() {
    const confirmed = window.confirm("finalizar sem fotos do serviço executado?");

    if (!confirmed) return;

    await runAction("finalizar", async () => {
      await changeProductionStatus("finalizado");
      setLocalFinalized(true);
      setAfterDraftPhotos([]);
      setAfterOpen(false);
    });
  }


  const photos = normalizePhotos([...(budget.photos || []), ...localAfterPhotos])
    .filter((photo) => !localDeletedPhotoIds.includes(photo.id));
  const beforePhotos = photos.filter((photo) => normalizePhotoStage(photo.stage || photo.label) === "before");
  const afterPhotos = photos.filter((photo) => normalizePhotoStage(photo.stage || photo.label) === "after");
  const documentPhotos = photos.filter((photo) => normalizePhotoStage(photo.stage || photo.label) === "vehicle_document");
  const rearPlatePhotos = photos.filter((photo) => normalizePhotoStage(photo.stage || photo.label) === "rear_plate");

  const customer = budget.customer || {};
  const vehicle = budget.vehicle || {};
  const insurance = budget.insurance || {};
  const payment = budget.payment || {};

  const rawOrderStatus = String(budget.status || "em aberto").toLowerCase();
  const rawProductionStatus = String(budget.production_status || "orcamento").toLowerCase();
  const orderStatus = localFinalized ? "finalizado" : rawOrderStatus;
  const productionStatus = localFinalized ? "finalizado" : rawProductionStatus;

  const amount = parseMoney(payment.amount ?? budget.amount ?? 0);
  const amountLabel = amount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const vehicleLabel = [vehicle.brand, vehicle.model].filter(Boolean).join(" ") || "veículo não informado";
  const plateLabel =
    vehicle.plateOrChassis ||
    vehicle.plate_or_chassis ||
    vehicle.plate ||
    vehicle.license_plate ||
    vehicle.chassis ||
    "sem placa/chassi";
  const isInsurance = budget.os_type === "seguradora";
  const canApprove = !["aprovado", "finalizado", "cancelado"].includes(orderStatus);
  const canReceive = !["finalizado", "cancelado"].includes(orderStatus) && productionStatus !== "recebido" && productionStatus !== "finalizado";
  const isFinalized = orderStatus === "finalizado" || productionStatus === "finalizado";

  const statusLabels = {
    "rascunho": "rascunho",
    "em aberto": "em aberto",
    "aprovado": "aprovado",
    "cancelado": "cancelado",
    "finalizado": "finalizado"
  };

  const productionLabels = {
    "orcamento": "orçamento",
    "enviado": "enviado",
    "aprovado": "aprovado",
    "agendado": "agendado",
    "recebido": "veículo recebido",
    "em_execucao": "em execução",
    "pronto": "pronto",
    "finalizado": "finalizado",
    "cancelado": "cancelado"
  };

  const fileGroups = [
    { key: "document", icon: "📄", title: "documento do veículo", items: documentPhotos, empty: "documento pendente" },
    { key: "rear_plate", icon: "🔢", title: "placa traseira", items: rearPlatePhotos, empty: "placa pendente" },
    { key: "before", icon: "📷", title: "fotos do antes", items: beforePhotos, empty: "sem fotos do antes" },
    { key: "after", icon: "✅", title: "fotos do depois", items: afterPhotos, empty: "sem fotos do depois" }
  ];

  function openGallery(groupKey) {
    const selected = fileGroups.find((group) => group.key === groupKey);
    if (!selected) return;
    setGallery(selected);
  }

  function openAfterUploader(mode = "add") {
    setAfterMode(mode);
    setAfterDraftPhotos([]);
    setAfterOpen(true);
  }

  async function removePhoto(photo) {
    if (!photo?.id) return;

    const confirmed = window.confirm("remover este arquivo do orçamento?");

    if (!confirmed) return;

    await runAction("arquivo", async () => {
      await api(`/photos/${photo.id}`, {
        method: "DELETE",
        token
      });

      setLocalDeletedPhotoIds((current) => Array.from(new Set([...current, photo.id])));
      setLocalAfterPhotos((current) => current.filter((item) => item.id !== photo.id));

      if (gallery) {
        setGallery({
          ...gallery,
          items: gallery.items.filter((item) => item.id !== photo.id)
        });
      }
    });
  }

  function closeFiscalWizard() {
    if (fiscalLoading) return;

    setFiscalOpen(false);
    setFiscalStep(1);
    setFiscalMessage("");
  }

  function fiscalPersonLabel(type) {
    return type === "juridica" ? "pessoa jurídica" : "pessoa física";
  }

  function fiscalTakerName(taker) {
    if (!taker) return "";
    return taker.legal_name || taker.name || "";
  }

  function fiscalTaxLabel(taker) {
    if (!taker) return "";
    return taker.tax_id || "";
  }

  function updateFiscal(section, field, value) {
    setFiscalDraft((current) => ({
      ...(current || {}),
      [section]: {
        ...((current || {})[section] || {}),
        [field]: value
      }
    }));

    if (fiscalMessage) setFiscalMessage("");
  }

  function fiscalDraftWithDefaults(raw) {
    const taker = raw?.taker || {};
    const service = raw?.service || {};
    const values = raw?.values || {};
    const settings = raw?.settings || {};

    return {
      ...raw,
      taker: {
        person_type: taker.person_type || "fisica",
        name: taker.name || "",
        legal_name: taker.legal_name || taker.name || "",
        tax_id: taker.tax_id || "",
        municipal_registration: taker.municipal_registration || "",
        email: taker.email || "",
        phone: taker.phone || "",
        address: taker.address || "",
        number: taker.number || "",
        district: taker.district || "",
        city: taker.city || "",
        state: taker.state || "",
        zip_code: taker.zip_code || "",
        country: taker.country || "Brasil"
      },
      service: {
        description: service.description || "",
        service_code: service.service_code || settings.service_code || "",
        cnae: service.cnae || settings.cnae || "",
        activity_description: service.activity_description || settings.activity_description || ""
      },
      values: {
        service_amount: values.service_amount ?? amount,
        deductions: values.deductions ?? 0,
        discount_unconditional: values.discount_unconditional ?? 0,
        discount_conditional: values.discount_conditional ?? 0,
        other_withholdings: values.other_withholdings ?? 0,
        iss_withheld: Boolean(values.iss_withheld)
      },
      settings
    };
  }

  async function openFiscalWizard() {
    if (!fiscalEnabled || fiscalLoading) return;

    try {
      setFiscalOpen(true);
      setFiscalStep(1);
      setFiscalLoading(true);
      setFiscalMessage("");

      const draft = await api(`/orders/${budget.id}/fiscal-draft`, { token });

      setFiscalDraft(fiscalDraftWithDefaults(draft));
    } catch (error) {
      setFiscalMessage(error.message || "erro ao preparar rascunho fiscal");
    } finally {
      setFiscalLoading(false);
    }
  }

  function validateFiscalDraft() {
    const taker = fiscalDraft?.taker || {};
    const service = fiscalDraft?.service || {};
    const values = fiscalDraft?.values || {};

    const takerName = fiscalTakerName(taker);

    if (!String(takerName || "").trim()) {
      return "informe o nome ou razão social do tomador";
    }

    if (!String(taker.tax_id || "").trim()) {
      return "informe o CPF ou CNPJ do tomador";
    }

    if (!String(service.description || "").trim()) {
      return "escreva a discriminação fiscal";
    }

    if (!Number(values.service_amount || 0)) {
      return "informe o valor do rascunho";
    }

    return "";
  }

  async function downloadFiscalDraftXml() {
    if (!fiscalEnabled || fiscalLoading) return;

    try {
      setFiscalLoading(true);
      setFiscalMessage("");

      const response = await fetch(`${API_BASE}/orders/${budget.id}/fiscal-draft/xml`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        let message = "erro ao baixar XML fiscal";

        try {
          const data = await response.json();
          message = apiErrorMessage(data, message);
        } catch {
          message = await response.text() || message;
        }

        throw new Error(message);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = `nfse-rascunho-${budget.id}.xml`;
      document.body.appendChild(link);
      link.click();
      link.remove();

      window.setTimeout(() => URL.revokeObjectURL(url), 3000);
    } catch (error) {
      setFiscalMessage(error.message || "erro ao baixar XML fiscal");
      setFiscalOpen(true);
      setFiscalStep(3);
    } finally {
      setFiscalLoading(false);
    }
  }

  async function saveFiscalDraft() {
    const error = validateFiscalDraft();

    if (error) {
      setFiscalMessage(error);
      setFiscalStep(error.includes("discriminação") || error.includes("valor") ? 2 : 1);
      return;
    }

    try {
      setFiscalLoading(true);
      setFiscalMessage("");

      const saved = await api(`/orders/${budget.id}/fiscal-draft`, {
        method: "POST",
        token,
        body: {
          taker: fiscalDraft.taker,
          service: fiscalDraft.service,
          values: fiscalDraft.values,
          settings: fiscalDraft.settings || {},
          status: "pendente_emissao_giss"
        }
      });

      setFiscalDraft(fiscalDraftWithDefaults(saved));
      setFiscalOpen(false);
      setFiscalStep(1);
      setFiscalMessage("");
    } catch (error) {
      setFiscalMessage(error.message || "erro ao salvar rascunho fiscal");
    } finally {
      setFiscalLoading(false);
    }
  }

  const afterSlots = [0, 1, 2, 3, 4, 5];

  function afterPhotoBySlot(slot) {
    return afterDraftPhotos.find((photo) => photo.slot === slot);
  }

  function renderInfoCard(icon, label, value, detail, variant = "") {
    return (
      <div className={cx("ready-v2-info-card", variant && `ready-v2-info-${variant}`)}>
        <div className="ready-v2-info-icon">{icon}</div>
        <div>
          <span>{label}</span>
          <strong title={String(value || "")}>{value}</strong>
          {detail && <p>{detail}</p>}
        </div>
      </div>
    );
  }

  function renderFileGroup(icon, title, items, emptyText, groupKey) {
    return (
      <div className="ready-v2-file-card ready-v2-file-card-pro">
        <button type="button" className="ready-v2-file-main" onClick={() => openGallery(groupKey)}>
          <div className="ready-v2-file-icon">{icon}</div>

          <div>
            <strong>{title}</strong>
            <span>{items.length ? `${items.length} arquivo${items.length === 1 ? "" : "s"}` : emptyText}</span>
          </div>
        </button>

        {items.length > 0 ? (
          <div className="ready-v2-file-preview">
            {items.slice(0, 3).map((photo, index) => {
              const src = photo.url || photo.src || photo.data_url;

              return (
                <button
                  key={photo.id || `${title}-${index}`}
                  type="button"
                  onClick={() => openGallery(groupKey)}
                >
                  <img src={src} alt={`${title} ${index + 1}`} />
                </button>
              );
            })}

            <button type="button" className="ready-v2-file-open" onClick={() => openGallery(groupKey)}>
              abrir
            </button>
          </div>
        ) : (
          <span className="ready-v2-pending">pendente</span>
        )}
      </div>
    );
  }


  return (
    <main className="screen ready-v2-screen">
      <section className="panel ready-v2-hero">
        <div className="ready-v2-topbar">
          <Brand compact />

          <div className="ready-v2-status-row">
            <span className={`ready-v2-status ${orderStatus.replace(/\s/g, "-")}`}>
              {statusLabels[orderStatus] || orderStatus}
            </span>

            <span className={`ready-v2-status production ${productionStatus}`}>
              {productionLabels[productionStatus] || productionStatus}
            </span>
          </div>
        </div>

        <div className="ready-v2-title-block">
          <span>orçamento #{budget.id}</span>
          <h1 title={customer.name || "cliente não informado"}>{customer.name || "cliente não informado"}</h1>
          <p>{vehicleLabel} · {plateLabel}</p>
        </div>

        <div className="ready-v2-value-block">
          <span>valor do serviço</span>
          <strong>{amountLabel}</strong>
          <p>{payment.method || "forma não informada"} · {payment.condition || "condição não informada"}</p>
        </div>

        <div className="ready-v2-command-card">
          <div className="ready-v2-section-title">
            <span>comandos</span>
            <h2>painel do orçamento</h2>
          </div>

          <div className="ready-v2-command-grid">
            {!isFinalized && (
            <button className="ready-v2-command-btn soft" onClick={() => setScheduleOpen((value) => !value)}>
              reagendar
            </button>
            )}

            <button className="ready-v2-command-btn soft" onClick={() => onEdit?.(budget)}>
              editar
            </button>

            {canApprove && (
            <button
              className="ready-v2-command-btn primary"
              disabled={!canApprove || actionLoading}
              onClick={() => runAction("aprovar", () => onStatusChange?.(budget, "aprovado"))}
            >
              aprovar
            </button>
            )}

            {orderStatus === "aprovado" && canReceive && (
            <button
              className="ready-v2-command-btn soft"
              disabled={!canReceive || actionLoading}
              onClick={() => runAction("receber", () => changeProductionStatus("recebido"))}
            >
              receber veículo
            </button>
            )}

            {!isFinalized && (
            <button
              className="ready-v2-command-btn dark"
              disabled={isFinalized || actionLoading}
              onClick={() => openAfterUploader("finalize")}
            >
              finalizar
            </button>
            )}

            {fiscalEnabled && isFinalized && (
              <>
                <button
                  className="ready-v2-command-btn fiscal"
                  disabled={fiscalLoading}
                  onClick={openFiscalWizard}
                >
                  preparar rascunho fiscal
                </button>


              </>
            )}
          </div>

          {scheduleOpen && (
            <div className="ready-v2-schedule-box">
              <input
                type="datetime-local"
                value={scheduleValue}
                onChange={(event) => setScheduleValue(event.target.value)}
              />

              <input
                value={scheduleNote}
                onChange={(event) => setScheduleNote(event.target.value)}
                placeholder="observação da entrada"
              />

              <button className="ready-v2-command-btn primary" onClick={saveSchedule} disabled={actionLoading}>
                salvar agenda
              </button>
            </div>
          )}

          {actionLoading && <p className="ready-v2-loading">atualizando {actionLoading}...</p>}
        </div>
      </section>

      <section className="panel ready-v2-card">
        <div className="ready-v2-section-title">
          <span>atendimento</span>
          <h2>dados principais</h2>
        </div>

        <div className="ready-v2-info-grid">
          {renderInfoCard("👤", "cliente", customer.name || "não informado", customer.phone || "sem telefone", "customer")}
          {renderInfoCard("🚗", "veículo", vehicleLabel, plateLabel, "vehicle")}

          {isInsurance ? (
            <>
              {renderInfoCard("🛡️", "seguradora", insurance.company || "não informada", insurance.contact ? `responsável: ${insurance.contact}` : "responsável não informado", "insurance")}
              {renderInfoCard("📌", "os/atendimento", insurance.service_order || "não informado", "número para lançamento na seguradora", "insurance")}
            </>
          ) : (
            renderInfoCard("🧾", "tipo", "particular", "cliente particular", "type")
          )}

          {renderInfoCard("📅", "agenda", formatDateTime(budget.scheduled_entry_at), budget.scheduled_entry_note || "sem observação", "schedule")}
          {renderInfoCard("💳", "pagamento", amountLabel, payment.method || "forma não informada", "payment")}
        </div>
      </section>

      <section className="panel ready-v2-card">
        <div className="ready-v2-section-title">
          <span>envio</span>
          <h2>ações do orçamento</h2>
        </div>

        <div className="ready-v2-actions-grid">
          <button className="ready-v2-action-btn" onClick={() => onWhatsapp?.(budget)}>whatsapp</button>
          <button className="ready-v2-action-btn" onClick={() => onEmail?.(budget)}>email</button>
          <button className="ready-v2-action-btn" onClick={() => onPrint?.(budget)}>pdf/imprimir</button>
          <button className="ready-v2-action-btn danger" onClick={() => onDelete?.(budget)}>excluir orçamento</button>
        </div>
      </section>

      <section className="panel ready-v2-card">
        <div className="ready-v2-section-title">
          <span>arquivos</span>
          <h2>fotos e documentos</h2>
        </div>

        <div className="ready-v2-files-tools">
          <button type="button" className="ready-v2-file-tool" onClick={() => openAfterUploader("add")}>
            adicionar fotos do depois
          </button>
        </div>

        <div className="ready-v2-files-grid">
          {fileGroups.map((group) => (
            <div key={group.key}>
              {renderFileGroup(group.icon, group.title, group.items, group.empty, group.key)}
            </div>
          ))}
        </div>
      </section>

      {afterOpen && (
        <div className="ready-v2-after-backdrop">
          <section className="ready-v2-after-modal">
            <div className="ready-v2-after-head">
              <div>
                <span>{afterMode === "finalize" ? "finalização" : "arquivos"}</span>
                <h2>fotos do serviço executado</h2>
                <p>{afterMode === "finalize" ? "adicione até 6 fotos do depois antes de finalizar." : "adicione novas fotos do depois ao orçamento."}</p>
              </div>

              <button onClick={() => setAfterOpen(false)} disabled={actionLoading}>fechar</button>
            </div>

            <input
              ref={afterFileInputRef}
              hidden
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleAfterPhoto}
            />

            <div className="ready-v2-after-grid">
              {afterSlots.map((slot) => {
                const photo = afterPhotoBySlot(slot);

                return (
                  <button
                    key={slot}
                    type="button"
                    className={`ready-v2-after-slot ${photo ? "has-photo" : ""}`}
                    onClick={() => pickAfterPhoto(slot)}
                  >
                    {photo ? (
                      <>
                        <img src={photo.src} alt={`foto do depois ${slot + 1}`} />
                        <span>trocar</span>
                        <i
                          onClick={(event) => {
                            event.stopPropagation();
                            removeAfterPhoto(slot);
                          }}
                        >
                          remover
                        </i>
                      </>
                    ) : (
                      <>
                        <b>+</b>
                        <span>foto {slot + 1}</span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="ready-v2-after-actions">
              {afterMode === "finalize" ? (
                <>
                  <button className="ready-v2-command-btn soft" onClick={finalizeBudgetWithoutPhotos} disabled={actionLoading}>
                    finalizar sem fotos
                  </button>

                  <button className="ready-v2-command-btn primary" onClick={finalizeBudgetWithPhotos} disabled={actionLoading}>
                    salvar fotos e finalizar
                  </button>
                </>
              ) : (
                <>
                  <button className="ready-v2-command-btn soft" onClick={() => setAfterOpen(false)} disabled={actionLoading}>
                    cancelar
                  </button>

                  <button className="ready-v2-command-btn primary" onClick={saveAfterPhotosOnly} disabled={actionLoading || afterDraftPhotos.length === 0}>
                    salvar fotos
                  </button>
                </>
              )}
            </div>
          </section>
        </div>
      )}

      {fiscalOpen && (
        <div className="ready-v2-fiscal-backdrop">
          <section className="ready-v2-fiscal-modal">
            <div className="ready-v2-fiscal-head">
              <div>
                <span>nota fiscal</span>
                <h2>rascunho fiscal NFS-e</h2>
                <p>preencha só o necessário. os dados técnicos da oficina ficam salvos por trás.</p>
              </div>

              <button type="button" onClick={closeFiscalWizard} disabled={fiscalLoading}>fechar</button>
            </div>

            {fiscalLoading && !fiscalDraft ? (
              <div className="ready-v2-fiscal-loading">preparando rascunho fiscal...</div>
            ) : fiscalDraft ? (
              <>
                <div className="ready-v2-fiscal-steps">
                  <button type="button" className={fiscalStep === 1 ? "active" : ""} onClick={() => setFiscalStep(1)}>1. tomador</button>
                  <button type="button" className={fiscalStep === 2 ? "active" : ""} onClick={() => setFiscalStep(2)}>2. serviço</button>
                  <button type="button" className={fiscalStep === 3 ? "active" : ""} onClick={() => setFiscalStep(3)}>3. revisar</button>
                </div>

                {fiscalStep === 1 && (
                  <div className="ready-v2-fiscal-panel">
                    <h3>dados do tomador</h3>
                    <p>é quem vai receber a NFS-e quando a emissão automática for liberada. pode ser pessoa física ou empresa.</p>

                    <div className="ready-v2-fiscal-type">
                      <button
                        type="button"
                        className={fiscalDraft.taker.person_type === "fisica" ? "active" : ""}
                        onClick={() => updateFiscal("taker", "person_type", "fisica")}
                      >
                        pessoa física
                      </button>

                      <button
                        type="button"
                        className={fiscalDraft.taker.person_type === "juridica" ? "active" : ""}
                        onClick={() => updateFiscal("taker", "person_type", "juridica")}
                      >
                        pessoa jurídica
                      </button>
                    </div>

                    <div className="ready-v2-fiscal-grid">
                      <label>
                        <span>{fiscalDraft.taker.person_type === "juridica" ? "razão social" : "nome"}</span>
                        <input
                          value={fiscalTakerName(fiscalDraft.taker)}
                          onChange={(event) => {
                            updateFiscal("taker", fiscalDraft.taker.person_type === "juridica" ? "legal_name" : "name", event.target.value);
                          }}
                          placeholder={fiscalDraft.taker.person_type === "juridica" ? "ex: concessionária fiat ltda" : "nome do cliente"}
                        />
                      </label>

                      <label>
                        <span>{fiscalDraft.taker.person_type === "juridica" ? "cnpj" : "cpf"}</span>
                        <input
                          value={fiscalDraft.taker.tax_id || ""}
                          onChange={(event) => updateFiscal("taker", "tax_id", event.target.value)}
                          placeholder={fiscalDraft.taker.person_type === "juridica" ? "00.000.000/0000-00" : "000.000.000-00"}
                        />
                      </label>

                      <label>
                        <span>email</span>
                        <input
                          value={fiscalDraft.taker.email || ""}
                          onChange={(event) => updateFiscal("taker", "email", event.target.value)}
                          placeholder="email do tomador"
                        />
                      </label>

                      <label>
                        <span>telefone</span>
                        <input
                          value={fiscalDraft.taker.phone || ""}
                          onChange={(event) => updateFiscal("taker", "phone", event.target.value)}
                          placeholder="telefone"
                        />
                      </label>

                      <label className="wide">
                        <span>endereço</span>
                        <input
                          value={fiscalDraft.taker.address || ""}
                          onChange={(event) => updateFiscal("taker", "address", event.target.value)}
                          placeholder="rua, avenida, etc."
                        />
                      </label>

                      <label>
                        <span>número</span>
                        <input
                          value={fiscalDraft.taker.number || ""}
                          onChange={(event) => updateFiscal("taker", "number", event.target.value)}
                          placeholder="número"
                        />
                      </label>

                      <label>
                        <span>bairro</span>
                        <input
                          value={fiscalDraft.taker.district || ""}
                          onChange={(event) => updateFiscal("taker", "district", event.target.value)}
                          placeholder="bairro"
                        />
                      </label>

                      <label>
                        <span>cidade</span>
                        <input
                          value={fiscalDraft.taker.city || ""}
                          onChange={(event) => updateFiscal("taker", "city", event.target.value)}
                          placeholder="cidade"
                        />
                      </label>

                      <label>
                        <span>uf</span>
                        <input
                          value={fiscalDraft.taker.state || ""}
                          onChange={(event) => updateFiscal("taker", "state", event.target.value.toUpperCase())}
                          placeholder="SP"
                          maxLength={2}
                        />
                      </label>

                      <label>
                        <span>cep</span>
                        <input
                          value={fiscalDraft.taker.zip_code || ""}
                          onChange={(event) => updateFiscal("taker", "zip_code", event.target.value)}
                          placeholder="00000-000"
                        />
                      </label>
                    </div>

                    <div className="ready-v2-fiscal-footer split">
                      <button type="button" className="ready-v2-command-btn soft" onClick={closeFiscalWizard}>
                        cancelar
                      </button>

                      <button type="button" className="ready-v2-command-btn primary" onClick={() => setFiscalStep(2)}>
                        continuar
                      </button>
                    </div>
                  </div>
                )}

                {fiscalStep === 2 && (
                  <div className="ready-v2-fiscal-panel">
                    <h3>serviço e valor</h3>
                    <p>escreva a discriminação fiscal do serviço. esse texto será usado quando o Giss liberar a emissão automática.</p>

                    <label className="ready-v2-fiscal-description">
                      <span>discriminação fiscal</span>
                      <textarea
                        value={fiscalDraft.service.description || ""}
                        onChange={(event) => updateFiscal("service", "description", event.target.value)}
                        placeholder={"ex:\\nMARTELINHO DE OURO\\nAT.: 22203311\\nO.S.: 19336642"}
                      />
                    </label>

                    <div className="ready-v2-fiscal-grid two">
                      <label>
                        <span>valor do rascunho</span>
                        <input
                          type="number"
                          step="0.01"
                          value={fiscalDraft.values.service_amount ?? ""}
                          onChange={(event) => updateFiscal("values", "service_amount", Number(event.target.value || 0))}
                        />
                      </label>

                      <label>
                        <span>iss retido?</span>
                        <select
                          value={fiscalDraft.values.iss_withheld ? "sim" : "nao"}
                          onChange={(event) => updateFiscal("values", "iss_withheld", event.target.value === "sim")}
                        >
                          <option value="nao">não</option>
                          <option value="sim">sim</option>
                        </select>
                      </label>
                    </div>

                    <div className="ready-v2-fiscal-footer triple">
                      <button type="button" className="ready-v2-command-btn soft" onClick={closeFiscalWizard}>
                        cancelar
                      </button>

                      <button type="button" className="ready-v2-command-btn soft" onClick={() => setFiscalStep(1)}>
                        voltar
                      </button>

                      <button type="button" className="ready-v2-command-btn primary" onClick={() => setFiscalStep(3)}>
                        revisar
                      </button>
                    </div>
                  </div>
                )}

                {fiscalStep === 3 && (
                  <div className="ready-v2-fiscal-panel">
                    <h3>revisar antes de salvar</h3>
                    <p>por enquanto isso salva o rascunho fiscal e deixa a emissão marcada como pendente no Giss.</p>

                    <div className="ready-v2-fiscal-note">
                      <strong>emissão automática pausada</strong>
                      <p>o orbeauto já prepara os dados e o XML técnico, mas a emissão real está aguardando retorno do suporte Giss/Jaboticabal. nada será enviado automaticamente agora.</p>
                    </div>

                    <div className="ready-v2-fiscal-review">
                      <div>
                        <span>tomador</span>
                        <strong>{fiscalTakerName(fiscalDraft.taker) || "não informado"}</strong>
                        <p>{fiscalPersonLabel(fiscalDraft.taker.person_type)} · {fiscalTaxLabel(fiscalDraft.taker) || "sem CPF/CNPJ"}</p>
                      </div>

                      <div>
                        <span>valor</span>
                        <strong>{Number(fiscalDraft.values.service_amount || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</strong>
                        <p>{fiscalDraft.values.iss_withheld ? "ISS retido" : "ISS não retido"}</p>
                      </div>

                      <div className="wide">
                        <span>discriminação</span>
                        <pre>{fiscalDraft.service.description || "sem discriminação"}</pre>
                      </div>
                    </div>

                    {fiscalMessage && <p className="ready-v2-fiscal-message">{fiscalMessage}</p>}

                    <div className="ready-v2-fiscal-footer triple">
                      <button type="button" className="ready-v2-command-btn soft" onClick={closeFiscalWizard}>
                        cancelar
                      </button>

                      <button type="button" className="ready-v2-command-btn soft" onClick={() => setFiscalStep(2)}>
                        voltar
                      </button>

                      <button type="button" className="ready-v2-command-btn primary" onClick={saveFiscalDraft} disabled={fiscalLoading}>
                        salvar e voltar
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="ready-v2-fiscal-loading">
                {fiscalMessage || "não foi possível preparar o rascunho fiscal."}
              </div>
            )}
          </section>
        </div>
      )}

      {gallery && (
        <div className="ready-v2-gallery-backdrop">
          <section className="ready-v2-gallery-modal">
            <div className="ready-v2-gallery-head">
              <div>
                <span>arquivos</span>
                <h2>{gallery.title}</h2>
                <p>{gallery.items.length} arquivo{gallery.items.length === 1 ? "" : "s"} neste grupo</p>
              </div>

              <button type="button" onClick={() => setGallery(null)} disabled={actionLoading}>fechar</button>
            </div>

            {gallery.items.length > 0 ? (
              <div className="ready-v2-gallery-grid">
                {gallery.items.map((photo, index) => {
                  const src = photo.url || photo.src || photo.data_url;

                  return (
                    <article key={photo.id || `${gallery.key}-${index}`} className="ready-v2-gallery-item">
                      <a href={src} target="_blank" rel="noreferrer">
                        <img src={src} alt={`${gallery.title} ${index + 1}`} />
                      </a>

                      <div>
                        <strong>{photo.filename || `arquivo ${index + 1}`}</strong>

                        <div className="ready-v2-gallery-actions">
                          <a href={src} target="_blank" rel="noreferrer" download={photo.filename || true}>abrir/baixar</a>
                          <button type="button" onClick={() => removePhoto(photo)} disabled={actionLoading}>remover</button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="ready-v2-gallery-empty">nenhum arquivo neste grupo ainda.</p>
            )}
          </section>
        </div>
      )}

      <div className="ready-v2-bottom-bar">
        <button onClick={() => go("home")}>voltar para home</button>
      </div>
    </main>
  );
}


function NewBudget({ go, onSaveDraft, onGenerate, initialDraft, editingBudget }) {
  const fileInputRef = useRef(null);
  const [open, setOpen] = useState(() => (!editingBudget ? loadNewBudgetAutoOpen() : "cliente"));
  const [draft, setDraft] = useState(() => clone(editingBudget ? (initialDraft || emptyDraft) : (loadNewBudgetAutoDraft() || initialDraft || emptyDraft)));
  const [photoCategory, setPhotoCategory] = useState("foto_1");
  const [validationError, setValidationError] = useState("");

  const isEditing = Boolean(editingBudget);
  const photoSlots = ["foto_1", "foto_2", "foto_3", "foto_4", "foto_5", "foto_6"];
  const stageOrder = ["cliente", "veiculo", "fotos", "valor"];

  // orbeauto 1.17a auto draft
  useEffect(() => {
    if (editingBudget) return;

    const timer = window.setTimeout(() => {
      saveNewBudgetAutoDraft(draft, open);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [draft, open, editingBudget]);

  useEffect(() => {
    if (editingBudget) return;

    function persistNow() {
      saveNewBudgetAutoDraft(draft, open);
    }

    window.addEventListener("pagehide", persistNow);
    document.addEventListener("visibilitychange", persistNow);

    return () => {
      window.removeEventListener("pagehide", persistNow);
      document.removeEventListener("visibilitychange", persistNow);
    };
  }, [draft, open, editingBudget]);

  function update(section, field, value) {
    setDraft((current) => ({
      ...current,
      [section]: { ...current[section], [field]: value }
    }));

    if (validationError) setValidationError("");
  }

  function updateDirect(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));

    if (validationError) setValidationError("");
  }

  function toggleDamage(type) {
    setDraft((current) => {
      const exists = current.damageTypes.includes(type);
      return {
        ...current,
        damageTypes: exists ? current.damageTypes.filter((item) => item !== type) : [...current.damageTypes, type]
      };
    });
  }

  function pickPhoto(category) {
    setPhotoCategory(category);
    fileInputRef.current?.click();
  }

  function handlePhoto(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      setDraft((current) => ({
        ...current,
        photos: [
          ...current.photos.filter((photo) => photo.label !== photoCategory),
          {
            id: crypto.randomUUID?.() || String(Date.now()),
            label: photoCategory,
            src: reader.result,
            file,
            local: true
          }
        ]
      }));
    };

    reader.readAsDataURL(file);
    event.target.value = "";
  }

  function removePhoto(id) {
    setDraft((current) => ({
      ...current,
      photos: current.photos.filter((photo) => photo.id !== id)
    }));
  }

  function required(value) {
    return String(value || "").trim().length > 0;
  }

  function validateStage(stage) {
    if (stage === "cliente") {
      const missing = [];

      if (!required(draft.customer.name)) missing.push("nome completo");
      if (!required(draft.customer.phone)) missing.push("telefone");

      if (missing.length) {
        return `preencha ${missing.join(" e ")} para continuar.`;
      }
    }

    if (stage === "veiculo") {
      const missing = [];

      if (!required(draft.vehicle.brand)) missing.push("marca");
      if (!required(draft.vehicle.model)) missing.push("modelo");
      if (!required(draft.vehicle.plateOrChassis)) missing.push("placa ou chassi");

      if (missing.length) {
        return `preencha ${missing.join(", ")} para continuar.`;
      }
    }

    if (stage === "valor") {
      const missing = [];

      if (!required(draft.payment.amount)) missing.push("valor do serviço");
      if (!required(draft.payment.method)) missing.push("forma de pagamento");

      if (missing.length) {
        return `preencha ${missing.join(" e ")} para gerar o orçamento.`;
      }
    }

    return "";
  }

  function requestOpen(nextStage) {
    if (!nextStage) {
      setOpen("");
      return;
    }

    const targetIndex = stageOrder.indexOf(nextStage);

    if (targetIndex <= 0) {
      setValidationError("");
      setOpen(nextStage);
      return;
    }

    for (let i = 0; i < targetIndex; i += 1) {
      const error = validateStage(stageOrder[i]);

      if (error) {
        setValidationError(error);
        setOpen(stageOrder[i]);
        return;
      }
    }

    setValidationError("");
    setOpen(nextStage);
  }

  function generateBudget() {
    for (const stage of ["cliente", "veiculo", "valor"]) {
      const error = validateStage(stage);

      if (error) {
        setValidationError(error);
        setOpen(stage);
        return;
      }
    }

    setValidationError("");
    if (!editingBudget) clearNewBudgetAutoDraft();
    onGenerate(draft, editingBudget);
  }

  function saveDraft() {
    if (!editingBudget) clearNewBudgetAutoDraft();
    onSaveDraft(draft, editingBudget);
  }

  const photoByLabel = (label) => draft.photos.find((photo) => photo.label === label);

  return (
    <main className="screen form-screen">
      <input ref={fileInputRef} hidden type="file" accept="image/*" capture="environment" onChange={handlePhoto} />

      <header className="nav-title">
        <button className="round-button ghost" onClick={() => go(isEditing ? "ready" : "home")}><ArrowLeft size={21} /></button>
        <div>
          <h1>{isEditing ? `editar #${editingBudget.id}` : "novo orçamento"}</h1>
          <p>{isEditing ? "salvará online" : "criação rápida de orçamento"}</p>
        </div>
        <span className="nav-spacer" />
      </header>

      <section className="mini-steps">
        <Step active={open === "cliente"} number="1" label="cliente" />
        <Step active={open === "veiculo"} number="2" label="veículo" />
        <Step active={open === "fotos"} number="3" label="fotos" />
        <Step active={open === "valor"} number="4" label="valor" />
      </section>

      {validationError && (
        <div className="wizard-error">
          {validationError}
        </div>
      )}

      <Accordion id="cliente" open={open} setOpen={requestOpen} icon={<User size={19} />} title="cliente" summary="nome e telefone obrigatórios">
        <div className="form-grid">
          <Field label="nome completo *" placeholder="digite o nome" value={draft.customer.name} onChange={(value) => update("customer", "name", value)} />
          <Field label="telefone *" placeholder="(11) 99999-9999" inputMode="tel" icon={<Phone size={16} />} value={draft.customer.phone} onChange={(value) => update("customer", "phone", formatPhoneInput(value))} />
          <Field label="cpf" placeholder="000.000.000-00" inputMode="numeric" icon={<IdCard size={16} />} value={draft.customer.cpf} onChange={(value) => update("customer", "cpf", formatCpfInput(value))} />
          <Field label="email" placeholder="email@exemplo.com" inputMode="email" icon={<Mail size={16} />} value={draft.customer.email} onChange={(value) => update("customer", "email", value)} />
          <Field wide label="endereço" placeholder="digite o endereço completo" icon={<MapPin size={16} />} value={draft.customer.address} onChange={(value) => update("customer", "address", value)} />
        </div>
        <button className="mini-action" onClick={() => requestOpen("veiculo")}>continuar para veículo</button>
      </Accordion>

      <Accordion id="veiculo" open={open} setOpen={requestOpen} icon={<Car size={19} />} title="veículo" summary="marca, modelo e placa/chassi obrigatórios">
        <div className="form-grid">
          <Field label="marca *" placeholder="ex: toyota" value={draft.vehicle.brand} onChange={(value) => update("vehicle", "brand", value)} />
          <Field label="modelo *" placeholder="ex: corolla" value={draft.vehicle.model} onChange={(value) => update("vehicle", "model", value)} />
          <Field label="ano" placeholder="ex: 2020" inputMode="numeric" icon={<Calendar size={16} />} value={draft.vehicle.year} onChange={(value) => update("vehicle", "year", value)} />
          <Field label="cor" placeholder="ex: prata" value={draft.vehicle.color} onChange={(value) => update("vehicle", "color", value)} />
          <Field wide label="placa ou chassi *" placeholder="abc1d23 ou 9bwzzz377vt004251" value={draft.vehicle.plateOrChassis} onChange={(value) => update("vehicle", "plateOrChassis", value)} />
        </div>

        <div className="segmented-block">
          <span>tipo de os</span>
          <div className="segment">
            <button className={draft.osType === "particular" ? "active" : ""} onClick={() => updateDirect("osType", "particular")}>particular</button>
            <button className={draft.osType === "seguradora" ? "active" : ""} onClick={() => updateDirect("osType", "seguradora")}>seguradora</button>
          </div>
        </div>

        {draft.osType === "seguradora" && (
          <div className="insurance-fields">
            <Field label="seguradora" placeholder="nome da seguradora" value={draft.insurance.company} onChange={(value) => update("insurance", "company", value)} />
            <Field label="os/atendimento" placeholder="número da os ou atendimento" value={draft.insurance.serviceOrder} onChange={(value) => update("insurance", "serviceOrder", value)} />
            <Field label="responsável" placeholder="nome do responsável" value={draft.insurance.contact} onChange={(value) => update("insurance", "contact", value)} />

            <div className="vehicle-doc-slot">
              <div className="insurance-photo-grid">
                <PhotoSlot
                  label="documento_veiculo"
                  displayLabel="documento do veículo"
                  photo={photoByLabel("documento_veiculo")}
                  onPick={() => pickPhoto("documento_veiculo")}
                  onRemove={removePhoto}
                />

                <PhotoSlot
                  label="placa_traseira"
                  displayLabel="placa traseira"
                  photo={photoByLabel("placa_traseira")}
                  onPick={() => pickPhoto("placa_traseira")}
                  onRemove={removePhoto}
                />
              </div>
            </div>
          </div>
        )}

        <button className="mini-action" onClick={() => requestOpen("fotos")}>continuar para fotos</button>
      </Accordion>

      <Accordion id="fotos" open={open} setOpen={requestOpen} icon={<ImageIcon size={19} />} title="fotos e dano" summary="fotos rápidas do veículo">
        <div className="photo-grid photo-grid-six">
          {photoSlots.map((slot) => (
            <PhotoSlot
              key={slot}
              label={slot}
              hideLabel
              photo={photoByLabel(slot)}
              onPick={() => pickPhoto(slot)}
              onRemove={removePhoto}
            />
          ))}
        </div>

        <div className="chips-block">
          <span>tipo de dano</span>
          <div className="chips">
            {["amassado", "risco", "desencaixe", "outros"].map((chip) => (
              <button key={chip} className={draft.damageTypes.includes(chip) ? "selected" : ""} onClick={() => toggleDamage(chip)}>{chip}</button>
            ))}
          </div>
        </div>

        <label className="textarea-field">
          <span>descrição do dano</span>
          <textarea value={draft.damageDescription} onChange={(event) => updateDirect("damageDescription", event.target.value)} placeholder="ex: amassado na porta traseira direita" />
        </label>

        <label className="textarea-field">
          <span>serviço proposto</span>
          <textarea value={draft.serviceDescription} onChange={(event) => updateDirect("serviceDescription", event.target.value)} placeholder="ex: funilaria, pintura e polimento" />
        </label>

        <button className="mini-action" onClick={() => requestOpen("valor")}>continuar para valor</button>
      </Accordion>

      <Accordion id="valor" open={open} setOpen={requestOpen} icon={<DollarSign size={19} />} title="valor e pagamento" summary="valor e forma de pagamento obrigatórios">
        <div className="form-grid">
          <Field label="valor do serviço *" placeholder="ex: R$ 2.350,00" inputMode="numeric" value={draft.payment.amount} onChange={(value) => update("payment", "amount", formatCurrencyInput(value))} />
          <Field label="forma de pagamento *" placeholder="pix, cartão, dinheiro" value={draft.payment.method} onChange={(value) => update("payment", "method", value)} />
        </div>

        <div className="segmented-block">
          <span>condição</span>
          <div className="segment">
            <button className={draft.payment.condition === "avista" ? "active" : ""} onClick={() => update("payment", "condition", "avista")}>à vista</button>
            <button className={draft.payment.condition === "parcelado" ? "active" : ""} onClick={() => update("payment", "condition", "parcelado")}>parcelado</button>
          </div>
        </div>

        {draft.payment.condition === "parcelado" && (
          <Field label="parcelas" placeholder="ex: 3" inputMode="numeric" value={draft.payment.installments} onChange={(value) => update("payment", "installments", value)} />
        )}

        <button className="mini-action primary-mini" onClick={generateBudget}>
          {isEditing ? "salvar alterações" : "gerar orçamento"}
        </button>
      </Accordion>

      <section className="bottom-actions">
        <button className="secondary" onClick={saveDraft}><Bookmark size={18} />rascunho</button>
        <button className="primary" onClick={generateBudget}><ReceiptText size={18} />{isEditing ? "salvar" : "gerar"}</button>
      </section>
    </main>
  );
}


function Accordion({ id, open, setOpen, icon, title, summary, children }) {
  const isOpen = open === id;

  return (
    <section className={cx("accordion panel", isOpen && "is-open")}>
      <button className="accordion-head" onClick={() => setOpen(isOpen ? "" : id)}>
        <span className="accordion-icon">{icon}</span>
        <span className="accordion-copy"><strong>{title}</strong><small>{summary}</small></span>
        <ChevronRight size={20} className={cx("accordion-arrow", isOpen && "turned")} />
      </button>
      {isOpen && <div className="accordion-body">{children}</div>}
    </section>
  );
}

function Step({ active, number, label }) {
  return (
    <button className={cx("step", active && "active")}>
      <span>{number}</span>
      <small>{label}</small>
    </button>
  );
}

function Field({ label, placeholder, wide, icon, value, onChange, inputMode, disabled }) {
  return (
    <label className={cx("field", wide && "wide", disabled && "field-disabled")}>
      <span>{label}</span>
      <div className="field-box">
        {icon}
        <input disabled={disabled} value={value || ""} inputMode={inputMode} placeholder={placeholder} onChange={(event) => onChange?.(event.target.value)} />
      </div>
    </label>
  );
}

function PhotoSlot({ label, displayLabel, hideLabel, photo, onPick, onRemove }) {
  const visibleLabel = displayLabel || label;

  return (
    <div
      className={cx("photo-slot", hideLabel && "photo-slot-compact", photo && "has-photo")}
      onClick={onPick}
      role="button"
      tabIndex={0}
    >
      {photo ? (
        <>
          <img src={photo.src || photo.url || photo.data_url} alt={`foto ${visibleLabel}`} />
          {!hideLabel && <span className="photo-caption">{visibleLabel}</span>}
          <button
            className="remove-photo"
            onClick={(event) => {
              event.stopPropagation();
              onRemove(photo.id);
            }}
          >
            <Trash2 size={15} />
          </button>
        </>
      ) : (
        <>
          <Camera size={hideLabel ? 21 : 18} />
          {!hideLabel && <span>{visibleLabel}</span>}
        </>
      )}
    </div>
  );
}

function SummaryCard({ icon, title, action, children }) {
  return (
    <section className="panel summary-card">
      <div className="card-heading">
        <h2><span className="title-icon">{icon}</span>{title}</h2>
        {action && <button className="text-button">{action}</button>}
      </div>
      <div className="summary-content">{children}</div>
    </section>
  );
}

function Info({ label, value, wide }) {
  return (
    <div className={cx("info", wide && "wide")}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function SettingsScreen({ go, workshop, onSaveWorkshop, onUploadLogo }) {
  const [form, setForm] = useState({
    legalName: workshop.legalName,
    tradeName: workshop.tradeName,
    cnpj: workshop.cnpj,
    email: workshop.email,
    phone: workshop.phone,
    address: workshop.address
  });

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  return (
    <main className="screen settings-screen">
      <header className="nav-title">
        <button className="round-button ghost" onClick={() => go("home")}><ArrowLeft size={21} /></button>
        <div><h1>configurações</h1><p>dados da oficina</p></div>
        <span className="nav-spacer" />
      </header>

      <section className="panel settings-card">
        <div className="card-heading loose">
          <h2><span className="title-icon"><Building2 size={19} /></span> cadastro da oficina</h2>
        </div>

        <div className="locked-note">
          razão social, nome fantasia e cnpj são bloqueados. só o administrador altera.
        </div>

        <div className="logo-admin-box">
          <div className="logo-preview">
            {workshop.logoUrl ? (
              <img src={workshop.logoUrl} alt="logo da oficina" />
            ) : (
              <Building2 size={24} />
            )}
          </div>

          <label className="secondary logo-upload-button">
            <Upload size={17} />
            enviar logomarca
            <input
              hidden
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onUploadLogo(file);
                event.target.value = "";
              }}
            />
          </label>
        </div>

        <div className="form-grid settings-grid">
          <Field disabled label="razão social" value={form.legalName} placeholder="razão social" />
          <Field disabled label="nome fantasia" value={form.tradeName} placeholder="nome fantasia" />
          <Field disabled label="cnpj" value={form.cnpj} placeholder="cnpj" />
          <Field label="email" value={form.email} placeholder="email da oficina" onChange={(value) => update("email", value)} />
          <Field label="telefone" value={form.phone} placeholder="telefone" onChange={(value) => update("phone", value)} />
          <Field wide label="endereço" value={form.address} placeholder="endereço" onChange={(value) => update("address", value)} />
        </div>

        <button className="mini-action primary-mini" onClick={() => onSaveWorkshop(form)}>
          salvar alterações permitidas
        </button>

        <p className="settings-note">
          a logomarca, email, telefone e endereço vêm do banco da oficina.
        </p>
      </section>
    </main>
  );
}

function DashboardScreen({ go, dashboard, openBudget }) {
  const [period, setPeriod] = useState("month");

  const current = dashboard?.periods?.[period] || emptyDashboardPeriod;
  const types = dashboard?.types || {};
  const rankings = dashboard?.rankings || {};

  const statusEntries = Object.entries(current.statusCounts || {});

  return (
    <main className="screen dashboard-screen">
      <header className="nav-title">
        <button className="round-button ghost" onClick={() => go("home")}>
          <ArrowLeft size={21} />
        </button>

        <div>
          <h1>painel</h1>
          <p>visão financeira da oficina</p>
        </div>

        <button className="round-button ghost" onClick={() => go("home")}>
          <HomeIcon size={20} />
        </button>
      </header>

      <section className="dashboard-periods">
        {[
          ["today", "hoje"],
          ["week", "7 dias"],
          ["month", "mês"],
          ["all", "geral"]
        ].map(([id, label]) => (
          <button key={id} className={period === id ? "active" : ""} onClick={() => setPeriod(id)}>
            {label}
          </button>
        ))}
      </section>

      <section className="dashboard-hero panel">
        <div>
          <span>valor ativo</span>
          <strong>{moneyLabel(current.activeValue, "R$ 0,00")}</strong>
          <p>orçamentos que não estão cancelados ou rascunho</p>
        </div>

        <div className="approval-orb">
          <strong>{current.approvalRate}%</strong>
          <span>aprovação</span>
        </div>
      </section>

      <section className="dashboard-grid">
        <DashMetric label="orçado" value={moneyLabel(current.totalValue, "R$ 0,00")} icon={<ReceiptText size={19} />} />
        <DashMetric label="aprovado" value={moneyLabel(current.approvedValue, "R$ 0,00")} icon={<CheckCircle2 size={19} />} tone="green" />
        <DashMetric label="em aberto" value={moneyLabel(current.openValue, "R$ 0,00")} icon={<Clock3 size={19} />} tone="orange" />
        <DashMetric label="ticket médio" value={moneyLabel(current.ticketAverage, "R$ 0,00")} icon={<DollarSign size={19} />} tone="purple" />
      </section>

      <section className="panel">
        <div className="card-heading loose">
          <h2><span className="title-icon"><Filter size={19} /></span>status</h2>
          <span className="small-muted">{current.ordersCount} orçamento(s)</span>
        </div>

        <div className="status-bars">
          {statusEntries.map(([status, count]) => {
            const percent = current.ordersCount ? Math.round((count / current.ordersCount) * 100) : 0;

            return (
              <div className="status-bar-row" key={status}>
                <div>
                  <span>{status}</span>
                  <strong>{count}</strong>
                </div>

                <div className="status-bar-track">
                  <span style={{ width: `${percent}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="dashboard-type-grid">
        <TypeCard title="particular" data={types.particular} />
        <TypeCard title="seguradora" data={types.seguradora} />
      </section>

      <section className="panel">
        <div className="card-heading loose">
          <h2><span className="title-icon"><Zap size={19} /></span>maiores orçamentos</h2>
        </div>

        <div className="recent-list compact-history">
          {(rankings.biggestOrders || []).map((order) => (
            <button className="recent-item" key={order.id} onClick={() => openBudget(order)}>
              <div className="car-badge"><ReceiptText size={18} /></div>

              <div className="recent-copy">
                <strong>#{order.id} · {order.customer.name}</strong>
                <span>{budgetVehicleTitle(order)}</span>
                <small>{timeLabel(order.createdAt)}</small>
              </div>

              <div className="recent-right">
                <span className={cx("status-pill", order.status.replace(" ", "-"))}>{order.status}</span>
                <strong>{moneyLabel(order.payment.amount)}</strong>
              </div>
            </button>
          ))}

          {(rankings.biggestOrders || []).length === 0 && (
            <p className="soft-empty">sem orçamentos ainda.</p>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="card-heading loose">
          <h2><span className="title-icon"><Users size={19} /></span>clientes recorrentes</h2>
        </div>

        <div className="ranking-list">
          {(rankings.customers || []).map((customer, index) => (
            <div className="ranking-item" key={customer.id}>
              <span>{index + 1}</span>

              <div>
                <strong>{customer.name || "cliente sem nome"}</strong>
                <small>{customer.orders_count} orçamento(s)</small>
              </div>

              <b>{moneyLabel(customer.approved_value, "R$ 0,00")}</b>
            </div>
          ))}

          {(rankings.customers || []).length === 0 && (
            <p className="soft-empty">clientes aparecem quando existirem orçamentos.</p>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="card-heading loose">
          <h2><span className="title-icon"><ShieldCheck size={19} /></span>seguradoras</h2>
        </div>

        <div className="ranking-list">
          {(rankings.insurers || []).map((insurer, index) => (
            <div className="ranking-item" key={insurer.name}>
              <span>{index + 1}</span>

              <div>
                <strong>{insurer.name}</strong>
                <small>{insurer.orders_count} orçamento(s)</small>
              </div>

              <b>{moneyLabel(insurer.total_value, "R$ 0,00")}</b>
            </div>
          ))}

          {(rankings.insurers || []).length === 0 && (
            <p className="soft-empty">nenhum orçamento de seguradora no período.</p>
          )}
        </div>
      </section>

      <BottomNav go={go} active="dashboard" />
    </main>
  );
}

function DashMetric({ label, value, icon, tone }) {
  return (
    <div className={cx("dash-metric panel", tone && `tone-${tone}`)}>
      <span>{icon}</span>
      <p>{label}</p>
      <strong>{value}</strong>
    </div>
  );
}

function TypeCard({ title, data = {} }) {
  return (
    <section className="panel type-card">
      <div className="card-heading loose">
        <h2>{title}</h2>
        <span className="small-muted">{data.ordersCount || 0} os</span>
      </div>

      <div className="type-card-values">
        <div>
          <span>total</span>
          <strong>{moneyLabel(data.totalValue, "R$ 0,00")}</strong>
        </div>

        <div>
          <span>aprovado</span>
          <strong>{moneyLabel(data.approvedValue, "R$ 0,00")}</strong>
        </div>

        <div>
          <span>ticket</span>
          <strong>{moneyLabel(data.ticketAverage, "R$ 0,00")}</strong>
        </div>
      </div>
    </section>
  );
}

function CustomersScreen({ go, customers, openCustomer, onNewOrder }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();

    return customers.filter((customer) => {
      const searchable = [
        customer.name,
        customer.phone,
        customer.cpf,
        customer.email,
        customer.address,
        ...(customer.vehicles || []).map((vehicle) =>
          `${vehicle.brand} ${vehicle.model} ${vehicle.year} ${vehicle.plateOrChassis}`
        )
      ].join(" ").toLowerCase();

      return !search || searchable.includes(search);
    });
  }, [customers, query]);

  return (
    <main className="screen customers-screen">
      <header className="nav-title">
        <button className="round-button ghost" onClick={() => go("home")}>
          <ArrowLeft size={21} />
        </button>

        <div>
          <h1>clientes</h1>
          <p>{customers.length} cliente(s) no banco da oficina</p>
        </div>

        <button className="round-button ghost" onClick={() => go("new")}>
          <Plus size={21} />
        </button>
      </header>

      <section className="panel search-panel">
        <label className="search-box">
          <Search size={18} />
          <input
            value={query}
            placeholder="buscar por nome, telefone, cpf, placa"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </section>

      <section className="customer-list">
        {filtered.map((customer) => (
          <button className="panel customer-card" key={customer.id} onClick={() => openCustomer(customer)}>
            <div className="customer-avatar">
              <User size={22} />
            </div>

            <div className="customer-card-copy">
              <strong>{customer.name || "cliente sem nome"}</strong>
              <span>{customer.phone || "telefone não informado"}</span>
              <small>
                {customer.vehiclesCount} veículo(s) · {customer.ordersCount} orçamento(s)
              </small>
            </div>

            <div className="customer-card-right">
              <strong>{moneyLabel(customer.approvedTotal, "R$ 0,00")}</strong>
              <span>aprovado</span>
              <ChevronRight size={19} />
            </div>
          </button>
        ))}

        {filtered.length === 0 && (
          <section className="panel empty-state">
            <Users size={22} />
            <strong>nenhum cliente encontrado</strong>
            <p>quando criar orçamentos, os clientes aparecem aqui automaticamente.</p>
          </section>
        )}
      </section>

      <section className="bottom-actions">
        <button className="secondary" onClick={() => go("home")}>
          início
        </button>

        <button className="primary" onClick={() => onNewOrder(null)}>
          <Plus size={18} />
          novo orçamento
        </button>
      </section>
    </main>
  );
}

function CustomerDetailScreen({ go, customer, openBudget, onNewOrder }) {
  if (!customer) {
    return (
      <main className="screen customers-screen">
        <section className="panel empty-state">
          <Users size={22} />
          <strong>cliente não carregado</strong>
          <p>volte para a lista e abra o cliente novamente.</p>
          <button className="mini-action" onClick={() => go("customers")}>voltar</button>
        </section>
      </main>
    );
  }

  const vehicles = customer.vehicles || [];
  const orders = customer.orders || [];

  return (
    <main className="screen customer-detail-screen">
      <header className="nav-title">
        <button className="round-button ghost" onClick={() => go("customers")}>
          <ArrowLeft size={21} />
        </button>

        <div>
          <h1>{customer.name || "cliente"}</h1>
          <p>ficha do cliente</p>
        </div>

        <button className="round-button ghost" onClick={() => onNewOrder(customer)}>
          <Plus size={21} />
        </button>
      </header>

      <section className="panel customer-hero">
        <div className="customer-hero-top">
          <div className="customer-avatar big">
            <User size={28} />
          </div>

          <div>
            <strong>{customer.name || "cliente sem nome"}</strong>
            <span>{customer.phone || "telefone não informado"}</span>
          </div>
        </div>

        <div className="customer-actions">
          <button
            className="secondary"
            onClick={() => {
              const phone = onlyDigits(customer.phone);
              if (phone) window.open(`https://wa.me/55${phone}`, "_blank");
            }}
          >
            <Phone size={17} />
            whatsapp
          </button>

          <button
            className="secondary"
            onClick={() => {
              if (customer.email) window.location.href = `mailto:${customer.email}`;
            }}
          >
            <Mail size={17} />
            email
          </button>
        </div>

        <div className="customer-info-grid">
          <Info label="cpf" value={customer.cpf || "não informado"} />
          <Info label="email" value={customer.email || "não informado"} />
          <Info label="endereço" value={customer.address || "não informado"} wide />
        </div>
      </section>

      <section className="customer-metrics">
        <div className="panel">
          <span>orçamentos</span>
          <strong>{customer.ordersCount}</strong>
        </div>

        <div className="panel">
          <span>veículos</span>
          <strong>{customer.vehiclesCount}</strong>
        </div>

        <div className="panel">
          <span>aprovado</span>
          <strong>{moneyLabel(customer.approvedTotal, "R$ 0,00")}</strong>
        </div>
      </section>

      <SummaryCard icon={<Car size={19} />} title="veículos">
        <div className="vehicle-list">
          {vehicles.map((vehicle) => (
            <div className="vehicle-card" key={vehicle.id}>
              <div className="car-badge">
                <Car size={18} />
              </div>

              <div>
                <strong>{vehicle.brand} {vehicle.model}</strong>
                <span>{vehicle.year} · {vehicle.color || "cor não informada"}</span>
                <small>{vehicle.plateOrChassis || "placa/chassi não informado"}</small>
              </div>
            </div>
          ))}

          {vehicles.length === 0 && (
            <p>nenhum veículo vinculado ainda.</p>
          )}
        </div>
      </SummaryCard>

      <SummaryCard icon={<ReceiptText size={19} />} title="histórico de orçamentos">
        <div className="recent-list compact-history">
          {orders.map((order) => (
            <button className="recent-item" key={order.id} onClick={() => openBudget(order)}>
              <div className="car-badge">
                <ReceiptText size={18} />
              </div>

              <div className="recent-copy">
                <strong>orçamento #{order.id}</strong>
                <span>{budgetVehicleTitle(order)}</span>
                <small>{timeLabel(order.createdAt)}</small>
              </div>

              <div className="recent-right">
                <span className={cx("status-pill", order.status.replace(" ", "-"))}>
                  {order.status}
                </span>
                <strong>{moneyLabel(order.payment.amount)}</strong>
              </div>
            </button>
          ))}

          {orders.length === 0 && (
            <p>nenhum orçamento para esse cliente ainda.</p>
          )}
        </div>
      </SummaryCard>

      <section className="bottom-actions">
        <button className="secondary" onClick={() => go("customers")}>
          clientes
        </button>

        <button className="primary" onClick={() => onNewOrder(customer)}>
          <Plus size={18} />
          orçamento
        </button>
      </section>
    </main>
  );
}

function BottomNav({ go, active = "home" }) {
  return (
    <nav className="bottom-nav">
      <button className={active === "home" ? "active" : ""} onClick={() => go("home")}><HomeIcon size={20} /><span>início</span></button>
      <button className={active === "dashboard" ? "active" : ""} onClick={() => go("dashboard")}><FileText size={20} /><span>painel</span></button>
      <button className="camera-tab" onClick={() => go("new")}><Camera size={23} /></button>
      <button className={active === "customers" ? "active" : ""} onClick={() => go("customers")}><Users size={20} /><span>clientes</span></button>
      <button className={active === "settings" ? "active" : ""} onClick={() => go("settings")}><Settings size={20} /><span>ajustes</span></button>
    </nav>
  );
}

export default function App() {
  const [booting, setBooting] = useState(true);
  const [screen, setScreen] = useState("login");
  const [token, setToken] = useState("");
  const [user, setUser] = useState(null);
  const [workshop, setWorkshop] = useState(null);
  const [budgets, setBudgets] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [adminToken, setAdminToken] = useState("");
  const [subscribers, setSubscribers] = useState([]);
  const [currentBudget, setCurrentBudget] = useState(null);
  const [currentCustomer, setCurrentCustomer] = useState(null);
  const [editingBudget, setEditingBudget] = useState(null);
  const [draftPreset, setDraftPreset] = useState(null);
  const [toast, setToast] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setBooting(false), 680);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const savedToken = localStorage.getItem(TOKEN_KEY);
    if (!savedToken) return;

    bootSession(savedToken).catch(() => {
      localStorage.removeItem(TOKEN_KEY);
    });
  }, []);

  function notify(message) {
    setToast(message);
    window.setTimeout(() => setToast(""), 2500);
  }

  async function bootSession(nextToken) {
    const data = await api("/me", { token: nextToken });
    const normalizedWorkshop = normalizeWorkshop(data.workshop);

    setToken(nextToken);
    setUser(data.user);
    setWorkshop(normalizedWorkshop);
    localStorage.setItem(TOKEN_KEY, nextToken);

    await loadOrders(nextToken);
    await loadCustomers(nextToken);
    await loadDashboard(nextToken);
    setScreen("home");
  }

  async function loadOrders(activeToken = token) {
    const data = await api("/orders", { token: activeToken });
    const normalized = data.map((item) => syncOrderStatusFromProduction(enrichOperationalOrder(normalizeOrder(item), item)));
    setBudgets(normalized);

    if (currentBudget) {
      const fresh = normalized.find((item) => item.id === currentBudget.id);
      if (fresh) setCurrentBudget(fresh);
    }

    return normalized;
  }

  async function loadCustomers(activeToken = token) {
    const data = await api("/customers", { token: activeToken });
    const normalized = data.map(normalizeCustomer);
    setCustomers(normalized);

    if (currentCustomer) {
      const fresh = normalized.find((item) => item.id === currentCustomer.id);
      if (fresh) setCurrentCustomer(fresh);
    }

    return normalized;
  }


  async function loadDashboard(activeToken = token) {
    const data = await api("/dashboard", { token: activeToken });
    const normalized = normalizeDashboard(data);
    setDashboard(normalized);
    return normalized;
  }


  async function handleLogin(email, password) {
    const cleanEmail = String(email || "").trim().toLowerCase();
    const cleanPassword = String(password || "").trim();

    if (!cleanEmail || !cleanPassword) {
      notify("preencha email e senha");
      return;
    }

    if (!cleanEmail.includes("@")) {
      notify("digite um email válido");
      return;
    }

    try {
      const data = await api("/auth/login", {
        method: "POST",
        body: { email: cleanEmail, password: cleanPassword }
      });

      await bootSession(data.token);
      notify("login realizado");
    } catch (error) {
      notify(error.message || "erro no login");
    }
  }

  async function handleAdminPanelLogin(username, password) {
    const cleanUser = String(username || "").trim();
    const cleanPassword = String(password || "");

    if (!cleanUser || !cleanPassword) {
      notify("preencha usuário e senha admin");
      return;
    }

    try {
      const data = await api("/admin/login", {
        method: "POST",
        body: {
          username: cleanUser,
          password: cleanPassword
        }
      });

      setAdminToken(data.token);
      await loadSubscribers(data.token);
      setScreen("control-panel");
      notify("painel liberado");
    } catch (error) {
      notify(error.message || "erro no painel");
    }
  }

  async function loadSubscribers(activeToken = adminToken) {
    const data = await api("/admin/subscribers", { token: activeToken });
    setSubscribers(data);
    return data;
  }

  async function handleCreateSubscriber(payload) {
    const required = [
      ["razão social", payload.legal_name],
      ["nome fantasia", payload.trade_name],
      ["cnpj", payload.cnpj],
      ["nome do dono", payload.owner_name],
      ["email do dono", payload.owner_email],
      ["senha do dono", payload.owner_password]
    ];

    const missing = required.find(([, value]) => !String(value || "").trim());

    if (missing) {
      notify(`preencha ${missing[0]}`);
      return;
    }

    try {
      await api("/admin/subscribers", {
        method: "POST",
        token: adminToken,
        body: {
          ...payload,
          owner_email: String(payload.owner_email || "").trim().toLowerCase(),
          email: payload.email ? String(payload.email).trim().toLowerCase() : null
        }
      });

      await loadSubscribers();
      notify("assinante criado");
    } catch (error) {
      notify(error.message || "erro ao criar assinante");
    }
  }

  async function handleResetOwnerPassword(id, password, reason = "reset manual pelo painel interno") {
    const cleanPassword = String(password || "").trim();

    if (cleanPassword.length < 6) {
      notify("a senha precisa ter pelo menos 6 caracteres");
      return;
    }

    try {
      await api(`/admin/subscribers/${id}/owner-password`, {
        method: "PATCH",
        token: adminToken,
        body: {
          password: cleanPassword,
          reason
        }
      });

      notify("senha do dono atualizada");
    } catch (error) {
      notify(error.message || "erro ao resetar senha");
    }
  }

  async function handleLoadSubscriberAudit(id) {
    try {
      return await api(`/admin/subscribers/${id}/audit`, {
        token: adminToken
      });
    } catch (error) {
      console.error("audit load error", error);
      return [];
    }
  }

  async function handleUpdateSubscriber(id, patch) {
    try {
      await api(`/admin/subscribers/${id}`, {
        method: "PATCH",
        token: adminToken,
        body: patch
      });

      await loadSubscribers();
      notify("assinante atualizado");
    } catch (error) {
      notify(error.message || "erro ao atualizar assinante");
    }
  }

  function handleAdminLogout() {
    setAdminToken("");
    setSubscribers([]);
    setScreen("login");
    notify("painel encerrado");
  }

  async function handleAdminCreate(payload, adminSecret) {
    const required = [
      ["admin secret", adminSecret],
      ["razão social", payload.legal_name],
      ["nome fantasia", payload.trade_name],
      ["cnpj", payload.cnpj],
      ["nome do dono", payload.owner_name],
      ["email do dono", payload.owner_email],
      ["senha do dono", payload.owner_password]
    ];

    const missing = required.find(([, value]) => !String(value || "").trim());

    if (missing) {
      notify(`preencha ${missing[0]}`);
      return;
    }

    if (!String(payload.owner_email || "").includes("@")) {
      notify("email do dono inválido");
      return;
    }

    try {
      await api("/admin/workshops", {
        method: "POST",
        headers: { "x-admin-secret": String(adminSecret || "").trim() },
        body: {
          ...payload,
          owner_email: String(payload.owner_email || "").trim().toLowerCase(),
          email: payload.email ? String(payload.email).trim().toLowerCase() : null
        }
      });

      notify("oficina cadastrada");
      setScreen("login");
    } catch (error) {
      notify(error.message || "erro ao cadastrar");
    }
  }

  function navigate(next) {
    if (next === "new") {
      setEditingBudget(null);
      setDraftPreset(null);
    }

    setScreen(next);
  }

  async function uploadPhotos(orderId, draft, existingBudget = null) {
    const existingRemote = existingBudget?.photos?.filter((photo) => photo.remote) || [];
    const keptRemoteIds = new Set(draft.photos.filter((photo) => photo.remote).map((photo) => photo.id));

    for (const oldPhoto of existingRemote) {
      if (!keptRemoteIds.has(oldPhoto.id)) {
        await api(`/photos/${oldPhoto.id}`, { method: "DELETE", token });
      }
    }

    for (const photo of draft.photos.filter((item) => item.local && item.file)) {
      const formData = new FormData();
      formData.append("file", photo.file);

      await api(`/orders/${orderId}/photos?label=${encodeURIComponent(photo.label || "foto")}`, {
        method: "POST",
        token,
        body: formData
      });
    }
  }

  async function saveOrder(draft, existingBudget = null, forcedStatus = null) {
    const status = forcedStatus || existingBudget?.status || "em aberto";
    const payload = toApiOrder(draft, status);

    const saved = existingBudget
      ? await api(`/orders/${existingBudget.id}`, { method: "PUT", token, body: payload })
      : await api("/orders", { method: "POST", token, body: payload });

    await uploadPhotos(saved.id, draft, existingBudget);

    const refreshed = await api(`/orders/${saved.id}`, { token });
    const normalized = syncOrderStatusFromProduction(enrichOperationalOrder(normalizeOrder(refreshed), refreshed));
    maybeAskScheduleAfterApproved(normalized, handleScheduleBudget);

    await loadOrders();
    await loadCustomers();
    await loadDashboard();
    setCurrentBudget(normalized);
    setEditingBudget(null);
    setScreen("ready");

    return normalized;
  }

  async function handleSaveDraft(draft, existingBudget = null) {
    try {
      await saveOrder(draft, existingBudget, "rascunho");
      notify("rascunho salvo no banco");
    } catch (error) {
      notify(error.message || "erro ao salvar");
    }
  }

  async function handleGenerate(draft, existingBudget = null) {
    try {
      const status = existingBudget?.status && existingBudget.status !== "rascunho" ? existingBudget.status : "em aberto";
      await saveOrder(draft, existingBudget, status);
      notify(existingBudget ? "orçamento atualizado" : "orçamento criado");
    } catch (error) {
      notify(error.message || "erro ao gerar orçamento");
    }
  }

  function openBudget(budget) {
    setEditingBudget(null);
    setCurrentBudget(budget);
    setScreen("ready");
  }

  async function openCustomer(customer) {
    try {
      const data = await api(`/customers/${customer.id}`, { token });
      setCurrentCustomer(normalizeCustomer(data));
      setScreen("customer");
    } catch (error) {
      notify(error.message || "erro ao abrir cliente");
    }
  }

  async function handleScheduleBudget(orderId, payload) {
    const updated = await api(`/orders/${orderId}/schedule`, {
      method: "PATCH",
      token,
      body: payload
    });

    const normalized = syncOrderStatusFromProduction(enrichOperationalOrder(normalizeOrder(updated), updated));
    maybeAskScheduleAfterApproved(normalized, handleScheduleBudget);

    setBudgets((current) =>
      current.map((item) => (item.id === normalized.id ? normalized : item))
    );

    await loadDashboard();

    return normalized;
  }

  async function handleVehicleArrived(orderId) {
    const updated = await api(`/orders/${orderId}/production`, {
      method: "PATCH",
      token,
      body: {
        production_status: "recebido",
        production_notes: "veículo chegou na oficina"
      }
    });

    const normalized = syncOrderStatusFromProduction(enrichOperationalOrder(normalizeOrder(updated), updated));
    maybeAskScheduleAfterApproved(normalized, handleScheduleBudget);

    setBudgets((current) =>
      current.map((item) => (item.id === normalized.id ? normalized : item))
    );

    await loadDashboard();

    return normalized;
  }

  async function handleUploadOrderPhoto(orderId, file, stage = "entrada") {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("stage", stage);
    formData.append("caption", "");

    const response = await fetch(`/api/orders/${orderId}/photos`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`
      },
      body: formData
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || "erro ao enviar foto");
    }

    const photo = normalizePhoto(await response.json());

    setBudgets((current) =>
      current.map((item) => {
        if (item.id !== orderId) return item;

        const photos = Array.isArray(item.photos) ? item.photos : [];
        return {
          ...item,
          photos: [photo, ...photos]
        };
      })
    );

    return photo;
  }

  async function handleDeleteOrderPhoto(orderId, photoId) {
    const response = await fetch(`/api/orders/${orderId}/photos/${photoId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || "erro ao apagar foto");
    }

    setBudgets((current) =>
      current.map((item) => {
        if (item.id !== orderId) return item;

        return {
          ...item,
          photos: orderPhotos(item).filter((photo) => photo.id !== photoId)
        };
      })
    );
  }

  async function handleUpdateChecklistBudget(orderId, checklist) {
    const updated = await api(`/orders/${orderId}/checklist`, {
      method: "PATCH",
      token,
      body: { checklist }
    });

    const normalized = syncOrderStatusFromProduction(enrichOperationalOrder(normalizeOrder(updated), updated));

    setBudgets((current) =>
      current.map((item) => (item.id === normalized.id ? normalized : item))
    );

    return normalized;
  }

  async function handleUpdateProductionBudget(orderId, productionStatus, productionNotes = "") {
    const updated = await api(`/orders/${orderId}/production`, {
      method: "PATCH",
      token,
      body: {
        production_status: productionStatus,
        production_notes: productionNotes
      }
    });

    let normalized = enrichOperationalOrder(normalizeOrder(updated), updated);
    normalized = syncOrderStatusFromProduction(normalized);

    setBudgets((current) =>
      current.map((item) => (item.id === normalized.id ? normalized : item))
    );

    await loadDashboard();

    return normalized;
  }

  function handleNewOrderForCustomer(customer) {
    setEditingBudget(null);
    setDraftPreset(customer ? draftFromCustomer(customer) : null);
    setScreen("new");
  }

  function handleEditBudget(budget) {
    setEditingBudget(budget);
    setCurrentBudget(budget);
    setScreen("new");
  }

  async function handleStatusChange(budget, status) {
    try {
      const updated = await api(`/orders/${budget.id}/status`, {
        method: "PATCH",
        token,
        body: { status }
      });

      const normalized = syncOrderStatusFromProduction(enrichOperationalOrder(normalizeOrder(updated), updated));
      maybeAskScheduleAfterApproved(normalized, handleScheduleBudget);
      setCurrentBudget(normalized);
      await loadOrders();
      await loadCustomers();
      await loadDashboard();
      notify(`status alterado para ${status}`);
    } catch (error) {
      notify(error.message || "erro ao alterar status");
    }
  }

  async function handleDeleteBudget(budget) {
    const ok = window.confirm("apagar este orçamento do banco?");
    if (!ok) return;

    try {
      await api(`/orders/${budget.id}`, { method: "DELETE", token });
      const next = await loadOrders();
      await loadCustomers();
      await loadDashboard();
      setCurrentBudget(next[0] || null);
      setScreen("home");
      notify("orçamento apagado");
    } catch (error) {
      notify(error.message || "erro ao apagar");
    }
  }

  async function handleUploadLogo(file) {
    try {
      const formData = new FormData();
      formData.append("file", file);

      const updated = await api("/workshop/logo", {
        method: "POST",
        token,
        body: formData
      });

      setWorkshop(normalizeWorkshop(updated));
      notify("logomarca atualizada");
    } catch (error) {
      notify(error.message || "erro ao enviar logo");
    }
  }

  async function handleSaveWorkshop(form) {
    try {
      const updated = await api("/workshop", {
        method: "PATCH",
        token,
        body: {
          email: form.email || null,
          phone: form.phone || "",
          address: form.address || ""
        }
      });

      setWorkshop(normalizeWorkshop(updated));
      notify("dados permitidos atualizados");
    } catch (error) {
      notify(error.message || "erro ao salvar oficina");
    }
  }

  function handleWhatsapp(budget) {
    let phone = onlyDigits(budget.customer.phone);
    if (phone.length === 10 || phone.length === 11) phone = `55${phone}`;

    if (!phone) {
      notify("adicione telefone do cliente");
      return;
    }

    const text = encodeURIComponent(buildWhatsappText(budget, workshop));
    window.open(`https://wa.me/${phone}?text=${text}`, "_blank");
  }

  function handleEmail(budget) {
    const subject = encodeURIComponent(`orçamento #${budget.id} - ${workshop.name}`);
    const body = encodeURIComponent(buildWhatsappText(budget, workshop));
    window.location.href = `mailto:${budget.customer.email || ""}?subject=${subject}&body=${body}`;
  }

  async function handleCopyReport(budget) {
    const report = buildInsuranceReport(budget, workshop);

    try {
      await navigator.clipboard.writeText(report);
      notify("relatório copiado");
    } catch {
      window.prompt("copie o relatório:", report);
    }
  }

  async function handlePrint(budget) {
    try {
      notify("gerando pdf...");

      const response = await fetch(`${API_BASE}/orders/${budget.id}/pdf`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        let message = "erro ao gerar pdf";

        try {
          const data = await response.json();
          message = apiErrorMessage(data, message);
        } catch {
          message = await response.text() || message;
        }

        throw new Error(message);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = pdfFileName(budget, workshop);
      document.body.appendChild(link);
      link.click();
      link.remove();

      window.setTimeout(() => URL.revokeObjectURL(url), 3000);
      notify("pdf baixado");
    } catch (error) {
      notify(error.message || "erro ao baixar pdf");
    }
  }

  function handleLogout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken("");
    setUser(null);
    setWorkshop(null);
    setBudgets([]);
    setCustomers([]);
    setDashboard(null);
    setCurrentBudget(null);
    setCurrentCustomer(null);
    setEditingBudget(null);
    setDraftPreset(null);
    setScreen("login");
    notify("sessão encerrada");
  }

  if (booting) return <Splash />;

  let content;

  if (screen === "login") {
    content = <Login onLogin={handleLogin} goAdmin={() => setScreen("admin-login")} />;
  }

  if (screen === "admin-login") {
    content = (
      <AdminPanelLogin
        goLogin={() => setScreen("login")}
        onLogin={handleAdminPanelLogin}
      />
    );
  }

  if (screen === "control-panel") {
    content = (
      <SubscriberControlPanel
        goLogin={() => setScreen("login")}
        subscribers={subscribers}
        onRefresh={() => loadSubscribers()}
        onCreateSubscriber={handleCreateSubscriber}
        onUpdateSubscriber={handleUpdateSubscriber}
        onResetOwnerPassword={handleResetOwnerPassword}
        onLoadSubscriberAudit={handleLoadSubscriberAudit}
        onLogout={handleAdminLogout}
      />
    );
  }

  if (screen === "admin") {
    content = <AdminScreen goLogin={() => setScreen("login")} onCreated={handleAdminCreate} />;
  }

  if (screen === "home" && workshop) {
    content = (
      <Home
        go={navigate}
        budgets={budgets}
        workshop={workshop}
        user={user}
        openBudget={openBudget}
        onDeleteBudget={handleDeleteBudget}
        onLogout={handleLogout}
              onScheduleBudget={handleScheduleBudget}
        onReceiveBudget={handleVehicleArrived}
/>
    );
  }

  if (screen === "dashboard" && workshop) {
    content = (
      <DashboardScreen
        go={navigate}
        dashboard={dashboard}
        openBudget={openBudget}
      />
    );
  }


  if (screen === "customers" && workshop) {
    content = (
      <CustomersScreen
        go={navigate}
        customers={customers}
        openCustomer={openCustomer}
        onNewOrder={handleNewOrderForCustomer}
      />
    );
  }

  if (screen === "customer" && workshop) {
    content = (
      <CustomerDetailScreen
        go={navigate}
        customer={currentCustomer}
        openBudget={openBudget}
        onNewOrder={handleNewOrderForCustomer}
      />
    );
  }


  if (screen === "new" && workshop) {
    const draftSeed = editingBudget
      ? draftFromBudget(editingBudget)
      : draftPreset
        ? clone(draftPreset)
        : emptyDraft;

    content = (
      <NewBudget
        key={editingBudget?.id || draftPreset?.customer?.phone || "new-budget"}
        go={navigate}
        initialDraft={draftSeed}
        editingBudget={editingBudget}
        onSaveDraft={handleSaveDraft}
        onGenerate={handleGenerate}
      />
    );
  }

  if (screen === "ready" && workshop && currentBudget) {
    content = (
      <ReadyBudget
        go={navigate}
        budget={currentBudget}
        workshop={workshop}
        token={token}
        onWhatsapp={handleWhatsapp}
        onEmail={handleEmail}
        onPrint={handlePrint}
        onDelete={handleDeleteBudget}
        onEdit={handleEditBudget}
        onStatusChange={handleStatusChange}
        onScheduleBudget={handleScheduleBudget}
        onProductionChange={handleUpdateProductionBudget}
        onCopyReport={handleCopyReport}
      />
    );
  }

  if (screen === "settings" && workshop) {
    content = (
      <SettingsScreen
        go={navigate}
        workshop={workshop}
        onSaveWorkshop={handleSaveWorkshop}
        onUploadLogo={handleUploadLogo}
      />
    );
  }
  if (screen === "production") {
    return (
      <ProductionScreen
        go={setScreen}
        budgets={budgets}
        openBudget={openBudget}
        onUpdateProduction={handleUpdateProductionBudget}
        onUpdateChecklist={handleUpdateChecklistBudget}
        onUploadPhoto={handleUploadOrderPhoto}
        onDeletePhoto={handleDeleteOrderPhoto}
        onScheduleBudget={handleScheduleBudget}
      />
    );
  }



  return (
    <>
      {content || <Login onLogin={handleLogin} goAdmin={() => setScreen("admin")} />}
      <Toast message={toast} />
    </>
  );
}

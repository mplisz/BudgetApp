// ============================================================
// File: src/data/constants/ui.js
// UI-only constants: colors, labels, icons, pickers.
// No business logic, no panel routing — those live in panels.js.
// ============================================================

export const POPULAR_EMOJIS = [
  "🛒", "🏠", "🏡", "🛋️", "🪴", "🧹", "🪣", "🧴", "🧻", "🪟",
  "🚗", "🚕", "🚌", "🚇", "🚲", "🛵", "✈️", "⛽", "🅿️", "🛞",
  "🍽️", "🍔", "🍕", "🥗", "🥡", "🍱", "☕", "🍺", "🧃", "🍷",
  "💊", "🏥", "🩺", "💉", "💇", "🧖", "🪥", "🧼", "🩹", "🏋️",
  "🎭", "🎮", "🎬", "🎵", "🎸", "📺", "🎳", "🎯", "🎲", "🏊",
  "📚", "📖", "🖥️", "💻", "🖨️", "📝", "🎓", "📐", "📏", "🗂️",
  "💰", "💳", "💵", "🏦", "📈", "📉", "🪙", "💸", "🧾", "💹",
  "📱", "📷", "🎧", "🔋", "🖱️", "⌨️", "📡", "🔌", "📠", "⌚",
  "👶", "🧸", "🎠", "🍼", "🧒", "👨‍👩‍👧", "🎒", "🛝", "🪀", "🖍️",
  "👗", "👟", "👔", "🧥", "👜", "🕶️", "💍", "👒", "🧣", "👠",
  "🔧", "🔨", "🪛", "🔩", "🪚", "🪜", "🧰", "⚙️", "🪝", "🔦",
  "🎁", "🎉", "🎂", "🥂", "🎊", "💐", "🎈", "🪅", "🎀", "🃏",
  "📦", "📰", "📧", "🗞️", "📨", "📬", "🗃️", "📋", "🔔", "📲",
  "💡", "🌍", "🌱", "☀️", "🌙", "⚡", "🔑", "🏷️", "🪐", "❓",
];

// ── Priorities ───────────────────────────────────────────────

export const PRIORITY_LABELS = {
  1: { label: "Krytyczne",     color: "#ef4444", desc: "Niezbędne do życia"   },
  2: { label: "Ważne",         color: "#f97316", desc: "Potrzeby podstawowe"  },
  3: { label: "Komfort",       color: "#eab308", desc: "Luksus i przyjemności" },
  4: { label: "Poza poduszką", color: "#6b7280", desc: "Nie wlicza się"       },
};

export const PRIO_COLORS = {
  1: "#ef4444",
  2: "#f97316",
  3: "#eab308",
  4: "#6b7280",
};

// ── Calendar ─────────────────────────────────────────────────

export const MONTHS = [
  "Styczeń", "Luty",    "Marzec",     "Kwiecień", "Maj",     "Czerwiec",
  "Lipiec",  "Sierpień", "Wrzesień",  "Październik", "Listopad", "Grudzień",
];

// ── Charts ───────────────────────────────────────────────────

export const PIE_COLORS = [
  "#10b981", "#3b82f6", "#f97316", "#a855f7", "#ec4899",
  "#eab308", "#06b6d4", "#ef4444", "#84cc16", "#f43f5e",
];

export const PIE_COLORS_TREND = PIE_COLORS;

// ── Date range pickers ───────────────────────────────────────

export const DATE_PILLS = [
  { label: "1 msc",     months: 1    },
  { label: "3 msc",     months: 3    },
  { label: "6 msc",     months: 6    },
  { label: "12 msc",    months: 12   },
  { label: "Wszystkie", months: null },
];

// ── Recurring transactions ───────────────────────────────────

export const FREQUENCY_OPTIONS = [
  { value: "monthly",   label: "Co miesiąc"                            },
  { value: "quarterly", label: "Co kwartał"                            },
  { value: "biannual",  label: "Co pół roku"                           },
  { value: "yearly",    label: "Co rok"                                },
  { value: "custom",    label: "Niestandardowo (wybierz miesiące)"     },
];

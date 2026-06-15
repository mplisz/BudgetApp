// ============================================================
// File: src/data/currencies.ts  (adjust path to your project)
// Printed currency symbol / abbreviation → ISO 4217 code.
//
// PURPOSE
//   Safety net for OCR. After the backend prompt is told to return ISO
//   codes, this only fires when the model still hands back a printed mark
//   ("Kč", "zł", "$"). normalizeCurrency() turns that into a 3-letter code
//   the NBP rate lookup can use.
//
// ⚠️ GLYPH COLLISIONS
//   Many currencies share a symbol ($, kr, £, ¥, ₨, R, Br, DH…). This map
//   cannot see the receipt's country, so for an ambiguous glyph it returns
//   the single most common code and lists the alternatives in a comment.
//   Treat ambiguous hits as best-effort; the user can override the rate or
//   edit the cart item. Unambiguous glyphs (the majority of exotics) are
//   exact.
//
// NOT INCLUDED
//   Crypto (₿ BTC, Ξ ETH, Ł LTC) — not ISO 4217; NBP has no rate, including
//   them would only produce silent failures. Add a separate map if needed.
//
//   A few entries are redenominated/retired currencies (HRK "kn", VEF…)
//   kept for OLD receipts; NBP still serves historical rates for their
//   active period. Marked inline.
// ============================================================

export const CURRENCY_SYMBOLS: Record<string, string> = {
  // ── Global / major ──────────────────────────────────────────
  "€":    "EUR",
  "$":    "USD",   // collision: CAD AUD NZD MXN ARS CLP COP HKD SGD… → USD default
  "£":    "GBP",   // collision: EGP LBP SYP FKP GIP SHP… → GBP default
  "¥":    "JPY",   // collision: CNY → JPY default (use 元/円 below to disambiguate)
  "円":   "JPY",
  "元":   "CNY",
  "圆":   "CNY",
  "圓":   "CNY",
  "₩":    "KRW",
  "Fr":   "CHF",   // Switzerland; collision: old French/African francs
  "Fr.":  "CHF",
  "SFr":  "CHF",
  "CHF":  "CHF",
  "₣":    "CHF",   // historic franc glyph

  // ── Europe (non-euro) ───────────────────────────────────────
  "zł":   "PLN",
  "Kč":   "CZK",
  "Ft":   "HUF",
  "kr":   "SEK",   // collision: NOK DKK ISK FOK → SEK default
  "kr.":  "DKK",   // the dotted form is most often Danish in practice
  "lei":  "RON",   // collision: MDL (Moldova) also "lei" → RON default
  "лв":   "BGN",
  "kn":   "HRK",   // Croatia — retired 2023 (now EUR); kept for old receipts
  "din":  "RSD",   // Serbia
  "дин":  "RSD",
  "дин.": "RSD",
  "KM":   "BAM",   // Bosnia & Herzegovina (konvertibilna marka)
  "ден":  "MKD",   // North Macedonia
  "Lek":  "ALL",   // Albania
  "₾":    "GEL",   // Georgia
  "֏":    "AMD",   // Armenia
  "₼":    "AZN",   // Azerbaijan
  "₺":    "TRY",   // Turkey

  // ── CIS / Eastern Europe ────────────────────────────────────
  "₽":    "RUB",
  "руб":  "RUB",
  "руб.": "RUB",
  "р.":   "RUB",
  "₴":    "UAH",
  "грн":  "UAH",
  "грн.": "UAH",
  "Br":   "BYN",   // Belarus; collision: ETB (Ethiopia) — see "ብር" below
  "₸":    "KZT",   // Kazakhstan
  "сом":  "KGS",   // Kyrgyzstan; collision: UZS (see so'm)
  "so'm": "UZS",   // Uzbekistan
  "soʻm": "UZS",
  "сўм":  "UZS",
  "SM":   "TJS",   // Tajikistan (somoni)
  "смн":  "TJS",
  "m":    "TMT",   // Turkmenistan manat (rarely printed bare)

  // ── Middle East / North Africa (Arabic marks vary; tune if needed) ──
  "₪":    "ILS",   // Israel
  "﷼":    "SAR",   // shared rial glyph → SAR default; collision: IRR YER
  "ر.س":  "SAR",
  "ر.ق":  "QAR",
  "ر.ع.": "OMR",
  "ر.ي":  "YER",
  "﷼ ":   "IRR",   // (kept distinct only if your data uses a trailing space)
  "د.إ":  "AED",
  "د.ك":  "KWD",
  "د.ب":  "BHD",
  "د.ا":  "JOD",
  "د.ع":  "IQD",
  "د.ج":  "DZD",
  "د.م.": "MAD",
  "د.ت":  "TND",
  "ل.د":  "LYD",
  "ل.ل":  "LBP",
  "ل.س":  "SYP",
  "ج.م":  "EGP",
  "£E":   "EGP",
  "DH":   "MAD",   // Morocco; collision: Dhs (AED) below
  "Dhs":  "AED",   // UAE
  "DA":   "DZD",   // Algeria

  // ── South & Central Asia ────────────────────────────────────
  "₹":    "INR",
  "Rs":   "INR",   // collision: PKR LKR NPR MUR SCR → INR default
  "Rs.":  "INR",
  "₨":    "PKR",   // shared rupee glyph → PKR default; collision: LKR NPR…
  "රු":   "LKR",   // Sri Lanka
  "৳":    "BDT",   // Bangladesh
  "Tk":   "BDT",
  "Nu.":  "BTN",   // Bhutan (ngultrum)
  "Rf":   "MVR",   // Maldives (rufiyaa)
  "؋":    "AFN",   // Afghanistan
  "Af":   "AFN",

  // ── East & Southeast Asia ───────────────────────────────────
  "฿":    "THB",   // Thailand
  "₫":    "VND",   // Vietnam
  "₱":    "PHP",   // Philippines
  "₭":    "LAK",   // Laos
  "៛":    "KHR",   // Cambodia
  "₮":    "MNT",   // Mongolia
  "Ks":   "MMK",   // Myanmar (kyat)
  "Rp":   "IDR",   // Indonesia
  "RM":   "MYR",   // Malaysia
  "S$":   "SGD",   // Singapore
  "NT$":  "TWD",   // Taiwan
  "HK$":  "HKD",   // Hong Kong
  "MOP$": "MOP",   // Macau

  // ── Africa ──────────────────────────────────────────────────
  "₦":    "NGN",   // Nigeria
  "₵":    "GHS",   // Ghana
  "GH₵":  "GHS",
  "ብር":   "ETB",   // Ethiopia (Amharic) — distinct from "Br" (BYN above)
  "KSh":  "KES",   // Kenya
  "USh":  "UGX",   // Uganda
  "TSh":  "TZS",   // Tanzania
  "FRw":  "RWF",   // Rwanda
  "FBu":  "BIF",   // Burundi
  "FC":   "CDF",   // DR Congo (franc congolais)
  "R":    "ZAR",   // South Africa; collision: BRL uses "R$" (below)
  "MK":   "MWK",   // Malawi (kwacha)
  "ZK":   "ZMW",   // Zambia (kwacha)
  "MT":   "MZN",   // Mozambique (metical)
  "Db":   "STN",   // São Tomé & Príncipe (dobra)
  "Ar":   "MGA",   // Madagascar (ariary)
  "Nfk":  "ERN",   // Eritrea (nakfa)
  "Le":   "SLE",   // Sierra Leone (leone; redenominated 2022, was SLL)
  "UM":   "MRU",   // Mauritania (ouguiya)
  "FCFA": "XOF",   // West African CFA; collision: XAF (Central) → XOF default
  "CFA":  "XOF",
  "CFP":  "XPF",   // French Pacific franc

  // ── North America ───────────────────────────────────────────
  "C$":   "CAD",   // collision: NIO (Nicaragua) also "C$" → CAD default
  "CA$":  "CAD",
  "Can$": "CAD",
  "US$":  "USD",
  "Mex$": "MXN",
  "MX$":  "MXN",

  // ── Central America & Caribbean ─────────────────────────────
  "₡":    "CRC",   // Costa Rica (colón)
  "Q":    "GTQ",   // Guatemala (quetzal)
  "Lps":  "HNL",   // Honduras (lempira)
  "C$ ":  "NIO",   // Nicaragua (córdoba) — trailing space variant, optional
  "RD$":  "DOP",   // Dominican Republic
  "B/.":  "PAB",   // Panama (balboa)
  "J$":   "JMD",   // Jamaica
  "TT$":  "TTD",   // Trinidad & Tobago
  "BZ$":  "BZD",   // Belize

  // ── South America ───────────────────────────────────────────
  "R$":   "BRL",   // Brazil (real)
  "S/":   "PEN",   // Peru (sol)
  "S/.":  "PEN",
  "Bs":   "BOB",   // Bolivia (boliviano); collision: VES uses "Bs.S"
  "Bs.S": "VES",   // Venezuela (bolívar soberano)
  "₲":    "PYG",   // Paraguay (guaraní)
  "Gs":   "PYG",
  "Col$": "COP",   // Colombia
  "Arg$": "ARS",   // Argentina
  "G$":   "GYD",   // Guyana

  // ── Oceania ─────────────────────────────────────────────────
  "A$":   "AUD",   // Australia
  "AU$":  "AUD",
  "NZ$":  "NZD",   // New Zealand
  "FJ$":  "FJD",   // Fiji
  "T$":   "TOP",   // Tonga (paʻanga)
  "VT":   "VUV",   // Vanuatu (vatu)
  "WS$":  "WST",   // Samoa (tala)
  "SI$":  "SBD",   // Solomon Islands
};


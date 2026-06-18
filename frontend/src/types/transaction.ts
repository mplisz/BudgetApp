// ============================================================
// File: src/types/transaction.ts
// Shared domain types for transaction form and related components.
// ============================================================

export type Priority = 1 | 2 | 3 | 4;

// A single voucher applied to a transaction. amount is always PLN
// (percent vouchers are pre-resolved to their PLN value).
export interface VoucherAllocation {
  voucherId: string;
  amount:    number;
}

export interface Voucher {
  id:                  string;
  code:                string;
  description:         string;
  store:               string;                    // mandatory — drives store-match
  valueType:           "amount" | "percent";
  percentValue?:       number | null;             // percent vouchers
  remainingValue:      number;                     // amount vouchers (0 for percent)
  expiresAt?:          string;
  isArchived:          boolean;
  initialValue:        number;
  currency?:           string;
  usedInTransactions?: Array<{ amount: number }>;
}

export interface CartItem {
  _cartId:        string;
  useVoucher?:    boolean;
  voucherId?:     string | null;
  voucherAmount?: number;
  voucherAllocations?: VoucherAllocation[];
}

export interface RateInfo {
  activeRate:       number;
  resolvedCurrency: string;
}

export type DiscountMode = "per_order" | "per_unit";

export interface DiscountSummary {
  gross:       number;   // unit price
  discount:    number;   // discount amount (per_order = total, per_unit = per piece)
  net:         number;   // final total after discount
  pct:         number;   // discount % relative to gross total
  grossTotal:  number;   // gross × qty
  qty:         number;
  mode:        DiscountMode;
}

export interface FormValues {
  date:            Date;
  currency:        string;
  customCurrency:  string;
  amountOrig:      string;
  subcategoryId:   string;
  subcategoryName: string;
  categoryId:      string;
  categoryName:    string;
  categoryType:    string | null;
  priority:        Priority;
  description:     string;
  tags:            string[];
  voucherAllocations: VoucherAllocation[];
  amountGross:     string;
  discountAmount:  string;
  qty:             number;
  merchant:        string;
  lineItems:       FormLineItem[];
}

export interface TransactionPayload {
  date:             string;
  type:             string;
  budgetMonth:      string;
  subcategoryId:    string;
  subcategoryName:  string;
  categoryId:       string;
  categoryName:     string;
  amount:           number;
  originalAmount:   number;
  originalCurrency: string;
  fxRate:           number;
  description:      string;
  tags:             string[];
  priority:         Priority;
  useVoucher:       boolean;
  voucherId:        string | null;
  voucherAmount:    number;
  voucherAllocations?: VoucherAllocation[];
  netAmount:        number;
  isRecurring:      boolean;
  recurringId:      null;
  receiptBlobPath?: string | null;
  receiptId?:       string | null;   
  merchant?:        string | null;  
  isWarranty?:      boolean;                                       
  lineItems?:       Array<{
                      description:       string;
                      amount:            number;          // PLN — always
                      originalAmount?:   number;          // Original amount
                      originalCurrency?: string;          // for example "CZK"; if absent ⇒ PLN
                    }>;
}

export interface TransactionFormProps {
  initialValues?: FormValues;
  budgetMonth:    string;
  onSubmit:       (payload: TransactionPayload) => Promise<void> | void;
  onCancel?:      () => void;
  onAddToCart?:   (payload: TransactionPayload) => void;
  isSaving?:      boolean;
  mode?:          "add" | "edit";
  cart?:          CartItem[];
  showVouchers?:  boolean;   // default true; cart-item edits pass false (cart-level only)
}

export interface FormLineItem {
  description:    string;
  originalAmount: string;   // editable
}
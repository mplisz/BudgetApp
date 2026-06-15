// ============================================================
// File: src/types/transaction.ts
// Shared domain types for transaction form and related components.
// ============================================================

export type Priority = 1 | 2 | 3 | 4;

export interface Voucher {
  id:                  string;
  code:                string;
  remainingValue:      number;
  expiresAt?:          string;
  isArchived:          boolean;
  initialValue:        number;
  usedInTransactions?: Array<{ amount: number }>;
}

export interface CartItem {
  _cartId:       string;
  useVoucher?:   boolean;
  voucherId?:    string;
  voucherAmount?: number;
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
  useVoucher:      boolean;
  voucherId:       string;
  voucherAmount:   string;
  amountGross:     string;
  discountAmount:  string;
  qty:             number;
  merchant:        string;
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
}
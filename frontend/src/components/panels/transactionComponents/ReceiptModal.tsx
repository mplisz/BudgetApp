// ============================================================
// File: src/components/panels/transactionComponents/ReceiptModal.tsx
// Receipt preview (photo or PDF e-receipt) — the shared stored-file
// viewer pointed at the transaction's receipt proxy
// (GET /api/transactions/:id/receipt).
// ============================================================

import { StoredFileModal } from "../../ui/StoredFileModal";

interface ReceiptModalProps {
  txId:    string;
  onClose: () => void;
}

export function ReceiptModal({ txId, onClose }: ReceiptModalProps) {
  return <StoredFileModal path={`/api/transactions/${txId}/receipt`} title="🧾 Paragon" onClose={onClose} />;
}

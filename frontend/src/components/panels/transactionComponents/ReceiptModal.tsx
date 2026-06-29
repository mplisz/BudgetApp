// ============================================================
// File: src/components/panels/transactionComponents/ReceiptModal.tsx
// Receipt photo preview. The blob container is PRIVATE, so the
// image is fetched through the authenticated backend proxy
// (GET /api/transactions/:id/receipt) and shown via an object
// URL, which is revoked on unmount to avoid memory leaks.
// ============================================================

import { useState, useEffect } from "react";
import { useAuth } from "../../../context/AuthContext";
import { c } from "../../../styles/tokens";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

interface ReceiptModalProps {
  txId:    string;
  onClose: () => void;
}

export function ReceiptModal({ txId, onClose }: ReceiptModalProps) {
  const { fetchWithAuth } = useAuth() as {
    fetchWithAuth: (url: string, opts?: RequestInit) => Promise<Response>;
  };

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [error,    setError]    = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetchWithAuth(`${API_URL}/api/transactions/${txId}/receipt`);
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error === "Receipt file not found."
            ? "Plik paragonu nie istnieje (mógł zostać usunięty)."
            : "Nie udało się pobrać paragonu.");
        }
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setImageUrl(objectUrl);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Błąd pobierania.");
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [txId, fetchWithAuth]);

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1000, padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: c.surface, border: `1px solid ${c.border}`, borderRadius: 14,
          padding: 16, maxWidth: "90vw", maxHeight: "90vh",
          display: "flex", flexDirection: "column", gap: 12,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ color: c.text, fontWeight: 700, fontSize: 14 }}>🧾 Paragon</span>
          <button
            onClick={onClose}
            style={{ background: "none", border: "none", color: c.textSecondary, cursor: "pointer", fontSize: 18, padding: "0 4px" }}
          >
            ✕
          </button>
        </div>

        <div style={{ overflow: "auto", display: "flex", justifyContent: "center", minHeight: 200, minWidth: 280 }}>
          {error ? (
            <div style={{ color: c.dangerLight, fontSize: 13, alignSelf: "center" }}>⚠️ {error}</div>
          ) : imageUrl ? (
            <img
              src={imageUrl}
              alt="Paragon"
              style={{ maxWidth: "100%", maxHeight: "75vh", borderRadius: 8, objectFit: "contain" }}
            />
          ) : (
            <div style={{ color: c.textSecondary, fontSize: 13, alignSelf: "center" }}>⏳ Ładowanie…</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// File: src/components/ui/StoredFileModal.tsx
// Preview of a file kept in the private blob container — a receipt
// (photo or PDF e-receipt) or a shopping-list item's photo. The
// container is PRIVATE, so the file is fetched through an
// authenticated backend proxy and shown via an object URL, which is
// revoked on unmount to avoid memory leaks.
// PDFs render in an <iframe> — <img> can't display them.
// ============================================================

import { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { c } from "../../styles/tokens";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

interface StoredFileModalProps {
  /** Backend proxy path, e.g. `/api/transactions/:id/receipt`. */
  path:    string;
  title:   string;
  onClose: () => void;
}

export function StoredFileModal({ path, title, onClose }: StoredFileModalProps) {
  const { fetchWithAuth } = useAuth();

  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [isPdf,   setIsPdf]   = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetchWithAuth(`${API_URL}${path}`);
        if (!res.ok) {
          throw new Error(res.status === 404
            ? "Plik nie istnieje (mógł zostać usunięty)."
            : "Nie udało się pobrać pliku.");
        }
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) {
          setIsPdf(blob.type === "application/pdf");
          setFileUrl(objectUrl);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Błąd pobierania.");
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, fetchWithAuth]);

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
          <span style={{ color: c.text, fontWeight: 700, fontSize: 14 }}>{title}</span>
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
          ) : fileUrl && isPdf ? (
            // Mobile browsers refuse to render a PDF inside an iframe, so the
            // escape hatch below is the only viewer there.
            <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
              <iframe
                src={fileUrl}
                title={`${title} (PDF)`}
                style={{ width: "80vw", maxWidth: 800, height: "75vh", border: "none", borderRadius: 8, background: "#fff" }}
              />
              <a
                href={fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: c.textSecondary, fontSize: 12, textDecoration: "none" }}
              >
                ↗ Otwórz PDF w nowej karcie
              </a>
            </div>
          ) : fileUrl ? (
            <img
              src={fileUrl}
              alt={title}
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

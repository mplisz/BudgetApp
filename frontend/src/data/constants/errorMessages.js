// ============================================================
// File: src/data/constants/errorMessages.js
// Maps backend error messages (English keys) to Polish UI messages.
// Backend ALWAYS sends English — frontend translates via translateError().
// ============================================================

export const API_ERRORS = {
  // ── Categories ───────────────────────────────────────────────
  "Category with this name already exists.":                          "Kategoria o tej nazwie już istnieje.",
  "Subcategory with this name already exists in this category.":      "Subkategoria o tej nazwie już istnieje w tej kategorii.",
  "Invalid name. Must be between 2 and 50 characters.":               "Nieprawidłowa nazwa. Musi mieć od 2 do 50 znaków.",
  "Parent category not found.":                                        "Nie znaleziono kategorii nadrzędnej.",
  "Parent category not found in your family scope.":                  "Nie znaleziono kategorii nadrzędnej.",
  "Main category must have a valid type (EXPENSE, INCOME, SAVING, TRANSFER).": "Kategoria główna musi mieć określony typ.",
  "Category not found or unauthorized.":                               "Nie znaleziono kategorii lub brak uprawnień.",

  // ── Tags ─────────────────────────────────────────────────────
  "Tag with this name already exists.":   "Tag o tej nazwie już istnieje.",
  "Tag not found or unauthorized.":       "Nie znaleziono tagu lub brak uprawnień.",
  "Failed to add tag.":                   "Nie udało się dodać tagu.",
  "Failed to update tag.":                "Nie udało się zmodyfikować tagu.",

  // ── Transactions ─────────────────────────────────────────────
  "Transaction not found.":              "Nie znaleziono transakcji.",
  "Cannot edit a deleted transaction.":  "Nie można edytować usuniętej transakcji.",
  "Already deleted.":                    "Transakcja jest już usunięta.",
  "The update of the transaction failed.": "Nie udało się zaktualizować transakcji.",
  "The transaction couldn't be deleted" : "Nie udało się usunąć transakcji",
  "Data was modified by another user. Please refresh and try again.": "Dane zostały zmodyfikowane przez innego użytkownika. Odśwież i spróbuj ponownie.",
  
  // ── Transaction form validation ───────────────────────────────
  "Select a subcategory.":                                          "Wybierz subkategorię.",
  "Enter an amount greater than 0.":                               "Podaj kwotę większą od zera.",
  "Missing exchange rate.":                                         "Brak kursu walutowego.",
  "Select a currency.":                                             "Wybierz walutę.",
  "Discount cannot be equal to or greater than the gross amount.": "Upust nie może być równy ani większy od kwoty brutto.",
  "Discount cannot be equal to or greater than the order total.": "Upust nie może być równy ani większy od sumy zamówienia.",

  // ── Returns ──────────────────────────────────────────────────
  "Transaction is deleted.":             "Transakcja jest usunięta.",
  "Return amount exceeds transaction amount.": "Kwota zwrotu przekracza kwotę transakcji.",
  "cashAmount + voucherAmount must equal amount.": "Suma gotówki i vouchera musi być równa kwocie zwrotu.",
  "Return month cannot be before purchase month.": "Miesiąc zwrotu nie może być wcześniejszy niż miesiąc zakupu.",
  "Return month is outside the allowed window.":   "Miesiąc zwrotu poza dozwolonym oknem.",
  "Target month is closed.":             "Docelowy miesiąc jest zamknięty.",
  "Failed to save return.":              "Nie udało się zapisać zwrotu.",

  // ── Vouchers ─────────────────────────────────────────────────
  "Voucher not found.":                  "Nie znaleziono vouchera.",
  "Voucher is archived.":                "Voucher jest zarchiwizowany.",
  "Voucher is already archived.":        "Voucher jest już zarchiwizowany.",
  "Failed to create voucher.":           "Nie udało się dodać vouchera.",
  "Failed to update voucher.":           "Nie udało się zaktualizować vouchera.",
  "Failed to archive voucher.":          "Nie udało się zarchiwizować vouchera.",

  // ── Limits ───────────────────────────────────────────────────
  "Failed to fetch limits.":             "Nie udało się pobrać limitów.",
  "Batch save failed.":                  "Nie udało się zapisać limitów.",
  "Historical write blocked.":           "Nie można modyfikować limitów z przeszłości.",

  // ── Months ───────────────────────────────────────────────────
  "Month is already closed.":            "Miesiąc jest już zamknięty.",
  "Previous month is not closed yet.":   "Poprzedni miesiąc nie jest jeszcze zamknięty.",
  "Month not found.":                    "Nie znaleziono miesiąca.",
  "Failed to close month.":              "Nie udało się zamknąć miesiąca.",

  // ── Auth ─────────────────────────────────────────────────────
  "Access denied. Your email is not on the whitelist.": "Brak dostępu. Twój email nie jest na liście.",
  "Invalid Google authentication token":                "Nieprawidłowy token Google.",
  "Missing authentication token":                       "Brak tokenu uwierzytelniającego.",
  "Session expired. Please log in again.":              "Sesja wygasła. Zaloguj się ponownie.",

  // ── Shared / Zod ─────────────────────────────────────────────
  "Invalid ID format":                   "Błędny format ID.",
  "Invalid name format":                 "Nieprawidłowy format nazwy.",
  "No valid fields provided for update.": "Nie podano żadnych pól do aktualizacji.",
  "Name must be at least 2 characters":  "Nazwa musi mieć co najmniej 2 znaki.",
  "Name must be at most 30 characters":  "Nazwa nie może przekraczać 30 znaków.",
  "Name must be at most 50 characters":  "Nazwa nie może przekraczać 50 znaków.",
  "Invalid budgetMonth format (YYYY-MM)": "Nieprawidłowy format miesiąca (YYYY-MM).",
  "Failed to fetch":                     "Nie udało się pobrać danych.",


  // ──RATE LIMITING ─────────────────────────────────────────────
  "Too many refresh attempts, please try again later.":           "Zbyt wiele prób odświeżenia. Spróbuj ponownie później.",
  "Too many login attempts, please try again later.":             "Zbyt wiele prób logowania. Spróbuj ponownie później.",
  "Too many requests to limits container, please try again later.": "Zbyt wiele zapytań o limity. Spróbuj ponownie później.",
  "Too many requests from this IP, please try again later.":      "Zbyt wiele zapytań z Twojego adresu IP. Spróbuj ponownie później.",
  "Too many write operations, please slow down.":                 "Zbyt wiele zapisów do bazy. Zwolnij troszeczkę."
};

export function translateError(backendMsg, fallback = "Wystąpił nieoczekiwany błąd.") {
  if (!backendMsg) return fallback;
  return API_ERRORS[backendMsg] ?? fallback;
}
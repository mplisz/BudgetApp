// ============================================================
// File: src/data/constants/errorMessages.js
// Maps backend error messages to Polish UI messages
// ============================================================

export const API_ERRORS = {
  // Categories
  "Category with this name already exists.": "Kategoria o tej nazwie już istnieje.",
  "Subcategory with this name already exists in this category.": "Subkategoria o tej nazwie już istnieje w tej kategorii.",
  "Invalid name. Must be between 2 and 50 characters.": "Nieprawidłowa nazwa. Musi mieć od 2 do 50 znaków.",
  "Parent category not found.": "Nie znaleziono kategorii nadrzędnej.",
  "Parent category not found in your family scope.": "Nie znaleziono kategorii nadrzędnej.",
  "Main category must have a valid type (EXPENSE, INCOME, SAVING, TRANSFER).": "Kategoria główna musi mieć określony typ  (EXPENSE, INCOME, SAVING, TRANSFER).",
  "Category not found or unauthorized.": "Nie znaleziono kategorii lub brak uprawnień.",

  // Tags
  "Tag with this name already exists.": "Tag o tej nazwie już istnieje.",
  "Tag not found or unauthorized.": "Nie znaleziono tagu lub brak uprawnień.",
  "Failed to add tag.": "Nie udało się dodać tagu.",
  "Failed to update tag.": "Nie udało się zmodyfikować tagu.",

  // Shared
  "Invalid ID format": "Błędny format ID.",
  "Invalid name format": "Nieprawidłowy format nazwy.",
  "No valid fields provided for update.": "Nie podano żadnych pól do aktualizacji.",

  // Zod
  "Name must be at least 2 characters": "Nazwa musi mieć co najmniej 2 znaki.",
  "Name must be at most 30 characters": "Nazwa nie może przekraczać 30 znaków.",
  "Name must be at most 50 characters": "Nazwa nie może przekraczać 50 znaków.",

  // Auth
  "Access denied. Your email is not on the whitelist.": "Brak dostępu. Twój email nie jest na liście.",
  "Invalid Google authentication token": "Nieprawidłowy token Google.",
  "Missing authentication token": "Brak tokenu uwierzytelniającego.",

  // Generic
  "Session expired. Please log in again.": "Sesja wygasła. Zaloguj się ponownie.",
  "Failed to fetch" :"Nie udało się pobrać danych"
};

export function translateError(backendMsg, fallback = "Wystąpił nieoczekiwany błąd.") {
  return API_ERRORS[backendMsg] ?? fallback;
}
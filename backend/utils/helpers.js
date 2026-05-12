// ============================================================
// File: backend/utils/helpers.js
// ============================================================

const generateId = (text) => {
  if (!text || typeof text !== 'string') return `${Date.now()}`;
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ł/g, "l")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/(^_|_$)/g, "");
};

module.exports = { generateId };
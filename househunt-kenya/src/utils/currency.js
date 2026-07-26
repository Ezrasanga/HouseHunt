/**
 * Currency formatting utilities
 */

export const formatKES = (amount = 0) => {
  const value = Number(amount);

  if (Number.isNaN(value)) {
    return "KSh 0";
  }

  return `KSh ${value.toLocaleString("en-KE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;
};

export const formatCurrency = (
  amount = 0,
  currency = "KES",
  locale = "en-KE"
) => {
  const value = Number(amount);

  if (Number.isNaN(value)) return "";

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
  }).format(value);
};

export const parseCurrency = (value) => {
  if (!value) return 0;

  return Number(String(value).replace(/[^\d.-]/g, "")) || 0;
};
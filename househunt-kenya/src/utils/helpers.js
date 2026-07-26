/**
 * General helper functions
 */

export const generateId = () => {
  return crypto.randomUUID();
};

export const todayStr = () => {
  return new Date().toISOString().split("T")[0];
};

export const nowStr = () => {
  return new Date().toLocaleString("en-KE");
};

export const sleep = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const capitalize = (text = "") => {
  return text.charAt(0).toUpperCase() + text.slice(1);
};

export const slugify = (text = "") => {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
};

export const truncate = (text = "", length = 100) => {
  if (text.length <= length) return text;

  return text.substring(0, length) + "...";
};

export const formatDate = (date) => {
  return new Date(date).toLocaleDateString("en-KE", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

export const formatDateTime = (date) => {
  return new Date(date).toLocaleString("en-KE");
};

export const debounce = (callback, delay = 300) => {
  let timeout;

  return (...args) => {
    clearTimeout(timeout);

    timeout = setTimeout(() => {
      callback(...args);
    }, delay);
  };
};

export const randomImage = (images = []) => {
  if (!images.length) return "";

  return images[Math.floor(Math.random() * images.length)];
};

export const deepClone = (obj) => {
  return structuredClone(obj);
};

export const sortNewest = (items = []) => {
  return [...items].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
};

export const sortOldest = (items = []) => {
  return [...items].sort(
    (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
  );
};
/**
 * Simple profanity/content moderation utilities
 */

const bannedWords = [
  "fuck",
  "shit",
  "bitch",
  "asshole",
  "bastard",
  "damn",
  "idiot",
  "stupid",
  "scam",
  "fraud",
];

export const containsProfanity = (text = "") => {
  const lower = text.toLowerCase();

  return bannedWords.some((word) => lower.includes(word));
};

export const censorText = (text = "") => {
  let output = text;

  bannedWords.forEach((word) => {
    const regex = new RegExp(word, "gi");

    output = output.replace(regex, "*".repeat(word.length));
  });

  return output;
};

export const validateProperty = (property) => {
  const errors = [];

  if (!property.title?.trim())
    errors.push("Property title is required.");

  if (!property.location?.trim())
    errors.push("Location is required.");

  if (!property.description?.trim())
    errors.push("Description is required.");

  if (!property.price || property.price <= 0)
    errors.push("Invalid property price.");

  if (containsProfanity(property.title))
    errors.push("Title contains inappropriate language.");

  if (containsProfanity(property.description))
    errors.push("Description contains inappropriate language.");

  return {
    valid: errors.length === 0,
    errors,
  };
};

export const validateReview = (review) => {
  const errors = [];

  if (!review.trim()) {
    errors.push("Review cannot be empty.");
  }

  if (containsProfanity(review)) {
    errors.push("Review contains inappropriate language.");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

export const cleanObject = (obj) => {
  const cleaned = {};

  Object.entries(obj).forEach(([key, value]) => {
    if (typeof value === "string") {
      cleaned[key] = censorText(value.trim());
    } else {
      cleaned[key] = value;
    }
  });

  return cleaned;
};
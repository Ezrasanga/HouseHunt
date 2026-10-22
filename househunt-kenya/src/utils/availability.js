export function formatAvailabilityConfirmation(value) {
	if (!value) return "Not yet confirmed";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "Confirmation date unavailable";
	return date.toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" });
}

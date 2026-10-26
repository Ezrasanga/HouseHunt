import api from "./api";

export async function uploadPropertyMedia(file) {
	const formData = new FormData();
	formData.append("file", file);
	const response = await api.post("/api/uploads/property-media", formData);
	const media = response.data.data?.media;
	if (!media?.url || !media.publicId || !["image", "video"].includes(media.type)) {
		throw new Error("The media upload returned an invalid response.");
	}
	return media;
}

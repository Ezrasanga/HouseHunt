export default function PropertyGallery({ media, midx, setMidx }) {
  if (!media || media.length <= 1) return null;

  return (
    <div className="thumbrow">
      {media.map((m, i) => (
        <button
          key={i}
          type="button"
          className={`thumb${midx === i ? " on" : ""}`}
          aria-label={`Show ${m.type === "image" ? "image" : "video"} ${i + 1} of ${media.length}`}
          aria-pressed={midx === i}
          onClick={() => setMidx(i)}
        >
          {m.type === "image" ? <img src={m.url} alt="" loading="lazy" decoding="async" /> : <video src={m.url} muted preload="none" />}
        </button>
      ))}
    </div>
  );
}

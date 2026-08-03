export default function PropertyGallery({ media, midx, setMidx }) {
  if (!media || media.length <= 1) return null;

  return (
    <div className="thumbrow">
      {media.map((m, i) => (
        <div key={i} className={`thumb${midx === i ? " on" : ""}`} onClick={() => setMidx(i)}>
          {m.type === "image" ? <img src={m.url} alt="" /> : <video src={m.url} muted />}
        </div>
      ))}
    </div>
  );
}

export default function Toast({ variant, children }) {
  const role = variant === "err" ? "alert" : "status";
  return (
    <div className={`toast ${variant}`} role={role} aria-live={role === "alert" ? "assertive" : "polite"}>
      {children}
    </div>
  );
}

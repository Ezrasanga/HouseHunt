export default function Modal({
  children,
  labelledBy,
  dialogRef,
  className = "",
  onBackdropClick,
  overlayClassName = "",
}) {
  const overlayClasses = ["mov", overlayClassName].filter(Boolean).join(" ");
  const dialogClasses = ["mdl", className].filter(Boolean).join(" ");

  return (
    <div
      className={overlayClasses}
      role="presentation"
      onClick={event => {
        if (event.target === event.currentTarget) onBackdropClick?.();
      }}
    >
      <div
        ref={dialogRef}
        className={dialogClasses}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>
  );
}
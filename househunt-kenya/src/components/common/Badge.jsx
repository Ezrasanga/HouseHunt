export default function Badge({ as: Element = "span", className = "", ...props }) {
  return <Element className={className || undefined} {...props} />;
}
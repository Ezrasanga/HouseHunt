export default function Card({ as: Element = "div", className = "", ...props }) {
  return <Element className={className || undefined} {...props} />;
}
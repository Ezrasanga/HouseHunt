const variantClass = {
  primary: "bp",
  secondary: "bo",
  ghost: "bghost",
  danger: "bdel",
  verify: "bver",
  boost: "bboost",
  ban: "bban",
  approve: "bapp",
  unlock: "bunlock",
};

export default function Button({ variant, className = "", type = "button", ...props }) {
  const classes = [variant ? variantClass[variant] : "", className].filter(Boolean).join(" ");
  return <button type={type} className={classes || undefined} {...props} />;
}
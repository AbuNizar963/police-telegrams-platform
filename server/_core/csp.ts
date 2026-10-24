export function getContentSecurityPolicy(isProduction: boolean): {
  header: "Content-Security-Policy" | "Content-Security-Policy-Report-Only";
  value: string;
} {
  const commonDirectives =
    "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: https:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; connect-src 'self' https:;";
  const scriptDirective = isProduction
    ? "script-src 'self';"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval';";

  return {
    header: isProduction
      ? "Content-Security-Policy"
      : "Content-Security-Policy-Report-Only",
    value: `${commonDirectives} ${scriptDirective}`,
  };
}

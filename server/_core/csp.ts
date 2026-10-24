export function getContentSecurityPolicy(isProduction: boolean): {
  header: "Content-Security-Policy" | "Content-Security-Policy-Report-Only";
  value: string;
} {
  const commonDirectives =
    "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data: https:; font-src 'self' data: https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; connect-src 'self' https:;";
  const scriptDirective = isProduction
    ? "script-src 'self' https://maps.googleapis.com https://maps.gstatic.com;"
    : "script-src 'self' 'unsafe-inline' 'unsafe-eval';";

  return {
    header: isProduction
      ? "Content-Security-Policy"
      : "Content-Security-Policy-Report-Only",
    value: `${commonDirectives} ${scriptDirective}`,
  };
}

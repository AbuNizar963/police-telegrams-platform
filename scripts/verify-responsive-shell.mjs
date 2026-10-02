import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));

async function readProjectFile(relativePath) {
  return readFile(new URL(relativePath, `file://${projectRoot}/`), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const [indexHtml, dashboardLayout, homePage, headerActions] = await Promise.all(
  [
    "client/index.html",
    "client/src/components/DashboardLayout.tsx",
    "client/src/pages/Home.tsx",
    "client/src/components/HeaderActions.tsx",
  ].map(readProjectFile)
);

const viewportMatch = indexHtml.match(
  /<meta\s+name="viewport"\s+content="([^"]+)"\s*\/>/i
);

assert(
  viewportMatch?.[1].includes("width=device-width"),
  "The application shell must declare a width=device-width viewport."
);

assert(
  dashboardLayout.includes('<BrandMark size="sm" showLabel compactLabel />'),
  "The mobile dashboard header must provide the primary brand mark."
);

assert(
  !homePage.includes("BrandMark"),
  "The dashboard page must not render a second brand mark beside the sidebar brand."
);

assert(
  headerActions.includes("if (!user) {\n    return null;\n  }"),
  "Header actions must not render before an authenticated user is available."
);

console.log("Responsive application shell checks passed.");

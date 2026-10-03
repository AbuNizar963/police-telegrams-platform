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

const [indexHtml, dashboardLayout, homePage, headerActions, sidebarLayout] =
  await Promise.all(
    [
      "client/index.html",
      "client/src/components/DashboardLayout.tsx",
      "client/src/pages/Home.tsx",
      "client/src/components/HeaderActions.tsx",
      "client/src/components/ui/sidebar.tsx",
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
  homePage.includes('showStandaloneBrand ? <BrandMark size="md" /> : null'),
  "The dashboard page must render the standalone brand only when the desktop sidebar is collapsed."
);

assert(
  homePage.includes('showStandaloneBrand ? "lg:pr-16" : ""'),
  "The collapsed desktop header must reserve space beside the standalone brand."
);

assert(
  dashboardLayout.includes(
    "const showSidebarBrand = isMobile || !isCollapsed;"
  ) && dashboardLayout.includes("{showSidebarBrand ? ("),
  "The sidebar brand must be visible on mobile and only when the desktop sidebar is expanded."
);

assert(
  dashboardLayout.includes('collapsible="offcanvas"') &&
    dashboardLayout.includes("fixed inset-0 z-20") &&
    dashboardLayout.includes("setOpen(false)"),
  "The desktop sidebar must overlay the page and close through its backdrop."
);

assert(
  dashboardLayout.includes(
    "flex h-14 shrink-0 items-center justify-end border-b"
  ) &&
    dashboardLayout.includes('dir="ltr"') &&
    dashboardLayout.includes("{isCollapsed ? (\n              <SidebarTrigger"),
  "The desktop sidebar must expose its open button in a dedicated top bar."
);

assert(
  sidebarLayout.includes('collapsible === "offcanvas"') &&
    sidebarLayout.includes('"w-0"'),
  "An offcanvas sidebar must not reserve layout width for the page content."
);

assert(
  headerActions.includes("if (!user) {\n    return null;\n  }"),
  "Header actions must not render before an authenticated user is available."
);

console.log("Responsive application shell checks passed.");

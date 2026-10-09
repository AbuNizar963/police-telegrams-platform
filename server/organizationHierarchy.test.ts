import { describe, expect, it } from "vitest";
import {
  canOrganizationHaveParent,
  getOrganizationTreeVisibleIds,
  wouldCreateOrganizationCycle,
  type OrganizationParentLink,
} from "../shared/organizationHierarchy";

const organizations: OrganizationParentLink[] = [
  { id: "ministry", parentOrganizationId: null },
  { id: "governorate", parentOrganizationId: "ministry" },
  { id: "city-section", parentOrganizationId: "governorate" },
  { id: "station", parentOrganizationId: "city-section" },
  { id: "unit", parentOrganizationId: "station" },
];

describe("organization hierarchy defaults and cycle protection", () => {
  it("keeps the requested structure as the default", () => {
    expect(canOrganizationHaveParent("governorate", "central")).toBe(true);
    expect(canOrganizationHaveParent("department", "governorate")).toBe(true);
    expect(canOrganizationHaveParent("station", "department")).toBe(true);
    expect(canOrganizationHaveParent("unit", "station")).toBe(true);
    expect(canOrganizationHaveParent("station", "central")).toBe(false);
  });

  it("allows a valid custom relationship without requiring the default type", () => {
    expect(
      wouldCreateOrganizationCycle(organizations, "station", "ministry")
    ).toBe(false);
  });

  it("rejects self-parenting and assigning an ancestor below its descendant", () => {
    expect(
      wouldCreateOrganizationCycle(organizations, "station", "station")
    ).toBe(true);
    expect(
      wouldCreateOrganizationCycle(organizations, "governorate", "unit")
    ).toBe(true);
  });

  it("detects a pre-existing cycle in the selected parent's ancestry", () => {
    const broken: OrganizationParentLink[] = [
      { id: "a", parentOrganizationId: "b" },
      { id: "b", parentOrganizationId: "a" },
    ];
    expect(wouldCreateOrganizationCycle(broken, null, "a")).toBe(true);
  });

  it("keeps the command path when showing a selected organization in a tree", () => {
    expect(getOrganizationTreeVisibleIds(organizations, ["unit"])).toEqual(
      new Set(["ministry", "governorate", "city-section", "station", "unit"])
    );
  });

  it("does not loop when preparing a tree from malformed cyclic hierarchy data", () => {
    const broken: OrganizationParentLink[] = [
      { id: "a", parentOrganizationId: "b" },
      { id: "b", parentOrganizationId: "a" },
    ];
    expect(getOrganizationTreeVisibleIds(broken, ["a"])).toEqual(
      new Set(["a", "b"])
    );
  });
});

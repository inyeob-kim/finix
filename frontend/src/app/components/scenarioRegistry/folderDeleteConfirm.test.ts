import { describe, expect, it } from "vitest";
import { canConfirmFolderDelete } from "./folderDeleteConfirm";

describe("canConfirmFolderDelete", () => {
  it("allows delete when collection has no scenarios", () => {
    expect(canConfirmFolderDelete(0, "")).toBe(true);
  });

  it("requires typing delete when scenarios exist", () => {
    expect(canConfirmFolderDelete(2, "")).toBe(false);
    expect(canConfirmFolderDelete(2, "delet")).toBe(false);
    expect(canConfirmFolderDelete(2, "delete")).toBe(true);
  });
});

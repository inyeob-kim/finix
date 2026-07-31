import { describe, expect, it } from "vitest";
import {
  bodyForPostmanEditor,
  parsePostmanBody,
  parsePostmanVarToken,
} from "./postmanBodyBindings";

describe("postmanBodyBindings", () => {
  it("parses {{var}} tokens", () => {
    expect(parsePostmanVarToken("{{accountNo}}")).toBe("accountNo");
    expect(parsePostmanVarToken(" {{ txId }} ")).toBe("txId");
    expect(parsePostmanVarToken("prefix-{{x}}")).toBeNull();
  });

  it("renders injects as Postman placeholders", () => {
    const body = bodyForPostmanEditor(
      { accountNo: "000", amount: 1 },
      [{ json_path: "$.amount", value: 99 }],
      [{ var: "accountNo", json_path: "$.accountNo" }],
    );
    expect(body).toEqual({ accountNo: "{{accountNo}}", amount: 99 });
  });

  it("parses body into injects and overrides", () => {
    const parsed = parsePostmanBody(
      { accountNo: "000", amount: 1, memo: "x" },
      { accountNo: "{{accountNo}}", amount: 50, memo: "x" },
    );
    expect(parsed.injects).toEqual([
      { var: "accountNo", json_path: "$.accountNo" },
    ]);
    expect(parsed.overrides).toEqual([
      { json_path: "$.amount", value: 50 },
    ]);
  });
});

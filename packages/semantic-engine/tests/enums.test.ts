import { ConflictType, Severity, Confidence, SourceType } from "../src/types/enums";

describe("ConflictType", () => {
  it("has exactly three members", () => { expect(Object.values(ConflictType)).toHaveLength(3); });
  it("contains BUSINESS_RULE", () => { expect(ConflictType.BUSINESS_RULE).toBe("BUSINESS_RULE"); });
  it("contains CONTRACT", () => { expect(ConflictType.CONTRACT).toBe("CONTRACT"); });
  it("contains DEPENDENCY", () => { expect(ConflictType.DEPENDENCY).toBe("DEPENDENCY"); });
});

describe("Severity", () => {
  it("has exactly four members", () => { expect(Object.values(Severity)).toHaveLength(4); });
  it("contains all values", () => {
    expect(Severity.HIGH).toBe("HIGH");
    expect(Severity.MEDIUM).toBe("MEDIUM");
    expect(Severity.LOW).toBe("LOW");
    expect(Severity.INFO).toBe("INFO");
  });
});

describe("Confidence", () => {
  it("has exactly three members", () => { expect(Object.values(Confidence)).toHaveLength(3); });
  it("contains HIGH, MEDIUM, LOW", () => {
    expect(Confidence.HIGH).toBe("HIGH");
    expect(Confidence.MEDIUM).toBe("MEDIUM");
    expect(Confidence.LOW).toBe("LOW");
  });
});

describe("SourceType", () => {
  it("has exactly five members", () => { expect(Object.values(SourceType)).toHaveLength(5); });
  it("contains all expected members", () => {
    expect(SourceType.REQUIREMENT).toBe("REQUIREMENT");
    expect(SourceType.CODE_DIFF).toBe("CODE_DIFF");
    expect(SourceType.FILE_SNIPPET).toBe("FILE_SNIPPET");
    expect(SourceType.DOCUMENTATION).toBe("DOCUMENTATION");
    expect(SourceType.TEST).toBe("TEST");
  });
});

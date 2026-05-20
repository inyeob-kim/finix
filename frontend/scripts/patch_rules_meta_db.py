"""One-off patch: wire RulesMeta.tsx to DB registry API. Run from repo root."""

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
P = ROOT / "frontend" / "src" / "app" / "components" / "RulesMeta.tsx"


def main() -> None:
    text = P.read_text(encoding="utf-8")

    old_imports = (
        'import { listServiceCatalog } from "@/api/serviceCatalogApi";\n'
        'import { generateServiceRulesDraftFromSource } from "@/api/serviceRulesApi";\n'
        'import { ApiError } from "@/api/client";\n'
        'import type { ServiceRuleBundleReadDto } from "@/api/types";\n'
        'import { useAuthStore } from "../auth/authStore";\n'
        "\n"
        "type RuleRegistryItem = {\n"
        "  serviceCode: string;\n"
        "  serviceName: string;\n"
        "  sourceVersion: string;\n"
        '  status: "active" | "draft";\n'
        "  rules: number;\n"
        "  lastUpdatedAt: string;\n"
        "  lastUpdatedBy: string;\n"
        "};\n"
        "\n"
        "type SortKey ="
    )
    new_imports = (
        'import { listServiceCatalog } from "@/api/serviceCatalogApi";\n'
        "import {\n"
        "  activateServiceRulesBundle,\n"
        "  approveServiceRulesBundle,\n"
        "  createServiceRulesDraft,\n"
        "  generateServiceRulesDraftFromSource,\n"
        "  getServiceRulesBundle,\n"
        '} from "@/api/serviceRulesApi";\n'
        'import { ApiError } from "@/api/client";\n'
        'import type { ServiceRuleBundleReadDto } from "@/api/types";\n'
        'import { type RuleRegistryItem, useRulesRegistry } from "@/hooks/useRulesRegistry";\n'
        'import { useAuthStore } from "../auth/authStore";\n'
        "\n"
        "type SortKey ="
    )
    if old_imports not in text:
        raise SystemExit("import block not found")
    text = text.replace(old_imports, new_imports, 1)

    start = text.find("const MOCK_REGISTRY")
    end = text.find("function StatusPill")
    if start < 0 or end < 0:
        raise SystemExit("mock block not found")
    text = text[:start] + text[end:]

    text = text.replace(
        'function StatusPill({ status }: { status: RuleRegistryItem["status"] })',
        "function StatusPill({ status }: { status: string })",
        1,
    )

    text = text.replace(
        'useState<"" | "active" | "draft">("")',
        'useState<"" | "active" | "draft" | "approved">("")',
        1,
    )

    needle = "  const [pageSize, setPageSize] = useState(10);\n\n  const [yamlAiOpen"
    repl = (
        "  const [pageSize, setPageSize] = useState(10);\n"
        "  const [editLoading, setEditLoading] = useState(false);\n"
        "  const [editSaving, setEditSaving] = useState(false);\n"
        "  const [editError, setEditError] = useState<string | null>(null);\n"
        "  const [editNotice, setEditNotice] = useState<string | null>(null);\n"
        "\n"
        "  const {\n"
        "    registry,\n"
        "    loading: registryLoading,\n"
        "    error: registryError,\n"
        "    load: reloadRegistry,\n"
        "    activeCount,\n"
        "    draftCount,\n"
        "  } = useRulesRegistry({ query, statusFilter });\n"
        "\n"
        "  const [yamlAiOpen"
    )
    if needle not in text:
        raise SystemExit("pageSize needle not found")
    text = text.replace(needle, repl, 1)

  # uniqueVersions + filteredSorted
    text = text.replace(
        "  const uniqueVersions = useMemo(() => {\n"
        "    const s = new Set(MOCK_REGISTRY.map((r) => r.sourceVersion));\n"
        "    return [...s].sort();\n"
        "  }, []);",
        "  const uniqueVersions = useMemo(() => {\n"
        "    const s = new Set(\n"
        '      registry.map((r) => r.sourceVersion).filter((v) => v && v !== "—"),\n'
        "    );\n"
        "    return [...s].sort();\n"
        "  }, [registry]);",
        1,
    )

    old_filter = (
        "  const filteredSorted = useMemo(() => {\n"
        "    const q = query.trim().toLowerCase();\n"
        "    let list = MOCK_REGISTRY.filter((x) => {\n"
        "      if (statusFilter && x.status !== statusFilter) return false;\n"
        "      if (versionFilter && x.sourceVersion !== versionFilter) return false;\n"
        "      if (!q) return true;\n"
        "      return (\n"
        "        x.serviceCode.toLowerCase().includes(q) ||\n"
        "        x.serviceName.toLowerCase().includes(q) ||\n"
        "        x.sourceVersion.toLowerCase().includes(q) ||\n"
        "        x.lastUpdatedBy.toLowerCase().includes(q)\n"
        "      );\n"
        "    });\n"
        "\n"
        "    list = [...list].sort((a, b) => {"
    )
    new_filter = (
        "  const filteredSorted = useMemo(() => {\n"
        "    let list = registry.filter((x) => {\n"
        "      if (versionFilter && x.sourceVersion !== versionFilter) return false;\n"
        "      return true;\n"
        "    });\n"
        "\n"
        "    list = [...list].sort((a, b) => {"
    )
    if old_filter not in text:
        raise SystemExit("filteredSorted block not found")
    text = text.replace(old_filter, new_filter, 1)
    text = text.replace(
        "  }, [query, statusFilter, versionFilter, sortKey]);",
        "  }, [registry, versionFilter, sortKey]);",
        1,
    )

    old_open = (
        "  const openItem = (item: RuleRegistryItem) => {\n"
        "    setSelected(item);\n"
        '    setActiveTab("meta");\n'
        "    setYamlText(MOCK_YAML_BY_SERVICE[item.serviceCode] ?? \"\");\n"
        "    setLastSavedAt(null);\n"
        "  };"
    )
    new_open = (
        "  const openItem = async (item: RuleRegistryItem) => {\n"
        "    setSelected(item);\n"
        '    setActiveTab("meta");\n'
        '    setYamlText("");\n'
        "    setLastSavedAt(null);\n"
        "    setEditError(null);\n"
        "    setEditNotice(null);\n"
        "    setEditLoading(true);\n"
        "    try {\n"
        "      const bundle = await getServiceRulesBundle(item.serviceCode, item.bundleId);\n"
        "      setYamlText(bundle.yaml_text ?? \"\");\n"
        "    } catch (e) {\n"
        "      setEditError(\n"
        '        e instanceof ApiError ? e.message : "YAML을 불러오지 못했습니다.",\n'
        "      );\n"
        "    } finally {\n"
        "      setEditLoading(false);\n"
        "    }\n"
        "  };"
    )
    if old_open not in text:
        raise SystemExit("openItem not found")
    text = text.replace(old_open, new_open, 1)

    text = text.replace(
        "  const closePanel = () => {\n"
        "    setSelected(null);\n"
        "    setYamlText(\"\");\n"
        "    setLastSavedAt(null);\n"
        "  };",
        "  const closePanel = () => {\n"
        "    setSelected(null);\n"
        "    setYamlText(\"\");\n"
        "    setLastSavedAt(null);\n"
        "    setEditError(null);\n"
        "    setEditNotice(null);\n"
        "  };",
        1,
    )

    old_save = (
        "  const saveDraft = () => {\n"
        "    const now = new Date();\n"
        "    setLastSavedAt(\n"
        '      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(\n'
        "        now.getHours(),\n"
        '      ).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,\n'
        "    );\n"
        "  };"
    )
    new_save = (
        "  const saveDraft = async () => {\n"
        "    if (!selected) return;\n"
        "    setEditSaving(true);\n"
        "    setEditError(null);\n"
        "    setEditNotice(null);\n"
        "    try {\n"
        "      const bundle = await createServiceRulesDraft(selected.serviceCode, {\n"
        "        yaml_text: yamlText,\n"
        "        source_version:\n"
        '          selected.sourceVersion !== "—" ? selected.sourceVersion : null,\n'
        "        created_by: user?.username ?? null,\n"
        "      });\n"
        "      const now = new Date();\n"
        "      setLastSavedAt(\n"
        '      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(\n'
        "        now.getHours(),\n"
        '      ).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,\n'
        "      );\n"
        "      const rulesArr =\n"
        "        bundle.rules && Array.isArray((bundle.rules as { rules?: unknown }).rules)\n"
        "          ? (bundle.rules as { rules: unknown[] }).rules\n"
        "          : null;\n"
        "      setSelected({\n"
        "        ...selected,\n"
        "        bundleId: bundle.id,\n"
        "        bundleVersion: bundle.version,\n"
        "        status: bundle.status,\n"
        "        rules: rulesArr?.length ?? selected.rules,\n"
        "      });\n"
        "      setEditNotice(`드래프트 v${bundle.version} 저장됨 (bundle #${bundle.id})`);\n"
        "      await reloadRegistry();\n"
        "    } catch (e) {\n"
        "      setEditError(\n"
        '        e instanceof ApiError ? e.message : "저장에 실패했습니다.",\n'
        "      );\n"
        "    } finally {\n"
        "      setEditSaving(false);\n"
        "    }\n"
        "  };\n"
        "\n"
        "  const runApprove = async () => {\n"
        "    if (!selected) return;\n"
        "    setEditSaving(true);\n"
        "    setEditError(null);\n"
        "    try {\n"
        "      await approveServiceRulesBundle(selected.serviceCode, selected.bundleId);\n"
        "      setEditNotice(\"승인되었습니다.\");\n"
        "      await reloadRegistry();\n"
        "    } catch (e) {\n"
        "      setEditError(e instanceof ApiError ? e.message : \"승인에 실패했습니다.\");\n"
        "    } finally {\n"
        "      setEditSaving(false);\n"
        "    }\n"
        "  };\n"
        "\n"
        "  const runActivate = async () => {\n"
        "    if (!selected) return;\n"
        "    setEditSaving(true);\n"
        "    setEditError(null);\n"
        "    try {\n"
        "      await activateServiceRulesBundle(selected.serviceCode, selected.bundleId);\n"
        "      setEditNotice(\"활성화되었습니다. 테스트 케이스 생성에 사용됩니다.\");\n"
        "      await reloadRegistry();\n"
        "    } catch (e) {\n"
        "      setEditError(\n"
        '        e instanceof ApiError ? e.message : "활성화에 실패했습니다.",\n'
        "      );\n"
        "    } finally {\n"
        "      setEditSaving(false);\n"
        "    }\n"
        "  };"
    )
    if old_save not in text:
        raise SystemExit("saveDraft not found")
    text = text.replace(old_save, new_save, 1)

    text = text.replace(
        "      setYamlAiResult(bundle);\n    } catch (e) {",
        "      setYamlAiResult(bundle);\n      await reloadRegistry();\n    } catch (e) {",
        1,
    )

    text = re.sub(
        r'description="서비스 단위 레지스트리[^"]*"',
        'description="서비스별 규칙 번들(DB)을 조회·편집하고 드래프트 저장·승인·활성화합니다."',
        text,
        count=1,
    )

    text = text.replace(
        "            {uniqueVersions[uniqueVersions.length - 1]} 기준 레지스트리 · 활성{\" \"}\n"
        "            {MOCK_REGISTRY.filter((x) => x.status === \"active\").length}건 ·\n"
        "            초안{\" \"}\n"
        "            {MOCK_REGISTRY.filter((x) => x.status === \"draft\").length}건",
        '            DB 레지스트리 · 활성 {activeCount}건 · 초안 {draftCount}건',
        1,
    )

    text = text.replace(
        '                <option value="draft">Draft</option>\n              </FinixUnderlineSelect>',
        '                <option value="draft">Draft</option>\n'
        '                <option value="approved">Approved</option>\n'
        "              </FinixUnderlineSelect>",
        1,
    )

    text = text.replace(
        "          <FinixPrimaryButton\n"
        "            onClick={() => setPage(1)}\n"
        "            className=\"h-9 px-4 ml-auto w-auto\"\n"
        "          >\n"
        "            <Search className=\"w-4 h-4\" />\n"
        "            목록 적용\n"
        "          </FinixPrimaryButton>",
        "          <FinixPrimaryButton\n"
        "            onClick={() => void reloadRegistry()}\n"
        "            className=\"h-9 px-4 ml-auto w-auto\"\n"
        "          >\n"
        "            <RotateCw className=\"w-4 h-4\" />\n"
        "            새로고침\n"
        "          </FinixPrimaryButton>",
        1,
    )

    text = text.replace(
        "        </motion.div>\n\n        <motion.div className=\"bg-card border border-border rounded-sm overflow-hidden shadow-sm\">",
        "        </motion.div>\n\n        {registryError ? (\n"
        "          <div className=\"rounded-sm border border-destructive/30 bg-destructive/5 text-destructive text-sm px-4 py-3\">\n"
        "            {registryError}\n"
        "          </motion.div>\n"
        "        ) : null}\n\n"
        '        <div className="bg-card border border-border rounded-sm overflow-hidden shadow-sm">',
        1,
    )
    # fix accidental motion.div in error block
    text = text.replace(
        '          </motion.div>\n        ) : null}',
        "          </motion.div>\n        ) : null}".replace("motion.div", "motion.div"),
    )
    text = text.replace(
        "          <motion.div className=\"rounded-sm border border-destructive",
        '          <div className="rounded-sm border border-destructive',
    )
    text = text.replace(
        "          </motion.div>\n        ) : null}\n\n        <div className=\"bg-card",
        "          </motion.div>\n        ) : null}\n\n        <motion.div className=\"bg-card",
    )
    # simpler fix for error div closing tag
    text = text.replace(
        "            {registryError}\n          </motion.div>",
        "            {registryError}\n          </motion.div>".replace("</motion.div>", "</div>"),
    )

    old_tbody = (
        "            <TableBody>\n"
        "              {pageRows.length === 0 ? ("
    )
    new_tbody = (
        "            <TableBody>\n"
        "              {registryLoading ? (\n"
        "                <TableRow>\n"
        "                  <TableCell\n"
        "                    colSpan={8}\n"
        "                    className=\"py-12 text-center text-muted-foreground text-sm\"\n"
        "                  >\n"
        "                    <span className=\"inline-flex items-center gap-2\">\n"
        "                      <Loader2 className=\"w-4 h-4 animate-spin\" />\n"
        "                      불러오는 중…\n"
        "                    </span>\n"
        "                  </TableCell>\n"
        "                </TableRow>\n"
        "              ) : pageRows.length === 0 ? ("
    )
    if old_tbody in text:
        text = text.replace(old_tbody, new_tbody, 1)
        text = text.replace(
            "조건에 맞는 레지스트리 항목이 없습니다.",
            "등록된 규칙 번들이 없습니다. 소스 AI로 드래프트를 만드세요.",
            1,
        )

    text = text.replace(
        "onClick={() => openItem(item)}",
        "onClick={() => void openItem(item)}",
        1,
    )

    text = text.replace(
        "onClick={saveDraft}",
        "onClick={() => void saveDraft()}\n                          disabled={editSaving || editLoading}",
        1,
    )
    text = text.replace(
        "저장(드래프트)",
        '{editSaving ? "저장 중…" : "저장(드래프트)"}',
        1,
    )

    footer_old = (
        "              <DialogFooter className=\"px-6 py-4 border-t border-border bg-muted/20 shrink-0 sm:justify-between gap-2\">\n"
        "                <p className=\"text-[11px] text-muted-foreground text-left w-full sm:w-auto order-2 sm:order-1\">\n"
        "                  Rule Editor(폼 편집)는 레지스트리 연동 후 확장 예정입니다.\n"
        "                </p>\n"
        "                <button\n"
        "                  type=\"button\"\n"
        "                  className=\"h-9 px-4 rounded-sm border border-border text-sm font-medium hover:bg-muted order-1 sm:order-2\"\n"
        "                  onClick={closePanel}\n"
        "                >\n"
        "                  닫기\n"
        "                </button>\n"
        "              </DialogFooter>"
    )
    footer_new = (
        "              <DialogFooter className=\"px-6 py-4 border-t border-border bg-muted/20 shrink-0 flex-wrap justify-end gap-2\">\n"
        "                {editNotice ? (\n"
        '                  <p className="text-xs text-emerald-700 dark:text-emerald-300 w-full text-left">{editNotice}</p>\n'
        "                ) : null}\n"
        "                {editError ? (\n"
        '                  <p className="text-xs text-destructive w-full text-left">{editError}</p>\n'
        "                ) : null}\n"
        "                <button\n"
        "                  type=\"button\"\n"
        "                  className=\"h-9 px-3 rounded-sm border border-border text-sm font-medium hover:bg-muted disabled:opacity-50\"\n"
        "                  disabled={editSaving || selected.status === \"active\"}\n"
        "                  onClick={() => void runApprove()}\n"
        "                >\n"
        "                  승인\n"
        "                </button>\n"
        "                <button\n"
        "                  type=\"button\"\n"
        "                  className=\"h-9 px-3 rounded-sm border border-primary/40 text-sm font-medium hover:bg-primary/10 disabled:opacity-50\"\n"
        "                  disabled={editSaving}\n"
        "                  onClick={() => void runActivate()}\n"
        "                >\n"
        "                  활성화\n"
        "                </button>\n"
        "                <button\n"
        "                  type=\"button\"\n"
        "                  className=\"h-9 px-4 rounded-sm border border-border text-sm font-medium hover:bg-muted\"\n"
        "                  onClick={closePanel}\n"
        "                >\n"
        "                  닫기\n"
        "                </button>\n"
        "              </DialogFooter>"
    )
    if footer_old in text:
        text = text.replace(footer_old, footer_new, 1)

    P.write_text(text, encoding="utf-8")
    print("patched", P)


if __name__ == "__main__":
    main()

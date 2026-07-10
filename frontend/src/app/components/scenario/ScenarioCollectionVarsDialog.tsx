import { useEffect, useRef, useState } from "react";
import { headerKeysFromConfig } from "@/lib/scenarioPostmanHeaders";
import {
  appendStartVarIfMissing,
  normalizePostmanConfigWithMeta,
  startVarKeysFromConfig,
  type ScenarioPostmanConfig,
} from "@/lib/scenarioPostmanVariables";
import {
  isFavoriteCollectionVarKey,
  loadCollectionVarFavorites,
  removeCollectionVarFavorite,
  upsertCollectionVarFavorite,
  type CollectionVarFavorite,
} from "@/lib/collectionVarFavorites";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { ScenarioPostmanHeaderRows } from "./ScenarioPostmanHeaderRows";
import { ScenarioCollectionVarsEditor } from "./ScenarioCollectionVarsEditor";
import { cn } from "../ui/utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: ScenarioPostmanConfig;
  onChange: (next: ScenarioPostmanConfig) => void;
  /** Which tab to show when the dialog opens. */
  initialTab?: "vars" | "headers";
};

export function ScenarioCollectionVarsDialog({
  open,
  onOpenChange,
  config,
  onChange,
  initialTab = "vars",
}: Props) {
  const [tab, setTab] = useState<"vars" | "headers">(initialTab);
  const [favorites, setFavorites] = useState<CollectionVarFavorite[]>([]);
  const [cleanupNote, setCleanupNote] = useState<string | null>(null);
  const normalizedOnOpenRef = useRef(false);

  const channelVarCount = startVarKeysFromConfig(config).length;
  const headerCount = headerKeysFromConfig(config).length;

  useEffect(() => {
    if (open) {
      setFavorites(loadCollectionVarFavorites());
      setTab(initialTab);
      normalizedOnOpenRef.current = false;
      setCleanupNote(null);
    }
  }, [open, initialTab]);

  useEffect(() => {
    if (!open || normalizedOnOpenRef.current) return;
    normalizedOnOpenRef.current = true;
    const { config: normalized, migratedHeaderCount } =
      normalizePostmanConfigWithMeta(config);
    if (migratedHeaderCount > 0) {
      onChange(normalized);
      setCleanupNote(
        `중복 채널 헤더 ${migratedHeaderCount}건을 변수로 정리했습니다.`,
      );
    }
  }, [open, config, onChange]);

  const configuredKeys = new Set(startVarKeysFromConfig(config));

  const addFromFavorite = (fav: CollectionVarFavorite) => {
    onChange(appendStartVarIfMissing(config, fav.key, fav.value));
  };

  const toggleFavorite = (key: string, value: string) => {
    const k = key.trim();
    if (!k) return;
    if (isFavoriteCollectionVarKey(favorites, k)) {
      const target = favorites.find((f) => f.key.trim() === k);
      if (target) setFavorites(removeCollectionVarFavorite(target.id));
      return;
    }
    setFavorites(upsertCollectionVarFavorite(k, value));
  };

  const isFavorite = (key: string) => isFavoriteCollectionVarKey(favorites, key);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "w-full max-w-lg rounded-sm flex flex-col gap-0 p-0 overflow-hidden",
          "h-[min(620px,88vh)] max-h-[88vh]",
        )}
      >
        <DialogHeader className="shrink-0 px-6 pt-6 pb-2">
          <DialogTitle className="pr-8">컬렉션 설정</DialogTitle>
          <DialogDescription>
            채널 변수·헤더만 설정 · baseUrl은 Postman 다운로드·Live 실행 시
            입력
          </DialogDescription>
        </DialogHeader>

        {cleanupNote ? (
          <p className="shrink-0 mx-6 text-[11px] text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-sm px-2.5 py-1.5">
            {cleanupNote}
          </p>
        ) : null}

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as "vars" | "headers")}
          className="flex flex-col flex-1 min-h-0 gap-0 px-6"
        >
          <TabsList className="shrink-0 w-full grid grid-cols-2 h-9 rounded-sm p-0.5 bg-muted/60">
            <TabsTrigger value="vars" className="text-xs rounded-sm">
              변수{channelVarCount > 0 ? ` (${channelVarCount})` : ""}
            </TabsTrigger>
            <TabsTrigger value="headers" className="text-xs rounded-sm">
              헤더{headerCount > 0 ? ` (${headerCount})` : ""}
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="vars"
            className="flex flex-col flex-1 min-h-0 gap-2 mt-2 pb-3 data-[state=inactive]:hidden"
          >
            {favorites.length > 0 ? (
              <div className="shrink-0 space-y-1.5 max-h-24 overflow-y-auto overscroll-contain">
                <p className="text-[10px] text-muted-foreground">
                  즐겨찾기 · 클릭하면 시나리오 변수에 추가
                </p>
                <div className="flex flex-wrap gap-1">
                  {favorites.map((fav) => {
                    const added = configuredKeys.has(fav.key.trim());
                    return (
                      <button
                        key={fav.id}
                        type="button"
                        disabled={added}
                        title={fav.value ? `${fav.key}=${fav.value}` : fav.key}
                        className={cn(
                          "text-[10px] font-mono px-2 py-0.5 rounded-sm border transition-colors",
                          added
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200 opacity-70"
                            : "border-border bg-muted/30 hover:border-primary/40 hover:bg-primary/10",
                        )}
                        onClick={() => addFromFavorite(fav)}
                      >
                        {added ? "✓ " : ""}
                        {fav.key}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="shrink-0 text-[10px] text-muted-foreground border border-dashed rounded-sm px-2 py-2">
                시나리오 변수 행의 ★로 즐겨찾기에 등록하세요.
              </p>
            )}

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain -mx-1 px-1 border border-border/60 rounded-sm bg-muted/10">
              <div className="p-2">
                <ScenarioCollectionVarsEditor
                  config={config}
                  onChange={onChange}
                  isFavoriteKey={isFavorite}
                  onToggleFavorite={toggleFavorite}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent
            value="headers"
            className="flex flex-col flex-1 min-h-0 gap-2 mt-2 pb-3 data-[state=inactive]:hidden"
          >
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain -mx-1 px-1 border border-border/60 rounded-sm bg-muted/10">
              <div className="p-2">
                <ScenarioPostmanHeaderRows config={config} onChange={onChange} />
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter className="shrink-0 px-6 pb-6 pt-2 border-t border-border">
          <button
            type="button"
            className="h-9 px-4 rounded-sm border border-border text-sm font-medium hover:bg-muted"
            onClick={() => onOpenChange(false)}
          >
            닫기
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

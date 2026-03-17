"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/utils/supabase";
import {
  Plus,
  RefreshCw,
  Trash2,
  Edit2,
  Sun,
  Moon,
  ArrowUpDown,
  Search,
  X,
  Loader2,
  Download,
  AlertTriangle,
  ArrowUp,
  ArrowDown,
  PlusCircle,
  Copy,
  Check,
  AlertCircle,
  Hash,
  Package,
  Calendar,
  ExternalLink,
  ChevronRight,
  Database,
  Link2,
  Maximize2,
  LayoutGrid,
  ChevronDown
} from "lucide-react";
import { useTheme } from "next-themes";

type ProductCode = {
  id: number;
  created_at: string;
  category: string;
  full_code: string;
  product_url: string | null;
  sequence_number: number;
};

const CATEGORIES = [
  { code: "GY", name: "게이밍용", color: "bg-rose-500/10 text-rose-500 border-rose-500/20" },
  { code: "DY", name: "디자인용", color: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20" },
  { code: "VY", name: "영상편집용", color: "bg-violet-500/10 text-violet-500 border-violet-500/20" },
  { code: "OY", name: "사무용", color: "bg-teal-500/10 text-teal-500 border-teal-500/20" },
  { code: "HY", name: "하이엔드", color: "bg-orange-500/10 text-orange-500 border-orange-500/20" },
];

export default function Home() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [products, setProducts] = useState<ProductCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [sortBy, setSortBy] = useState<"num" | "date" | "category">("date");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newCategory, setNewCategory] = useState("GY");
  const [newUrls, setNewUrls] = useState<string[]>([]);
  const [currentNewUrl, setCurrentNewUrl] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isVariation, setIsVariation] = useState(false);
  const [variationBaseNum, setVariationBaseNum] = useState("");
  const [variationSuffix, setVariationSuffix] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editUrls, setEditUrls] = useState<string[]>([]);
  const [currentEditUrl, setCurrentEditUrl] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);

  const [syncProgress, setSyncProgress] = useState(0);
  const [syncTotalFound, setSyncTotalFound] = useState(0);
  const [syncStatusText, setSyncStatusText] = useState("");

  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; title: string; message: string; onConfirm: () => void; type: 'default' | 'danger' }>({
    open: false,
    title: "",
    message: "",
    onConfirm: () => { },
    type: 'default'
  });

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setDeferredPrompt(null);
  };

  const nextAutoCode = useMemo(() => {
    const catProducts = products.filter(p => p.category === newCategory);
    if (catProducts.length === 0) return `${newCategory}1`; // 규칙: GY001(X) -> GY1(O)
    const maxSeq = Math.max(...catProducts.map(p => p.sequence_number));
    return `${newCategory}${maxSeq + 1}`;
  }, [products, newCategory]);

  const isDuplicateCode = useMemo(() => {
    if (!isVariation || editingId !== null) return false;
    if (!variationBaseNum) return false;
    let suffix = variationSuffix.trim().toUpperCase().replace(/^[-_]+/, '');
    if (suffix) suffix = '_' + suffix;
    const generatedCode = `${newCategory}${parseInt(variationBaseNum, 10)}${suffix}`;
    return products.some(p => p.full_code === generatedCode);
  }, [isVariation, newCategory, variationBaseNum, variationSuffix, products, editingId]);

  const canSubmit = useMemo(() => {
    const hasUrls = newUrls.length > 0 || currentNewUrl.trim() !== "";
    const hasEditUrls = editUrls.length > 0 || currentEditUrl.trim() !== "";
    if (editingId !== null) return !isUpdating && hasEditUrls;
    const commonFlags = !isGenerating && hasUrls;
    if (isVariation) return variationBaseNum.trim() !== "" && !isDuplicateCode && commonFlags;
    return commonFlags;
  }, [isVariation, variationBaseNum, isDuplicateCode, isGenerating, isUpdating, editingId, newUrls, currentNewUrl, editUrls, currentEditUrl]);

  const [copyStatus, setCopyStatus] = useState<{ [key: string]: boolean }>({});

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopyStatus({ ...copyStatus, [id]: true });
    setTimeout(() => setCopyStatus(prev => ({ ...prev, [id]: false })), 2000);
  };

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    let query = supabase.from("product_codes").select("*");
    if (sortBy === "num") query = query.order("category", { ascending: true }).order("sequence_number", { ascending: sortOrder === "asc" });
    else if (sortBy === "category") query = query.order("category", { ascending: sortOrder === "asc" });
    else query = query.order("created_at", { ascending: sortOrder === "asc" });

    const { data, error } = await query;
    if (!error) setProducts(data || []);
    setLoading(false);
  }, [sortBy, sortOrder]);

  useEffect(() => {
    setMounted(true);
    fetchProducts();
  }, [fetchProducts]);

  const handleSync = async (isFullReset: boolean = false) => {
    setConfirmDialog({
      open: true,
      title: isFullReset ? "전체 데이터 미러링" : "실시간 단축 스캔",
      message: isFullReset ? "DB를 자사몰과 완전히 대조하여 최신화합니다. 기존 데이터가 유실되거나 복구될 수 있습니다." : "기존 정보를 유지한 채 신규 상품 정보만 빠르게 수집합니다.",
      type: isFullReset ? 'danger' : 'default',
      onConfirm: async () => {
        setConfirmDialog(p => ({ ...p, open: false }));
        setIsSyncing(true);
        setSyncProgress(0);
        setSyncTotalFound(0);
        setSyncStatusText("준비 중...");
        try {
          if (isFullReset) {
            await fetch("/api/reset-db", { method: "POST" });
          }
          const categories = ["GY", "DY", "VY", "OY", "HY"];
          const chunksPerCategory = 4;
          const totalSteps = categories.length * chunksPerCategory;
          let currentStep = 0;
          for (const cat of categories) {
            setSyncStatusText(`${cat} 자료 대조 중...`);
            for (let chunk = 0; chunk < chunksPerCategory; chunk++) {
              const res = await fetch("/api/sync-search", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ category: cat, pageStart: (chunk * 5) + 1, pageCount: 5 })
              });
              if (res.ok) {
                const result = await res.json();
                if (result.success) setSyncTotalFound(prev => prev + (result.count || 0));
              }
              currentStep++;
              setSyncProgress(Math.round((currentStep / totalSteps) * 100));
            }
          }
          await fetchProducts();
          setSyncStatusText("데이터 갱신 중...");
          setSyncProgress(100);
        } catch (e: any) {
          console.error('[handleSync] 동기화 중 에러 발생:', e);
          alert(`동기화 중 오류가 발생했습니다: ${e.message}`);
        } finally {
          setTimeout(() => {
            setIsSyncing(false);
            setSyncProgress(0);
          }, 1000);
        }
      }
    });
  };

  const handleDelete = async (id: number) => {
    setConfirmDialog({
      open: true,
      title: "기록 삭제",
      message: "해당 제품 넘버링 기록이 영구 삭제됩니다.",
      type: 'danger',
      onConfirm: async () => {
        setConfirmDialog(p => ({ ...p, open: false }));
        const { error } = await supabase.from("product_codes").delete().eq("id", id);
        if (error) alert("삭제 실패");
        else setProducts(products.filter(p => p.id !== id));
      }
    });
  };

  const handleUpdate = async (id: number) => {
    if (!canSubmit) return;
    setIsUpdating(true);
    let finalUrls = [...editUrls];
    if (currentEditUrl.trim()) finalUrls.push(currentEditUrl.trim());
    const urlString = Array.from(new Set(finalUrls)).join(', ');
    const { error } = await supabase.from("product_codes").update({ product_url: urlString }).eq("id", id);
    if (!error) {
      setProducts(products.map(p => p.id === id ? { ...p, product_url: urlString } : p));
      setEditingId(null);
      setIsModalOpen(false);
    }
    setIsUpdating(false);
  };

  const handleGenerate = async () => {
    if (!canSubmit) return;
    setIsGenerating(true);
    let finalUrls = [...newUrls];
    if (currentNewUrl.trim()) finalUrls.push(currentNewUrl.trim());
    const urlString = Array.from(new Set(finalUrls)).join(', ');
    let payload: any = { category: newCategory, product_url: urlString };
    if (isVariation) {
      payload.manualSequenceNumber = parseInt(variationBaseNum);
      payload.manualFullCode = `${newCategory}${variationBaseNum}${variationSuffix}`.toUpperCase();
    }
    try {
      const res = await fetch("/api/generate-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await res.json();
      if (result.success) {
        setIsModalOpen(false);
        setNewUrls([]);
        setVariationBaseNum("");
        setVariationSuffix("");
        setCurrentNewUrl("");
        await fetchProducts();
      } else alert(result.error);
    } catch (err) { alert("생성 중 오류 발생"); }
    finally { setIsGenerating(false); }
  };

  const filteredProducts = useMemo(() => {
    let result = products;
    if (selectedCategory !== "ALL") result = result.filter(p => p.category === selectedCategory);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(p => p.full_code.toLowerCase().includes(q) || (p.product_url && p.product_url.toLowerCase().includes(q)));
    }
    return result;
  }, [products, selectedCategory, searchQuery]);

  const stats = useMemo(() => {
    const codeCount = filteredProducts.length;
    const urlCount = filteredProducts.reduce((acc, p) => acc + (p.product_url ? p.product_url.split(',').filter(u => u.trim().length > 0).length : 0), 0);
    return { codeCount, urlCount };
  }, [filteredProducts]);

  const categoryCounts = useMemo(() => {
    const counts: any = { ALL: products.length };
    CATEGORIES.forEach(c => counts[c.code] = products.filter(p => p.category === c.code).length);
    return counts;
  }, [products]);

  const formatDate = (date: string) => {
    return new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(date));
  };

  const handleSort = (type: "num" | "date" | "category") => {
    if (sortBy === type) setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    else { setSortBy(type); setSortOrder(type === "date" ? "desc" : "asc"); }
  };

  if (!mounted) return null;

  return (
    <div className="h-screen flex flex-col bg-white dark:bg-[#020617] text-slate-800 dark:text-slate-200 font-sans selection:bg-blue-500/20 transition-colors duration-500 overflow-hidden">

      {/* Sync Overlay */}
      {isSyncing && (
        <div className="fixed inset-0 z-[120] flex flex-col items-center justify-center bg-white/70 dark:bg-black/90 backdrop-blur-3xl animate-in fade-in duration-500">
          <div className="w-full max-w-sm p-8 space-y-10">
            <div className="flex flex-col items-center gap-6">
              <div className="relative">
                <div className="absolute inset-0 bg-blue-500/20 blur-[80px] animate-pulse" />
                <div className="relative w-20 h-20 bg-white dark:bg-slate-900 rounded-full flex items-center justify-center shadow-2xl border border-slate-100 dark:border-white/5">
                  <Loader2 className="w-7 h-7 text-blue-500 animate-spin" />
                </div>
              </div>
              <div className="text-center">
                <h3 className="text-xl font-black">{syncProgress === 100 ? "동기화 완료" : "데이터 동기화 중"}</h3>
                <p className="text-[10px] font-black text-blue-500/80 tracking-widest uppercase mt-2">{syncStatusText}</p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="h-2 w-full bg-slate-100 dark:bg-white/5 rounded-full overflow-hidden flex p-[1px] shadow-inner">
                <div className="h-full bg-gradient-to-r from-blue-600 to-indigo-500 rounded-full transition-all duration-700 relative" style={{ width: `${syncProgress}%` }}>
                  <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.2)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.2)_50%,rgba(255,255,255,0.2)_75%,transparent_75%,transparent)] bg-[length:20px_20px] animate-shimmer" />
                </div>
              </div>
              <div className="flex justify-between items-center text-[10px] font-black text-slate-400 uppercase">
                <span>진행: {syncProgress}%</span>
                <span>수집: {syncTotalFound.toLocaleString()} 개</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Top Header */}
      <header className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between px-4 lg:px-10 py-3 bg-white dark:bg-[#0B1221] border-b border-slate-200 dark:border-white/5 z-50 shrink-0 gap-3">
        <div className="flex items-center justify-between lg:justify-start gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-indigo-700 text-white rounded-xl flex items-center justify-center font-black text-base shadow-lg shrink-0">Y</div>
            <h1 className="text-sm lg:text-base font-black tracking-tighter dark:text-white truncate">영재컴퓨터 넘버링</h1>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => handleSync(false)} title="단축 스캔" className="group p-2 bg-blue-600/10 hover:bg-blue-600 text-blue-600 hover:text-white rounded-lg transition-all active:scale-95 border border-blue-600/10">
              <RefreshCw className="w-3.5 h-3.5 group-hover:rotate-180 transition-transform duration-500" />
            </button>
            <button onClick={() => handleSync(true)} title="전체 데이터 미러링" className="p-2 bg-red-600/5 hover:bg-red-600 text-red-600/50 hover:text-white rounded-lg transition-all border border-transparent hover:border-red-600/20">
              <AlertCircle className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-1 lg:flex-none">
          <div className="relative group flex-1 min-w-0 lg:min-w-[240px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 group-focus-within:text-blue-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="코드, URL 검색..."
              className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/5 rounded-lg py-1.5 pl-9 pr-4 text-[11px] font-bold focus:ring-2 focus:ring-blue-500/10 transition-all outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            {deferredPrompt && (
              <button onClick={handleInstall} title="앱 다운로드" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[10px] font-black shadow-lg active:scale-95 transition-all flex items-center gap-1.5 animate-bounce-subtle">
                <Download className="w-3.5 h-3.5" />
                데스크탑 앱
              </button>
            )}
            <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="p-2 bg-slate-100 dark:bg-slate-900 text-slate-500 dark:text-slate-400 rounded-lg hover:bg-white dark:hover:bg-slate-800 transition-all border border-slate-200 dark:border-white/5">
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button onClick={() => setIsModalOpen(true)} className="px-4 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-lg text-[10px] font-black shadow-lg active:scale-95 transition-all flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" />
              제품코드 발급
            </button>
          </div>
        </div>
      </header>

      {/* Categories & Stats */}
      <div className="bg-white dark:bg-[#020617] border-b border-slate-200 dark:border-white/5 z-40 shrink-0">
        <div className="px-6 lg:px-10 py-2 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            <div className="flex items-center gap-2 p-1 bg-slate-50 dark:bg-white/5 rounded-lg border border-slate-200/50 dark:border-white/5 shrink-0 mr-1 px-2.5">
              <LayoutGrid className="w-3 h-3 text-blue-500" />
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-l border-slate-300 dark:border-white/10 pl-2 ml-1">분류</span>
            </div>
            <button onClick={() => setSelectedCategory("ALL")} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black transition-all shrink-0 ${selectedCategory === "ALL" ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm" : "bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/5 text-slate-400"}`}>
              전체 {categoryCounts.ALL}
            </button>
            {CATEGORIES.map(c => (
              <button key={c.code} onClick={() => setSelectedCategory(c.code)} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black transition-all shrink-0 ${selectedCategory === c.code ? "bg-blue-600 text-white shadow-sm" : "bg-white dark:bg-slate-900 border border-slate-100 dark:border-white/5 text-slate-400"}`}>
                {c.name} {categoryCounts[c.code] || 0}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-4 shrink-0 opacity-60">
            <div className="flex items-center gap-1.5">
              <Database className="w-3 h-3 text-blue-500" />
              <span className="text-[9px] font-black tabular-nums">{stats.codeCount} 코드</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Link2 className="w-3 h-3 text-indigo-500" />
              <span className="text-[9px] font-black tabular-nums">{stats.urlCount} 연결</span>
            </div>
          </div>
        </div>
      </div>

      {/* Table Main Area */}
      <main className="flex-1 flex flex-col overflow-hidden bg-slate-50/20 dark:bg-black/10">
        <div className="max-w-[1800px] w-full mx-auto px-6 lg:px-10 pt-4 pb-8 flex flex-col flex-1 overflow-hidden">

          {/* Table Header Filter (Updated Labels) */}
          <div className="grid grid-cols-[160px_100px_160px_1fr_120px] items-center text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest px-8 py-4 bg-white dark:bg-white/[0.02] border border-slate-200/50 dark:border-white/5 rounded-t-2xl shadow-sm shrink-0">
            <div className="flex items-center gap-2 cursor-pointer hover:text-blue-500 transition-colors" onClick={() => handleSort("date")}>
              <Calendar className="w-3 h-3" /> 수정일시 <ChevronDown className={`w-2.5 h-2.5 transition-transform ${sortBy === "date" && sortOrder === "asc" ? "rotate-180" : ""}`} />
            </div>
            <div className="flex items-center justify-center gap-2 cursor-pointer hover:text-blue-500 transition-colors" onClick={() => handleSort("category")}>
              카테고리 <ChevronDown className={`w-2.5 h-2.5 transition-transform ${sortBy === "category" && sortOrder === "asc" ? "rotate-180" : ""}`} />
            </div>
            <div className="flex items-center justify-center gap-2 cursor-pointer hover:text-blue-500 transition-colors" onClick={() => handleSort("num")}>
              <Hash className="w-3 h-3" /> 제품 넘버 <ChevronDown className={`w-2.5 h-2.5 transition-transform ${sortBy === "num" && sortOrder === "asc" ? "rotate-180" : ""}`} />
            </div>
            <div className="px-8 flex items-center gap-2 font-black">
              <Package className="w-3 h-3" /> URL
            </div>
            <div className="text-right pr-2">관리</div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar bg-white dark:bg-[#0B0F1A]/30 border-x border-b border-slate-200/50 dark:border-white/5 rounded-b-2xl shadow-lg">
            <div className="divide-y-[1px] divide-slate-100 dark:divide-white/[0.02]">
              {loading && products.length === 0 ? (
                <div className="py-32 text-center opacity-40">
                  <Loader2 className="w-10 h-10 text-blue-500 animate-spin mx-auto mb-3" />
                  <p className="text-[10px] font-black italic tracking-widest">데이터 불러오는 중...</p>
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="py-32 text-center opacity-10">
                  <Search className="w-12 h-12 mx-auto mb-3" />
                  <p className="text-lg font-black tracking-tighter">발급 데이터 없음</p>
                </div>
              ) : (
                filteredProducts.map(p => {
                  const urls = p.product_url ? p.product_url.split(',').map(u => u.trim()).filter(Boolean) : [];
                  const codeKey = `code-${p.id}`;
                  return (
                    <div key={p.id} className="group flex flex-col xl:flex-row xl:items-center px-8 xl:px-8 py-6 xl:py-2.5 transition-all hover:bg-blue-500/[0.02] dark:hover:bg-blue-500/[0.03]">

                      <div className="flex items-center gap-4 xl:gap-0 shrink-0 xl:w-[420px]">
                        {/* 수정일시 */}
                        <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 font-mono italic opacity-50 w-[140px] xl:w-[153px] shrink-0">
                          {formatDate(p.created_at).replace('오전', 'AM').replace('오후', 'PM')}
                        </div>

                        {/* 카테고리 */}
                        <div className="flex items-center shrink-0 w-[50px] xl:w-[80px] justify-center">
                          <span className={`px-2 py-0.5 rounded-md text-[9px] font-black border uppercase tracking-tighter ${CATEGORIES.find(c => c.code === p.category)?.color || 'bg-slate-200'}`}>
                            {p.category}
                          </span>
                        </div>

                        {/* 제품 넘버 */}
                        <div className="flex-1 xl:flex-none flex items-center justify-between xl:justify-center min-w-0 pr-2 xl:pr-0">
                          <div onClick={() => handleCopy(p.full_code, codeKey)} className="inline-flex items-center gap-3 cursor-pointer group/num relative min-w-0">
                            <span className="text-xl lg:text-2xl font-bold dark:text-white group-hover:text-blue-500 transition-colors inline-block py-1" style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' }}>
                              {p.full_code}
                            </span>
                            <div className={`p-1 rounded-md transition-all shrink-0 ${copyStatus[codeKey] ? 'bg-blue-600 text-white' : 'opacity-0 group-hover/num:opacity-100 text-slate-400 bg-slate-100 dark:bg-white/5'}`}>
                              {copyStatus[codeKey] ? <Check className="w-2.5 h-2.5" /> : <Copy className="w-2.5 h-2.5" />}
                            </div>
                          </div>

                          {/* Mobile-only actions */}
                          <div className="flex xl:hidden items-center gap-2 ml-4">
                            <button onClick={() => { setEditingId(p.id); setEditUrls(urls); setIsModalOpen(true); }} className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-blue-500 rounded-lg transition-all"><Edit2 className="w-3.5 h-3.5" /></button>
                            <button onClick={() => handleDelete(p.id)} className="p-2 bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-red-500 rounded-lg transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
                          </div>
                        </div>
                      </div>

                      {/* URL 분석 리스트 */}
                      <div className="flex-1 min-w-0 mt-4 xl:mt-0 xl:px-8 border-t xl:border-t-0 xl:border-l border-slate-100 dark:border-white/5 pt-4 xl:pt-0 flex flex-col gap-2">
                        {urls.length > 0 ? urls.map((url, idx) => {
                          const itId = url.match(/it_id=(\d+)/)?.[1] || "???";
                          const itKey = `it-${p.id}-${idx}`;
                          return (
                            <div key={idx} className="flex flex-wrap items-center gap-2.5 bg-slate-50/50 dark:bg-white/[0.01] p-2 rounded-lg border border-slate-200/30 dark:border-white/5 hover:border-blue-500/20 transition-all w-full lg:w-fit group/link shadow-sm">
                              <div onClick={() => handleCopy(itId, itKey)} className="flex items-center gap-2 bg-white dark:bg-slate-800 text-[9px] font-black font-mono tracking-tighter px-2.5 py-0.5 relative rounded-md border border-slate-200/50 dark:border-white/5 cursor-pointer hover:text-blue-500 shrink-0">
                                {itId} {copyStatus[itKey] ? <Check className="w-3 h-3 text-blue-500" /> : <Copy className="w-3 h-3 text-slate-400 opacity-20" />}
                              </div>
                              <a href={url} target="_blank" rel="noopener noreferrer" className="text-[10px] font-bold text-blue-600 dark:text-blue-400/80 hover:text-blue-500 truncate flex-1 lg:max-w-4xl font-mono">
                                {url}
                              </a>
                              <ExternalLink className="w-3 h-3 text-slate-300 opacity-20 group-hover/link:opacity-100" />
                            </div>
                          );
                        }) : (
                          <div className="flex items-center gap-2 text-[10px] font-black text-red-500/40 p-1 italic w-fit">
                            <AlertTriangle className="w-3 h-3" /> 데이터 누락
                          </div>
                        )}
                      </div>

                      {/* Desktop 관리 액션 */}
                      <div className="hidden xl:flex items-center justify-end gap-2 shrink-0 ml-4 pr-1">
                        <button onClick={() => { setEditingId(p.id); setEditUrls(urls); setIsModalOpen(true); }} className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-blue-600 text-slate-400 hover:text-white rounded-xl transition-all shadow-sm"><Edit2 className="w-3.5 h-3.5" /></button>
                        <button onClick={() => handleDelete(p.id)} className="p-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-red-600 text-slate-400 hover:text-white rounded-xl transition-all shadow-sm"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Modal Interface */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="bg-white dark:bg-[#0F172A] border border-white/10 w-full max-w-4xl rounded-[2.5rem] shadow-4xl overflow-hidden animate-in zoom-in-95 duration-300 flex flex-col max-h-[95vh]">

            <div className="px-10 py-6 border-b border-white/5 flex items-center justify-between shrink-0">
              <h3 className="text-lg font-black tracking-tight dark:text-white flex items-center gap-3">
                <div className="p-2 bg-blue-600/10 rounded-xl text-blue-600 ring-1 ring-blue-600/20">
                  {editingId ? <Edit2 className="w-5 h-5" /> : <PlusCircle className="w-5 h-5" />}
                </div>
                {editingId ? "데이터 기록 수정" : "신규 제품 넘버링 발급"}
              </h3>
              <button onClick={() => { setIsModalOpen(false); setEditingId(null); setNewUrls([]); setEditUrls([]); setVariationBaseNum(""); setVariationSuffix(""); setCurrentNewUrl(""); setCurrentEditUrl(""); }} className="p-3 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-xl transition-all">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-8 lg:p-10 overflow-y-auto custom-scrollbar flex-1">
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_0.9fr] gap-8 items-start">

                {/* Guidelines Section (Priority 1) */}
                <div className="space-y-6 order-1">
                  <div className="p-8 bg-gradient-to-br from-[#111A2E] to-black rounded-[2rem] shadow-2xl space-y-6 relative overflow-hidden ring-1 ring-white/10">
                    <div className="relative z-10 border-l-4 border-blue-600 pl-5">
                      <h4 className="text-base font-black text-white tracking-tight uppercase">넘버링 생성 가이드</h4>
                      <p className="text-[9px] font-black text-blue-500/60 uppercase tracking-widest mt-0.5">Issuance Protocol</p>
                    </div>

                    <div className="relative z-10 space-y-4 text-[11px] font-bold text-slate-300 leading-relaxed">
                      <div className="space-y-2.5">
                        <div className="flex gap-3 p-3.5 bg-white/5 rounded-xl border border-white/5">
                          <Check className="w-4 h-4 text-blue-500 shrink-0" />
                          <p>모든 넘버링은 자사몰 URL을 <span className="text-blue-400 font-black">최소 1개 이상 기입</span>해야 발급됩니다.</p>
                        </div>
                        <div className="flex gap-3 p-3.5 bg-white/5 rounded-xl border border-white/5">
                          <Check className="w-4 h-4 text-blue-500 shrink-0" />
                          <p>수동 입력 시 <span className="text-white font-black">제품 넘버와 접미 기호</span> 필수 입력.</p>
                        </div>
                      </div>



                      <div className="space-y-3 pt-3 border-t border-white/10">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">접미사(SUFFIX) 입력 방법</p>
                        <div className="grid gap-2 text-[10px]">
                          <div className="p-2.5 bg-white/5 rounded-lg border border-white/5 flex justify-between items-center px-4">
                            <span className="text-slate-400">부품 변경 바리에이션</span>
                            <span className="text-blue-400 font-bold">_1, _2, _3</span>
                          </div>
                          <div className="p-2.5 bg-white/5 rounded-lg border border-white/5 flex justify-between items-center px-4">
                            <span className="text-slate-400">컬러 변경 바리에이션</span>
                            <span className="text-white font-bold">_W, _B</span>
                          </div>
                          <div className="p-2.5 bg-white/5 rounded-lg border border-white/5 flex justify-between items-center px-4">
                            <span className="text-slate-400">부품 + 컬러 중복 변경</span>
                            <span className="text-indigo-400 font-bold">_1W, _1B</span>
                          </div>
                        </div>
                      </div>

                      <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3">
                        <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                        <p className="text-red-500/90 text-[10px] font-black leading-snug">
                          * 규칙 미준수 시, 추후 대시보드 동기화 스캔 프로세스 중 데이터가 자동 누락/삭제될 수 있습니다.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Input Form Section (Priority 2) */}
                <div className="space-y-6 order-2 lg:mt-0 mt-4">
                  {!editingId && (
                    <div className="space-y-3">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">카테고리 선택</label>
                      <div className="grid grid-cols-5 gap-2">
                        {CATEGORIES.map(c => (
                          <button key={c.code} onClick={() => setNewCategory(c.code)} className={`flex flex-col items-center justify-center py-3.5 rounded-xl border-2 transition-all ${newCategory === c.code ? 'border-blue-600 bg-blue-600/5 text-blue-600 font-black' : 'border-slate-100 dark:border-white/5 text-slate-400'}`}>
                            <div className="text-base leading-none mb-1">{c.code}</div>
                            <div className="text-[7px] font-black uppercase">{c.name.slice(0, 3)}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {!editingId && (
                    <div className="space-y-3">
                      <div className="flex bg-slate-100 dark:bg-black p-1 rounded-xl border border-white/5">
                        <button onClick={() => setIsVariation(false)} className={`flex-1 py-2.5 rounded-lg text-[10px] font-black transition-all ${!isVariation ? 'bg-white dark:bg-slate-800 text-blue-600 shadow-sm' : 'text-slate-400'}`}>자동 순번 생성</button>
                        <button onClick={() => setIsVariation(true)} className={`flex-1 py-2.5 rounded-lg text-[10px] font-black transition-all ${isVariation ? 'bg-white dark:bg-slate-800 text-blue-600 shadow-sm' : 'text-slate-400'}`}>수동 번호 입력</button>
                      </div>
                      {isVariation ? (
                        <div className="space-y-4 animate-in slide-in-from-top-1">
                          <div className="grid grid-cols-2 gap-3 mt-3">
                            <div className="space-y-1.5">
                              <p className="text-[9px] font-black text-slate-500 ml-1">번호 (숫자)</p>
                              <input type="number" value={variationBaseNum} onChange={e => setVariationBaseNum(e.target.value)} placeholder="01" className="w-full bg-slate-50 dark:bg-black border border-white/5 rounded-lg px-3 py-3 text-[11px] font-black outline-none focus:ring-1 focus:ring-blue-600/40" />
                            </div>
                            <div className="space-y-1.5">
                              <p className="text-[9px] font-black text-slate-500 ml-1">접미사 (_1W)</p>
                              <input type="text" value={variationSuffix} onChange={e => setVariationSuffix(e.target.value)} placeholder="_1W" className="w-full bg-slate-50 dark:bg-black border border-white/5 rounded-lg px-3 py-3 text-[11px] font-black outline-none focus:ring-1 focus:ring-blue-600/40" />
                            </div>
                          </div>
                          {variationBaseNum && (
                            <div className="p-4 bg-blue-600/5 border border-dashed border-blue-600/20 rounded-2xl text-center flex flex-col items-center gap-1.5">
                              <span className="text-[8px] font-black text-blue-500/60 uppercase tracking-widest">수동 발급 예정 코드</span>
                              <span className="text-xl font-bold text-slate-900 dark:text-white inline-block py-1" style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' }}>
                                {`${newCategory}${variationBaseNum}${variationSuffix}`.toUpperCase()}
                              </span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="p-6 bg-slate-50 dark:bg-white/[0.02] border border-dashed border-white/10 rounded-2xl text-center flex flex-col items-center gap-2 mt-3 animate-in fade-in zoom-in-95 duration-300">
                          <p className="text-[9px] font-bold text-slate-500 italic uppercase tracking-wider">시스템 자동 채번 예약됨</p>
                          <div className="flex flex-col items-center">
                            <span className="text-[8px] font-black text-blue-500/60 uppercase tracking-widest mb-0.5">발급 예정 코드</span>
                            <span className="text-2xl font-bold text-slate-900 dark:text-white inline-block py-1" style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' }}>
                              {nextAutoCode}
                            </span>
                          </div>
                        </div>
                      )}

                      <div className="space-y-3 mt-4">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">URL 연동 정보 (필수)</label>
                        <div className="flex gap-2.5">
                          <input
                            type="url"
                            value={editingId ? currentEditUrl : currentNewUrl}
                            onChange={e => editingId ? setCurrentEditUrl(e.target.value) : setCurrentNewUrl(e.target.value)}
                            placeholder="자사몰 아이템 링크 입력..."
                            className="flex-1 bg-slate-50 dark:bg-black border border-white/5 rounded-xl px-4 py-3 text-[11px] font-bold dark:text-white outline-none focus:ring-1 focus:ring-blue-600/40"
                          />
                          <button onClick={() => {
                            const val = (editingId ? currentEditUrl : currentNewUrl).trim();
                            if (val) {
                              if (editingId) { setEditUrls([...editUrls, val]); setCurrentEditUrl(""); }
                              else { setNewUrls([...newUrls, val]); setCurrentNewUrl(""); }
                            }
                          }} className="p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-500 shadow-lg active:scale-95"><Plus className="w-4 h-4" /></button>
                        </div>
                        <div className="max-h-36 overflow-y-auto space-y-2 custom-scrollbar pr-1 mt-1">
                          {(editingId ? editUrls : newUrls).map((u, i) => (
                            <div key={i} className="flex items-center gap-3 bg-white dark:bg-white/[0.03] p-2.5 px-4 rounded-xl border border-white/5 shadow-sm group">
                              <span className="text-[9px] font-bold text-slate-500 truncate flex-1 font-mono">{u}</span>
                              <button onClick={() => editingId ? setEditUrls(editUrls.filter((_, idx) => idx !== i)) : setNewUrls(newUrls.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-600 p-1 opacity-20 group-hover:opacity-100 transition-opacity"><X className="w-3 h-3" /></button>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="px-10 py-6 bg-slate-50 dark:bg-black/50 border-t border-white/5 flex gap-4 shrink-0">
              <button onClick={() => { setIsModalOpen(false); setEditingId(null); setNewUrls([]); setEditUrls([]); setVariationBaseNum(""); setVariationSuffix(""); setCurrentNewUrl(""); setCurrentEditUrl(""); }} className="flex-1 py-3.5 bg-white dark:bg-slate-800 border border-white/5 text-slate-900 dark:text-white rounded-xl text-[11px] font-black hover:bg-slate-100 active:scale-95">취소</button>
              <button
                onClick={editingId ? () => handleUpdate(editingId!) : handleGenerate}
                disabled={!canSubmit}
                className="flex-[2] py-3.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-200 dark:disabled:bg-slate-900 disabled:text-slate-400 text-white rounded-xl text-[11px] font-black shadow-lg shadow-blue-600/20 active:scale-95 flex items-center justify-center gap-2"
              >
                {isGenerating || isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : (editingId ? "변경사항 반영" : "즉시 발급 승인")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      {confirmDialog.open && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-black/90 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="bg-white dark:bg-[#0F172A] w-full max-w-[400px] rounded-[2.5rem] shadow-4xl border border-white/10 overflow-hidden scale-in-center">
            <div className="p-10 text-center space-y-6">
              <div className={`w-16 h-16 rounded-[1.8rem] mx-auto flex items-center justify-center shadow-lg ${confirmDialog.type === 'danger' ? 'bg-red-500/10 text-red-500' : 'bg-blue-500/10 text-blue-500'}`}>
                {confirmDialog.type === 'danger' ? <Trash2 className="w-8 h-8" /> : <RefreshCw className="w-8 h-8" />}
              </div>
              <div className="space-y-3">
                <h3 className="text-xl font-black text-white">{confirmDialog.title}</h3>
                <p className="text-[13px] text-slate-400 font-bold leading-relaxed">{confirmDialog.message}</p>
              </div>
            </div>
            <div className="p-8 pt-0 flex gap-3">
              <button onClick={() => setConfirmDialog(p => ({ ...p, open: false }))} className="flex-1 py-3 bg-slate-800 text-slate-400 rounded-xl text-[10px] font-black hover:bg-slate-700">이전</button>
              <button onClick={confirmDialog.onConfirm} className={`flex-1 py-3 text-white rounded-xl text-[10px] font-black shadow-xl ${confirmDialog.type === 'danger' ? 'bg-red-600 hover:bg-red-500' : 'bg-blue-600 hover:bg-blue-500'}`}>
                확인
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1E293B; border-radius: 20px; }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        .animate-shimmer { background: linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.05) 50%, rgba(255,255,255,0) 100%); background-size: 200% 100%; animation: shimmer 2s infinite; }
        @keyframes bounce-subtle { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
        .animate-bounce-subtle { animation: bounce-subtle 2s infinite ease-in-out; }
      `}</style>
    </div>
  );
}

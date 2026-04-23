import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  BarChart3, 
  Users, 
  Settings, 
  TrendingUp, 
  MessageSquare, 
  ThumbsUp, 
  AlertCircle,
  FileText,
  ChevronRight,
  LayoutDashboard,
  PieChart as PieChartIcon,
  Share2,
  Save,
  Copy,
  Check,
  RefreshCw,
  Edit3,
  Trash2,
  X,
  ExternalLink,
  ChevronDown,
  Clock,
  MessageSquareText,
  Box,
  Globe,
  Languages
} from 'lucide-react';
import { RawFeedback, AnalyzedFeedback, DashboardStats, CATEGORY_PATTERNS } from './types';
import { FileUpload } from './components/FileUpload';
import { CategoryChart } from './components/CategoryChart';
import { 
  analyzeFeedbackBatch, 
  calculateStats, 
  calculateBasicStats,
  analyzeChatTimeout
} from './services/analysisService';
import { saveReport, getReport } from './services/reportService';
import { cn } from './lib/utils';
import { db } from './firebase';
import { collection, query, orderBy, onSnapshot, deleteDoc, doc } from 'firebase/firestore';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type ViewMode = 'CS' | 'PM';

interface SavedReport {
  id: string;
  title: string;
  type: 'full' | 'pm';
  createdAt: any;
}

export default function App() {
  const [rawData, setRawData] = useState<RawFeedback[]>([]);
  const [analyzedData, setAnalyzedData] = useState<AnalyzedFeedback[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('CS');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState<string>('');
  const [filterType, setFilterType] = useState<'all' | 'product' | 'service'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [reportLanguage, setReportLanguage] = useState<'zh' | 'en'>('zh');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [isInsightExpanded, setIsInsightExpanded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [reportTitle, setReportTitle] = useState('');
  const [reportTypeToSave, setReportTypeToSave] = useState<'full' | 'pm'>('full');
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [savedReports, setSavedReports] = useState<SavedReport[]>([]);
  const [editingFeedback, setEditingFeedback] = useState<AnalyzedFeedback | null>(null);
  const [isReportsExpanded, setIsReportsExpanded] = useState(false);
  const [reportToDelete, setReportToDelete] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [timeoutAnalysis, setTimeoutAnalysis] = useState<{id: string, content: string} | null>(null);
  const [isAnalyzingTimeout, setIsAnalyzingTimeout] = useState(false);

  // Load saved reports from Firebase
  useEffect(() => {
    const q = query(collection(db, "reports"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const reports = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as SavedReport[];
      setSavedReports(reports);
    }, (error) => {
      console.error("Firebase Error:", error);
    });
    return () => unsubscribe();
  }, []);

  const handleDeleteReport = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setReportToDelete(id);
  };

  const confirmDeleteReport = async () => {
    if (!reportToDelete) return;
    try {
      await deleteDoc(doc(db, "reports", reportToDelete));
      setReportToDelete(null);
    } catch (error) {
      setErrorMessage('刪除失敗，請稍後再試。');
    }
  };

  const handleAnalyzeTimeout = async (feedback: AnalyzedFeedback) => {
    setIsAnalyzingTimeout(true);
    try {
      const content = `${feedback.ticketComment} ${feedback.npsComment} ${feedback.howToImprove}`;
      const result = await analyzeChatTimeout(content);
      setTimeoutAnalysis({ id: feedback.ticketId, content: result });
    } catch (err) {
      setErrorMessage('超時分析失敗。');
    } finally {
      setIsAnalyzingTimeout(false);
    }
  };
  const handleUpdateFeedback = (updated: AnalyzedFeedback) => {
    const newData = analyzedData.map(f => f.ticketId === updated.ticketId ? updated : f);
    setAnalyzedData(newData);
    
    // Recalculate stats based on new data
    const newStats = calculateBasicStats(newData);
    setStats(prev => prev ? { ...prev, ...newStats } : null);
    setEditingFeedback(null);
  };

  // Load report from URL if present
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reportId = params.get('report');
    if (reportId) {
      const loadReport = async () => {
        setIsAnalyzing(true);
        try {
          const report = await getReport(reportId);
          if (report) {
            setAnalyzedData(report.analyzedData);
            setStats(report.stats);
            if (report.type) setViewMode(report.type === 'pm' ? 'PM' : 'CS');
            // We don't have rawData in saved reports to save space
            setRawData([]);
          } else {
            setErrorMessage('找不到該報告，可能已被刪除。');
          }
        } catch (err) {
          console.error("Failed to load report:", err);
        } finally {
          setIsAnalyzing(false);
        }
      };
      loadReport();
    }
  }, []);

  const handleSaveReport = async () => {
    if (!analyzedData.length || !stats || !reportTitle) return;
    setIsSaving(true);
    try {
      // If it's PM Only, we filter the data to save space and keep it focused
      const dataToSave = reportTypeToSave === 'pm' 
        ? analyzedData.filter(f => f.isProductRelated) 
        : analyzedData;
        
      // Optimization: Only save necessary fields to avoid the 1MB Firestore limit
      const optimizedData: AnalyzedFeedback[] = dataToSave.map(f => ({
        ticketId: f.ticketId,
        location: f.location,
        productId: f.productId,
        mainCategory: f.mainCategory,
        subCategory: f.subCategory,
        sentiment: f.sentiment,
        csatScore: f.csatScore,
        npsScore: f.npsScore,
        ticketComment: f.ticketComment,
        npsComment: f.npsComment,
        howToImprove: f.howToImprove,
        isProductRelated: f.isProductRelated,
        isServiceRelated: f.isServiceRelated,
        friendliness: f.friendliness || 0,
        helpfulness: f.helpfulness || 0,
        promptness: f.promptness || 0
      }));

      const id = await saveReport(optimizedData, stats, reportTitle, reportTypeToSave);
      const url = `${window.location.origin}${window.location.pathname}?report=${id}`;
      setShareUrl(url);
    } catch (err: any) {
      console.error("Save report error:", err);
      let errorMsg = '儲存報告失敗，請稍後再試。';
      
      if (err?.code === 'permission-denied') {
        errorMsg = '儲存失敗：權限不足或 Firebase 額度已達上限。';
      } else if (err?.message?.includes('too large') || err?.code === 'invalid-argument') {
        // Even with compression it failed? We can try one last time with NO data (insight only)
        try {
          const fallbackId = await saveReport(undefined, stats, reportTitle, 'insight_only');
          const url = `${window.location.origin}${window.location.pathname}?report=${fallbackId}`;
          setShareUrl(url);
          errorMsg = '注意：由於工單數量極大，已自動改為「精簡版」分享 (僅含 AI 總結與圖表，不含原始工單內容)。';
        } catch (innerErr) {
          errorMsg = '儲存失敗：資料量嚴重超限，且自動降級儲存也失敗。';
        }
      } else if (err?.message) {
        errorMsg = `儲存失敗：${err.message}`;
      }
      
      setErrorMessage(errorMsg);
    } finally {
      setIsSaving(false);
    }
  };

  const copyToClipboard = () => {
    if (shareUrl) {
      navigator.clipboard.writeText(shareUrl);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  const handleDataLoaded = async (data: RawFeedback[]) => {
    if (!data || data.length === 0) {
      setErrorMessage('未偵測到有效數據，請檢查檔案格式或 Google Sheet 內容。');
      return;
    }

    setIsAnalyzing(true);
    setAnalysisStep('正在讀取數據...');
    setCurrentPage(1);
    setFilterType('all');
    setSelectedCategory(null);
    setSelectedProductId(null);
    setSelectedLocations([]);
    setReportLanguage('zh');
    setRawData(data);
    
    try {
      // Artificial delay to show loading state if it's too fast
      await new Promise(resolve => setTimeout(resolve, 800));
      
      setAnalysisStep(`正在進行本地分類分析 (共 ${data.length} 筆)...`);
      const analyzed = await analyzeFeedbackBatch(data);
      setAnalyzedData(analyzed);
      
      setAnalysisStep('正在產生 AI 深度洞察報告...');
      const fullStats = await calculateStats(analyzed, reportLanguage);
      setStats(fullStats);
    } catch (err) {
      console.error("Analysis failed:", err);
      setErrorMessage('分析過程中發生錯誤，請稍後再試。');
    } finally {
      setIsAnalyzing(false);
      setAnalysisStep('');
    }
  };

  const viewModeData = useMemo(() => {
    let data = analyzedData;
    if (viewMode === 'PM') {
      data = data.filter(f => f.isProductRelated);
    }
    return data;
  }, [analyzedData, viewMode]);

  const filteredData = useMemo(() => {
    let data = viewModeData;
    
    // Interactive filter (Product vs Service)
    if (filterType === 'product') {
      data = data.filter(f => f.isProductRelated);
    } else if (filterType === 'service') {
      data = data.filter(f => f.isServiceRelated);
    }

    // Product ID filter
    if (selectedProductId) {
      data = data.filter(f => f.productId === selectedProductId);
    }

    // Location filter
    if (selectedLocations.length > 0) {
      data = data.filter(f => selectedLocations.includes(f.location));
    }

    // Category filter
    if (selectedCategory) {
      data = data.filter(f => f.mainCategory === selectedCategory || f.subCategory === selectedCategory);
    }

    return data;
  }, [viewModeData, filterType, selectedCategory, selectedProductId, selectedLocations]);

  const displayStats = useMemo(() => {
    if (!stats || !analyzedData.length) return null;
    return calculateBasicStats(filteredData);
  }, [stats, filteredData, analyzedData.length]);

  const viewStats = useMemo(() => {
    if (!stats || !viewModeData.length) return null;
    return calculateBasicStats(viewModeData);
  }, [stats, viewModeData]);

  const productIds = useMemo(() => {
    const ids = new Set(analyzedData.map(f => f.productId).filter(Boolean));
    return Array.from(ids).sort();
  }, [analyzedData]);

  const locations = useMemo(() => {
    const locs = new Set(analyzedData.map(f => f.location).filter(Boolean));
    return Array.from(locs).sort();
  }, [analyzedData]);

  const handleUpdateAISummary = async () => {
    if (filteredData.length === 0) return;
    setIsAnalyzing(true);
    setAnalysisStep('正在根據篩選條件重新產生 AI 洞察...');
    try {
      const newStats = await calculateStats(filteredData, reportLanguage);
      setStats(newStats);
    } catch (err) {
      setErrorMessage('重新生成 AI 洞察失敗。');
    } finally {
      setIsAnalyzing(false);
      setAnalysisStep('');
    }
  };

  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredData.slice(start, start + itemsPerPage);
  }, [filteredData, currentPage]);

  const totalPages = Math.ceil(filteredData.length / itemsPerPage);

  const StatCard = ({ title, value, icon: Icon, colorClass, active, onClick }: { title: string, value: string | number, icon: any, colorClass: string, active?: boolean, onClick?: () => void }) => (
    <button 
      onClick={onClick}
      className={cn(
        "bg-white p-6 rounded-xl border transition-all flex items-center gap-4 text-left w-full",
        active ? "border-blue-500 ring-2 ring-blue-100 shadow-md" : "border-slate-200 shadow-sm hover:border-slate-300",
        onClick ? "cursor-pointer" : "cursor-default"
      )}
    >
      <div className={cn("p-3 rounded-lg", colorClass)}>
        <Icon className="w-6 h-6" />
      </div>
      <div>
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{title}</p>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
      </div>
    </button>
  );

  return (
    <div 
      className="min-h-screen bg-slate-50 text-slate-900 font-sans"
      onClick={() => {
        // Global reset when clicking background
        if (analyzedData.length > 0) {
          setFilterType('all');
          setSelectedCategory(null);
          setCurrentPage(1);
        }
      }}
    >
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm" onClick={(e) => e.stopPropagation()}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-1.5 rounded-lg">
              <BarChart3 className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">InsightFlow <span className="text-slate-400 font-normal">| 客服滿意度分析</span></h1>
          </div>
          
          {analyzedData.length > 0 && (
            <div className="flex items-center gap-4">
              <div className="flex bg-slate-100 p-1 rounded-lg">
                <button
                  onClick={(e) => { e.stopPropagation(); setViewMode('CS'); setFilterType('all'); setSelectedCategory(null); }}
                  className={cn(
                    "px-4 py-1.5 text-sm font-medium rounded-md transition-all flex items-center gap-2",
                    viewMode === 'CS' ? "bg-white text-blue-600 shadow-sm" : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  <Users className="w-4 h-4" /> 客服視角
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setViewMode('PM'); setFilterType('all'); setSelectedCategory(null); }}
                  className={cn(
                    "px-4 py-1.5 text-sm font-medium rounded-md transition-all flex items-center gap-2",
                    viewMode === 'PM' ? "bg-white text-blue-600 shadow-sm" : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  <Settings className="w-4 h-4" /> PM 視角
                </button>
              </div>
              
              <button
                onClick={(e) => { e.stopPropagation(); setShowSaveModal(true); setShareUrl(null); }}
                className="flex items-center gap-2 px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 transition-all shadow-sm"
              >
                <Share2 className="w-4 h-4" /> 分享報告
              </button>

              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setAnalyzedData([]);
                  setRawData([]);
                  setStats(null);
                  window.history.replaceState({}, '', window.location.pathname);
                }}
                className="text-xs text-slate-400 hover:text-slate-600 underline"
              >
                重新上傳
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {analyzedData.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-2xl mx-auto mt-12"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center mb-12">
              <h2 className="text-3xl font-extrabold text-slate-900 sm:text-4xl">
                將數據轉化為洞察
              </h2>
              <p className="mt-4 text-lg text-slate-600">
                上傳客服工單與 NPS 調查資料，讓 AI 為您分析客戶回饋、分類問題並產生總結。
              </p>
            </div>
            
            {!isAnalyzing ? (
              <FileUpload onDataLoaded={handleDataLoaded} isAnalyzing={isAnalyzing} />
            ) : (
              <div className="p-12 border-2 border-dashed border-blue-200 rounded-2xl bg-blue-50 flex flex-col items-center gap-6">
                <div className="relative">
                  <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <RefreshCw className="w-6 h-6 text-blue-600 animate-pulse" />
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-blue-700 font-bold text-lg">AI 正在深度分析中</p>
                  <p className="text-blue-500 text-sm font-medium mt-2 animate-pulse">{analysisStep}</p>
                  <div className="flex justify-center gap-1 mt-4">
                    <motion.div animate={{ opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0 }} className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
                    <motion.div animate={{ opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0.3 }} className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
                    <motion.div animate={{ opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 1.5, delay: 0.6 }} className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
                  </div>
                  <p className="text-slate-400 text-[10px] mt-6">
                    提示：數據量較大時 (如 800+ 筆) 可能需要 15-30 秒，請勿關閉視窗。
                  </p>
                </div>
              </div>
            )}
          </motion.div>
        ) : (
          <div className="space-y-8">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" onClick={(e) => e.stopPropagation()}>
              <StatCard 
                title="總回饋筆數" 
                value={displayStats?.totalCount || 0} 
                icon={MessageSquare} 
                colorClass="bg-blue-50 text-blue-600"
                active={filterType === 'all' && !selectedCategory}
                onClick={() => { setFilterType('all'); setSelectedCategory(null); setCurrentPage(1); }}
              />
              <StatCard 
                title="平均 CSAT" 
                value={displayStats?.avgCsat || 0} 
                icon={TrendingUp} 
                colorClass="bg-emerald-50 text-emerald-600"
              />
              <StatCard 
                title="平均 NPS" 
                value={displayStats?.avgNps || 0} 
                icon={TrendingUp} 
                colorClass="bg-indigo-50 text-indigo-600"
              />
              <StatCard 
                title="正向回饋" 
                value={`${displayStats?.positiveCount || 0} (${Math.round(((displayStats?.positiveCount || 0) / (displayStats?.totalCount || 1)) * 100)}%)`} 
                icon={ThumbsUp} 
                colorClass="bg-amber-50 text-amber-600"
              />
            </div>

            {/* Filter Bar */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-lg shadow-slate-100 flex flex-wrap items-center gap-y-6 gap-x-8" onClick={(e) => e.stopPropagation()}>
              {/* Product ID Section */}
              <div className="flex items-center gap-3 pr-6 border-r border-slate-100">
                <div className="p-2 bg-slate-50 rounded-lg">
                  <Box className="w-4 h-4 text-slate-500" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Product ID</span>
                  <select 
                    value={selectedProductId || ''} 
                    onChange={(e) => { setSelectedProductId(e.target.value || null); setCurrentPage(1); }}
                    className="text-sm font-bold text-slate-700 focus:outline-none bg-transparent cursor-pointer hover:text-blue-600 transition-colors"
                  >
                    <option value="">全部產品</option>
                    {productIds.map(id => <option key={id} value={id}>{id}</option>)}
                  </select>
                </div>
              </div>

              {/* Location Section */}
              <div className="flex-1 flex items-center gap-4 min-w-[300px]">
                <div className="p-2 bg-slate-50 rounded-lg shrink-0">
                  <Globe className="w-4 h-4 text-slate-500" />
                </div>
                <div className="flex flex-col flex-1 overflow-hidden">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">地區篩選 (可複選)</span>
                  <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto scrollbar-hide">
                    <button
                      onClick={() => { setSelectedLocations([]); setCurrentPage(1); }}
                      className={cn(
                        "px-3 py-1 text-xs font-bold rounded-full border transition-all",
                        selectedLocations.length === 0 
                          ? "bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-100" 
                          : "bg-white text-slate-500 border-slate-200 hover:border-blue-400 hover:text-blue-500"
                      )}
                    >
                      全部
                    </button>
                    {locations.map(loc => (
                      <button
                        key={loc}
                        onClick={() => {
                          const next = selectedLocations.includes(loc)
                            ? selectedLocations.filter(l => l !== loc)
                            : [...selectedLocations, loc];
                          setSelectedLocations(next);
                          setCurrentPage(1);
                        }}
                        className={cn(
                          "px-3 py-1 text-xs font-bold rounded-full border transition-all",
                          selectedLocations.includes(loc)
                            ? "bg-blue-50 text-blue-600 border-blue-200 ring-2 ring-blue-50"
                            : "bg-white text-slate-500 border-slate-200 hover:border-blue-400 hover:text-blue-500"
                        )}
                      >
                        {loc}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* AI Language Section */}
              <div className="flex items-center gap-3 pl-6 border-l border-slate-100">
                <div className="p-2 bg-slate-50 rounded-lg">
                  <Languages className="w-4 h-4 text-slate-500" />
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">AI 輸出語言</span>
                  <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                    <button
                      onClick={() => setReportLanguage('zh')}
                      className={cn(
                        "px-3 py-1 text-[11px] font-bold rounded-md transition-all",
                        reportLanguage === 'zh' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                      )}
                    >
                      中文
                    </button>
                    <button
                      onClick={() => setReportLanguage('en')}
                      className={cn(
                        "px-3 py-1 text-[11px] font-bold rounded-md transition-all",
                        reportLanguage === 'en' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                      )}
                    >
                      EN
                    </button>
                  </div>
                </div>
              </div>

              {/* Action Section */}
              <div className="pl-4 flex items-center shrink-0">
                <button
                  onClick={handleUpdateAISummary}
                  disabled={isAnalyzing}
                  className="group flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 disabled:opacity-50 transition-all shadow-xl shadow-slate-200 active:scale-95"
                >
                  <RefreshCw className={cn("w-4 h-4 transition-transform group-hover:rotate-180 duration-500", isAnalyzing && "animate-spin")} />
                  重新生成 AI 洞察
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Left Column: Charts */}
              <div className="lg:col-span-2 space-y-8" onClick={(e) => e.stopPropagation()}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <CategoryChart 
                    title="Main Category 分布" 
                    data={displayStats?.mainCategoryDistribution || {}} 
                    onItemClick={(name) => { setSelectedCategory(name === selectedCategory ? null : name); setCurrentPage(1); }}
                    selectedItem={selectedCategory}
                  />
                  <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-900 mb-6 uppercase tracking-wider">議題佔比</h3>
                    <div className="space-y-4">
                      <button 
                        onClick={(e) => { e.stopPropagation(); setFilterType(filterType === 'product' ? 'all' : 'product'); setCurrentPage(1); }}
                        className={cn(
                          "w-full text-left p-4 rounded-xl border transition-all",
                          filterType === 'product' ? "bg-blue-50 border-blue-200 ring-2 ring-blue-100" : "bg-white border-slate-100 hover:bg-slate-50"
                        )}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-bold text-slate-700">產品相關議題</span>
                          <span className="text-sm font-bold text-blue-600">{stats?.productRelatedCount} 筆 ({Math.round(((stats?.productRelatedCount || 0) / (stats?.totalCount || 1)) * 100)}%)</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2">
                          <div className="bg-blue-500 h-2 rounded-full transition-all duration-500" style={{ width: `${((stats?.productRelatedCount || 0) / (stats?.totalCount || 1)) * 100}%` }}></div>
                        </div>
                      </button>
                      
                      {viewMode === 'CS' && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); setFilterType(filterType === 'service' ? 'all' : 'service'); setCurrentPage(1); }}
                          className={cn(
                            "w-full text-left p-4 rounded-xl border transition-all",
                            filterType === 'service' ? "bg-emerald-50 border-emerald-200 ring-2 ring-emerald-100" : "bg-white border-slate-100 hover:bg-slate-50"
                          )}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-bold text-slate-700">客服相關議題</span>
                            <span className="text-sm font-bold text-emerald-600">{stats?.serviceRelatedCount} 筆 ({Math.round(((stats?.serviceRelatedCount || 0) / (stats?.totalCount || 1)) * 100)}%)</span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-2">
                            <div className="bg-emerald-500 h-2 rounded-full transition-all duration-500" style={{ width: `${((stats?.serviceRelatedCount || 0) / (stats?.totalCount || 1)) * 100}%` }}></div>
                          </div>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <CategoryChart 
                    title="產品議題細分" 
                    data={displayStats?.productIssuesDistribution || {}} 
                    onItemClick={(name) => { setSelectedCategory(name === selectedCategory ? null : name); setCurrentPage(1); }}
                    selectedItem={selectedCategory}
                  />
                  {viewMode === 'CS' && (
                    <CategoryChart 
                      title="客服議題細分" 
                      data={displayStats?.serviceIssuesDistribution || {}} 
                      onItemClick={(name) => { setSelectedCategory(name === selectedCategory ? null : name); setCurrentPage(1); }}
                      selectedItem={selectedCategory}
                    />
                  )}
                </div>
              </div>

              {/* Right Column: AI Insights */}
              <div className="space-y-6" onClick={(e) => e.stopPropagation()}>
                <div 
                  className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden flex flex-col h-[400px] cursor-pointer hover:border-blue-300 transition-all group"
                  onClick={() => setIsInsightExpanded(true)}
                >
                  <div className="absolute top-0 left-0 w-1 h-full bg-blue-500 group-hover:w-2 transition-all"></div>
                  <div className="relative z-10 flex flex-col h-full">
                    <div className="flex items-center justify-between mb-6 flex-shrink-0">
                      <div className="flex items-center gap-2">
                        <LayoutDashboard className="w-5 h-5 text-blue-600" />
                        <h3 className="font-bold text-slate-900 text-lg">{viewMode === 'CS' ? '客服與產品' : '產品'}洞察</h3>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-[10px] text-blue-500 font-bold bg-blue-50 px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">點擊展開詳情</div>
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                      <div className="prose prose-slate max-w-none">
                        <div className="text-slate-700 leading-relaxed font-sans text-lg markdown-body">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {viewMode === 'CS' ? stats?.aiSummaryCS : stats?.aiSummaryPM || "正在生成 AI 洞察..."}
                          </ReactMarkdown>
                        </div>
                      </div>
                    </div>
                    <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400 font-medium flex-shrink-0">
                      <span>由 Gemini AI 自動產生</span>
                      <span>{new Date().toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm" onClick={(e) => e.stopPropagation()}>
                  <h3 className="text-sm font-bold text-slate-900 mb-4 uppercase tracking-wider flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-600" /> 主要痛點
                  </h3>
                  <div className="space-y-2">
                    {Object.entries({
                      ...(viewStats?.productIssuesDistribution || {}),
                      ...(viewMode === 'CS' ? (viewStats?.serviceIssuesDistribution || {}) : {})
                    })
                      .map(([name, count]) => ({ name, count: Number(count) }))
                      .sort((a, b) => b.count - a.count)
                      .slice(0, 5)
                      .map(({ name, count }) => (
                        <button 
                          key={name} 
                          onClick={(e) => { 
                            e.stopPropagation(); 
                            setSelectedCategory(name === selectedCategory ? null : name); 
                            setCurrentPage(1); 
                          }}
                          className={cn(
                            "flex items-center justify-between p-3 rounded-lg group transition-all w-full",
                            selectedCategory === name ? "bg-blue-50 border border-blue-100" : "bg-slate-50 hover:bg-slate-100"
                          )}
                        >
                          <span className="text-sm font-medium text-slate-700">{name}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-400">{count} 筆</span>
                            <ChevronRight className={cn("w-4 h-4 transition-colors", selectedCategory === name ? "text-blue-500" : "text-slate-300 group-hover:text-blue-500")} />
                          </div>
                        </button>
                      ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Detailed Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-4">
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">回饋明細</h3>
                  <span className="px-2 py-1 bg-slate-200 text-slate-600 rounded text-[10px] font-bold uppercase">
                    共 {filteredData.length} 筆
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2 mr-4">
                    <span className="text-xs text-slate-500">跳至頁面:</span>
                    <select 
                      value={currentPage}
                      onChange={(e) => setCurrentPage(Number(e.target.value))}
                      className="text-xs border border-slate-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                        <option key={page} value={page}>第 {page} 頁</option>
                      ))}
                    </select>
                  </div>
                  <button 
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    className="p-1.5 rounded-md border border-slate-200 disabled:opacity-30 hover:bg-white transition-colors"
                  >
                    <ChevronRight className="w-4 h-4 rotate-180" />
                  </button>
                  <span className="text-xs font-medium text-slate-500">
                    第 {currentPage} / {totalPages || 1} 頁
                  </span>
                  <button 
                    disabled={currentPage === totalPages || totalPages === 0}
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    className="p-1.5 rounded-md border border-slate-200 disabled:opacity-30 hover:bg-white transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="w-full text-left border-collapse min-w-[1000px]">
                  <thead className="sticky top-0 z-10 bg-white shadow-sm">
                    <tr>
                      <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100 w-32">工單 ID</th>
                      <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100 w-24">CSAT/NPS</th>
                      <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100 w-32">Product / Loc</th>
                      <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100 w-40">分類</th>
                      <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100">用戶回饋內容</th>
                      <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100 w-24">相關性</th>
                      <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100 w-16"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paginatedData.map((f, i) => (
                      <tr key={i} className="hover:bg-slate-50 transition-colors group">
                        <td className="p-4 align-top">
                          <a 
                            href={`https://furbo.zendesk.com/agent/tickets/${f.ticketId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-bold text-blue-600 hover:underline flex items-center gap-1"
                          >
                            #{f.ticketId}
                          </a>
                        </td>
                        <td className="p-4 align-top">
                          <div className="flex flex-col gap-1">
                            <span className={cn(
                              "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold",
                              f.csatScore >= 4 ? "bg-emerald-100 text-emerald-800" : f.csatScore <= 2 ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-800"
                            )}>CSAT: {f.csatScore}</span>
                            <span className={cn(
                              "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold",
                              f.npsScore >= 9 ? "bg-indigo-100 text-indigo-800" : f.npsScore <= 6 ? "bg-orange-100 text-orange-800" : "bg-slate-100 text-slate-800"
                            )}>NPS: {f.npsScore}</span>
                          </div>
                        </td>
                        <td className="p-4 align-top">
                          <div className="flex flex-col gap-1">
                            <span className="text-xs font-bold text-slate-700">{f.productId || '-'}</span>
                            <span className="text-[10px] text-slate-400">{f.location || '-'}</span>
                          </div>
                        </td>
                        <td className="p-4 align-top">
                          <div className="flex flex-col gap-1">
                            <span className="text-xs font-bold text-slate-700">{f.mainCategory}</span>
                            <span className="text-[10px] text-slate-400">{f.subCategory}</span>
                          </div>
                        </td>
                        <td className="p-4 align-top">
                          <div className="space-y-2 max-w-2xl">
                            {f.ticketComment && (
                              <div className="text-sm text-slate-700 bg-slate-50 p-2 rounded border border-slate-100">
                                <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">工單評論</span>
                                {f.ticketComment}
                              </div>
                            )}
                            {f.npsComment && (
                              <div className="text-sm text-slate-700 bg-indigo-50/30 p-2 rounded border border-indigo-100/50">
                                <span className="text-[10px] font-bold text-indigo-400 uppercase block mb-1">NPS 評論</span>
                                {f.npsComment}
                              </div>
                            )}
                            {f.howToImprove && (
                              <div className="text-sm text-slate-700 bg-amber-50/30 p-2 rounded border border-amber-100/50">
                                <span className="text-[10px] font-bold text-amber-400 uppercase block mb-1">改進建議</span>
                                {f.howToImprove}
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="p-4 align-top">
                          <div className="flex flex-col gap-1">
                            {f.isProductRelated && <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded text-[9px] font-bold uppercase text-center">Product</span>}
                            {f.isServiceRelated && <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded text-[9px] font-bold uppercase text-center">Service</span>}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-400">
                          <div className="flex items-center gap-1">
                            <button 
                              onClick={() => setEditingFeedback(f)}
                              className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-blue-600 hover:text-blue-700"
                              title="手動修正 AI 分類"
                            >
                              <Edit3 size={16} />
                            </button>
                            <button 
                              onClick={() => handleAnalyzeTimeout(f)}
                              className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-emerald-600 hover:text-emerald-700"
                              title="Chat 超時分析"
                            >
                              <Clock size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Saved Reports Section */}
        <div className="mt-12 border-t border-slate-200 pt-8" onClick={(e) => e.stopPropagation()}>
            <button 
              onClick={() => setIsReportsExpanded(!isReportsExpanded)}
              className="flex items-center gap-2 text-slate-500 hover:text-slate-900 transition-colors group"
            >
              <div className={cn("transition-transform duration-300", isReportsExpanded ? "rotate-180" : "")}>
                <ChevronDown className="w-5 h-5" />
              </div>
              <span className="font-bold uppercase tracking-widest text-xs">查看已儲存的歷史報告 ({savedReports.length})</span>
            </button>

            {isReportsExpanded && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pb-12"
              >
                {savedReports.length === 0 ? (
                  <div className="col-span-full py-12 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    <p className="text-slate-400 text-sm">尚未儲存任何報告</p>
                  </div>
                ) : (
                  savedReports.map(report => (
                    <div key={report.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all group relative">
                      <div className="flex flex-col gap-1 mb-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-bold text-slate-900 line-clamp-1">{report.title}</span>
                          <span className={cn(
                            "text-[8px] px-1.5 py-0.5 rounded font-bold uppercase",
                            report.type === 'pm' ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-600"
                          )}>
                            {report.type === 'pm' ? 'PM' : 'Full'}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-medium">
                          {report.createdAt?.seconds ? new Date(report.createdAt.seconds * 1000).toLocaleString() : '未知時間'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => window.open(`${window.location.origin}${window.location.pathname}?report=${report.id}`, '_blank')}
                          className="flex-1 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-bold hover:bg-blue-100 transition-all flex items-center justify-center gap-1"
                        >
                          <ExternalLink size={12} /> 開啟報告
                        </button>
                        <button 
                          onClick={(e) => handleDeleteReport(report.id, e)}
                          className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                          title="刪除"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </motion.div>
            )}
          </div>
      </main>

      {/* Timeout Analysis Modal */}
      {timeoutAnalysis && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden"
          >
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="bg-emerald-100 p-2 rounded-xl">
                  <Clock className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">Chat 超時分析報告</h3>
                  <p className="text-xs text-slate-500">工單 ID: {timeoutAnalysis.id}</p>
                </div>
              </div>
              <button 
                onClick={() => setTimeoutAnalysis(null)}
                className="p-2 hover:bg-slate-200 rounded-full transition-all"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <div className="p-8 overflow-y-auto custom-scrollbar">
              <div className="prose prose-slate max-w-none markdown-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{timeoutAnalysis.content}</ReactMarkdown>
              </div>
            </div>
            <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex justify-end">
              <button
                onClick={() => setTimeoutAnalysis(null)}
                className="px-6 py-2 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 transition-all"
              >
                關閉
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Global Loading for Timeout Analysis */}
      {isAnalyzingTimeout && (
        <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-[2px] z-[110] flex items-center justify-center">
          <div className="bg-white p-6 rounded-2xl shadow-xl flex items-center gap-4">
            <RefreshCw className="w-5 h-5 text-blue-600 animate-spin" />
            <p className="text-sm font-bold text-slate-700">正在分析超時原因...</p>
          </div>
        </div>
      )}

      {/* Save & Share Modal */}
      {showSaveModal && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
          onClick={() => setShowSaveModal(false)}
        >
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
                <Save className="w-5 h-5 text-blue-600" /> 儲存並分享報告
              </h3>
              <button onClick={() => setShowSaveModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              {!shareUrl ? (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">報告名稱 (例如：2024 Q1 分析)</label>
                    <input 
                      type="text"
                      placeholder="輸入報告名稱..."
                      value={reportTitle}
                      onChange={(e) => setReportTitle(e.target.value)}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">報告類型</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button 
                        onClick={() => setReportTypeToSave('full')}
                        className={cn(
                          "py-2 rounded-xl text-xs font-bold border transition-all",
                          reportTypeToSave === 'full' 
                            ? "bg-blue-50 border-blue-200 text-blue-600 shadow-sm" 
                            : "bg-white border-slate-100 text-slate-400 hover:bg-slate-50"
                        )}
                      >
                        完整報告 (CS+PM)
                      </button>
                      <button 
                        onClick={() => setReportTypeToSave('pm')}
                        className={cn(
                          "py-2 rounded-xl text-xs font-bold border transition-all",
                          reportTypeToSave === 'pm' 
                            ? "bg-blue-50 border-blue-200 text-blue-600 shadow-sm" 
                            : "bg-white border-slate-100 text-slate-400 hover:bg-slate-50"
                        )}
                      >
                        PM 視角報告
                      </button>
                    </div>
                  </div>

                  <button 
                    onClick={handleSaveReport}
                    disabled={!reportTitle || isSaving}
                    className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
                  >
                    {isSaving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {isSaving ? '正在儲存...' : '產生分享連結'}
                  </button>
                </>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center gap-3">
                    <Check className="w-5 h-5 text-emerald-600" />
                    <p className="text-sm text-emerald-800 font-medium">報告已成功儲存！</p>
                  </div>
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-500 uppercase">分享連結</label>
                    <div className="flex gap-2">
                      <input 
                        type="text"
                        readOnly
                        value={shareUrl}
                        className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600"
                      />
                      <button 
                        onClick={copyToClipboard}
                        className="p-2 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all"
                      >
                        {isCopied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-slate-600" />}
                      </button>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-400 text-center">
                    任何人擁有此連結皆可查看此分析報告。
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}

      {/* AI Insight Modal */}
      {isInsightExpanded && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
          onClick={() => setIsInsightExpanded(false)}
        >
          <motion.div 
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white w-full max-w-4xl h-[80vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div className="bg-blue-600 p-2 rounded-xl shadow-lg shadow-blue-200">
                  <LayoutDashboard className="w-6 h-6 text-white" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900">{viewMode === 'CS' ? '客服與產品' : '產品'}洞察詳情</h2>
              </div>
              <button 
                onClick={() => setIsInsightExpanded(false)}
                className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-400 hover:text-slate-600"
              >
                <X size={24} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
              <div className="prose prose-slate max-w-none">
                <div className="text-slate-700 leading-relaxed whitespace-pre-wrap font-serif text-xl">
                  {viewMode === 'CS' ? stats?.aiSummaryCS : stats?.aiSummaryPM || "正在生成 AI 洞察..."}
                </div>
              </div>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 text-center">
              <button 
                onClick={() => setIsInsightExpanded(false)}
                className="px-6 py-2 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all"
              >
                關閉視窗
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Edit Feedback Modal */}
      {editingFeedback && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden"
          >
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="font-bold text-slate-900 text-lg flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-blue-600" /> 手動修正 AI 分析
              </h3>
              <button onClick={() => setEditingFeedback(null)} className="text-slate-400 hover:text-slate-600">
                <X size={24} />
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-2">情緒 (Sentiment)</label>
                <div className="flex gap-2">
                  {['positive', 'neutral', 'negative'].map(s => (
                    <button
                      key={s}
                      onClick={() => setEditingFeedback({ ...editingFeedback, sentiment: s as any })}
                      className={cn(
                        "flex-1 py-2 rounded-lg border transition-all capitalize text-sm font-bold",
                        editingFeedback.sentiment === s 
                          ? "bg-blue-600 border-blue-600 text-white shadow-md" 
                          : "bg-white border-slate-200 text-slate-400 hover:bg-slate-50"
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">主分類</label>
                  <select 
                    value={editingFeedback.mainCategory}
                    onChange={(e) => setEditingFeedback({ ...editingFeedback, mainCategory: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {Object.keys(CATEGORY_PATTERNS.main).map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-2">子分類</label>
                  <select 
                    value={editingFeedback.subCategory}
                    onChange={(e) => setEditingFeedback({ ...editingFeedback, subCategory: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {Object.keys(CATEGORY_PATTERNS.sub).map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  onClick={() => {
                    const isProduct = ['Product Disappointment', 'UX Friction', 'Feature Gap', 'Pricing Concern'].includes(editingFeedback.mainCategory);
                    const isService = ['Service Disappointment', 'Positive Resolved'].includes(editingFeedback.mainCategory);
                    handleUpdateFeedback({
                      ...editingFeedback,
                      isProductRelated: isProduct,
                      isServiceRelated: isService
                    });
                  }}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg shadow-blue-200"
                >
                  儲存修正
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
      {/* Delete Confirmation Modal */}
      {reportToDelete && (
        <div 
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
          onClick={() => setReportToDelete(null)}
        >
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 size={32} />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">確定要刪除這份報告嗎？</h3>
              <p className="text-slate-500 text-sm mb-6">此動作無法復原，該報告將永久從資料庫中移除。</p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setReportToDelete(null)}
                  className="flex-1 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-all"
                >
                  取消
                </button>
                <button 
                  onClick={confirmDeleteReport}
                  className="flex-1 py-2.5 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 transition-all shadow-lg shadow-red-200"
                >
                  確認刪除
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Error Message Modal */}
      {errorMessage && (
        <div 
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm"
          onClick={() => setErrorMessage(null)}
        >
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 text-center">
              <div className="w-16 h-16 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle size={32} />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">發生錯誤</h3>
              <p className="text-slate-500 text-sm mb-6">{errorMessage}</p>
              <button 
                onClick={() => setErrorMessage(null)}
                className="w-full py-2.5 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-all"
              >
                關閉
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

import React, { useCallback, useState } from 'react';
import Papa from 'papaparse';
import { Upload, FileType, Link as LinkIcon, RefreshCw, MessageSquareText } from 'lucide-react';
import { RawFeedback } from '../types';

interface FileUploadProps {
  onDataLoaded: (data: RawFeedback[]) => void;
  isAnalyzing: boolean;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onDataLoaded, isAnalyzing }) => {
  const [sheetUrl, setSheetUrl] = useState('');
  const [isFetching, setIsFetching] = useState(false);
  const [isFetchingZendesk, setIsFetchingZendesk] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parseCSVData = (csvString: string): Promise<void> => {
    return new Promise((resolve) => {
      Papa.parse(csvString, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const rawData: RawFeedback[] = results.data.map((row: any) => ({
            ticketId: row['工單 ID'] || row['工單ID'] || row['Ticket ID'] || row['id'] || row['ID'] || '',
            csatScore: parseInt(row['CSAT score'] || row['CSAT Score'] || row['CSAT'] || '0'),
            npsScore: parseInt(row['NPS Score'] || row['NPS score'] || row['NPS'] || '0'),
            ticketComment: row['工單滿意度評論'] || row['Ticket Satisfaction Comment'] || row['Comment'] || row['comment'] || '',
            npsComment: row['NPS comment'] || row['NPS Comment'] || row['NPS Feedback'] || '',
            howToImprove: row['NPC How to improve'] || row['How to improve'] || row['Improvement'] || '',
            friendliness: parseInt(row['Friendliness'] || row['親切度'] || '0'),
            helpfulness: parseInt(row['Helpfulness'] || row['專業度'] || '0'),
            promptness: parseInt(row['Promptness'] || row['速度'] || '0'),
            productId: row['Product ID'] || row['ProductID'] || row['產品ID'] || row['產品'] || '',
            location: row['Location'] || row['location'] || row['地區'] || row['國家'] || '',
          }));
          onDataLoaded(rawData);
          resolve();
        },
        error: (err) => {
          setError(`解析失敗: ${err.message}`);
          resolve();
        }
      });
    });
  };

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      await parseCSVData(text);
    };
    reader.readAsText(file);
  }, [onDataLoaded]);

  const handleFetchGoogleSheet = async () => {
    if (!sheetUrl) return;
    setIsFetching(true);
    setError(null);

    try {
      // Extract sheet ID
      const sheetIdMatch = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
      if (!sheetIdMatch) {
        throw new Error('無效的 Google Sheet 網址');
      }
      const sheetId = sheetIdMatch[1];

      // Extract sheet name (optional, default to first sheet)
      const gidMatch = sheetUrl.match(/gid=([0-9]+)/);
      const gid = gidMatch ? gidMatch[1] : '0';

      // Construct CSV export URL
      const exportUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;

      const response = await fetch(exportUrl);
      if (!response.ok) {
        throw new Error('無法讀取試算表，請確認該試算表已開啟「知道連結的人均可查看」權限。');
      }

      const csvText = await response.text();
      
      // Check if it's actually HTML (login page or error page)
      if (csvText.includes('<!DOCTYPE html>') || csvText.includes('<html') || csvText.includes('google-signin')) {
        throw new Error('讀取失敗：該試算表可能未開啟「知道連結的人均可查看」權限，或網址格式不正確。');
      }

      if (csvText.length < 10) {
        throw new Error('讀取失敗：試算表內容似乎是空的。');
      }
      
      await parseCSVData(csvText);
    } catch (err) {
      setError(err instanceof Error ? err.message : '發生未知錯誤');
    } finally {
      setIsFetching(false);
    }
  };

  const handleFetchZendesk = async () => {
    setIsFetchingZendesk(true);
    setError(null);
    try {
      const response = await fetch('/api/zendesk/tickets');
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || '無法連線至 Zendesk，請檢查環境變數設定。');
      }
      const data = await response.json();
      
      // Map Zendesk tickets to RawFeedback format
      const rawData: RawFeedback[] = data.tickets.map((t: any) => ({
        ticketId: t.id.toString(),
        csatScore: t.satisfaction_rating?.score === 'good' ? 5 : (t.satisfaction_rating?.score === 'bad' ? 1 : 0),
        npsScore: 0, // Zendesk core doesn't have NPS by default
        ticketComment: t.subject + '\n' + t.description,
        npsComment: '',
        howToImprove: '',
        friendliness: 0,
        helpfulness: 0,
        promptness: 0,
        productId: t.fields?.find((f: any) => f.id === 12345678)?.value || '', // Placeholder for custom field
        location: t.fields?.find((f: any) => f.id === 87654321)?.value || '', // Placeholder for custom field
      }));
      
      onDataLoaded(rawData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Zendesk 讀取失敗');
    } finally {
      setIsFetchingZendesk(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Google Sheet Section */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <LinkIcon className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">讀取 Google Sheet</h3>
          </div>
          <div className="flex gap-2 mb-auto">
            <input
              type="text"
              placeholder="貼上 Google Sheet 網址"
              value={sheetUrl}
              onChange={(e) => setSheetUrl(e.target.value)}
              className="flex-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            />
            <button
              onClick={handleFetchGoogleSheet}
              disabled={!sheetUrl || isFetching || isAnalyzing}
              className="px-6 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
            >
              {isFetching ? <RefreshCw className="w-4 h-4 animate-spin" /> : '讀取'}
            </button>
          </div>
          <p className="mt-3 text-[10px] text-slate-400 leading-relaxed">
            提示：需開啟「知道連結的人均可查看」權限。
          </p>
        </div>

        {/* Zendesk Section */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <MessageSquareText className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">整合 Zendesk API</h3>
          </div>
          <div className="flex flex-col gap-3">
            <button
              onClick={handleFetchZendesk}
              disabled={isFetchingZendesk || isAnalyzing}
              className="w-full py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
            >
              {isFetchingZendesk ? <RefreshCw className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              同步最新 Zendesk 工單
            </button>
            <p className="text-[10px] text-slate-400 leading-relaxed">
              將自動從您的 Zendesk 帳戶抓取最近的工單進行分析。
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600 font-medium flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-red-600 rounded-full"></span>
          {error}
        </div>
      )}

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-slate-200"></span>
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-slate-50 px-2 text-slate-500 font-bold">或</span>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-slate-300 rounded-2xl bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer relative">
        <input
          type="file"
          accept=".csv"
          onChange={handleFileUpload}
          className="absolute inset-0 opacity-0 cursor-pointer"
          disabled={isAnalyzing || isFetching}
        />
        <div className="bg-blue-100 p-4 rounded-full mb-4">
          <Upload className="w-8 h-8 text-blue-600" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900">上傳原始檔案</h3>
        <p className="text-sm text-slate-500 mt-1">支援 CSV 格式檔案</p>
      </div>

      <div className="flex justify-center gap-2">
        <span className="px-3 py-1 bg-white border border-slate-200 rounded-md text-[10px] text-slate-600 flex items-center gap-1">
          <FileType className="w-3 h-3" /> 工單ID
        </span>
        <span className="px-3 py-1 bg-white border border-slate-200 rounded-md text-[10px] text-slate-600 flex items-center gap-1">
          <FileType className="w-3 h-3" /> CSAT/NPS Score
        </span>
        <span className="px-3 py-1 bg-white border border-slate-200 rounded-md text-[10px] text-slate-600 flex items-center gap-1">
          <FileType className="w-3 h-3" /> 用戶評論
        </span>
      </div>
    </div>
  );
};

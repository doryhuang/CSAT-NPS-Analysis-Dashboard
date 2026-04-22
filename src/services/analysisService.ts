import { GoogleGenAI, Type } from "@google/genai";
import { RawFeedback, AnalyzedFeedback, DashboardStats, CATEGORY_PATTERNS } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export async function analyzeFeedbackBatch(feedbacks: RawFeedback[]): Promise<AnalyzedFeedback[]> {
  const baselineAnalyzed = feedbacks.map(f => {
    const combinedText = `${f.ticketComment} ${f.npsComment} ${f.howToImprove}`.toLowerCase();
    
    let mainCategory = 'Other';
    for (const [cat, patterns] of Object.entries(CATEGORY_PATTERNS.main)) {
      if ((patterns as string[]).some(p => combinedText.includes(p.toLowerCase()))) {
        mainCategory = cat;
        break;
      }
    }

    let subCategory = 'Other';
    for (const [cat, patterns] of Object.entries(CATEGORY_PATTERNS.sub)) {
      if ((patterns as string[]).some(p => combinedText.includes(p.toLowerCase()))) {
        subCategory = cat;
        break;
      }
    }

    // Sentiment - Refined logic
    const positiveKeywords = [
      '非常滿意', '加薪', '超乎預期', '迅速有禮', '很棒', '感謝', '推薦', '很好', '喜歡', '幫助很大', '效率高', '讚', '推', '留住了', '積極',
      'excellent', 'great', 'awesome', 'thank', 'recommend', 'helpful', 'efficient', 'satisfied', 'love', 'perfect',
      '満足', '感謝', '素晴らしい', 'おすすめ', '助かる', '速い', '丁寧', '大好き', '良い', '最高', 'ありがとう', '満足しています'
    ];
    const negativeKeywords = [
      '不滿', '太慢', '很差', '沒解決', '沒人理', '垃圾', '難用', '斷線', '故障', '壞了', '浪費', '貴', '失望', '生氣', '爛',
      'disappointed', 'slow', 'bad', 'not resolved', 'waste', 'expensive', 'useless', 'broken', 'failed', 'terrible', 'angry',
      '不満', '遅い', '悪い', '解決しない', '返事がない', '最悪', '使いにくい', '検知されない', '故障', '壊れた', '無駄', '高い', '失望', '怒り'
    ];

    const hasStrongPositive = positiveKeywords.some(k => combinedText.includes(k.toLowerCase()));
    const hasStrongNegative = negativeKeywords.some(k => combinedText.includes(k.toLowerCase()));

    let sentiment: 'positive' | 'neutral' | 'negative' = 'neutral';
    if (hasStrongPositive || f.csatScore >= 4 || f.npsScore >= 9) {
      sentiment = 'positive';
    } else if (hasStrongNegative || f.csatScore <= 2 || f.npsScore <= 6) {
      sentiment = 'negative';
    }

    // If sentiment is positive, override negative categories if they were matched by mistake
    if (sentiment === 'positive' && (mainCategory === 'Service Disappointment' || mainCategory === 'Product Disappointment')) {
      mainCategory = 'Positive Delight';
    }

    // Determine relation based on category definitions (STRICT)
    const serviceMainCategories = ['Service Disappointment', 'Positive Resolved', 'Positive Delight'];
    const productMainCategories = ['Product Disappointment', 'UX Friction', 'Feature Gap', 'Pricing Concern'];
    
    const serviceSubCategories = ['Response Speed', 'Resolution Quality'];
    const productSubCategories = ['AI Accuracy', 'Recording', 'Hardware', 'App UI', 'Account', 'WiFi Setup', 'Subscription', 'Video Quality'];

    // Determine relations
    let isServiceRelated = serviceMainCategories.includes(mainCategory) || serviceSubCategories.includes(subCategory);
    let isProductRelated = productMainCategories.includes(mainCategory) || productSubCategories.includes(subCategory);

    // Strict overrides as requested
    if (serviceMainCategories.includes(mainCategory) || serviceSubCategories.includes(subCategory)) {
      // If it's primarily service, we lean towards service unless it explicitly mentions product main categories
      if (!productMainCategories.includes(mainCategory)) {
        isProductRelated = false;
      }
    }
    
    if (productMainCategories.includes(mainCategory) || productSubCategories.includes(subCategory)) {
      // If it's primarily product, we lean towards product unless it explicitly mentions service main categories
      if (!serviceMainCategories.includes(mainCategory)) {
        isServiceRelated = false;
      }
    }

    return {
      ...f,
      mainCategory,
      subCategory,
      isProductRelated,
      isServiceRelated,
      sentiment
    };
  });

  // If there are many "Other" categories, we use AI to categorize them in batches
  const needsAi = baselineAnalyzed.filter(f => f.mainCategory === 'Other' || f.subCategory === 'Other' || f.sentiment === 'positive').slice(0, 50);
  
  if (needsAi.length > 0) {
    const prompt = `
      你是一個專業的數據分析師。請幫我將以下用戶回饋內容進行分類。
      
      主分類 (mainCategory) 定義：
      1. Product Disappointment: 使用者對產品本身的表現不滿 (功能失效、偵測不準確、錄影漏掉、硬體異常)。[產品相關]
      2. Service Disappointment: 使用者對客服服務或支援流程不滿 (回覆慢、態度不佳、問題未解決、流程繁瑣)。[客服相關]
      3. UX Friction: 產品可用性或操作體驗造成困擾，但功能本身存在 (設定複雜、找不到功能、操作步驟太多、App 不直覺)。[產品相關]
      4. Feature Gap: 使用者希望有某功能，但目前沒有或不足 (建議新增功能、期待優化特定場景辨識)。[產品相關]
      5. Pricing Concern: 與價格或訂閱費用相關的負面回饋 (太貴、CP值低、續訂猶豫、功能與價格不符)。[產品相關]
      6. Positive Resolved: 原本有問題，但已被妥善解決 (問題有處理完成、對解決結果滿意、無後續抱怨)。[客服相關]
      7. Positive Delight: 使用者明確表達滿意或超出期待 (很喜歡、超出預期、推薦朋友、非問題導向)。[客服相關]
      
      子分類 (subCategory) 定義：
      - AI Accuracy: AI 偵測準確度問題。[產品相關]
      - Recording: 錄影機制相關問題。[產品相關]
      - Hardware: 硬體設備問題。[產品相關]
      - App UI: App 操作與介面體驗問題。[產品相關]
      - Account: 帳號與登入相關問題。[產品相關]
      - WiFi Setup: 連線或安裝設定問題。[產品相關]
      - Subscription: 訂閱與方案問題。[產品相關]
      - Video Quality: 影像品質問題。[產品相關]
      - Response Speed: 客服回應速度。[客服相關]
      - Resolution Quality: 問題處理品質。[客服相關]
      - Other: 無法歸類。
      
      分類規則：
      - 客服相關 (isServiceRelated: true): 主分類為 Service Disappointment, Positive Resolved, Positive Delight，或子分類為 Response Speed, Resolution Quality。
      - 產品相關 (isProductRelated: true): 主分類為 Product Disappointment, UX Friction, Feature Gap, Pricing Concern，或子分類為 AI Accuracy, Recording, Hardware, App UI, Account, WiFi Setup, Subscription, Video Quality。
      - 如果內容同時涉及兩者，請同時標記為 true。但如果主分類明確屬於其中一方且內容未提及另一方，請將另一方標記為 false。
      
      回饋內容：
      ${needsAi.map(f => `[ID: ${f.ticketId}] ${f.ticketComment} ${f.npsComment} ${f.howToImprove}`).join('\n')}
    `;
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          safetySettings: [
            { category: "HARM_CATEGORY_HATE_SPEECH" as any, threshold: "BLOCK_NONE" as any },
            { category: "HARM_CATEGORY_HARASSMENT" as any, threshold: "BLOCK_NONE" as any },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT" as any, threshold: "BLOCK_NONE" as any },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT" as any, threshold: "BLOCK_NONE" as any },
          ],
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                ticketId: { type: Type.STRING },
                mainCategory: { type: Type.STRING },
                subCategory: { type: Type.STRING },
                isProductRelated: { type: Type.BOOLEAN },
                isServiceRelated: { type: Type.BOOLEAN },
                sentiment: { type: Type.STRING, enum: ['positive', 'neutral', 'negative'] }
              },
              required: ["ticketId", "mainCategory", "subCategory", "isProductRelated", "isServiceRelated", "sentiment"]
            }
          }
        }
      });

      const aiResults = JSON.parse(response.text || "[]") as Array<{
        ticketId: string;
        mainCategory: string;
        subCategory: string;
        isProductRelated: boolean;
        isServiceRelated: boolean;
        sentiment: 'positive' | 'neutral' | 'negative';
      }>;
      
      const aiMap = new Map(aiResults.map(r => [r.ticketId, r]));

      return baselineAnalyzed.map(f => {
        const aiResult = aiMap.get(f.ticketId);
        if (aiResult) {
          return {
            ...f,
            mainCategory: aiResult.mainCategory,
            subCategory: aiResult.subCategory,
            isProductRelated: aiResult.isProductRelated,
            isServiceRelated: aiResult.isServiceRelated,
            sentiment: aiResult.sentiment
          };
        }
        return f;
      });
    } catch (error) {
      console.error("AI Categorization Error:", error);
    }
  }

  return baselineAnalyzed;
}

export async function generateAISummary(analyzedData: AnalyzedFeedback[], viewMode: 'CS' | 'PM', language: 'zh' | 'en' = 'zh'): Promise<string> {
  const isCS = viewMode === 'CS';
  const isZh = language === 'zh';

  if (analyzedData.length === 0) return isZh ? "尚無資料可分析。" : "No data available for analysis.";

  // Filter for negative feedback first
  let targetFeedback = analyzedData.filter(f => f.sentiment === 'negative' && (isCS ? true : f.isProductRelated));
  
  // If no negative feedback, look for "Other" or "Neutral" feedback that might contain issues
  if (targetFeedback.length === 0) {
    targetFeedback = analyzedData.filter(f => f.sentiment !== 'positive' && (isCS ? true : f.isProductRelated));
  }

  // If still no data, or only positive data exists
  if (targetFeedback.length === 0) {
    return isZh ? "目前篩選條件下無明顯負面回饋或待改進事項。" : "No significant negative feedback or issues found under the current filters.";
  }
  
  const feedbackText = targetFeedback
    .map(f => `[Case ID: ${f.ticketId}] [${f.isProductRelated ? '產品' : '客服'}] ${f.ticketComment} ${f.npsComment} ${f.howToImprove}`)
    .slice(0, 50)
    .join("\n");

  const prompt = isCS ? `
    你是一位客服與客戶體驗分析師。
    任務：將所有終端使用者的描述以及已採取的關鍵行動（如有）整理成三個精簡的重點條列。
    要求：
    1. 擷取並強調關鍵問題、情緒與緊急程度。
    2. 依優先順序（由最緊急／最重要開始）提供三個關鍵結論。
    3. 在結論中需包含數據分析（例如：本次分析中有 70% 的工單屬於此類）。
    4. 最後，從客服角度提出一項可改善的機會建議。
    5. 在摘要後標註案件編號（case ID）。
    6. 格式如下：
       ## 工單摘要
       (重點條列)
       
       ## 結論（百分比）
       (結論內容)
       
       ## 洞察與三個範例情境
       (洞察內容)
       
       ## 改善建議
       (建議內容)
       
    請確保所有工單的百分比總和為 100%。產出結果必須為繁體中文。

    待分析工單：
    ${feedbackText}
  ` : `
    You are a professional Product Manager. Please provide a professional analysis focused on product logic and stability.
    
    Analysis Focus: Product functional defects, stability, user pain points, improvement directions, hardware issues, or App UI.
    Exclude: customer service attitude or response speed.
    Format: Use Markdown, include "Deep Analysis Report" and "Meeting Summary".
    Language: Traditional Chinese.
    
    User Feedback:
    ${feedbackText}
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        safetySettings: [
          { category: "HARM_CATEGORY_HATE_SPEECH" as any, threshold: "BLOCK_NONE" as any },
          { category: "HARM_CATEGORY_HARASSMENT" as any, threshold: "BLOCK_NONE" as any },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT" as any, threshold: "BLOCK_NONE" as any },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT" as any, threshold: "BLOCK_NONE" as any },
        ]
      }
    });
    return response.text || "無法產生 AI 總結。";
  } catch (error) {
    console.error("AI Summary Error:", error);
    return "AI 總結產生失敗，請稍後再試。";
  }
}

export function calculateBasicStats(data: AnalyzedFeedback[]): Omit<DashboardStats, 'aiSummaryCS' | 'aiSummaryPM'> {
  const totalCount = data.length;
  if (totalCount === 0) {
    return {
      totalCount: 0,
      avgCsat: 0,
      avgNps: 0,
      productRelatedCount: 0,
      serviceRelatedCount: 0,
      positiveCount: 0,
      mainCategoryDistribution: {},
      serviceIssuesDistribution: {},
      productIssuesDistribution: {}
    };
  }

  const avgCsat = data.reduce((acc, curr) => acc + curr.csatScore, 0) / totalCount;
  const avgNps = data.reduce((acc, curr) => acc + curr.npsScore, 0) / totalCount;
  const productRelatedCount = data.filter(f => f.isProductRelated).length;
  const serviceRelatedCount = data.filter(f => f.isServiceRelated).length;
  const positiveCount = data.filter(f => f.sentiment === 'positive').length;

  const mainCategoryDistribution: Record<string, number> = {};
  const serviceIssuesDistribution: Record<string, number> = {};
  const productIssuesDistribution: Record<string, number> = {};

  data.forEach(f => {
    mainCategoryDistribution[f.mainCategory] = (mainCategoryDistribution[f.mainCategory] || 0) + 1;
    
    if (f.isServiceRelated) {
      serviceIssuesDistribution[f.subCategory] = (serviceIssuesDistribution[f.subCategory] || 0) + 1;
    }
    if (f.isProductRelated) {
      productIssuesDistribution[f.subCategory] = (productIssuesDistribution[f.subCategory] || 0) + 1;
    }
  });

  return {
    totalCount,
    avgCsat: Number(avgCsat.toFixed(1)),
    avgNps: Number(avgNps.toFixed(1)),
    productRelatedCount,
    serviceRelatedCount,
    positiveCount,
    mainCategoryDistribution,
    serviceIssuesDistribution,
    productIssuesDistribution
  };
}

export async function calculateStats(analyzedData: AnalyzedFeedback[], language: 'zh' | 'en' = 'zh'): Promise<DashboardStats> {
  const basicStats = calculateBasicStats(analyzedData);
  
  const aiSummaryCS = await generateAISummary(analyzedData, 'CS', language);
  const aiSummaryPM = await generateAISummary(analyzedData, 'PM', language);

  return {
    ...basicStats,
    aiSummaryCS,
    aiSummaryPM
  };
}

export async function analyzeChatTimeout(ticketContent: string): Promise<string> {
  const prompt = `
    你是一位資深客服分析師。
    任務：將終端使用者的描述整理成五個精簡的重點條列，並分析 Chat 超時原因。
    要求：
    1. 擷取並強調關鍵問題、情緒與緊急程度。
    2. 依優先順序（由最緊急／最重要開始）提供三個關鍵結論。
    3. 在結論中需包含數據分析（例如：本次分析中有 70% 的內容與此核心問題相關）。
    4. 最後，從客服角度提出一項可改善的機會建議。
    5. 格式如下：
       ## 重點整理
       (五個條列)
       
       ## 結論（百分比）
       (結論內容)
       
       ## 洞察
       (洞察內容)
       
       ## 改善建議
       (建議內容)
       
    請確保百分比總和為 100%。產出結果必須為繁體中文。

    待分析內容：
    ${ticketContent}
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    return response.text || "無法產生超時分析。";
  } catch (error) {
    console.error("Chat Timeout Analysis Error:", error);
    return "超時分析產生失敗。";
  }
}

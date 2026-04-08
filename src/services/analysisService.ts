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
    const positiveKeywords = ['非常滿意', '加薪', '超乎預期', '迅速有禮', '很棒', '感謝', '推薦', '很好', '喜歡', '幫助很大', '效率高', '讚', '推', '留住了', '積極'];
    const hasStrongPositive = positiveKeywords.some(k => combinedText.includes(k));

    let sentiment: 'positive' | 'neutral' | 'negative' = 'neutral';
    if (hasStrongPositive || f.csatScore >= 4 || f.npsScore >= 9) {
      sentiment = 'positive';
    } else if (f.csatScore <= 2 || f.npsScore <= 6) {
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

export async function generateAISummary(analyzedData: AnalyzedFeedback[], viewMode: 'CS' | 'PM'): Promise<string> {
  if (analyzedData.length === 0) return "尚無資料可分析。";

  const isCS = viewMode === 'CS';
  
  const negativeFeedback = analyzedData
    .filter(f => f.sentiment === 'negative' && (isCS ? true : f.isProductRelated))
    .map(f => {
      if (isCS) {
        return `[ID: ${f.ticketId}] [${f.isProductRelated ? '產品' : '客服'}] ${f.ticketComment} ${f.npsComment} ${f.howToImprove}`;
      } else {
        // PM view: No ticket IDs
        return `[議題: ${f.subCategory}] ${f.ticketComment} ${f.npsComment} ${f.howToImprove}`;
      }
    })
    .slice(0, 30)
    .join("\n");

  const prompt = isCS ? `
    你是一個專業的客服主管。請針對以下用戶回饋進行精簡且專業的分析。
    
    分析重點：客服服務品質、回覆速度、態度，以及產品問題對客服的影響。
    
    格式要求 (請嚴格遵守)：
    - 使用 Markdown 格式。
    - **深度分析報告**：請分成 2-3 個小段落，每段加上小標題。使用**粗體**標示關鍵痛點。
    - **會議重點說明 (Meeting Summary)**：使用「無序列表 (Bullet points)」提供 3 句精簡的重點。
    
    用戶回饋：
    ${negativeFeedback}
    
    請直接輸出格式化後的總結文字。
  ` : `
    你是一個專業的產品經理。請針對以下用戶回饋進行專業分析。
    
    **重要指令：**
    1. **只專注於產品內容**：分析重點應完全放在產品功能缺陷、穩定性、用戶痛點、改進方向、硬體問題或 App UI。
    2. **排除客服內容**：請完全忽略任何關於客服態度、回覆速度、工單處理流程等服務相關的描述。
    3. **嚴禁工單號碼**：不要在總結中提到任何工單號碼 (Ticket ID)。
    
    格式要求 (請嚴格遵守)：
    - 使用 Markdown 格式。
    - **深度分析報告**：請依據「問題現況」、「影響評估」、「建議行動」三個小標題進行分析。使用**粗體**標示關鍵議題。
    - **會議重點說明 (Meeting Summary)**：使用「無序列表 (Bullet points)」提供 3-5 句精簡、有力、可直接在會議中報告的重點。
    
    用戶回饋：
    ${negativeFeedback}
    
    請直接輸出格式化後的總結文字。
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
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

export async function calculateStats(analyzedData: AnalyzedFeedback[]): Promise<DashboardStats> {
  const basicStats = calculateBasicStats(analyzedData);
  
  const aiSummaryCS = await generateAISummary(analyzedData, 'CS');
  const aiSummaryPM = await generateAISummary(analyzedData, 'PM');

  return {
    ...basicStats,
    aiSummaryCS,
    aiSummaryPM
  };
}

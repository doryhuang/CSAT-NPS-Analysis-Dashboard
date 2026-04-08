export interface RawFeedback {
  ticketId: string;
  csatScore: number;
  npsScore: number;
  ticketComment: string;
  npsComment: string;
  howToImprove: string;
  friendliness: number;
  helpfulness: number;
  promptness: number;
}

export interface AnalyzedFeedback extends RawFeedback {
  mainCategory: string;
  subCategory: string;
  isProductRelated: boolean;
  isServiceRelated: boolean;
  sentiment: 'positive' | 'neutral' | 'negative';
}

export interface DashboardStats {
  totalCount: number;
  avgCsat: number;
  avgNps: number;
  productRelatedCount: number;
  serviceRelatedCount: number;
  positiveCount: number;
  mainCategoryDistribution: Record<string, number>;
  serviceIssuesDistribution: Record<string, number>;
  productIssuesDistribution: Record<string, number>;
  aiSummaryCS: string;
  aiSummaryPM: string;
}

export const CATEGORY_PATTERNS = {
  main: {
    'Product Disappointment': ['偵測不到', '沒有偵測到', '漏掉', '誤判', '功能失效', '硬體異常', '錄影漏掉', '偵測不準確', '沒抓到', '錄影', '沒有錄影', '沒錄到', '錄影延遲', '錄影不完整', '影片沒有', '鏡頭', '設備故障', '無法開機', '過熱', '壞掉', '設備問題', '畫質', '模糊', '不清楚', '夜視', '畫面卡', '畫面卡頓', '影像品質', '攝影機', '嘔吐也沒偵測', '嘔吐也沒有偵測', '偵測'],
    'Service Disappointment': ['回覆慢', '態度不佳', '問題未解決', '流程繁瑣', '等很久', '等待很久', '沒有回覆', '客服很慢', '客服沒有回覆', '轉很久', '轉接很久', '浪費時間', '效率很差', '線上等了', '電話客服', '線上客服', '真人客服', '專線', '沒有解決', '未解決', '問題沒解決', '沒有幫助', '一直重複', '處理不好', '沒處理好'],
    'UX Friction': ['設定複雜', '找不到功能', '操作步驟太多', 'App 不直覺', '登入失敗', '無法登入', '帳號問題', '帳號綁定', '連線困難', '配對困難', '連不上', '無法連線', '網路不穩', '斷線', '設定麻煩', '流程複雜', '操作困難', '操作複雜', '介面不直覺', '不好操作', '不容易使用', '連線', '配對', '設定', '登入', '帳號'],
    'Feature Gap': ['建議新增功能', '期待優化特定場景辨識', '功能覆蓋不完整', '希望新增', '希望可以有', '建議新增', '建議增加', '期待新增', '期待增加', '希望改善', '希望優化', '功能不足', '沒有這個功能', '希望能有', '可否增加', '希望提供'],
    'Pricing Concern': ['太貴', 'CP值低', '續訂猶豫', '功能與價格不符', '價格太高', '費用太高', '收費太高', '訂閱太貴', '持續扣款', '自動續訂', '被扣款', '重複扣款', '扣款', '訂閱', '費用', '價格', '續訂', '方案', '收費', '漲價'],
    'Positive Resolved': ['問題有處理完成', '對解決結果滿意', '無後續抱怨', '問題解決', '已解決', '幫我解決', '處理完成', '順利解決', '解決了', '協助完成', '成功處理', '後來解決'],
    'Positive Delight': ['很喜歡', '超出預期', '推薦朋友', '非問題導向', '謝謝', '很好', '非常好', '很滿意', '服務很好', '很棒', '推薦', '感謝', '非常感謝', '感謝客服', '幫助很大', '即時回覆', '很有幫助', '很有效率', '加薪', '留住了', '積極'],
  },
  sub: {
    'AI Accuracy': ['偵測', '偵測不到', '沒有偵測到', '漏掉', '誤判', '沒有通知', '沒有提醒', '沒偵測到', '沒抓到', '嘔吐也沒偵測', '嘔吐也沒有偵測', '辨識', '嘔吐', '上廁所', '大便', '尿尿'],
    'Recording': ['錄影', '沒有錄影', '沒錄影', '錄影延遲', '錄影不完整', '影片沒有', '片段'],
    'Hardware': ['鏡頭', '設備故障', '無法開機', '過熱', '壞掉', '設備問題', '主機'],
    'App UI': ['操作困難', '操作複雜', '找不到功能', '介面不直覺', '不好操作', '不容易使用', '設定麻煩', '流程複雜', 'App UI', '介面', '版面'],
    'Account': ['登入', '帳號', '登入失敗', '無法登入', '帳號問題', '帳號綁定'],
    'WiFi Setup': ['連線', '斷線', '配對', '無法連線', '連不上網路', '網路不穩', '連不上', '設定網路'],
    'Subscription': ['訂閱', '費用', '價格', '太貴', '續訂', '方案', '收費', '價格太高', '持續扣款', '自動續訂', '被扣款', '重複扣款', '扣款'],
    'Video Quality': ['畫質', '模糊', '不清楚', '夜視', '畫面卡', '畫面卡頓', '影像品質'],
    'Response Speed': ['回覆慢', '等很久', '等待很久', '沒有回覆', '客服很慢', '客服沒有回覆', '轉很久', '轉接很久', '回應速度'],
    'Resolution Quality': ['沒有解決', '未解決', '問題沒解決', '沒有幫助', '一直重複', '處理不好', '沒處理好', '浪費時間', '效率很差', '電話客服', '線上客服', '真人客服', '專線', '處理品質'],
    'Other': ['其他', '無法歸類'],
  }
};

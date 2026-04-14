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
  productId: string;
  location: string;
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
    'Product Disappointment': [
      '偵測不到', '沒有偵測到', '漏掉', '誤判', '功能失效', '硬體異常', '錄影漏掉', '偵測不準確', '沒抓到', '錄影', '沒有錄影', '沒錄到', '錄影延遲', '錄影不完整', '影片沒有', '鏡頭', '設備故障', '無法開機', '過熱', '壞掉', '設備問題', '畫質', '模糊', '不清楚', '夜視', '畫面卡', '畫面卡頓', '影像品質', '攝影機', '嘔吐也沒偵測', '嘔吐也沒有偵測', '偵測', '離線', '斷線', '連不上',
      'not detected', 'missed', 'false positive', 'failed', 'hardware issue', 'not recording', 'delay', 'blur', 'quality', 'broken', 'not working', 'offline', 'disconnected',
      '検知されない', '見逃し', '誤検知', '故障', '録画されない', '遅延', '画質', 'ぼやける', '壊れた', '動かない', 'オフライン', '接続できない', '映らない', 'カメラ'
    ],
    'Service Disappointment': [
      '回覆慢', '態度不佳', '問題未解決', '流程繁瑣', '等很久', '等待很久', '沒有回覆', '客服很慢', '客服沒有回覆', '轉很久', '轉接很久', '浪費時間', '效率很差', '線上等了', '電話客服', '線上客服', '真人客服', '專線', '沒有解決', '未解決', '問題沒解決', '沒有幫助', '一直重複', '處理不好', '沒處理好', '沒人理',
      'slow response', 'bad attitude', 'not resolved', 'long wait', 'no reply', 'waste of time', 'inefficient', 'no help', 'customer service slow',
      '返信が遅い', '対応が悪い', '解決しない', '待ち時間が長い', '返事がない', '時間の無駄', '効率が悪い', '助けにならない', 'サポートが遅い', '連絡がない', '無視'
    ],
    'UX Friction': [
      '設定複雜', '找不到功能', '操作步驟太多', 'App 不直覺', '登入失敗', '無法登入', '帳號問題', '帳號綁定', '連線困難', '配對困難', '連不上', '無法連線', '網路不穩', '斷線', '設定麻煩', '流程複雜', '操作困難', '操作複雜', '介面不直覺', '不好操作', '不容易使用', '連線', '配對', '設定', '登入', '帳號', '更新', '升級',
      'complex setup', 'cannot find', 'not intuitive', 'login failed', 'connection issue', 'disconnected', 'difficult to use', 'pairing failed', 'setup trouble', 'update', 'upgrade',
      '設定が難しい', '見つからない', '直感的でない', 'ログインできない', '接続できない', '切断', '使いにくい', 'ペアリング失敗', '設定のトラブル', 'アップデート', '更新'
    ],
    'Feature Gap': [
      '建議新增功能', '期待優化特定場景辨識', '功能覆蓋不完整', '希望新增', '希望可以有', '建議新增', '建議增加', '期待新增', '期待增加', '希望改善', '希望優化', '功能不足', '沒有這個功能', '希望能有', '可否增加', '希望提供',
      'suggest new feature', 'hope to have', 'missing feature', 'improvement', 'request', 'add function', 'want to have',
      '機能追加', 'あればいい', '足りない', '改善', 'リクエスト', '機能が欲しい'
    ],
    'Pricing Concern': [
      '太貴', 'CP值低', '續訂猶豫', '功能與價格不符', '價格太高', '費用太高', '收費太高', '訂閱太貴', '持續扣款', '自動續訂', '被扣款', '重複扣款', '扣款', '訂閱', '費用', '價格', '續訂', '方案', '收費', '漲價',
      'too expensive', 'low value', 'subscription', 'overcharged', 'price', 'cost', 'charge', 'expensive',
      '高い', 'コスパ悪い', 'サブスク', '課金', '料金', '価格', '費用'
    ],
    'Positive Resolved': [
      '問題有處理完成', '對解決結果滿意', '無後續抱怨', '問題解決', '已解決', '幫我解決', '處理完成', '順利解決', '解決了', '協助完成', '成功處理', '後來解決',
      'resolved', 'fixed', 'satisfied with result', 'problem solved', 'handled',
      '解決した', '直った', '満足', '解決済み', '対応完了'
    ],
    'Positive Delight': [
      '很喜歡', '超出預期', '推薦朋友', '非問題導向', '謝謝', '很好', '非常好', '很滿意', '服務很好', '很棒', '推薦', '感謝', '非常感謝', '感謝客服', '幫助很大', '即時回覆', '很有幫助', '很有效率', '加薪', '留住了', '積極',
      'love it', 'exceeded expectations', 'recommend', 'thank you', 'great service', 'efficient', 'helpful', 'amazing', 'best',
      '大好き', '期待以上', 'おすすめ', 'ありがとう', '素晴らしい', '助かった', '効率的', '最高'
    ],
  },
  sub: {
    'AI Accuracy': [
      '偵測', '偵測不到', '沒有偵測到', '漏掉', '誤判', '沒有通知', '沒有提醒', '沒偵測到', '沒抓到', '嘔吐也沒偵測', '嘔吐也沒有偵測', '辨識', '嘔吐', '上廁所', '大便', '尿尿',
      'detection', 'not detected', 'missed', 'false alert', 'notification', 'vomit', 'potty',
      '検知', '検知されない', '見逃し', '誤通知', '通知', '嘔吐', 'トイレ'
    ],
    'Recording': [
      '錄影', '沒有錄影', '沒錄影', '錄影延遲', '錄影不完整', '影片沒有', '片段',
      'recording', 'no video', 'missed recording', 'clip',
      '録画', '録画されない', 'ビデオがない', 'クリップ'
    ],
    'Hardware': [
      '鏡頭', '設備故障', '無法開機', '過熱', '壞掉', '設備問題', '主機',
      'camera', 'hardware', 'overheat', 'broken', 'device',
      'カメラ', 'ハードウェア', 'オーバーヒート', '壊れた', 'デバイス'
    ],
    'App UI': [
      '操作困難', '操作複雜', '找不到功能', '介面不直覺', '不好操作', '不容易使用', '設定麻煩', '流程複雜', 'App UI', '介面', '版面',
      'app ui', 'interface', 'layout', 'difficult to navigate',
      'アプリUI', 'インターフェース', 'レイアウト', '使いにくい'
    ],
    'Account': [
      '登入', '帳號', '登入失敗', '無法登入', '帳號問題', '帳號綁定',
      'login', 'account', 'sign in', 'binding',
      'ログイン', 'アカウント', 'サインイン'
    ],
    'WiFi Setup': [
      '連線', '斷線', '配對', '無法連線', '連不上網路', '網路不穩', '連不上', '設定網路',
      'wifi', 'connection', 'pairing', 'setup', 'offline',
      'ワイファイ', '接続', 'ペアリング', '設定', 'オフライン'
    ],
    'Subscription': [
      '訂閱', '費用', '價格', '太貴', '續訂', '方案', '收費', '價格太高', '持續扣款', '自動續訂', '被扣款', '重複扣款', '扣款',
      'subscription', 'billing', 'payment', 'plan', 'charge',
      'サブスク', '請求', '支払い', 'プラン', '料金'
    ],
    'Video Quality': [
      '畫質', '模糊', '不清楚', '夜視', '畫面卡', '畫面卡頓', '影像品質',
      'video quality', 'blur', 'pixelated', 'night vision', 'lag',
      '画質', 'ぼやける', '不鮮明', 'ナイトビジョン', 'ラグ'
    ],
    'Response Speed': [
      '回覆慢', '等很久', '等待很久', '沒有回覆', '客服很慢', '客服沒有回覆', '轉很久', '轉接很久', '回應速度',
      'response speed', 'slow reply', 'waiting time', 'no response',
      '返信速度', '返信が遅い', '待ち時間', '返事がない'
    ],
    'Resolution Quality': [
      '沒有解決', '未解決', '問題沒解決', '沒有幫助', '一直重複', '處理不好', '沒處理好', '浪費時間', '效率很差', '電話客服', '線上客服', '真人客服', '專線', '處理品質',
      'resolution quality', 'not fixed', 'unresolved', 'helpful', 'support quality',
      '解決品質', '解決しない', '未解決', '助かる', 'サポート品質'
    ],
    'Other': ['其他', '無法歸類', 'other', 'unknown', 'その他']
  }
};

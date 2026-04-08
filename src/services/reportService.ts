import { collection, addDoc, getDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { AnalyzedFeedback, DashboardStats } from '../types';

export interface SavedReport {
  id?: string;
  analyzedData: AnalyzedFeedback[];
  stats: DashboardStats;
  createdAt: any;
  title: string;
  type: 'full' | 'pm';
}

export async function saveReport(analyzedData: AnalyzedFeedback[], stats: DashboardStats, title: string, type: 'full' | 'pm' = 'full'): Promise<string> {
  try {
    const docRef = await addDoc(collection(db, 'reports'), {
      analyzedData,
      stats,
      title,
      type,
      createdAt: serverTimestamp(),
    });
    return docRef.id;
  } catch (error) {
    console.error("Error saving report:", error);
    throw error;
  }
}

export async function getReport(id: string): Promise<SavedReport | null> {
  try {
    const docRef = doc(db, 'reports', id);
    const docSnap = await getDoc(docRef);
    
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as SavedReport;
    } else {
      return null;
    }
  } catch (error) {
    console.error("Error getting report:", error);
    throw error;
  }
}

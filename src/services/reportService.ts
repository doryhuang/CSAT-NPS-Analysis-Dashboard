import { collection, addDoc, getDoc, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { AnalyzedFeedback, DashboardStats } from '../types';
import LZString from 'lz-string';

export interface SavedReport {
  id?: string;
  analyzedData?: AnalyzedFeedback[];
  compressedData?: string; // New field for compressed data
  stats: DashboardStats;
  createdAt: any;
  title: string;
  type: 'full' | 'pm' | 'insight_only';
}

export async function saveReport(analyzedData: AnalyzedFeedback[] | undefined, stats: DashboardStats, title: string, type: 'full' | 'pm' | 'insight_only' = 'full'): Promise<string> {
  try {
    const payload: any = {
      stats,
      title,
      type,
      createdAt: serverTimestamp(),
    };
    
    if (analyzedData) {
      // Compress the data string to avoid Firebase 1MB limit
      const dataString = JSON.stringify(analyzedData);
      const compressed = LZString.compressToUTF16(dataString);
      
      // If compression actually helped and is needed, or just always use it for consistency
      payload.compressedData = compressed;
    }

    const docRef = await addDoc(collection(db, 'reports'), payload);
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
      const data = docSnap.data();
      let analyzedData = data.analyzedData;

      // Handle decompression if the data was compressed
      if (data.compressedData) {
        try {
          const decompressed = LZString.decompressFromUTF16(data.compressedData);
          if (decompressed) {
            analyzedData = JSON.parse(decompressed);
          }
        } catch (e) {
          console.error("Decompression failed:", e);
        }
      }

      return { 
        id: docSnap.id, 
        ...data,
        analyzedData 
      } as SavedReport;
    } else {
      return null;
    }
  } catch (error) {
    console.error("Error getting report:", error);
    throw error;
  }
}

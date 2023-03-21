import { FirebaseObject } from "./firebase_object";
import { StorageItem } from "./storage_item";

export interface Message extends FirebaseObject {
  created_on: number;
  id: string;
  message: string;
  seen_by?: string[];
  sender_id: string;
  sender_name: string;
  updated_on?: number;
  storage_items?: StorageItem[];
}

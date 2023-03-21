import { FirebaseObject } from "./firebase_object";

export interface StorageItem extends FirebaseObject {
  id?: string;
  storage_link?: string;
  presigned_url?: string;
  expired_on?: number;
  created_on?: number;
  is_deleted?: boolean;
  uploaded_by?: string;
  type?: string;
  name?: string;
}

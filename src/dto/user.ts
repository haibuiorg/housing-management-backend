import { Address } from "./address";
import { FirebaseObject } from "./firebase_object";

export interface User extends FirebaseObject {
  user_id: string;
  avatar_url?: string;
  created_on: number;
  email: string;
  email_verified: boolean;
  first_name: string;
  last_name: string;
  is_active: boolean;
  notification_tokens?: string[];
  phone?: string;
  avatar_storage_location?: string;
  avatar_url_expiration?: number;
  addresses?: Address[];
  payment_customer_id: string;
}

import { FirebaseObject } from './firebase_object';

export interface LegalDocument extends FirebaseObject {
  id: string;
  type: string;
  country_code: string;
  country_id: string;
  create_on: number;
  is_active: boolean;
  storage_link: string;
  url?: string;
  web_url: string;
}

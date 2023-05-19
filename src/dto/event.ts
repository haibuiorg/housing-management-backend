import { FirebaseObject } from './firebase_object';

export interface Event extends FirebaseObject {
  id: string;
  name: string;
  description: string;
  type: 'generic' | 'company_internal' | 'company' | 'apartment' | 'personal';
  company_id?: string | null;
  apartment_id?: string | null;
  start_time: number;
  end_time: number;
  repeat?: 'daily' | 'weekday' | 'weekly' | 'monthly' | 'yearly' | null;
  repeat_until: number;
  invitees: string[];
  accepted?: string[];
  declined?: string[];
  join_links?: string[];
  created_on: number;
  created_by: string;
  created_by_name: string;
  updated_by?: string;
  updated_by_name?: string;
  updated_on?: number | null;
  deleted: boolean;
  reminders: number[];
}

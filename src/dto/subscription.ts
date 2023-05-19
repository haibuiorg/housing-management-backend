import { FirebaseObject } from './firebase_object';

export interface Subscription extends FirebaseObject {
  subscription_plan_id: string;
  id: string;
  created_on: number;
  ended_on?: number;
  created_by: string;
  company_id: string;
  quantity?: number;
  is_active: boolean;
  payment_service_subscription_id?: string;
  latest_invoice_paid: boolean;
  latest_invoice_url: string;
}

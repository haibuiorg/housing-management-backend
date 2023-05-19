import { FirebaseObject } from './firebase_object';

export interface PaymentProductItem extends FirebaseObject {
  amount: number;
  currency_code: string;
  country_code: string;
  name: string;
  description: string;
  id: string;
  is_active: boolean;
  stripe_product_id: string;
  stripe_price_id: string;
  created_on: number;
  tax_percentage: number;
  company_id: string | null;
}

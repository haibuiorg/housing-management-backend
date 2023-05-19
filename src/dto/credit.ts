import { FirebaseObject } from './firebase_object';

export interface Credit extends FirebaseObject {
  amount: number;
  currency_code: string;
  id: string;
  company_id: string;
  added_on: number;
  payment_invoice_id: string;
  payment_product_item_id: string;
}

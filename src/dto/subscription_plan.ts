import { FirebaseObject } from "./firebase_object";

export interface SubscriptionPlan extends FirebaseObject {
  id: string;
  name: string;
  price: number;
  currency: string;
  is_active: boolean;
  stripe_product_id: string;
  stripe_price_id: string;
  created_on: number;
  translation: boolean;
  max_messaging_channels: number;
  max_invoice_number: number;
  additional_invoice_cost: number;
  interval: "month" | "day";
  interval_count: number;
  country_code: string;
  max_announcement: number;
  has_apartment_document: boolean;
  notification_types: string[];
}

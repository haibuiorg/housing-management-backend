import { FirebaseObject } from './firebase_object';

export interface Apartment extends FirebaseObject {
  housing_company_id?: string;
  id: string;
  building?: string;
  house_code?: string;
  is_deleted?: boolean;
  tenants?: string[];
  owners: string[];
}

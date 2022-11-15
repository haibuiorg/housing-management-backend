import {FirebaseObject} from './firebase_object';

export interface Company extends FirebaseObject {
    id?: string,
    street_address_1?: string,
    street_address_2?: string,
    postal_code?: string,
    city?: string,
    country_code?: string,
    lat?: number,
    lng?: number,
    name?: string;
    owners?: string[];
    managers?: string[];
    apartment_count?: number;
    water_bill_shared_folder_id?: string;
    water_bill_template_id?: string;
}

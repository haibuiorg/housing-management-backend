import {FirebaseObject} from './firebase_object';

export interface Country extends FirebaseObject {
    country_code: string;
    currency_code: string;
    id: string;
    vat: number;
}

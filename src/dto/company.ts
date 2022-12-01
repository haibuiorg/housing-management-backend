import {FirebaseObject} from './firebase_object';
import {NotificationChannel} from './notification_channel';
import {UI} from './ui';

export interface Company extends FirebaseObject {
    id?: string,
    street_address_1?: string,
    street_address_2?: string,
    postal_code?: string,
    city?: string,
    country_code?: string,
    currency_code?: string,
    lat?: number,
    lng?: number,
    name?: string;
    owners?: string[];
    managers?: string[];
    apartment_count?: number;
    water_bill_template_id?: string;
    business_id?: string,
    ui?: UI,
    is_deleted: boolean;
    vat?: number;
    cover_image_url?: string;
    logo_url?: string;
    notification_channels?: NotificationChannel[]
}

import {FirebaseObject} from './firebase_object';

export interface User extends FirebaseObject {
    user_id: string,
    avatar_url?: string,
    created_on: number,
    email: string,
    email_verified: boolean,
    first_name: string,
    last_name: string,
    is_active: boolean,
    notification_tokens?: string[],
    phone?: string,
    housing_companies: string[],
}

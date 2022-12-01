import {FirebaseObject} from './firebase_object';

export interface NotificationToken extends FirebaseObject {
    is_valid: boolean;
    token: string;
    channels?: string[];
    id?: string,
    user_id: string;
}

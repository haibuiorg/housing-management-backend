import {FirebaseObject} from './firebase_object';

export interface NotificationChannel extends FirebaseObject {
    channel_key: string,
    channel_name: string,
    channel_description: string,
    is_active: boolean,
}

import {FirebaseObject} from './firebase_object';

export interface NotificationPayload extends FirebaseObject {
    id?: string;
    channel_key?: string;
    title?: string;
    body?: string;
    auto_dismissible?: boolean;
    color?: string;
    wake_up_screen?: boolean;
    app_route_location?: string;
    created_by?: string;
    display_name?: string;
    created_on?:number;
    seen?:boolean;
}

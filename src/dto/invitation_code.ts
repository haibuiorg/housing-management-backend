import {FirebaseObject} from './firebase_object';

export interface InvitationCode extends FirebaseObject {
    content: string;
    iv: string;
}

import admin from 'firebase-admin';
import {isValidEmail} from '../../strings_utils';
import {sendVerificationEmail} from '../email/email_module';
import {Request, Response} from 'express';
import {codeValidation, removeCode} from './code_validation';
import {DEFAULT, USERS}
  from '../../constants';
import {addTenantToApartment} from '../housing/manage_apartment';

export const registerWithCode =
    async (request: Request, response: Response) => {
      const email = request.body.email;
      if (!isValidEmail(email)) {
        const error = {'errors': {'code': 500, 'message': 'Invalid email'}};
        response.status(500).send(error);
        return;
      }
      const invitationCode = request.body.invitation_code;
      const housingCompanyId = request.body.housing_company_id;
      const apartmentId : string = await codeValidation(
          invitationCode, housingCompanyId);

      if (apartmentId.length === 0) {
        const error = {'errors': {'code': 500, 'message': 'Invalid code'}};
        response.status(500).send(error);
        return;
      }

      const pass = request.body.password;
      try {
        const userRecord = await admin.auth().createUser({
          email: email,
          password: pass,
          emailVerified: false,
        });
        const user = await createUserOnFirestore(
            userRecord.uid, email, [DEFAULT]);
        await addTenantToApartment(
            userRecord.uid, housingCompanyId, apartmentId);
        await removeCode(invitationCode, housingCompanyId, userRecord.uid);
        response.status(200).send(user);
        sendVerificationEmail(email);
      } catch (errors) {
        response.status(500).send({'errors': errors});
        return;
      }
      return;
    };


export const register =
    async (request: Request, response: Response) => {
      const email = request.body.email;
      if (!isValidEmail(email)) {
        const error = {'errors': {'code': 500, 'message': 'Invalid email'}};
        response.status(500).send(error);
        return;
      }

      const pass = request.body.password;
      if (!pass || pass.toString().length < 8) {
        const error = {'errors': {'code': 500, 'message': 'Invalid password'}};
        response.status(500).send(error);
        return;
      }
      try {
        const userRecord = await admin.auth().createUser({
          email: email,
          password: pass,
          emailVerified: false,
        });
        const firstName = request.body.first_name;
        const lastName = request.body.last_name;
        const phone = request.body.phone;
        const user = await createUserOnFirestore(
            userRecord.uid, email, [DEFAULT],
            firstName ?? '',
            lastName ?? '',
            phone ?? '');
        response.status(200).send(user);
        sendVerificationEmail(email);
      } catch (errors) {
        response.status(500).send({'errors': errors});
        return;
      }
      return;
    };


const createUserOnFirestore = async (
    userUid: string,
    email: string,
    roles: string[],
    firstName: string = '', lastName: string='', phone: string = '') => {
  const createdOn = new Date().getTime();
  const user = {
    'user_id': userUid,
    'first_name': firstName,
    'last_name': lastName,
    'email': email,
    'phone': phone,
    'created_on': createdOn,
    'updated_on': createdOn,
    'avatar_url': '',
    'email_verified': false,
    'is_active': true,
    'roles': roles,
    'notification_tokens': [],
  };
  await admin.firestore().collection(USERS).doc(userUid).set(user);
  return user;
};

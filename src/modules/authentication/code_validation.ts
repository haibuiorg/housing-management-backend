import {Request, Response} from 'express';
import admin, {firestore} from 'firebase-admin';
import {CODE, CODE_CHARACTERS, HOUSING_COMPANY_ID, INVITATION_CODES, IS_VALID}
  from '../../constants';
import {sendInvitationEmail} from '../../email_module';
import {hasApartment}
  from '../housing/manage_housing_company';
import {isCompanyManager} from './authentication';

export const codeValidation =
 async (code: string, housingCompanyId: string) => {
   try {
     const codeData = await admin.firestore().collection(INVITATION_CODES)
         .where(HOUSING_COMPANY_ID, '==', housingCompanyId)
         .where(CODE, '==', code)
         .where(IS_VALID, '>=', 1).get();

     const codeDataFirst = codeData.docs.map((doc) => doc.data())[0];
     if (codeDataFirst && codeDataFirst.valid_until > new Date().getTime()) {
       return codeDataFirst.apartment_id.toString();
     }
   } catch (error) {
     console.log(error);
   }

   return '';
 };

export const removeCode =
    async (code: string, housingCompanyId: string, claimedBy: string) => {
      try {
        const codeData = await admin.firestore().collection(INVITATION_CODES)
            .where(HOUSING_COMPANY_ID, '==', housingCompanyId)
            .where(CODE, '==', code).get();
        const codeDataFirst = codeData.docs.map((doc) => doc.data())[0];
        if (codeDataFirst) {
          const decrement = firestore.FieldValue.increment(-1);
          await admin.firestore().collection(INVITATION_CODES)
              .doc(codeDataFirst.id)
              .update(
                  {
                    is_valid: decrement,
                    claimed_by: firestore.FieldValue.arrayUnion(claimedBy),
                  },
              );
        }
      } catch (error) {
        console.log(error);
      }
    };

export const inviteTenants = async (request: Request, response: Response) => {
  const apartmentId = request.body.apartment_id;
  const companyId = request.body.housing_company_id;
  const numeberOfTenants = request.body.number_of_tenants;
  const emailAddresses = request.body.emails;
  // @ts-ignore
  const userId = request.user?.uid;
  if (companyId && apartmentId &&
    await(isCompanyManager(userId, companyId)) &&
     await(hasApartment(apartmentId, companyId))) {
    const invitationCodeId = admin.firestore().collection(INVITATION_CODES)
        .doc().id;
    const invitationCode = _makeInvitationCode(6);
    const validUntil = (new Date().getTime()) + 604800000;
    const invitation = {
      invitation_code: invitationCode,
      id: invitationCodeId,
      is_valid: numeberOfTenants ?? 1,
      valid_until: validUntil,
      apartment_id: apartmentId,
      housing_company_id: companyId,
      claimed_by: null,
    };
    await admin.firestore().collection(INVITATION_CODES)
        .doc(invitationCodeId).set(invitation);
    if (emailAddresses && emailAddresses.length > 0) {
      sendInvitationEmail(emailAddresses, invitationCode);
    }
    response.status(200).send(invitation);
    return;
  }
  response.status(500).send({
    errors: {
      error: 'Invalid ids',
      code: 'missing_housing_company_id_or_apartment_id',
    },
  });
};

const _makeInvitationCode = (length: number) => {
  let result = '';
  const characters = CODE_CHARACTERS;
  const charactersLength = characters.length;
  for ( let i = 0; i < length; i++ ) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
};


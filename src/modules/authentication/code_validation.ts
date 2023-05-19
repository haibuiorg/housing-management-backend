import { Request, Response } from 'express';
import admin, { firestore } from 'firebase-admin';
import {
  APARTMENTS,
  CODE,
  CODE_CHARACTERS,
  HOUSING_COMPANIES,
  HOUSING_COMPANY_ID,
  INVITATION_CODES,
  IS_VALID,
} from '../../constants';
import { sendInvitationEmail } from '../email/email_module';
import { isApartmentIdTenant, isApartmentOwner, isCompanyManager } from './authentication';
import { Apartment } from '../../dto/apartment';
import { Invitation } from '../../dto/invitation';
import { Company } from '../../dto/company';
import { obscureEmail } from '../../strings_utils';

const INVITE_RETRY_LIMIT = 3;

export const codeValidation = async (code: string, email: string): Promise<Apartment | undefined> => {
  try {
    const codeData = await admin
      .firestore()
      .collection(INVITATION_CODES)
      .where('email', '==', email.toLowerCase())
      .where(CODE, '==', code)
      .where(IS_VALID, '>=', 1)
      .get();

    const codeDataFirst = codeData.docs.map((doc) => doc.data())[0];
    if (codeDataFirst && codeDataFirst.valid_until > new Date().getTime()) {
      const apartmentId = codeDataFirst.apartment_id.toString();
      const housingCompanyId = codeDataFirst.housing_company_id.toString();
      const apartment = await admin
        .firestore()
        .collection(HOUSING_COMPANIES)
        .doc(housingCompanyId)
        .collection(APARTMENTS)
        .doc(apartmentId)
        .get();
      const apartmentData = apartment.data();
      return apartmentData as Apartment;
    }
  } catch (error) {
    console.log(error);
  }
};

export const removeCode = async (
  code: string,
  housingCompanyId: string,
  claimedBy: string,
): Promise<Invitation | undefined> => {
  try {
    const codeData = await admin
      .firestore()
      .collection(INVITATION_CODES)
      .where(HOUSING_COMPANY_ID, '==', housingCompanyId)
      .where(CODE, '==', code)
      .get();
    const codeDataFirst = codeData.docs.map((doc) => doc.data())[0] as Invitation;
    if (codeDataFirst) {
      const decrement = firestore.FieldValue.increment(-1);
      await admin.firestore().collection(INVITATION_CODES).doc(codeDataFirst.id).update({
        is_valid: decrement,
        claimed_by: claimedBy,
      });
      return codeDataFirst;
    }
  } catch (error) {
    console.log(error);
  }
  return;
};

export const inviteTenants = async (request: Request, response: Response) => {
  const apartmentId = request.body.apartment_id;
  const companyId = request.body.housing_company_id;
  const emailAddresses = request.body.emails;
  const setAsOwner = request.body.set_as_apartment_owner ?? false;
  // @ts-ignore
  const userId = request.user?.uid;
  const companyManager = await isCompanyManager(userId, companyId);
  const apartmentOwner = await isApartmentOwner(userId, companyId, apartmentId);
  if (companyId && apartmentId && (companyManager || apartmentOwner)) {
    const companyData =
      companyManager ??
      ((await admin.firestore().collection(HOUSING_COMPANIES).doc(companyId).get()).data() as Company);

    const invitationList: Invitation[] = [];
    const inviteRetryLimit = await getInviteRetryLimit(companyData.country_code ?? 'fi');
    await Promise.all(
      emailAddresses.map(async (email: string) => {
        const invitationCodeId = admin.firestore().collection(INVITATION_CODES).doc().id;
        const invitationCode = _makeInvitationCode(16);
        const validUntil = new Date().getTime() + 604800000;
        const invitation: Invitation = {
          invitation_code: invitationCode,
          id: invitationCodeId,
          is_valid: 1,
          valid_until: validUntil,
          apartment_id: apartmentId,
          housing_company_id: companyId,
          claimed_by: null,
          set_as_apartment_owner: setAsOwner == true && companyManager != null,
          email: email.toLowerCase(),
          email_sent: 1,
          invite_retry_limit: inviteRetryLimit,
        };
        await admin.firestore().collection(INVITATION_CODES).doc(invitationCodeId).set(invitation);
        invitationList.push(invitation);
        sendInvitationEmail([email], invitationCode, companyData?.name ?? 'Housing company');
      }),
    );

    response.status(200).send(invitationList);
    return;
  }
  response.status(500).send({
    errors: {
      error: 'Invalid ids',
      code: 'missing_housing_company_id_or_apartment_id',
    },
  });
};

const getInviteRetryLimit = async (countryCode: string) => {
  //TODO: get invite retry limit from country code
  return INVITE_RETRY_LIMIT;
};

const _makeInvitationCode = (length: number) => {
  let result = '';
  const characters = CODE_CHARACTERS;
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
};

export const getInvitationRequest = async (request: Request, response: Response) => {
  const companyId = request.query.housing_company_id?.toString() ?? '';
  // @ts-ignore
  const userId = request.user?.uid;
  const company = await isCompanyManager(userId, companyId);
  const apartmentId = request.query.apartment_id?.toString() ?? '';
  const apartmentOwner = await isApartmentOwner(userId, companyId, apartmentId);
  if (!company && !apartmentOwner) {
    response.status(403).send({
      errors: {
        error: 'Unauthorized',
        code: 'unauthorized',
      },
    });
    return;
  }

  // @ts-ignore
  const status: 'pending' | 'accepted' | 'expired' = request.query.status?.toString() ?? 'pending';
  const invitation =
    status === 'pending'
      ? await getPendingInvitation(companyId, apartmentId)
      : status === 'accepted'
      ? await getAcceptedInvitation(companyId, apartmentId)
      : await getExpiredInvitation(companyId, apartmentId);
  if (invitation) {
    response.status(200).send(invitation);
    return;
  }
  response.status(500).send({
    errors: {
      error: 'Error getting pending invitations',
      code: 'error_getting_pending_invitations',
    },
  });
};

export const resendPendingInvitationRequest = async (request: Request, response: Response) => {
  const companyId = request.body.housing_company_id;
  const invitationId = request.body.invitation_id;
  // @ts-ignore
  const userId = request.user?.uid;
  const companyManager = await isCompanyManager(userId, companyId);
  const invitationData = (
    await admin.firestore().collection(INVITATION_CODES).doc(invitationId).get()
  ).data() as Invitation;
  const apartmentOwner = await isApartmentOwner(userId, companyId, invitationData.apartment_id);
  if (!companyManager && !apartmentOwner) {
    response.status(403).send({
      errors: {
        error: 'unauthorized',
        code: 'unauthorized',
      },
    });
    return;
  }
  const company =
    companyManager ?? ((await admin.firestore().collection(HOUSING_COMPANIES).doc(companyId).get()).data() as Company);
  const invitation = await resendPendingInvitation(invitationId, company);
  if (invitation) {
    response.status(200).send(invitation);
    return;
  }
  response.status(500).send({
    errors: {
      error: 'Error resending invitation',
      code: 'error_resending_invitation',
    },
  });
};

export const cancelPendingInvitationRequest = async (request: Request, response: Response) => {
  const companyId = request.body.housing_company_id;
  const invitationIds = (request.body.invitation_ids as string[]) ?? [];
  // @ts-ignore
  const userId = request.user?.uid;
  const cancelledInvitations: Invitation[] = [];
  await Promise.all(
    invitationIds.map(async (invitationId: string) => {
      const invitationData = (
        await admin.firestore().collection(INVITATION_CODES).doc(invitationId).get()
      ).data() as Invitation;
      const apartmentOwner = await isApartmentOwner(userId, companyId, invitationData.apartment_id);
      const companyManager = await isCompanyManager(userId, companyId);
      if (companyManager || apartmentOwner) {
        const invitation = await cancelPendingInvitation(invitationId);
        if (invitation) {
          cancelledInvitations.push(invitation);
        }
      }
    }),
  );
  if (cancelledInvitations.length > 0) {
    response.status(200).send(cancelledInvitations);
    return;
  }
  response.status(500).send({
    errors: {
      error: 'Error cancelling invitation',
      code: 'error_cancelling_invitation',
    },
  });
};

const cancelPendingInvitation = async (invitationId: string): Promise<Invitation | undefined> => {
  try {
    const invitation = await admin.firestore().collection(INVITATION_CODES).doc(invitationId).get();
    if (invitation.exists) {
      const invitationData = invitation.data() as Invitation;
      if (
        invitationData.is_valid === 0 ||
        invitationData.claimed_by !== null ||
        invitationData.valid_until < Date.now()
      ) {
        return invitationData;
      }
      await admin.firestore().collection(INVITATION_CODES).doc(invitationId).update({
        is_valid: 0,
      });
      return invitationData;
    }
    return;
  } catch (error) {
    console.log(error);
    return;
  }
};

const resendPendingInvitation = async (invitationId: string, company: Company): Promise<Invitation | undefined> => {
  try {
    const invitation = await admin.firestore().collection(INVITATION_CODES).doc(invitationId).get();

    if (invitation.exists) {
      const invitationData = invitation.data() as Invitation;
      if (
        (invitationData.email_sent ?? 1) >
          (invitationData.invite_retry_limit ?? (await getInviteRetryLimit(company.country_code ?? 'fi'))) ||
        invitationData.is_valid === 0 ||
        invitationData.claimed_by !== null ||
        invitationData.valid_until < Date.now()
      ) {
        return;
      }

      await sendInvitationEmail(
        [invitationData.email],
        invitationData.invitation_code,
        company.name ?? 'Housing company',
      );
      await admin
        .firestore()
        .collection(INVITATION_CODES)
        .doc(invitationId)
        .update({
          email_sent: firestore.FieldValue.increment(1),
        });
      invitationData.email_sent = (invitationData.email_sent ?? 0) + 1;
      invitationData.email = obscureEmail(invitationData.email);
      return invitationData;
    }
  } catch (error) {
    console.log(error);
  }
};

const getExpiredInvitation = async (
  companyId: string,
  apartmentId: string | undefined,
): Promise<Invitation[] | undefined> => {
  try {
    const invitations = apartmentId
      ? await admin
          .firestore()
          .collection(INVITATION_CODES)
          .where(HOUSING_COMPANY_ID, '==', companyId)
          .where('apartment_id', '==', apartmentId)
          .where('claimed_by', '==', null)
          .where('valid_until', '<=', Date.now())
          .get()
      : await admin
          .firestore()
          .collection(INVITATION_CODES)
          .where(HOUSING_COMPANY_ID, '==', companyId)
          .where('claimed_by', '==', null)
          .where('valid_until', '<=', Date.now())
          .get();
    return (invitations.docs.map((doc) => doc.data()) as Invitation[]).map((invitation) => ({
      ...invitation,
      email: obscureEmail(invitation.email),
    }));
  } catch (error) {
    console.log(error);
  }
};

const getAcceptedInvitation = async (
  companyId: string,
  apartmentId: string | undefined,
): Promise<Invitation[] | undefined> => {
  try {
    const invitations = apartmentId
      ? await admin
          .firestore()
          .collection(INVITATION_CODES)
          .where(HOUSING_COMPANY_ID, '==', companyId)
          .where('apartment_id', '==', apartmentId)
          .where('claimed_by', '!=', null)
          .get()
      : await admin
          .firestore()
          .collection(INVITATION_CODES)
          .where(HOUSING_COMPANY_ID, '==', companyId)
          .where('claimed_by', '!=', null)
          .get();
    return (invitations.docs.map((doc) => doc.data()) as Invitation[]).map((invitation) => ({
      ...invitation,
      email: obscureEmail(invitation.email),
    }));
  } catch (error) {
    console.log(error);
  }
};

const getPendingInvitation = async (
  companyId: string,
  apartmentId: string | undefined,
): Promise<Invitation[] | undefined> => {
  try {
    const invitations = apartmentId
      ? await admin
          .firestore()
          .collection(INVITATION_CODES)
          .where(HOUSING_COMPANY_ID, '==', companyId)
          .where('apartment_id', '==', apartmentId)
          .where(IS_VALID, '==', 1)
          .where('valid_until', '>=', Date.now())
          .get()
      : await admin
          .firestore()
          .collection(INVITATION_CODES)
          .where(HOUSING_COMPANY_ID, '==', companyId)
          .where(IS_VALID, '==', 1)
          .where('valid_until', '>=', Date.now())
          .get();
    return (invitations.docs.map((doc) => doc.data()) as Invitation[]).map((invitation) => ({
      ...invitation,
      email: obscureEmail(invitation.email),
    }));
  } catch (error) {
    console.log(error);
  }
};

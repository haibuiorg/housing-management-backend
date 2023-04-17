import { Request, Response } from "express";
import admin, { firestore } from "firebase-admin";
import {
  APARTMENTS,
  CODE,
  CODE_CHARACTERS,
  HOUSING_COMPANIES,
  HOUSING_COMPANY_ID,
  INVITATION_CODES,
  IS_VALID,
} from "../../constants";
import { sendInvitationEmail } from "../email/email_module";
import { hasApartment } from "../housing/manage_housing_company";
import { isCompanyManager } from "./authentication";
import { Apartment } from "../../dto/apartment";
import { Invitation } from "../../dto/invitation";
import { Company } from "../../dto/company";

const INVITE_RETRY_LIMIT = 3;

export const codeValidation = async (
  code: string,
  email: string
) : Promise<Apartment| undefined> => {
  try {
    const codeData = await admin
      .firestore()
      .collection(INVITATION_CODES)
      .where('email', '==', email.toLowerCase())
      .where(CODE, "==", code)
      .where(IS_VALID, ">=", 1)
      .get();

    const codeDataFirst = codeData.docs.map((doc) => doc.data())[0];
    if (codeDataFirst && codeDataFirst.valid_until > new Date().getTime()) {
      const apartmentId =  codeDataFirst.apartment_id.toString();
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
  claimedBy: string
) => {
  try {
    const codeData = await admin
      .firestore()
      .collection(INVITATION_CODES)
      .where(HOUSING_COMPANY_ID, "==", housingCompanyId)
      .where(CODE, "==", code)
      .get();
    const codeDataFirst = codeData.docs.map((doc) => doc.data())[0];
    if (codeDataFirst) {
      const decrement = firestore.FieldValue.increment(-1);
      await admin
        .firestore()
        .collection(INVITATION_CODES)
        .doc(codeDataFirst.id)
        .update({
          is_valid: decrement,
          claimed_by: claimedBy,
        });
    }
  } catch (error) {
    console.log(error);
  }
};

export const inviteTenants = async (request: Request, response: Response) => {
  const apartmentId = request.body.apartment_id;
  const companyId = request.body.housing_company_id;
  const emailAddresses = request.body.emails;
  // @ts-ignore
  const userId = request.user?.uid;
  const company = await isCompanyManager(userId, companyId);
  if (
    companyId &&
    apartmentId &&
    company &&
    (await hasApartment(apartmentId, companyId))
  ) {
    const invitationList: Invitation[] = [];
    const inviteRetryLimit = await getInviteRetryLimit(company.country_code ?? 'fi');
    await Promise.all( emailAddresses.map(async (email: string) => {
      const invitationCodeId = admin
        .firestore()
        .collection(INVITATION_CODES)
        .doc().id;
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
        email: email.toLowerCase(),
        email_sent: 1,
        invite_retry_limit: inviteRetryLimit,
      };
      await admin
        .firestore()
        .collection(INVITATION_CODES)
        .doc(invitationCodeId)
        .set(invitation);
      invitationList.push(invitation);
      sendInvitationEmail(
        [email],
        invitationCode,
        company.name ?? "Housing company",
      );
    }))
   
    response.status(200).send(invitationList);
    return;
  }
  response.status(500).send({
    errors: {
      error: "Invalid ids",
      code: "missing_housing_company_id_or_apartment_id",
    },
  });
};

const getInviteRetryLimit = async (countryCode: string) => {
  //TODO: get invite retry limit from country code
  return INVITE_RETRY_LIMIT;
}

const _makeInvitationCode = (length: number) => {
  let result = "";
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
  if (!company) {
    response.status(403).send({
      errors: {
        error: "Not manager of housing company",
        code: "not_manager_of_housing_company",
      },
    });
    return;
  }
  const apartmentId = request.query.apartment_id?.toString();

  // @ts-ignore
  const status : 'pending'|'accepted'|'expired' = request.query.status?.toString() ?? 'pending';
  const invitation = status === 'pending' ? 
      await getPendingInvitation(companyId, apartmentId) : 
    status === 'accepted' ? 
      await getAcceptedInvitation(companyId, apartmentId) :
      await getExpiredInvitation(companyId, apartmentId);
  if (invitation) {
    response.status(200).send(invitation);
    return;
  }
  response.status(500).send({
    errors: {
      error: "Error getting pending invitations",
      code: "error_getting_pending_invitations",
    },
  })
};

export const resendPendingInvitationRequest = async (request: Request, response: Response) => {
  const companyId = request.body.housing_company_id;
  const invitationId = request.body.invitation_id;
  // @ts-ignore
  const userId = request.user?.uid;
  const company = await isCompanyManager(userId, companyId);
  if (!company) {
    response.status(403).send({
      errors: {
        error: "Not manager of housing company",
        code: "not_manager_of_housing_company",
      },
    });
    return;
  }
  const invitation = await resendPendingInvitation(invitationId, company);
  if (invitation) {
    response.status(200).send(invitation);
    return;
  }
  response.status(500).send({
    errors: {
      error: "Error resending invitation",
      code: "error_resending_invitation",
    },
  })
}

const resendPendingInvitation = async (invitationId: string, company: Company): Promise<Invitation|undefined> => {
  try {
    const invitation = await admin.firestore().collection(INVITATION_CODES)
      .doc(invitationId)
      .get();
    if (invitation.exists) {
      const invitationData = invitation.data() as Invitation;
      if (
        (invitationData.email_sent ?? 1) < (invitationData.invite_retry_limit ?? await(getInviteRetryLimit(company.country_code ?? 'fi')))
        || invitationData.is_valid === 0 || invitationData.claimed_by !== null || invitationData.valid_until < Date.now()
        ) {
        return;
      }
      await sendInvitationEmail(
        [invitationData.email],
        invitationData.invitation_code,
        company.name ?? "Housing company",
      );
      await admin.firestore().collection(INVITATION_CODES).doc(invitationId).update({
        email_sent: firestore.FieldValue.increment(1),
      });
      return invitationData;
    }
  } catch (error) {
    console.log(error);
  }
}

const getExpiredInvitation = async (companyId: string, apartmentId: string| undefined): Promise<Invitation[]|undefined> => {
  try {
    const invitations = apartmentId ? 
      await admin.firestore().collection(INVITATION_CODES)
        .where(HOUSING_COMPANY_ID, '==', companyId)
        .where('apartment_id', '==', apartmentId)
        .where('claimed_by', '==', null)
        .where('valid_until', '<=', Date.now())
        .get() :
      await admin.firestore().collection(INVITATION_CODES)
        .where(HOUSING_COMPANY_ID, '==', companyId)
        .where('claimed_by', '==', null)
        .where('valid_until', '<=', Date.now())
        .get();
    return invitations.docs.map((doc) => doc.data()) as Invitation[];
  } catch (error) {
    console.log(error);
  } 
}

const getAcceptedInvitation = async (companyId: string, apartmentId: string| undefined): Promise<Invitation[]|undefined> => {
  try {
    const invitations =  apartmentId ? 
      await admin.firestore().collection(INVITATION_CODES)
        .where(HOUSING_COMPANY_ID, '==', companyId)
        .where('apartment_id', '==', apartmentId)
        .where('claimed_by', '!=', null)
        .get():
      await admin.firestore().collection(INVITATION_CODES)
        .where(HOUSING_COMPANY_ID, '==', companyId)
        .where('claimed_by', '!=', null)
        .get();
    return invitations.docs.map((doc) => doc.data()) as Invitation[];
  } catch (error) {
    console.log(error);
  }
}

const getPendingInvitation = async (companyId: string, apartmentId: string|undefined): Promise<Invitation[]|undefined> => {
  try {
    const invitations = apartmentId ?  await admin.firestore().collection(INVITATION_CODES)
      .where(HOUSING_COMPANY_ID, '==', companyId)
      .where('apartment_id', '==', apartmentId)
      .where(IS_VALID, '>=', 1)
      .where('valid_until', '>=',  Date.now())
      .get():
      await admin.firestore().collection(INVITATION_CODES)
      .where(HOUSING_COMPANY_ID, '==', companyId)
      .where(IS_VALID, '>=', 1)
      .where('valid_until', '>=',  Date.now())
      .get();
    return invitations.docs.map((doc) => doc.data()) as Invitation[];
  } catch (error) {
    console.log(error);
  }
 
}

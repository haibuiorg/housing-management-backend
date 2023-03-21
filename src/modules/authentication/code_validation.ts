import { Request, Response } from "express";
import admin, { firestore } from "firebase-admin";
import {
  APARTMENTS,
  CODE,
  CODE_CHARACTERS,
  EMAIL_ADDRESSES,
  HOUSING_COMPANIES,
  HOUSING_COMPANY_ID,
  INVITATION_CODES,
  IS_VALID,
} from "../../constants";
import { sendInvitationEmail } from "../email/email_module";
import { hasApartment } from "../housing/manage_housing_company";
import { isCompanyManager } from "./authentication";
import { Apartment } from "../../dto/apartment";

export const codeValidation = async (
  code: string,
  email: string
) : Promise<Apartment| undefined> => {
  try {
    const codeData = await admin
      .firestore()
      .collection(INVITATION_CODES)
      .where(EMAIL_ADDRESSES, 'array-contains', email)
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
          claimed_by: firestore.FieldValue.arrayUnion(claimedBy),
        });
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
  const company = await isCompanyManager(userId, companyId);
  if (
    companyId &&
    apartmentId &&
    company &&
    (await hasApartment(apartmentId, companyId))
  ) {
    const invitationCodeId = admin
      .firestore()
      .collection(INVITATION_CODES)
      .doc().id;
    const invitationCode = _makeInvitationCode(6);
    const validUntil = new Date().getTime() + 604800000;
    const invitation = {
      invitation_code: invitationCode,
      id: invitationCodeId,
      is_valid: numeberOfTenants ?? 1,
      valid_until: validUntil,
      apartment_id: apartmentId,
      housing_company_id: companyId,
      claimed_by: null,
      email_addresses: emailAddresses ?? [],
    };
    await admin
      .firestore()
      .collection(INVITATION_CODES)
      .doc(invitationCodeId)
      .set(invitation);
    if (emailAddresses && emailAddresses.length > 0) {
      sendInvitationEmail(
        emailAddresses,
        invitationCode,
        company.name ?? "Housing company",
      );
    }
    response.status(200).send(invitation);
    return;
  }
  response.status(500).send({
    errors: {
      error: "Invalid ids",
      code: "missing_housing_company_id_or_apartment_id",
    },
  });
};

const _makeInvitationCode = (length: number) => {
  let result = "";
  const characters = CODE_CHARACTERS;
  const charactersLength = characters.length;
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
};

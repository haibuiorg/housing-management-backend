import admin from "firebase-admin";
import { isValidEmail } from "../../strings_utils";
import { sendVerificationEmail } from "../email/email_module";
import { Request, Response } from "express";
import { codeValidation, removeCode } from "./code_validation";
import { DEFAULT, USERS } from "../../constants";
import { addTenantToApartment } from "../housing/manage_apartment";
import crypto from "crypto";
import { User } from "../../dto/user";
import { addPaymentCustomerAccount } from "../payment-externals/payment-service";
import { Apartment } from "../../dto/apartment";
import { getSupportedContries, isValidCountryCode } from "../country/manage_country";
import { getCompanyData } from "../housing/manage_housing_company";

const generatePassword = (
  length = 20,
  wishlist = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz~!@-#$"
) =>
  Array.from(crypto.randomFillSync(new Uint32Array(length)))
    .map((x) => wishlist[x % wishlist.length])
    .join("");

export const registerWithCode = async (
  request: Request,
  response: Response
) => {
  const invitationCode = request.body.invitation_code;
  const email = request.body.email;
  const apartment = await codeValidation(
    invitationCode,
    email
  );
  if (!apartment) {
    const error = { errors: { code: 500, message: "Invalid code" } };
    response.status(500).send(error);
    return;
  }

  const pass = request.body.password;
  try {
    if (!isValidEmail(email)) {
      const error = { errors: { code: 500, message: "Invalid email" } };
      response.status(500).send(error);
      return;
    }
    const userRecord = await admin.auth().createUser({
      email: email,
      password: pass,
      emailVerified: false,
    });
    const paymentCustomer = await addPaymentCustomerAccount(email);
    const company = await getCompanyData(apartment.housing_company_id!);
    const user = await createUserOnFirestore(
      userRecord.uid,
      company?.country_code ?? 'fi',
      email,
      [DEFAULT],
      paymentCustomer.id
    );
    await addTenantToApartment(userRecord.uid, apartment.housing_company_id!, apartment.id!);
    await removeCode(invitationCode, apartment.housing_company_id!, userRecord.uid);
    response.status(200).send(user);
    sendVerificationEmail(email);
  } catch (errors) {
    console.error(errors);
    response.status(500).send({ errors: errors });
    return;
  }
  return;
};

export const register = async (request: Request, response: Response) => {

  const email = request.body.email;
  if (!isValidEmail(email)) {
    const error = { errors: { code: 500, message: "Invalid email" } };
    response.status(500).send(error);
    return;
  }

  const pass = request.body.password;
  if (!pass || pass.toString().length < 8) {
    const error = { errors: { code: 500, message: "Invalid password" } };
    response.status(500).send(error);
    return;
  }
  try {
    const firstName = request.body.first_name;
    const lastName = request.body.last_name;
    const phone = request.body.phone;
  
    let countryCode = request.body.country_code?.toString() ?? "";
    if (countryCode.length == 0 || !await (isValidCountryCode(countryCode))) {
      countryCode = "fi";
    }
    console.log("Country code: " + countryCode)
    const userRecord = await admin.auth().createUser({
      email: email,
      password: pass,
      emailVerified: false,
    });
    const paymentCustomer = await addPaymentCustomerAccount(
      email,
      firstName ?? "" + " " + lastName ?? "",
      phone
    );
    const user = await createUserOnFirestore(
      userRecord.uid,
      countryCode,
      email,
      [DEFAULT],
      paymentCustomer.id,
      firstName ?? "",
      lastName ?? "",
      phone ?? ""
    );
    response.status(200).send(user);
    sendVerificationEmail(email);
  } catch (errors) {
    console.log(errors);
    response.status(500).send({ errors: errors });
    return;
  }
  return;
};

export const createUserWithEmail = async (
  email: string,
  countryCode: string,
  firstName?: string,
  lastName?: string,
  phone?: string,
): Promise<User | undefined> => {
  if (!isValidEmail(email)) {
    return undefined;
  }
  const pass = generatePassword();
  try {
    const userRecord = await admin.auth().createUser({
      email: email,
      password: pass,
      emailVerified: false,
    });

    const user = await createUserOnFirestore(
      userRecord.uid,
      countryCode,
      email,
      [DEFAULT],
      firstName ?? "",
      lastName ?? "",
      phone ?? ""
    );
    return user;
  } catch (errors) {
    return undefined;
  }
};

export const createUserOnFirestore = async (
  userUid: string,
  countryCode: string,
  email: string,
  roles: string[],
  paymentCustomerId: string,
  firstName: string = "",
  lastName: string = "",
  phone: string = ""
) => {
  const createdOn = new Date().getTime();
  const user = {
    user_id: userUid,
    first_name: firstName,
    last_name: lastName,
    email: email,
    phone: phone,
    created_on: createdOn,
    updated_on: createdOn,
    avatar_url: "",
    email_verified: false,
    is_active: true,
    roles: roles,
    notification_tokens: [],
    payment_customer_id: paymentCustomerId,
    country_code: countryCode,
  };
  await admin.firestore().collection(USERS).doc(userUid).set(user);
  return user;
};

"use strict";
import { Request, Response, request } from "express";
import admin from "firebase-admin";
import {
  addMultipleApartmentsInBuilding,
  addTenantToApartment,
  getUserApartment,
} from "./manage_apartment";
// eslint-disable-next-line max-len
import {
  APARTMENTS,
  CREATED_ON,
  DEFAULT,
  DEFAULT_WATER_BILL_TEMPLATE_ID,
  DOCUMENTS,
  HOUSING_COMPANIES,
  HOUSING_COMPANY_ID,
  IS_DELETED,
  PAYMENT_PRODUCT_ITEMS,
  USERS,
} from "../../constants";
import { Company } from "../../dto/company";
import {
  isAdminRole,
  isCompanyManager,
  isCompanyOwner,
  isCompanyTenant,
  removeUserAsCompanyManger,
  removeUserAsCompanyOwner,
  removeUserFromCompany,
} from "../authentication/authentication";
import { addHousingCompanyToUser, retrieveUser } from "../user/manage_user";
import { getCountryData, isValidCountryCode } from "../country/manage_country";
import { UI } from "../../dto/ui";
import {
  copyStorageFolder,
  getPublicLinkForFile,
} from "../storage/manage_storage";
import { codeValidation, removeCode } from "../authentication/code_validation";
import { StorageItem } from "../../dto/storage_item";
import { User } from "../../dto/user";
import { isValidEmail } from "../../strings_utils";
import { createUserWithEmail } from "../authentication/register";
import { sendManagerAccountCreatedEmail } from "../email/email_module";
import { addStripeProductForConnectAccount, createConnectAccount, createConnectAccountLink, retrieveConnectAccount } from "../payment-externals/payment-service";
import { PaymentProductItem } from "../../dto/payment-product-item";
import { storageItemTranslation } from "../translation/translation_service";
import { FirebaseObject } from "../../dto/firebase_object";

export const createHousingCompany = async (
  request: Request,
  response: Response
) => {
  const housingCompanyName = request.body.name;
  if (!housingCompanyName) {
    response.status(500).send({
      errors: {
        error: "Missing housing company name",
        code: "invalid_name",
      },
    });
    return;
  }

  const housingCompanyId = admin
    .firestore()
    .collection(HOUSING_COMPANIES)
    .doc().id;
  const countryCode = request.body.country_code;
  try {
    const companyCountry = await getCountryData(countryCode?.toString() ?? "fi");
    // @ts-ignore
    const userId = request.user?.uid;
    const user = await retrieveUser(userId);
    if (!user) { 
      response.status(500).send({
        errors: {
          error: "User not found",
          code: "user_not_found",
        },
      });
      return;
    }
    const businessId = request.body.business_id;
    const housingCompany: Company = {
      id: housingCompanyId,
      name: housingCompanyName,
      owners: [userId],
      managers: [userId],
      credit_amount: 0,
      created_on: new Date().getTime(),
      apartment_count: 0,
      is_deleted: false,
      currency_code: companyCountry.currency_code,
      country_code: companyCountry.country_code,
      vat: companyCountry.vat,
      water_bill_template_id: DEFAULT_WATER_BILL_TEMPLATE_ID,
      payment_account_id: "",
      business_id: businessId ?? "",
    };
    await admin
      .firestore()
      .collection(HOUSING_COMPANIES)
      .doc(housingCompanyId)
      .set(housingCompany);
    await addHousingCompanyToUser(housingCompanyId, userId);
    const paymentAccount = await createConnectAccount(
      user.email,
      companyCountry.country_code,
      housingCompanyName, 
      housingCompanyId,
      businessId? "company" : "individual");
    if (paymentAccount) {
      housingCompany.payment_account_id = paymentAccount.id;
      await admin
        .firestore()
        .collection(HOUSING_COMPANIES)
        .doc(housingCompanyId)
        .update({payment_account_id: paymentAccount.id});
    }
    housingCompany.is_user_owner = true;
    housingCompany.is_user_manager = true;
    const building = request.body.building;
    if (building) {
      const houseCodes = request.body.house_codes;
      const apartments = await addMultipleApartmentsInBuilding(
        housingCompanyId,
        building,
        houseCodes
      );
      if (apartments) {
        response.status(200).send({
          apartments: [apartments],
          id: housingCompanyId,
          name: housingCompanyName,
          owners: [userId],
          managers: [userId],
        });
        return;
      }
    }
    response.status(200).send(housingCompany);
  } catch (e) {
    console.error(e);
    response.status(500).send({
      errors: {
        error: e,
        code: "unknown_error",
      },
    });
  }
  
};

export const getHousingCompanies = async (
  request: Request,
  response: Response
) => {
  try {
    // @ts-ignore
    const userId = request.user?.uid;
    const companyIds = (
      await admin
        .firestore()
        .collection(USERS)
        .doc(userId)
        .collection(HOUSING_COMPANIES)
        .listDocuments()
    ).map((doc) => doc.id);
    const result: (admin.firestore.DocumentData | undefined)[] = [];
    await Promise.all(
      companyIds.map(async (id) => {
        try {
          const data = (
            await admin.firestore().collection(HOUSING_COMPANIES).doc(id).get()
          ).data() as Company;
          if (data && !data.is_deleted) {
            const expiration = Date.now() + 604000;
            if (
              data.cover_image_storage_link &&
              data.cover_image_storage_link.toString().length > 0 &&
              (data.cover_image_url_expiration ?? Date.now()) <= Date.now()
            ) {
              const coverImageUrl = await getPublicLinkForFile(
                data.cover_image_storage_link,
                expiration
              );
              data.cover_image_url = coverImageUrl;
              await admin
                .firestore()
                .collection(HOUSING_COMPANIES)
                .doc(id)
                .update({
                  cover_image_url: coverImageUrl,
                  cover_image_url_expiration: expiration,
                });
            }
            if (
              data.logo_storage_link &&
              data.logo_storage_link.toString().length > 0 &&
              (data.logo_url_expiration ?? Date.now()) <= Date.now()
            ) {
              const logoUrl = await getPublicLinkForFile(
                data.logo_storage_link,
                expiration
              );
              data.logo_url = logoUrl;
              await admin
                .firestore()
                .collection(HOUSING_COMPANIES)
                .doc(id)
                .update({ logo_url: logoUrl, logo_url_expiration: expiration });
            }
            result.push(data);
          }
        } catch (error) {
          console.log(error);
        }
      })
    );
    response.status(200).send(result);
  } catch (errors) {
    console.log(errors);
    response.status(500).send({ errors: errors });
  }
};
export const getHousingCompany = async (
  request: Request,
  response: Response
) => {
  try {
    // @ts-ignore
    const userId = request.user?.uid;
    const companyId = request.query.housing_company_id;
    if (!(await isCompanyTenant(userId, companyId?.toString() ?? ""))) {
      response.status(403).send({
        errors: { error: "Not tenant", code: "not_tenant" },
      });
      return;
    }
    const data = await getCompanyData(companyId?.toString() ?? "");
    if (data) {
      data.is_user_owner =
        (await isCompanyOwner(userId, companyId?.toString() ?? "")) !== undefined;
      data.is_user_manager =
        (await isCompanyManager(userId, companyId?.toString() ?? "")) !==
        undefined;
    }
    
    response.status(200).send(data);
  } catch (errors) {
    console.log(errors);
    response.status(500).send({ errors: errors });
  }
};
export const updateHousingCompanyDetail = async (
  request: Request,
  response: Response
) => {
  const companyId = request.body.housing_company_id;
  // @ts-ignore
  const userId = request.user?.uid;
  const company = await isCompanyManager(userId, companyId);

  if (!company) {
    response
      .status(403)
      .send({ errors: { error: "Unauthorized", code: "not_manager" } });
    return;
  }
  const isOwner = await isCompanyOwner(userId, companyId);
  const streetAddress1 = request.body.street_address_1;
  const streetAddress2 = request.body.street_address_2;
  const postalCode = request.body.postal_code;
  const city = request.body.city;
  const countryCode = request.body.country_code;
  const lat = request.body.lat;
  const lng = request.body.lng;
  const name = request.body.name;
  const companyBusinessId = request.body.business_id;
  const ui = request.body.ui;
  const isDeleted = request.body.is_deleted;
  const waterBillTemplateId = request.body.water_bill_template_id;
  const coverImageStorageLink = request.body.cover_image_storage_link;
  const logoStorageLink = request.body.logo_storage_link;
  if (streetAddress1) {
    company.street_address_1 = streetAddress1;
  }
  if (streetAddress2) {
    company.street_address_2 = streetAddress2;
  }
  if (postalCode) {
    company.postal_code = postalCode;
  }
  if (city) {
    company.city = city;
  }
  if (countryCode) {
    const country = await isValidCountryCode(countryCode);
    company.country_code = countryCode;
    company.currency_code = country.currency_code;
    company.vat = country.vat;
  }
  if (lat) {
    company.lat = lat;
  }
  if (lng) {
    company.lng = lng;
  }
  if (name) {
    company.name = name;
  }
  if (companyBusinessId) {
    company.business_id = companyBusinessId;
  }
  if (ui) {
    company.ui = ui as UI;
  }
  if (isDeleted) {
    if (isOwner) {
      company.is_deleted = isDeleted;
    }
  }
  const expiration = Date.now() + 604000;
  if (waterBillTemplateId) {
    company.water_bill_template_id = waterBillTemplateId;
  }
  if (coverImageStorageLink) {
    const lastPath = coverImageStorageLink.toString().split("/").at(-1);
    const newFileLocation = `public/companies/${companyId}/cover/${lastPath}`;
    await copyStorageFolder(coverImageStorageLink, newFileLocation);
    company.cover_image_storage_link = newFileLocation;
    company.cover_image_url = await getPublicLinkForFile(
      newFileLocation,
      expiration
    );
    company.cover_image_url_expiration = expiration;
  }
  if (logoStorageLink) {
    const lastPath = logoStorageLink.toString().split("/").at(-1);
    const newFileLocation = `public/companies/${companyId}/logo/${lastPath}`;
    await copyStorageFolder(logoStorageLink, newFileLocation);
    company.logo_storage_link = newFileLocation;
    company.logo_url = await getPublicLinkForFile(logoStorageLink, expiration);
    company.logo_url_expiration = expiration;
  }
  try {
    await admin
      .firestore()
      .collection(HOUSING_COMPANIES)
      .doc(companyId)
      .update(company);
    const newComapny = await getCompanyData(companyId);
    newComapny!.is_user_owner = isOwner !== undefined;
    newComapny!.is_user_manager = true;
    response.status(200).send(newComapny);
  } catch (errors) {
    console.log(errors);
    response.status(500).send({ errors: errors });
  }
};

export const getCompanyData = async (
  companyId: string
): Promise<Company | undefined> => {
  const company = (
    await admin.firestore().collection(HOUSING_COMPANIES).doc(companyId).get()
  ).data() as Company;
  if (!company) {
    return;
  }
  const expiration = Date.now() + 604000;
  if (
    company.cover_image_storage_link &&
    company.cover_image_storage_link.toString().length > 0 &&
    (company.cover_image_url_expiration ?? Date.now()) <= Date.now()
  ) {
    const coverImageUrl = await getPublicLinkForFile(
      company.cover_image_storage_link,
      expiration
    );
    company.cover_image_url = coverImageUrl;
    await admin
      .firestore()
      .collection(HOUSING_COMPANIES)
      .doc(companyId)
      .update({
        cover_image_url: coverImageUrl,
        cover_image_url_expiration: expiration,
      });
  }
  if (
    company.logo_storage_link &&
    company.logo_storage_link.toString().length > 0 &&
    (company.logo_url_expiration ?? Date.now()) <= Date.now()
  ) {
    const logoUrl = await getPublicLinkForFile(
      company.logo_storage_link,
      expiration
    );
    company.logo_url = logoUrl;
    await admin
      .firestore()
      .collection(HOUSING_COMPANIES)
      .doc(companyId)
      .update({ logo_url: logoUrl, logo_url_expiration: expiration });
  }
  if (!company.payment_account_id ||
      company.payment_account_id.length === 0 && 
      (company.owners?.length ?? 0) > 0) {
    const ownerId = company.owners![0];
    const owner = await retrieveUser(ownerId);
    if (!owner) {
      return company;
    }
    const paymentAccount = await createConnectAccount(
      owner.email,
      company.country_code ?? "fi",
      company.name ?? "",
      company.id,
      "company"
      );
    await admin
      .firestore()
      .collection(HOUSING_COMPANIES)
      .doc(companyId)
      .update({ payment_account_id: paymentAccount.id });
    company.payment_account_id = paymentAccount.id;
  }
  return company;
};


export const getCompanyTenantIds = async (
  housingCompanyId: string,
  includeOwner: boolean = false,
  includeManager: boolean = false
): Promise<string[]> => {
  const apartments = await admin
    .firestore()
    .collectionGroup(APARTMENTS)
    .where(HOUSING_COMPANY_ID, "==", housingCompanyId)
    .get();
  const tenants: string[] = [];
  if (includeManager || includeOwner) {
    const housingCompany = (
      await admin
        .firestore()
        .collection(HOUSING_COMPANIES)
        .doc(housingCompanyId)
        .get()
    ).data() as Company;
    if (includeManager) {
      tenants.push(...(housingCompany.managers ?? []));
    }
    if (includeOwner) {
      tenants.push(...(housingCompany.owners ?? []));
    }
  }
  apartments.docs.map((doc) => {
    tenants.push(...(doc.data().tenants as string[]));
  });
  return [...new Set(tenants)];
};

export const getCompanyUserRequest = async (
  request: Request,
  response: Response
) => {
  // @ts-ignore
  const userId = request.user?.uid;
  const companyId = request.params.companyId;
  if (!(await isCompanyTenant(userId, companyId))) {
    response.status(403).send({
      errors: { error: "Not tenant", code: "not_tenant" },
    });
    return;
  }
  try {
    const users = await getCompanyUserDetails(companyId);
    response.status(200).send(users);
  } catch (errors) {
    console.log(errors);
    response.sendStatus(404);
  }
};

export const retrieveUsers = async (userIds: string[]) => {
  const users: User[] = [];
  await Promise.all(
    userIds.map(async (id) => {
      const user = await retrieveUser(id);
      if (user) {
        users.push(user);
      }
    })
  );
  return users;
};

const getCompanyUserDetails = async (
  housingCompanyId: string
): Promise<User[]> => {
  const userIds: string[] = (
    await admin
      .firestore()
      .collectionGroup(HOUSING_COMPANIES)
      .where("id", "==", housingCompanyId)
      .where("user_id", "!=", null)
      .get()
  ).docs.map((doc) => {
    return doc.ref.parent.parent?.id ?? "";
  });
  return await retrieveUsers(userIds);
};

export const getCompanyManagerRequest = async (
  request: Request,
  response: Response
) => {
  // @ts-ignore
  const userId = request.user?.uid;
  const housingCompanyId = request.params.companyId;
  const company = await isCompanyManager(userId, housingCompanyId);
  if (!company) {
    response
      .status(403)
      .send({ errors: { error: "Unauthorized", code: "not_manager" } });
    return;
  }
  try {
    const users = await getCompanyManagerDetails(housingCompanyId);
    response.status(200).send(users);
  } catch (errors) {
    console.log(errors);
    response.status(500).send({ errors: errors });
  }
};

export const getCompanyManagerDetails = async (
  housingCompanyId: string
): Promise<User[]> => {
  const company = (
    await admin
      .firestore()
      .collection(HOUSING_COMPANIES)
      .doc(housingCompanyId)
      .get()
  ).data() as Company;
  const userIds: string[] = [
    ...new Set([...(company.managers ?? []), ...(company.owners ?? [])]),
  ];
  const users: User[] = [];
  await Promise.all(
    userIds.map(async (id) => {
      const user = await retrieveUser(id);
      if (user) {
        users.push(user); 
      }
    })
  );
  return users;
};

export const joinWithCode = async (request: Request, response: Response) => {
  const invitationCode = request.body.invitation_code;
   // @ts-ignore
  const userId = request.user?.uid;
  const user = await retrieveUser(userId);
  if (!user) { 
    response.status(403).send({ errors: { error: "Unauthorized", code: "not_manager" } });
    return;
  }
  const apartment = await codeValidation(
    invitationCode,
    user.email,
  );
  if (!apartment) {
    const error = { errors: { code: 500, message: "Invalid code" } };
    console.log(error);
    response.status(500).send(error);
    return;
  }
  try {
    // @ts-ignore
    const userId = request.user?.uid;
    await addTenantToApartment(userId, apartment!.housing_company_id!, apartment.id!, invitationCode);
    response.status(200).send(apartment);
  } catch (errors) {
    console.error(errors);
    response.status(500).send({ errors: errors });
    return;
  }
  return;
};

export const addDocumentToCompany = async (
  request: Request,
  response: Response
) => {
  // @ts-ignore
  const userId = request.user?.uid;
  const companyId = request.body?.housing_company_id;
  const company = await isCompanyManager(userId, companyId);
  if (!company) {
    response
      .status(403)
      .send({ errors: { error: "Unauthorized", code: "not_manager" } });
    return;
  }
  const type = request.body?.type?.toString() ?? DEFAULT;
  const storageItems = request.body.storage_items;
  const storageItemArray: StorageItem[] = [];
  if (storageItems && storageItems.length > 0) {
    const createdOn = new Date().getTime();
    await Promise.all(
      storageItems.map(async (link: string) => {
        try {
          const lastPath = link.toString().split("/").at(-1);
          const newFileLocation = `${HOUSING_COMPANIES}/${companyId}/${type}/${lastPath}`;
          await copyStorageFolder(link, newFileLocation);
          const id = admin
            .firestore()
            .collection(HOUSING_COMPANIES)
            .doc(companyId)
            .collection(DOCUMENTS)
            .doc().id;
          const storageItem: StorageItem = {
            type: type,
            name: lastPath ?? "",
            id: id,
            is_deleted: false,
            uploaded_by: userId,
            storage_link: newFileLocation,
            created_on: createdOn,
            summary_translations: null
          };
          await admin
            .firestore()
            .collection(HOUSING_COMPANIES)
            .doc(companyId)
            .collection(DOCUMENTS)
            .doc(id)
            .set(storageItem);
          storageItemArray.push(storageItem);
        } catch (error) {
          response.status(500).send({ errors: error });
          console.log(error);
        }
      })
    );
  }
  storageItemTranslation(storageItemArray);
  response.status(200).send(storageItemArray);
};

export const getCompanyDocuments = async (
  request: Request,
  response: Response
) => {
  // @ts-ignore
  const userId = request.user?.uid;
  const companyId = request.query?.housing_company_id;
  const isTenant = await isCompanyTenant(userId, companyId?.toString() ?? "");
  if (!isTenant) {
    response
      .status(403)
      .send({ errors: { error: "Unauthorized", code: "not_tenant" } });
    return;
  }
  let basicRef = admin
    .firestore()
    .collection(HOUSING_COMPANIES)
    .doc(companyId?.toString() ?? "")
    .collection(DOCUMENTS)
    .where(IS_DELETED, "==", false);
  const type = request.query.type;
  if (type) {
    basicRef = basicRef.where("type", "==", type.toString());
  }
  let limit = 3;
  if (request.query?.limit) {
    limit = parseInt(request.query?.limit?.toString() ?? "3");
  }
  if (request.query?.last_created_on) {
    const lastItemCreatedTime =
      parseInt(
        request.query?.last_created_on?.toString() ??
          new Date().getTime().toString()
      ) ?? new Date().getTime();
    const documents = (
      await basicRef
        .orderBy(CREATED_ON, "desc")
        .startAfter(lastItemCreatedTime)
        .limit(limit)
        .get()
    ).docs.map((doc) => doc.data());
    response.status(200).send(documents);
  } else {
    const documents = (
      await basicRef.orderBy(CREATED_ON, "desc").limit(limit).get()
    ).docs.map((doc) => doc.data());
    response.status(200).send(documents);
  }
};

export const updateCompanyDocument = async (
  request: Request,
  response: Response
) => {
  // @ts-ignore
  const userId = request.user?.uid;
  const companyId = request.body?.housing_company_id;
  const isTenant = await isCompanyManager(userId, companyId?.toString() ?? "");
  if (!isTenant) {
    response
      .status(403)
      .send({ errors: { error: "Unauthorized", code: "not_tenant" } });
    return;
  }
  const updatedFile: FirebaseObject = {};
  if (request.body?.is_deleted) {
    updatedFile.is_deleted = request.body?.is_deleted;
  }
  if (request.body?.name) {
    updatedFile.name = request.body?.name;
  }
  const docId = request.params?.document_id;
  await admin
    .firestore()
    .collection(HOUSING_COMPANIES)
    .doc(companyId?.toString() ?? "")
    .collection(DOCUMENTS)
    .doc(docId)
    .update(updatedFile);
  const basicRef = admin
    .firestore()
    .collection(HOUSING_COMPANIES)
    .doc(companyId?.toString() ?? "")
    .collection(DOCUMENTS)
    .doc(docId);
  const document = (await basicRef.get()).data();
  response.status(200).send(document);
};

export const getCompanyDocument = async (
  request: Request,
  response: Response
) => {
  // @ts-ignore
  const userId = request.user?.uid;
  const companyId = request.params?.housing_company_id;
  const docId = request.params?.document_id;
  const isTenant = await isCompanyTenant(userId, companyId?.toString() ?? "");
  if (!isTenant) {
    response
      .status(403)
      .send({ errors: { error: "Unauthorized", code: "not_tenant" } });
    return;
  }
  const document = (
    await admin
      .firestore()
      .collection(HOUSING_COMPANIES)
      .doc(companyId?.toString() ?? "")
      .collection(DOCUMENTS)
      .doc(docId)
      .get()
  ).data() as StorageItem;
  if (document?.expired_on ?? 0 < new Date().getTime()) {
    document.expired_on = new Date().getTime();
    document.presigned_url = await getPublicLinkForFile(
      document.storage_link ?? ""
    );
    admin
      .firestore()
      .collection(HOUSING_COMPANIES)
      .doc(companyId?.toString() ?? "")
      .collection(DOCUMENTS)
      .doc(docId)
      .update(document);
  }
  response.status(200).send(document);
};

export const addNewManager = async (request: Request, response: Response) => {
  // @ts-ignore
  const userId = request.user?.uid;
  const companyId = request.body?.housing_company_id;
  const companyOwner = await isCompanyOwner(userId, companyId);
  if (!companyOwner) {
    response.status(403).send({ errors: "not_owner" });
    return;
  }
  const email = request.body.email;
  if (!isValidEmail(email)) {
    const error = { errors: { code: 500, message: "Invalid email" } };
    response.status(500).send(error);
    return;
  }
  let addingUserId;
  try {
    const existUser = await admin.auth().getUserByEmail(email);
    addingUserId = existUser.uid;
    return;
  } catch (error) {
    console.log(error);
  }

  try {
    if (!addingUserId) {
      const firstName = request.body.first_name;
      const lastName = request.body.last_name;
      const phone = request.body.phone;
      const user = await createUserWithEmail(email, companyOwner.currency_code ?? 'fi' ,firstName, lastName, phone);
      addingUserId = user?.user_id;
      if (!user) {
        response.status(500).send({ errors: "unknown" });
        return;
      }
    }
    if (!addingUserId) {
      response.status(500).send({ errors: "unknown" });
      return;
    }
    const managers = [
      ...new Set([...(companyOwner.managers ?? []), ...[addingUserId]]),
    ];
    await addHousingCompanyToUser(companyId, addingUserId);
    await admin
      .firestore()
      .collection(HOUSING_COMPANIES)
      .doc(companyId)
      .update({ managers: managers });
    const updatedUser = await retrieveUser(addingUserId);
    response.status(200).send(updatedUser);
    sendManagerAccountCreatedEmail(
      email,
      companyOwner!.name ?? "Housing company"
    );
  } catch (errors) {
    console.log(errors);
    response.status(500).send({ errors: errors });
    return;
  }
};

export const setUpPaymentAccountRequest = async ( 
  request: Request,
  response: Response) => { 
  // @ts-ignore
  const userId = request.user?.uid;
  const companyId = request.body?.housing_company_id;
  const companyOwner = await isCompanyOwner(userId, companyId);
  if (!companyOwner) {
    response.status(403).send({ errors: "not_owner" });
    return;
  }
  const user = await retrieveUser(userId);
  if (!user) {
    response.status(403).send({ errors: "user_not_found" });
    return;
  }
  if (!companyOwner.payment_account_id || companyOwner.payment_account_id === "") { 
    const paymentAccount = await createConnectAccount(
      user.email,
      companyOwner.country_code ?? "fi",
      companyOwner.name ?? "Housing company",
      companyOwner.id,
      "company"
    );
    if (paymentAccount) { 
      await admin.firestore().collection(HOUSING_COMPANIES).doc(companyId).update({ payment_account_id: paymentAccount.id });
      companyOwner.payment_account_id = paymentAccount.id;
    }
  }
  const paymentAccountLinks = await createConnectAccountLink(companyOwner.payment_account_id, companyOwner.id);
  response.status(200).send(paymentAccountLinks); 
}

/*export const retrieveCompanyConnectAccountRequest = 
  async (request: Request , response: Response) => {
    // @ts-ignore
    const userId = request.user?.uid;
    const companyId = request.query.company_id ?? "";
    const companyManager = await isCompanyManager(userId, companyId.toString());
    if (!companyManager) { 
      response.status(403).send({
        errors: {
          error: "User not authorized",
          code: "not_authorized",
        },
      });
      return;
    }
    try { 
      const connectAccount = await retrieveConnectAccount(companyManager.payment_account_id);
      response.status(204).send(connectAccount);
    } catch (e) { 
      console.log(e);
      response.status(500).send({
        errors: {
          error: e,
          code: "unknown_error",
        },
      });
    }
   
  }*/

export const getCompanyPaymentProductItemRequest = async (
    request: Request,
    response: Response
  ) => {
    // @ts-ignore
    const userId = request.user?.uid;
    const companyId = request.query.company_id ?? "";
    const companyManager = await isCompanyManager(userId, companyId.toString());
    if (!companyManager) { 
      response.status(403).send({
        errors: {
          error: "User not authorized",
          code: "not_authorized",
        },
      });
      return;
    }
    
    const productItems = (
      await admin
        .firestore()
        .collection(PAYMENT_PRODUCT_ITEMS)
        .where("is_active", "==", true)
        .where("company_id", "==", companyId)
        .get()
    ).docs.map((doc) => doc.data());
    response.send(productItems);
  };

export const addCompanyPaymentProductItemRequest = async (
  request: Request,
  response: Response
) => {
  
  const { amount, name, description = "", company_id, tax_percentage } = request.body;
  // @ts-ignore
  const userId = request.user.uid;
  const company = await isCompanyManager(userId, company_id);
  if (!company) {
    response.status(403).send({ errors: "not_manager" });
    return;
  }
  const paymentProducItem = await addCompanyPaymentProductItem(company, name, description, tax_percentage, amount);
  if (!paymentProducItem) {
    response.status(500).send({ errors: "unknown" });
  }
  try {
    response.send(paymentProducItem);
  } catch (error) {
    response.sendStatus(500);
  }
};

export const addCompanyPaymentProductItem = async (
  company: Company, 
  name: string, 
  description: string,
  tax_percentage: number,
  amount: number) : Promise<PaymentProductItem|undefined> => {
    try {
      const stripeProduct = await addStripeProductForConnectAccount(
        company.payment_account_id,
        name,
        company.currency_code,
        amount
      );
      const stripeProductId = stripeProduct.id;
      const stripePriceId = stripeProduct.default_price;
      const id = admin.firestore().collection(PAYMENT_PRODUCT_ITEMS).doc().id;
      const paymentProducItem: PaymentProductItem = {
        description,
        id,
        name,
        amount,
        tax_percentage,
        currency_code: company.currency_code ?? 'eur',
        country_code: company.country_code ?? 'fi',
        is_active: true,
        stripe_product_id: stripeProductId,
        stripe_price_id: stripePriceId,
        created_on: Date.now(),
        company_id: company.id,
      };
      await admin
        .firestore()
        .collection(PAYMENT_PRODUCT_ITEMS)
        .doc(id)
        .set(paymentProducItem);
      return paymentProducItem;
    } catch (error) {
      console.log(error);
    }
}

export const deletePaymentProductItemRequest = async (
  request: Request,
  response: Response
) => {
  const { id, company_id } = request.query;
  // @ts-ignore
  const userId = request.user.uid;
  if (!(await isCompanyManager(userId, company_id?.toString() ?? ""))) {
    response.sendStatus(403);
    return;
  }
  try {
    const productItem = (await admin
      .firestore()
      .collection(PAYMENT_PRODUCT_ITEMS)
      .doc(id?.toString() ?? "").get()).data() as PaymentProductItem;
    if (productItem.company_id !== company_id) {
      response.status(403).send({ errors: "not_company_item" });
      return;
    }
    await admin
      .firestore()
      .collection(PAYMENT_PRODUCT_ITEMS)
      .doc(id?.toString() ?? "")
      .update({ is_active: false });
    response.sendStatus(200);
  } catch (error) {
    console.log(error);
    response.sendStatus(500);
  }
};

export const removeUserAsCompanyMangerRequest = async (request: Request, response: Response) => { 
  const { removed_user_id, housing_company_id } = request.body;
  // @ts-ignore
  const userId = request.user.uid;
  if (!(await isCompanyOwner(userId, housing_company_id?.toString() ?? ""))) {
    response.sendStatus(403);
    return;
  }
  try {
    await admin
      .firestore()
      .collection(HOUSING_COMPANIES)
      .doc(housing_company_id?.toString() ?? "")
      .update({ managers: admin.firestore.FieldValue.arrayRemove(removed_user_id?.toString() ?? "") });
    const users = await getCompanyManagerDetails(housing_company_id);
    response.status(200).send(users);
  } catch (error) {
    console.log(error);
    response.status(500).send({ errors: error });
  }
}

export const removeUserFromCompanyRequest = async (request: Request, response: Response) => { 
  const { removed_user_id, housing_company_id } = request.body;
  // @ts-ignore
  const userId = request.user.uid;
  const companyOwner = await isCompanyOwner(userId, housing_company_id?.toString() ?? "");
  const isRemovedUserManager = await isCompanyManager(removed_user_id?.toString() ?? "", housing_company_id?.toString() ?? "");
  const isRemovedUserOwner = await isCompanyOwner(removed_user_id?.toString() ?? "", housing_company_id?.toString() ?? "");
  const isAdmin = await isAdminRole(userId);
  if (isRemovedUserOwner && (!companyOwner || isAdmin)) {
    response.sendStatus(403);
    return;
  }
  if (isRemovedUserManager && !companyOwner) {
    response.sendStatus(403);
    return;
  }
  const companyManager = await isCompanyOwner(userId, housing_company_id?.toString() ?? "");
  if (!companyManager) {
    response.sendStatus(403);
    return;
  }
  if (isRemovedUserOwner) {
    await removeUserAsCompanyOwner(removed_user_id?.toString() ?? "", housing_company_id?.toString() ?? "");
  }
  if (isRemovedUserManager) {
    await removeUserAsCompanyManger(removed_user_id?.toString() ?? "", housing_company_id?.toString() ?? "");
  }
  await removeUserFromCompany(removed_user_id?.toString() ?? "", housing_company_id?.toString() ?? "");
  try {
    response.sendStatus(200);
  } catch (error) {
    console.log(error);
    response.status(500).send({ errors: error });
  }
}



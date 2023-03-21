import { Request, Response } from "express";
import admin, { firestore } from "firebase-admin";
// eslint-disable-next-line max-len
import {
  APARTMENTS,
  BUILDING,
  CREATED_ON,
  DEFAULT,
  DOCUMENTS,
  HOUSE_CODE,
  HOUSING_COMPANIES,
  HOUSING_COMPANY_ID,
  IS_DELETED,
  TENANTS,
} from "../../constants";
import { Apartment } from "../../dto/apartment";
import { StorageItem } from "../../dto/storage_item";
import {
  isAuthorizedAccessToApartment,
  isCompanyManager,
} from "../authentication/authentication";
import {
  copyStorageFolder,
  getPublicLinkForFile,
} from "../storage/manage_storage";
import { addHousingCompanyToUser } from "../user/manage_user";
import {
  getSubscriptionPlanById,
  hasOneActiveSubscription,
} from "../subscription/subscription-service";
export const addApartmentRequest = async (
  request: Request,
  response: Response
) => {
  // @ts-ignore
  const userId = request.user?.uid;
  const housingCompanyId = request.body.housing_company_id;
  if (!(await isCompanyManager(userId, housingCompanyId))) {
    response.status(403).send({
      errors: { error: "Not manager", code: "not_manager" },
    });
    return;
  }
  const building = request.body.building;
  const houseCodes = request.body.house_codes;
  if (!building) {
    response.status(500).send({
      errors: { error: "Building require", code: "missing_buiding" },
    });
    return;
  }
  try {
    const apartments = await addMultipleApartmentsInBuilding(
      housingCompanyId,
      building,
      houseCodes
    );
    response.status(200).send(apartments);
  } catch (errors) {
    response.status(500).send({
      errors: errors,
    });
  }
};

export const editApartmentRequest = async (
  request: Request,
  response: Response
) => {
  // @ts-ignore
  const userId = request.user?.uid;
  const housingCompanyId = request.body.housing_company_id;
  const isCompanyManagerBool = await isCompanyManager(userId, housingCompanyId);
  if (!isCompanyManagerBool) {
    response.status(403).send({
      errors: { error: "Not manager", code: "not_manager" },
    });
    return;
  }
  const apartmentId = request.body.apartment_id;
  const building = request.body.building;
  const houseCode = request.body.house_code;
  const isDeleted = request.body.is_deleted;
  if (!apartmentId) {
    response.status(500).send({
      errors: { error: "apartment_id require", code: "missing_apartment_id" },
    });
    return;
  }
  const apartment: Apartment = {};
  if (building) {
    apartment.building = building;
  }
  if (houseCode) {
    apartment.house_code = houseCode;
  }
  if (isDeleted) {
    apartment.is_deleted = isDeleted;
  }
  try {
    await admin
      .firestore()
      .collection(HOUSING_COMPANIES)
      .doc(housingCompanyId)
      .collection(APARTMENTS)
      .doc(apartmentId)
      .update(apartment);
    if (isDeleted) {
      await admin
        .firestore()
        .collection(HOUSING_COMPANIES)
        .doc(housingCompanyId)
        .update({ apartment_count: firestore.FieldValue.increment(-1) });
    }
    const apartmentUpdated = await admin
      .firestore()
      .collection(HOUSING_COMPANIES)
      .doc(housingCompanyId)
      .collection(APARTMENTS)
      .doc(apartmentId)
      .get();
    response.status(200).send(apartmentUpdated.data());
  } catch (errors) {
    response.status(500).send({
      errors: errors,
    });
  }
};

export const addTenantToApartment = async (
  userUid: string,
  housingCompanyId: string,
  apartmentId: string
) => {
  if (housingCompanyId && apartmentId) {
    await admin
      .firestore()
      .collection(HOUSING_COMPANIES)
      .doc(housingCompanyId)
      .collection(APARTMENTS)
      .doc(apartmentId)
      .update({ [TENANTS]: firestore.FieldValue.arrayUnion(userUid) });
    await addHousingCompanyToUser(housingCompanyId, userUid);
  }
};

export const addMultipleApartmentsInBuilding = async (
  housingCompanyId: string,
  building: string,
  houseCodes?: string[]
) => {
  const newApartmentCount = houseCodes ? houseCodes.length : 1;
  const companyPartmentCount = await getApartmentCount(housingCompanyId);
  const activeSubscription = await hasOneActiveSubscription(housingCompanyId);
  if (
    !activeSubscription ||
    (activeSubscription.quantity ?? 0) <
      companyPartmentCount + newApartmentCount
  ) {
    throw {
      error: "Subscription plan does not allow more apartments",
      code: "subscription_plan_does_not_allow_more_apartments",
    };
  }

  if (!houseCodes) {
    return await addSingleApartment(housingCompanyId, building);
  }
  const batch = admin.firestore().batch();
  const apartments = [];
  for (const houseCode of houseCodes) {
    const apartmentId = admin
      .firestore()
      .collection(HOUSING_COMPANIES)
      .doc(housingCompanyId)
      .collection(APARTMENTS)
      .doc().id;
    const apartment: Apartment = {
      housing_company_id: housingCompanyId,
      id: apartmentId,
      building: building,
      house_code: houseCode ?? "",
      tenants: [],
      is_deleted: false,
    };
    apartments.push(apartment);
    const apartmentRef = admin
      .firestore()
      .collection(HOUSING_COMPANIES)
      .doc(housingCompanyId)
      .collection(APARTMENTS)
      .doc(apartmentId);
    batch.set(apartmentRef, apartment);
  }
  await batch.commit();
  await admin
    .firestore()
    .collection(HOUSING_COMPANIES)
    .doc(housingCompanyId)
    .update({
      apartment_count: firestore.FieldValue.increment(houseCodes.length),
    });
  return apartments;
};

export const addSingleApartment = async (
  housingCompanyId: string,
  building: string,
  houseCode?: string
) => {
  const apartmentId = admin
    .firestore()
    .collection(HOUSING_COMPANIES)
    .doc(housingCompanyId)
    .collection(APARTMENTS)
    .doc().id;
  const apartment: Apartment = {
    housing_company_id: housingCompanyId,
    id: apartmentId,
    building: building,
    house_code: houseCode ?? "",
    tenants: [],
    is_deleted: false,
  };
  await admin
    .firestore()
    .collection(HOUSING_COMPANIES)
    .doc(housingCompanyId)
    .collection(APARTMENTS)
    .doc(apartmentId)
    .set(apartment);
  await admin
    .firestore()
    .collection(HOUSING_COMPANIES)
    .doc(housingCompanyId)
    .update({
      apartment_count: firestore.FieldValue.increment(1),
    });
  return [apartment];
};

export const isApartmentTenant = async (
  userId: string,
  housingCompanyId: string,
  building: string,
  houseCode?: string
) => {
  if (!houseCode) {
    const apartments = await admin
      .firestore()
      .collectionGroup(APARTMENTS)
      .where(HOUSING_COMPANY_ID, "==", housingCompanyId)
      .where(BUILDING, "==", building)
      .where(TENANTS, "array-contains", userId)
      .limit(1)
      .get();
    return apartments.docs.map((doc) => doc.data())[0];
  }
  const apartments = await admin
    .firestore()
    .collectionGroup(APARTMENTS)
    .where(HOUSING_COMPANY_ID, "==", housingCompanyId)
    .where(BUILDING, "==", building)
    .where(HOUSE_CODE, "==", houseCode)
    .where(TENANTS, "array-contains", userId)
    .limit(1)
    .get();
  return apartments.docs.map((doc) => doc.data())[0];
};

export const isApartmentIdTenant = async (
  userId: string,
  housingCompanyId: string,
  apartmentId: string
) => {
  const apartment = await admin
    .firestore()
    .collection(HOUSING_COMPANIES)
    .doc(housingCompanyId)
    .collection(APARTMENTS)
    .doc(apartmentId)
    .get();

  return apartment.data()?.tenants.includes(userId)
    ? apartment.data()
    : undefined;
};

export const getUserApartmentRequest = async (
  request: Request,
  response: Response
) => {
  // @ts-ignore
  const userId = request.user?.uid;
  const housingCompanyId = request.query.housing_company_id;
  if (!housingCompanyId) {
    response
      .status(500)
      .send({ errors: { error: "Missing value", code: "missing_company_id" } });
  }
  try {
    const apartments = await getUserApartments(
      userId,
      housingCompanyId!.toString()
    );
    response.status(200).send(apartments);
  } catch (errors) {
    response.status(500).send({ errors: errors });
  }
};

export const getSingleApartmentRequest = async (
  request: Request,
  response: Response
) => {
  // @ts-ignore
  const userId = request.user?.uid;
  const housingCompanyId = request.query.housing_company_id;
  const apartmentId = request.query.apartment_id;
  if (!housingCompanyId || !apartmentId) {
    response
      .status(500)
      .send({ errors: { error: "Missing value", code: "missing_value" } });
  }
  try {
    const apartment = await getUserApartment(
      userId,
      housingCompanyId!.toString(),
      apartmentId!.toString()
    );
    response.status(200).send(apartment);
  } catch (errors) {
    response.status(500).send({ errors: errors });
  }
};
export const getUserApartments = async (
  userId: string,
  housingCompanyId: string
) => {
  if (await isCompanyManager(userId, housingCompanyId)) {
    const apartments = await admin
      .firestore()
      .collectionGroup(APARTMENTS)
      .where(HOUSING_COMPANY_ID, "==", housingCompanyId)
      .where(IS_DELETED, "==", false)
      .orderBy(BUILDING)
      .orderBy(HOUSE_CODE)
      .get();
    return apartments.docs.map((doc) => doc.data());
  }
  const apartments = await admin
    .firestore()
    .collectionGroup(APARTMENTS)
    .where(HOUSING_COMPANY_ID, "==", housingCompanyId)
    .where(IS_DELETED, "==", false)
    .where(TENANTS, "array-contains", userId)
    .orderBy(BUILDING)
    .orderBy(HOUSE_CODE)
    .get();
  return apartments.docs.map((doc) => doc.data());
};
export const getUserApartment = async (
  userId: string,
  housingCompanyId: string,
  apartmentId: string
) => {
  if (await isCompanyManager(userId, housingCompanyId)) {
    const apartment = await admin
      .firestore()
      .collection(HOUSING_COMPANIES)
      .doc(housingCompanyId)
      .collection(APARTMENTS)
      .doc(apartmentId)
      .get();
    const apartmentData = apartment.data();
    if (apartmentData?.is_deleted) {
      return undefined;
    }
    return apartmentData;
  }
  const apartments = await admin
    .firestore()
    .collectionGroup(APARTMENTS)
    .where("id", "==", apartmentId)
    .where(HOUSING_COMPANY_ID, "==", housingCompanyId)
    .where(IS_DELETED, "==", false)
    .where(TENANTS, "array-contains", userId)
    .limit(1)
    .get();
  return apartments.docs.map((doc) => doc.data())[0];
};

export const addDocumentToApartment = async (
  request: Request,
  response: Response
) => {
  // @ts-ignore
  const userId = request.user?.uid;
  const companyId = request.body?.housing_company_id;
  const apartmentId = request.body?.apartment_id;
  const isTenant = await isAuthorizedAccessToApartment(
    userId,
    companyId,
    apartmentId
  );
  if (!isTenant) {
    response
      .status(403)
      .send({ errors: { error: "Unauthorized", code: "not_tenant" } });
    return;
  }
  const activeSubscription = await hasOneActiveSubscription(companyId);
  if (!activeSubscription) {
    response
      .status(403)
      .send({
        errors: { error: "Unauthorized", code: "no_active_subscription" },
      });
    return;
  }
  const subscriptionPlan = await getSubscriptionPlanById(
    activeSubscription.subscription_plan_id
  );
  if (subscriptionPlan.has_apartment_document !== true) {
    response
      .status(403)
      .send({ errors: { error: "Unauthorized", code: "no_document_access" } });
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
          const newFileLocation =
            // eslint-disable-next-line max-len
            `${HOUSING_COMPANIES}/${companyId}/${apartmentId}/${type}/${lastPath}`;
          await copyStorageFolder(link, newFileLocation);
          const id = admin
            .firestore()
            .collection(HOUSING_COMPANIES)
            .doc(companyId)
            .collection(APARTMENTS)
            .doc(apartmentId)
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
          };
          await admin
            .firestore()
            .collection(HOUSING_COMPANIES)
            .doc(companyId)
            .collection(APARTMENTS)
            .doc(apartmentId)
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
  response.status(200).send(storageItemArray);
};

export const getApartmentDocuments = async (
  request: Request,
  response: Response
) => {
  // @ts-ignore
  const userId = request.user?.uid;
  const companyId = request.query?.housing_company_id;
  const apartmentId = request.query?.apartment_id;
  const isTenant = await isAuthorizedAccessToApartment(
    userId,
    companyId?.toString() ?? "",
    apartmentId?.toString() ?? ""
  );
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
    .collection(APARTMENTS)
    .doc(apartmentId?.toString() ?? "")
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

export const deleteApartmentDocuments = async (
  request: Request,
  response: Response
) => {
  // @ts-ignore
  const userId = request.user?.uid;
  const companyId = request.body?.housing_company_id;
  const apartmentId = request.body?.apartment_id;
  const isTenant = await isAuthorizedAccessToApartment(
    userId,
    companyId?.toString() ?? "",
    apartmentId?.toString() ?? ""
  );
  if (!isTenant) {
    response
      .status(403)
      .send({ errors: { error: "Unauthorized", code: "not_tenant" } });
    return;
  }
  const docId = request.params?.document_id;
  await admin
    .firestore()
    .collection(HOUSING_COMPANIES)
    .doc(companyId?.toString() ?? "")
    .collection(APARTMENTS)
    .doc(apartmentId?.toString() ?? "")
    .collection(DOCUMENTS)
    .doc(docId)
    .update({ IS_DELETED: true });
  const basicRef = admin
    .firestore()
    .collection(HOUSING_COMPANIES)
    .doc(companyId?.toString() ?? "")
    .collection(APARTMENTS)
    .doc(apartmentId?.toString() ?? "")
    .collection(DOCUMENTS)
    .where(IS_DELETED, "==", false);
  const documents = (await basicRef.orderBy(CREATED_ON, "desc").get()).docs.map(
    (doc) => doc.data()
  );
  response.status(200).send(documents);
};

export const updateAparmentDocument = async (
  request: Request,
  response: Response
) => {
  // @ts-ignore
  const userId = request.user?.uid;
  const companyId = request.body?.housing_company_id;
  const apartmentId = request.body?.apartment_id;
  const isTenant = await isCompanyManager(userId, companyId?.toString() ?? "");
  if (!isTenant) {
    response
      .status(403)
      .send({ errors: { error: "Unauthorized", code: "not_tenant" } });
    return;
  }
  const updatedFile: StorageItem = {};
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
    .collection(APARTMENTS)
    .doc(apartmentId)
    .collection(DOCUMENTS)
    .doc(docId)
    .update(updatedFile);
  const basicRef = admin
    .firestore()
    .collection(HOUSING_COMPANIES)
    .doc(companyId?.toString() ?? "")
    .collection(APARTMENTS)
    .doc(apartmentId)
    .collection(DOCUMENTS)
    .doc(docId);
  const documents = (await basicRef.get()).data();
  response.status(200).send(documents);
};

export const getApartmentDocument = async (
  request: Request,
  response: Response
) => {
  // @ts-ignore
  const userId = request.user?.uid;
  const companyId = request.params?.housing_company_id;
  const docId = request.params?.document_id;
  const apartmentId = request.params?.apartment_id;
  const isTenant = await isAuthorizedAccessToApartment(
    userId,
    companyId?.toString() ?? "",
    apartmentId
  );
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
      .collection(APARTMENTS)
      .doc(apartmentId)
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
      .collection(APARTMENTS)
      .doc(apartmentId)
      .collection(DOCUMENTS)
      .doc(docId)
      .update(document);
  }
  response.status(200).send(document);
};

export const getApartmentCount = async (companyId: string) => {
  const apartmentCount = (
    await admin
      .firestore()
      .collection(HOUSING_COMPANIES)
      .doc(companyId)
      .collection(APARTMENTS)
      .count()
      .get()
  ).data().count;
  return apartmentCount;
};

import { Request, Response } from 'express';
import admin from 'firebase-admin';
import { ADMIN, APARTMENTS, HOUSING_COMPANIES } from '../../constants';
import { Apartment } from '../../dto/apartment';
import { Company } from '../../dto/company';
import { getUserApartments } from '../housing/manage_apartment';
import { getCompanyData } from '../housing/manage_housing_company';
import { removeCompanyFromUser, retrieveUser } from '../user/manage_user';

export const validateIdTokenAllowAnonymous = async (req: Request, res: Response, next: () => void) => {
  if (
    (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) &&
    !(req.cookies && req.cookies.__session)
  ) {
    res.status(403).send('Unauthorized');
    return;
  }

  let idToken;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    // Read the ID Token from the Authorization header.
    idToken = req.headers.authorization.split('Bearer ')[1];
  } else if (req.cookies) {
    // Read the ID Token from cookie.
    idToken = req.cookies.__session;
  } else {
    // No cookie
    res.status(403).send('Unauthorized');
    return;
  }

  try {
    const user = await admin.auth().verifyIdToken(idToken);
    // @ts-ignore
    req.user = user;
    next();
    return;
  } catch (error) {
    res.status(403).send('Unauthorized');
    return;
  }
};

export const validateFirebaseIdToken = async (req: Request, res: Response, next: () => void) => {
  await validateIdTokenAllowAnonymous(req, res, () => {
    // @ts-ignore
    const user = req.user;
    if (!user.email || user.email.toString().trim().length === 0) {
      res.status(403).send({ errors: 'Please sign in or create account to continue' });
      return;
    }
    next();
    return;
  });
};

export const isAuthorizedAccessToApartment = async (
  userId: string,
  companyId: string,
  apartmentId: string,
): Promise<Apartment | undefined> => {
  const apartment =
    (await isApartmentIdTenant(userId, companyId, apartmentId)) ??
    (await isApartmentOwner(userId, companyId, apartmentId));

  if (!apartment) {
    if ((await isCompanyManager(userId, companyId)) || (await isAdminRole(userId))) {
      const adminApartment = await admin
        .firestore()
        .collection(HOUSING_COMPANIES)
        .doc(companyId)
        .collection(APARTMENTS)
        .doc(apartmentId)
        .get();
      return adminApartment.data() as Apartment;
    }
    return;
  }
  return apartment;
};

export const removeUserFromApartment = async (removedUserId: string, companyId: string, apartmentId: string) => {
  await admin
    .firestore()
    .collection(HOUSING_COMPANIES)
    .doc(companyId)
    .collection(APARTMENTS)
    .doc(apartmentId)
    .update({
      tenants: admin.firestore.FieldValue.arrayRemove(removedUserId),
    });
};

export const removeUserAsOwnerFromApartment = async (removedUserId: string, companyId: string, apartmentId: string) => {
  await admin
    .firestore()
    .collection(HOUSING_COMPANIES)
    .doc(companyId)
    .collection(APARTMENTS)
    .doc(apartmentId)
    .update({
      owners: admin.firestore.FieldValue.arrayRemove(removedUserId),
    });
};

export const removeUserAsCompanyManger = async (removedUserId: string, companyId: string) => {
  await admin
    .firestore()
    .collection(HOUSING_COMPANIES)
    .doc(companyId)
    .update({
      managers: admin.firestore.FieldValue.arrayRemove(removedUserId),
    });
};

export const removeUserAsCompanyOwner = async (removedUserId: string, companyId: string) => {
  await admin
    .firestore()
    .collection(HOUSING_COMPANIES)
    .doc(companyId)
    .update({
      owners: admin.firestore.FieldValue.arrayRemove(removedUserId),
    });
};

export const removeUserFromCompany = async (removedUserId: string, housingCompanyId: string) => {
  try {
    const apartments = await getUserApartments(removedUserId, housingCompanyId);
    await Promise.all(
      (apartments ?? []).map(async (apartment) => {
        await removeUserFromApartment(removedUserId, housingCompanyId, apartment.id);
      }),
    );
  } catch (errors) {
    console.log(errors);
  }
  try {
    removeCompanyFromUser(removedUserId, housingCompanyId);
  } catch (errors) {
    console.log(errors);
  }
};

export const isCompanyOwner = async (userId: string, housingCompanyId: string): Promise<Company | undefined> => {
  const company = await getCompanyData(housingCompanyId);
  if (company?.owners?.includes(userId) || (await isAdminRole(userId))) {
    return company;
  }
  return;
};

export const isCompanyManager = async (userId: string, housingCompanyId: string): Promise<Company | undefined> => {
  if ((housingCompanyId?.length ?? 0) === 0) {
    return undefined;
  }
  const company = await getCompanyData(housingCompanyId);
  if (company?.managers?.includes(userId) || company?.owners?.includes(userId) || (await isAdminRole(userId))) {
    return company;
  }
  return;
};

export const isCompanyTenant = async (userId: string, housingCompanyId: string): Promise<boolean> => {
  try {
    const tenants = await getUserApartments(userId, housingCompanyId);
    return tenants.length > 0 || (await isCompanyManager(userId, housingCompanyId) !== undefined) || (await isAdminRole(userId) !== undefined);
  } catch (errors) {
    console.log(errors);
    return false;
  }
};

export const isAdminRole = async (userId: string) => {
  const user = await retrieveUser(userId);
  return user?.roles.includes(ADMIN) ? user : undefined;
};

export const isApartmentIdTenant = async (
  userId: string,
  housingCompanyId: string,
  apartmentId: string,
): Promise<Apartment | undefined> => {
  const apartment = (
    await admin
      .firestore()
      .collection(HOUSING_COMPANIES)
      .doc(housingCompanyId)
      .collection(APARTMENTS)
      .doc(apartmentId)
      .get()
  ).data() as Apartment;

  return (apartment?.tenants ?? []).includes(userId) ? apartment : undefined;
};

export const isApartmentOwner = async (userId: string, housingCompanyId: string, apartmentId: string) => {
  const apartment = (
    await admin
      .firestore()
      .collection(HOUSING_COMPANIES)
      .doc(housingCompanyId)
      .collection(APARTMENTS)
      .doc(apartmentId)
      .get()
  ).data() as Apartment;
  return (apartment?.owners ?? []).includes(userId) ? apartment : undefined;
};

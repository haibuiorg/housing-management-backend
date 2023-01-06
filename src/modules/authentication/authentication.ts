import {Request, Response} from 'express';
import admin from 'firebase-admin';
import {getUserApartments, isApartmentIdTenant}
  from '../housing/manage_apartment';
import {ADMIN, APARTMENTS, HOUSING_COMPANIES} from '../../constants';
import {getCompanyData}
  from '../housing/manage_housing_company';
import {retrieveUser} from '../user/manage_user';
import {Company} from '../../dto/company';

export const validateIdTokenAllowAnonymous =
    async (req: Request, res: Response, next: () => void) => {
      if (
        (!req.headers.authorization ||
         !req.headers.authorization.startsWith('Bearer ')
        ) &&
        !(req.cookies && req.cookies.__session)) {
        res.status(403).send('Unauthorized');
        return;
      }

      let idToken;
      if (req.headers.authorization &&
          req.headers.authorization.startsWith('Bearer ')) {
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

export const validateFirebaseIdToken =
    async (req: Request, res: Response, next: () => void) => {
      await validateIdTokenAllowAnonymous(req, res, () => {
        // @ts-ignore
        const user = req.user;
        if (!user.email || user.email.toString().trim().length === 0) {
          res.status(403)
              .send({'errors': 'Please sign in or create account to continue'});
          return;
        }
        next();
        return;
      });
    };

export const isAuthorizedAccessToApartment =
    async (userId: string, companyId: string, apartmentId: string) => {
      const apartment = await isApartmentIdTenant(
          userId,
          companyId,
          apartmentId);
      if (!apartment) {
        if (await isCompanyManager(userId, companyId) ||
       await isAdminRole(userId)) {
          const adminApartment = await admin.firestore()
              .collection(HOUSING_COMPANIES)
              .doc(companyId).collection(APARTMENTS).doc(apartmentId)
              .get();
          return adminApartment.data();
        }
        return undefined;
      }
      return apartment;
    };

export const isCompanyOwner =
    async (
        userId:string,
        housingCompanyId: string) : Promise<Company | undefined> => {
      const company = await getCompanyData(housingCompanyId);
      if (company?.owners?.includes(userId) || await isAdminRole(userId)) {
        return company;
      }
      return undefined;
    };

export const isCompanyManager =
    async (userId:string, housingCompanyId: string) => {
      const company = await getCompanyData(housingCompanyId);
      if (company?.managers?.includes(userId) ||
       company?.owners?.includes(userId) || await isAdminRole(userId)) {
        return company;
      }
      return undefined;
    };

export const isCompanyTenant =
    async (userId:string, housingCompanyId: string) => {
      try {
        const tenants = await getUserApartments(userId, housingCompanyId);
        return tenants.length> 0 ||
          await isCompanyManager(userId, housingCompanyId) ||
          await isAdminRole(userId);
      } catch (errors) {
        console.log(errors);
        return false;
      }
    };

export const isAdminRole =
   async (userId: string) => {
     const user = await retrieveUser(userId);
     return user?.roles.includes(ADMIN);
   };


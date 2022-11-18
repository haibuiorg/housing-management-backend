import {Request, Response} from 'express';
import admin, {firestore} from 'firebase-admin';
// eslint-disable-next-line max-len
import {APARTMENTS, BUILDING, HOUSE_CODE, HOUSING_COMPANIES, HOUSING_COMPANY_ID, TENANTS} from '../../constants';
import {isCompanyManager, isCompanyOwner}
  from '../authentication/authentication';
import {addHousingCompanyToUser} from '../user/manage_user';

export const addApartmentRequest =
  async (request: Request, response: Response) => {
    // @ts-ignore
    const userId = request.user?.uid;
    const housingCompanyId = request.body.housing_company_id;
    if (!await isCompanyOwner(userId, housingCompanyId)) {
      response.status(403).send({
        errors: {error: 'Not owner', code: 'not_owner'},
      });
      return;
    }
    const building = request.body.building;
    const houseCodes = request.body.house_codes;
    if (!building) {
      response.status(500).send({
        errors: {error: 'Building require', code: 'missing_buiding'},
      });
      return;
    }
    try {
      const apartments = await addMultipleApartmentsInBuilding(
          housingCompanyId, building, houseCodes);
      response.status(200).send(apartments);
    } catch (errors) {
      response.status(500).send({
        errors: errors,
      });
    }
  };

export const addTenantToApartment =
    async (userUid: string, housingCompanyId: string, apartmentId: string) => {
      if (housingCompanyId && apartmentId) {
        await admin.firestore().collection(HOUSING_COMPANIES)
            .doc(housingCompanyId).collection(APARTMENTS).doc(apartmentId)
            .update({[TENANTS]: firestore.FieldValue.arrayUnion(userUid)});
        await addHousingCompanyToUser(housingCompanyId, userUid);
      }
    };

export const addMultipleApartmentsInBuilding =
    async (
        housingCompanyId: string,
        building: string,
        houseCodes?: string[],
    ) => {
      if (!houseCodes) {
        return await addSingleApartment(housingCompanyId, building);
      }
      const batch = admin.firestore().batch();
      const apartments = [];
      for (const houseCode of houseCodes) {
        const apartmentId = admin.firestore().collection(HOUSING_COMPANIES)
            .doc(housingCompanyId).collection(APARTMENTS).doc().id;
        const apartment = {
          'housing_company_id': housingCompanyId,
          'id': apartmentId,
          'building': building,
          'house_code': houseCode ?? '',
          'tenants': [],
        };
        apartments.push(apartment);
        const apartmentRef = admin.firestore().collection(HOUSING_COMPANIES)
            .doc(housingCompanyId).collection(APARTMENTS).doc(apartmentId);
        batch.set(apartmentRef, apartment);
      }
      await batch.commit();
      await admin.firestore().collection(HOUSING_COMPANIES)
          .doc(housingCompanyId).update({
            apartment_count: firestore.FieldValue.increment(houseCodes.length),
          });
      return apartments;
    };

export const addSingleApartment =
    async (housingCompanyId: string, building: string, houseCode?: string) => {
      const apartmentId = admin.firestore().collection(HOUSING_COMPANIES)
          .doc(housingCompanyId).collection(APARTMENTS).doc().id;
      const apartment = {
        'housing_company_id': housingCompanyId,
        'id': apartmentId,
        'building': building,
        'house_code': houseCode ?? '',
        'tenants': [],
      };
      await admin.firestore().collection(HOUSING_COMPANIES)
          .doc(housingCompanyId).collection(APARTMENTS).doc(apartmentId)
          .set(apartment);
      await admin.firestore().collection(HOUSING_COMPANIES)
          .doc(housingCompanyId).update({
            apartment_count: firestore.FieldValue.increment(1),
          });
      return apartment;
    };

export const isApartmentTenant =
    async (
        userId:string,
        housingCompanyId:string,
        building: string,
        houseCode?: string,
    ) => {
      if (!houseCode) {
        const apartments =
            (await admin.firestore().collectionGroup(APARTMENTS)
                .where(HOUSING_COMPANY_ID, '==', housingCompanyId)
                .where(BUILDING, '==', building)
                .where(TENANTS, 'array-contains', userId)
                .limit(1).get());
        return apartments.docs.map((doc) => doc.data())[0];
      }
      const apartments =
      (await admin.firestore().collectionGroup(APARTMENTS)
          .where(HOUSING_COMPANY_ID, '==', housingCompanyId)
          .where(BUILDING, '==', building)
          .where(HOUSE_CODE, '==', houseCode)
          .where(TENANTS, 'array-contains', userId)
          .limit(1).get());
      return apartments.docs.map((doc) => doc.data())[0];
    };

export const isApartmentIdTenant =
    async (
        userId:string,
        housingCompanyId:string,
        apartmentId: string,
    ) => {
      const apartment =
      (await admin.firestore().collection(HOUSING_COMPANIES)
          .doc(housingCompanyId).collection(APARTMENTS).doc(apartmentId)
          .get());

      return apartment.data()?.tenants.includes(userId) ?
      apartment.data(): undefined;
    };

export const getUserApartmentRequest =
    async (request: Request, response: Response) => {
      // @ts-ignore
      const userId = request.user?.uid;
      const housingCompanyId = request.query.housing_company_id;
      if (!housingCompanyId) {
        response.status(500).send(
            {errors: {error: 'Missing value', code: 'missing_company_id'}},
        );
      }
      try {
        const apartments =
            await getUserApartments(userId, housingCompanyId!.toString());
        response.status(200).send(apartments);
      } catch (errors) {
        response.status(500).send({errors: errors});
      }
    };

export const getUserApartments =
    async (userId : string, housingCompanyId: string) => {
      if (await isCompanyManager(userId, housingCompanyId)) {
        const apartments = await admin.firestore().collectionGroup(APARTMENTS)
            .where(HOUSING_COMPANY_ID, '==', housingCompanyId)
            .get();
        return apartments.docs.map((doc) => doc.data());
      }
      const apartments = await admin.firestore().collectionGroup(APARTMENTS)
          .where(HOUSING_COMPANY_ID, '==', housingCompanyId)
          .where(TENANTS, 'array-contains', userId).get();
      return apartments.docs.map((doc) => doc.data());
    };

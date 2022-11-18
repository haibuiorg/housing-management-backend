'use strict';
import {Request, Response} from 'express';
import admin from 'firebase-admin';
import {addMultipleApartmentsInBuilding}
  from './manage_apartment';
// eslint-disable-next-line max-len
import {APARTMENTS, HOUSING_COMPANIES, HOUSING_COMPANY_ID, USERS}
  from '../../constants';
import {Company} from '../../dto/company';
import {isCompanyOwner, isCompanyTenant}
  from '../authentication/authentication';
import {addHousingCompanyToUser} from '../user/manage_user';
import {User} from '../../dto/user';
import {isValidCountryCode} from '../country/manage_country';
import {UI} from '../../dto/ui';

export const createHousingCompany =
    async (request: Request, response: Response) => {
      const housingCompanyName = request.body.name;
      if (!housingCompanyName) {
        response.status(500).send(
            {errors: {
              error: 'Missing housing company name',
              code: 'invalid_name',
            }},
        );
        return;
      }

      const housingCompanyId = admin.firestore().collection(HOUSING_COMPANIES)
          .doc().id;
      // @ts-ignore
      const userId = request.user?.uid;
      const housingCompany: Company = {
        id: housingCompanyId,
        name: housingCompanyName,
        owners: [userId],
        managers: [userId],
        apartment_count: 0,
        tenant_count: 1,
      };
      await admin.firestore().collection(HOUSING_COMPANIES)
          .doc(housingCompanyId)
          .set(housingCompany);
      await addHousingCompanyToUser(housingCompanyId, userId);
      const building = request.body.building;
      if (building) {
        const houseCodes = request.body.house_codes;
        const apartments =
            await addMultipleApartmentsInBuilding(
                housingCompanyId, building, houseCodes);
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
    };

export const getHousingCompanies =
    async (request: Request, response: Response) => {
      try {
        // @ts-ignore
        const userId = request.user?.uid;
        const user = (await admin.firestore()
            .collection(USERS).doc(userId).get()).data() as User;
        const companyIds = user.housing_companies;
        const companies = (await admin.firestore()
            .collection(HOUSING_COMPANIES).where('id', 'in', companyIds).get())
            .docs.map((doc) => doc.data());
        response.status(200).send(companies);
      } catch (errors) {
        console.log(errors);
        response.status(500).send({errors: errors});
      }
    };
export const getHousingCompany =
    async (request: Request, response: Response) => {
      try {
        // @ts-ignore
        const userId = request.user?.uid;
        const companyId = request.query.housing_company_id;
        if (!await isCompanyTenant(userId, companyId?.toString() ?? '')) {
          response.status(403).send({
            errors: {error: 'Not tenant', code: 'not_tenant'},
          });
          return;
        }
        const companies = (await admin.firestore()
            .collection(HOUSING_COMPANIES).where('id', '==', companyId)
            .limit(1).get())
            .docs.map((doc) => doc.data());
        response.status(200).send(companies[0]);
      } catch (errors) {
        response.status(500).send({errors: errors});
      }
    };

export const updateHousingCompanyDetail =
    async (request: Request, response: Response) => {
      const companyId = request.body.housing_company_id;
      // @ts-ignore
      const userId = request.user?.uid;
      if (!isCompanyOwner(userId, companyId)) {
        response.status(403).send(
            {errors: {error: 'Unauthorized', code: 'not_owner'}},
        );
        return;
      }
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
      const company: Company = {};
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
        company.ui = (ui as UI);
      }
      try {
        await admin.firestore().collection(HOUSING_COMPANIES)
            .doc(companyId).update(company);
        company.id = companyId;
        response.status(200).send({result: true});
      } catch (errors) {
        response.status(500).send({errors: errors});
      };
    };


export const getCompanyData =
    async (companyId:string): Promise<Company|undefined> => {
      const company = await admin.firestore()
          .collection(HOUSING_COMPANIES).doc(companyId).get();
      return company?.data() as Company;
    };

export const hasApartment =
    async (apartmentId: string, housingCompanyId: string)
        : Promise<boolean> => {
      const apartment = await admin.firestore().collection(HOUSING_COMPANIES)
          .doc(housingCompanyId).collection(APARTMENTS).doc(apartmentId).get();
      return apartment.exists;
    };

export const getCompanyTenantIds =
  async (housingCompanyId:string) => {
    const apartments = await admin.firestore().
        collectionGroup(APARTMENTS).
        where(HOUSING_COMPANY_ID, '==', housingCompanyId).get();
    const tenants: string[] = [];
    apartments.docs.map((doc) => {
      tenants.push(doc.data().tenants);
    });
    return tenants;
  };

